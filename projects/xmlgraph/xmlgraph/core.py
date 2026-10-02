"""Scan XML files and resolve key-based references between them.

Model (matches configuration XML where entities are named by a ``<key>`` child):

* An *entity* is any element with a direct child ``<key>``; its identity is
  ``(tag, key text)``, e.g. ``baseOffer:RES_STANDALONE``.
* A *reference* is any element whose tag ends in ``Key`` (``tariffModelKey``,
  ``featureGroupKey``...) with text content. The tag minus ``Key`` is the type of
  entity it points at (``tariffModel``). The plain ``<key>`` element is a
  definition, never a reference.
* An edge goes from the nearest enclosing entity to the entity it references.
  References that match nothing in the scanned files become *external* nodes, so
  dangling references stay visible.
"""
from __future__ import annotations

import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field


@dataclass
class Node:
    id: str
    type: str
    key: str
    file: str | None = None      # None for external (unresolved) nodes
    path: str = ""               # element path inside the file
    external: bool = False


@dataclass
class Edge:
    source: str
    target: str
    via: str                     # tag of the reference element
    file: str = ""
    path: str = ""


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: list[Edge] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    errors: dict[str, str] = field(default_factory=dict)

    def group_edges(self, depth: int = 2) -> tuple[dict[str, int], dict[tuple[str, str], int]]:
        """Entity counts per folder and reference counts between folders (first ``depth`` segments)."""
        def grp(f: str) -> str:
            return "/".join(f.split("/")[:-1][:depth]) or "."

        sizes: dict[str, int] = {}
        for n in self.nodes.values():
            if n.file:
                sizes[grp(n.file)] = sizes.get(grp(n.file), 0) + 1
        out: dict[tuple[str, str], int] = {}
        for e in self.edges:
            a, b = self.nodes[e.source].file, self.nodes[e.target].file
            if a and b and grp(a) != grp(b):
                k = (grp(a), grp(b))
                out[k] = out.get(k, 0) + 1
        return sizes, out

    def file_edges(self) -> dict[tuple[str, str], int]:
        """Edge counts between files (self-links and external targets excluded)."""
        out: dict[tuple[str, str], int] = {}
        for e in self.edges:
            a, b = self.nodes[e.source].file, self.nodes[e.target].file
            if a and b and a != b:
                out[(a, b)] = out.get((a, b), 0) + 1
        return out


def _local(tag: object) -> str:
    """Tag name without ``{namespace}``; comments/PIs (non-str tags) become ''."""
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _parse(path: str) -> ET.Element:
    return ET.parse(path).getroot()


def find_xml_files(root: str) -> list[str]:
    found = []
    for dirpath, dirnames, names in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        found += [os.path.join(dirpath, n) for n in sorted(names) if n.lower().endswith(".xml")]
    return found


def scan(root: str, key_tag: str = "key", ref_suffix: str = "Key") -> Graph:
    """Scan every ``*.xml`` under ``root`` (or the single file ``root``)."""
    g = Graph()
    base = os.path.dirname(root) if os.path.isfile(root) else root
    paths = [root] if os.path.isfile(root) else find_xml_files(root)

    # refs: (source node id | None, ref tag, wanted type, value, file, path)
    refs: list[tuple[str | None, str, str, str, str, str]] = []
    by_key: dict[tuple[str, str], list[str]] = {}

    for p in paths:
        rel = os.path.relpath(p, base).replace(os.sep, "/")
        g.files.append(rel)
        try:
            tree = _parse(p)
        except (ET.ParseError, OSError) as exc:
            g.errors[rel] = str(exc)
            continue
        _walk(tree, rel, [], None, g, refs, by_key, key_tag, ref_suffix)

    for src, via, typ, value, rel, path in refs:
        target = _resolve(typ, value, by_key, g, rel)
        if target is None:
            tid = f"?{typ}:{value}"
            g.nodes.setdefault(tid, Node(tid, typ, value, external=True))
            target = tid
        if src is not None:
            g.edges.append(Edge(src, target, via, rel, path))
    return g


def _walk(el, rel, trail, owner, g, refs, by_key, key_tag, ref_suffix):
    tag = _local(el.tag)
    trail = trail + [tag]
    path = "/".join(trail)

    key_child = next((c for c in el if _local(c.tag) == key_tag and (c.text or "").strip()), None)
    if key_child is not None:
        key = key_child.text.strip()
        nid = f"{rel}::{tag}:{key}"
        if nid not in g.nodes:
            g.nodes[nid] = Node(nid, tag, key, rel, path)
            by_key.setdefault((tag.lower(), key), []).append(nid)
        owner = nid

    for child in el:
        ctag = _local(child.tag)
        if not ctag:
            continue
        value = (child.text or "").strip()
        is_ref = ctag.endswith(ref_suffix) and ctag != key_tag and len(ctag) > len(ref_suffix)
        if is_ref and value and len(child) == 0:
            refs.append((owner, ctag, ctag[: -len(ref_suffix)], value, rel, f"{path}/{ctag}"))
        else:
            _walk(child, rel, trail, owner, g, refs, by_key, key_tag, ref_suffix)


def _closeness(g: Graph, nid: str, src_file: str) -> int:
    """Number of leading path segments shared with the referencing file."""
    n = 0
    for x, y in zip((g.nodes[nid].file or "").split("/")[:-1], src_file.split("/")[:-1]):
        if x != y:
            break
        n += 1
    return n


def _resolve(typ, value, by_key, g, src_file):
    """Pick the definition a reference points at.

    Same key defined in several trees (``portfolio/`` and ``wholesale/``) resolves to
    the one sharing the longest folder prefix with the referencing file.
    """
    t = typ.lower()
    cands = list(by_key.get((t, value), []))
    if not cands:
        # Tolerate naming drift such as ``resourceSpecificationGroupKey`` ->
        # ``resourceSpecificationGroupReference``.
        cands = [nid for (tag, k), ids in by_key.items() if k == value and (tag.startswith(t) or t.startswith(tag)) for nid in ids]
    if not cands:
        return None
    return max(cands, key=lambda nid: _closeness(g, nid, src_file))
