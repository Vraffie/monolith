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
