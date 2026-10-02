# xmlgraph

Visualise how the XML files in a repository reference each other. Zero dependencies, Python 3.10+.

It parses every `*.xml` file into a tree (the AST idea from [this article](https://medium.com/basecs/leveling-up-ones-parsing-game-with-asts-d7a6fc2400ff)), finds the entities and the references between them, and draws the resulting graph.

## Model

- **Entity**: an element with a direct `<key>` child, e.g. `<baseOffer><key>RES_STANDALONE</key>…`. Identity is `(tag, key)`.
- **Reference**: an element ending in `Key` with text, e.g. `<featureGroupKey>RES_SHIPPING</featureGroupKey>`. The tag minus `Key` is the target type (`featureGroup`), so the same key in different types does not clash.
- **Edge**: from the nearest enclosing entity to the referenced entity, possibly in another file.
- References that match nothing become dashed *unresolved* nodes, so dangling links are visible.

## Use

```sh
python -m xmlgraph path/to/repo -o graph.html        # self-contained, works offline
python -m xmlgraph path/to/repo -f mermaid           # Mermaid text
python -m xmlgraph path/to/repo -f dot --files       # Graphviz, one node per file
python -m xmlgraph path/to/repo -f json              # raw nodes/edges
```

Large repositories: use the **Folders** view (depth 2 groups by e.g. `portfolio/baseOffers`) to see the overall shape, then switch to **Entities** and filter by type. Nodes are coloured by top-level folder. If the same key exists in several trees (`portfolio/` and `wholesale/`), a reference resolves to the definition sharing the longest folder prefix with the referencing file. For Mermaid/DOT, `--depth N` gives the folder-level graph.

**Overlapping exports** (several files that each contain a full copy of the shared configuration plus one offer): add `--merge` to treat the same type+key in different files as one entity. The side panel then lists every file that defines it. Without it, each file gets its own copy.

The HTML viewer has search, a type filter, an entity/file toggle, drag, zoom, and a side panel listing what a node references and what references it. Choosing a type shows that type plus its direct neighbours; **Focus** shows the 2-hop neighbourhood of the selected node. Dashed edges were matched by key only (the reference's type name has no entity of its own, e.g. `businessRuleParamKey` → `parameter`). `--key-tag` and `--ref-suffix` adapt the conventions to other schemas.

Try it: `python -m xmlgraph examples -o /tmp/g.html`. Tests: `python -m unittest discover -s tests`.
