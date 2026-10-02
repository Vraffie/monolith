import os
import tempfile
import unittest

from xmlgraph import render, scan
from xmlgraph.__main__ import main

EX = os.path.join(os.path.dirname(__file__), "..", "examples")


class ScanTests(unittest.TestCase):
    def setUp(self):
        self.g = scan(EX)

    def edges(self):
        return {(self.g.nodes[e.source].key, self.g.nodes[e.target].key, e.via) for e in self.g.edges}

    def test_entities_found(self):
        keys = {(n.type, n.key) for n in self.g.nodes.values() if not n.external}
        self.assertIn(("baseOffer", "RES_STANDALONE"), keys)
        self.assertIn(("featureGroup", "RES_SHIPPING"), keys)

    def test_cross_file_reference_resolved(self):
        self.assertIn(("RES_STANDALONE", "RES_SHIPPING", "featureGroupKey"), self.edges())
        self.assertIn(("RES_STANDALONE", "RESIDENTIAL", "ruleKey"), self.edges())

    def test_type_disambiguates_same_key(self):
        # NEW_ONT is both a reference entity and a resourceSpecificationGroup.
        tgt = [self.g.nodes[e.target] for e in self.g.edges if e.via == "resourceSpecificationGroupKey"]
        self.assertEqual([t.type for t in tgt], ["resourceSpecificationGroup"])
        self.assertEqual(tgt[0].file, "resources.xml")

    def test_dangling_reference_is_external(self):
        ext = [n for n in self.g.nodes.values() if n.external]
        self.assertIn("RES_STANDALONE_TM", {n.key for n in ext})

    def test_file_edges(self):
        fe = self.g.file_edges()
        self.assertEqual(fe[("offers.xml", "features.xml")], 2 + 1)  # 2 groups + RESIDENTIAL rule
        self.assertNotIn(("features.xml", "features.xml"), fe)

    def test_parse_error_reported(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "bad.xml"), "w") as fh:
                fh.write("<a><b></a>")
            g = scan(d)
        self.assertIn("bad.xml", g.errors)


class ProximityTests(unittest.TestCase):
    def test_same_key_in_two_trees_resolves_locally(self):
        with tempfile.TemporaryDirectory() as d:
            for tree in ("portfolio", "wholesale"):
                os.makedirs(f"{d}/{tree}")
                with open(f"{d}/{tree}/a.xml", "w") as fh:
                    fh.write("<r><tariffModel><key>TM</key></tariffModel>"
                             "<offer><key>O</key><tariffModelKey>TM</tariffModelKey></offer></r>")
            g = scan(d)
        for e in g.edges:
            self.assertEqual(g.nodes[e.source].file, g.nodes[e.target].file)
        self.assertEqual(len(g.edges), 2)

    def test_group_edges(self):
        # files without folders are grouped by their top-level XML section
        sizes, edges = scan(EX).group_edges(1)
        self.assertEqual(sizes["baseOffers"], 2)
        self.assertEqual(edges[("baseOffers", "featureGroup")], 2)
        self.assertNotIn(("featureGroup", "featureGroup"), edges)

    def test_unknown_type_resolves_by_key_but_known_type_does_not(self):
        with tempfile.TemporaryDirectory() as d:
            with open(f"{d}/a.xml", "w") as fh:
                fh.write("<r><parameter><key>P</key></parameter><serviceFeature><key>S</key></serviceFeature>"
                         "<x><key>X</key><ruleParamKey>P</ruleParamKey><serviceFeatureKey>P</serviceFeatureKey></x></r>")
            g = scan(d)
        by = {e.via: e for e in g.edges}
        self.assertTrue(by["ruleParamKey"].loose)
        self.assertTrue(g.nodes[by["serviceFeatureKey"].target].external)


class MergeTests(unittest.TestCase):
    def test_merge_unifies_entities_across_files(self):
        with tempfile.TemporaryDirectory() as d:
            for f in ("a.xml", "b.xml"):
                with open(f"{d}/{f}", "w") as fh:
                    fh.write("<r><t><key>T</key></t><o><key>O</key><tKey>T</tKey></o></r>")
            sep, merged = scan(d), scan(d, merge=True)
        self.assertEqual(len(sep.nodes), 4)
        self.assertEqual(len(merged.nodes), 2)
        self.assertEqual(len(merged.edges), 1)
        self.assertEqual(merged.nodes["t:T"].files, ["a.xml", "b.xml"])


class RenderTests(unittest.TestCase):
    def test_outputs(self):
        g = scan(EX)
        self.assertTrue(render.to_mermaid(g).startswith("graph LR"))
        self.assertIn("digraph", render.to_dot(g))
        self.assertIn("offers.xml", render.to_mermaid(g, by_file=True))
        html = render.to_html(g)
        self.assertIn("RES_SHIPPING", html)
        self.assertEqual(html.count("</script>"), 2)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "g.html")
            self.assertEqual(main([EX, "-o", out]), 0)
            self.assertGreater(os.path.getsize(out), 1000)


if __name__ == "__main__":
    unittest.main()
