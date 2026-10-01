import hashlib
import unittest
import xml.etree.ElementTree as ET

from hitchly import qr


def bch_ok(bits: int) -> bool:
    """A valid 15-bit QR format word is a multiple of the generator once unmasked."""
    word = bits ^ 0x5412
    rem = word
    for i in range(14, 9, -1):
        if (rem >> i) & 1:
            rem ^= 0x537 << (i - 10)
    return rem == 0


class QRTests(unittest.TestCase):
    def test_sizes_follow_version(self):
        self.assertEqual(len(qr.encode("hi")), 21)  # version 1
        self.assertEqual(len(qr.encode("x" * 26)), 25)  # version 2-M holds 26 bytes
        self.assertEqual(len(qr.encode("x" * 27)), 29)  # 27 bytes spills into version 3
        self.assertEqual(len(qr.encode("https://example.com/" + "a" * 200)) % 4, 1)

    def test_function_patterns(self):
        m = qr.encode("https://example.com/abc")
        n = len(m)
        for cx, cy in ((0, 0), (n - 7, 0), (0, n - 7)):  # finder: dark ring, light ring, dark core
            self.assertTrue(all(m[cy][cx + i] for i in range(7)))
            self.assertFalse(any(m[cy + 1][cx + 1 + i] for i in range(5)))
            self.assertTrue(all(m[cy + 2 + a][cx + 2 + b] for a in range(3) for b in range(3)))
        for i in range(8, n - 8):  # timing patterns
            self.assertEqual(m[6][i], i % 2 == 0)
            self.assertEqual(m[i][6], i % 2 == 0)
        self.assertTrue(m[n - 8][8])  # always-dark module

    def test_format_word_is_valid_bch_and_level_m(self):
        m = qr.encode("https://example.com/abc")
        bits = sum(m[i][8] << i for i in range(6)) | m[7][8] << 6 | m[8][8] << 7 | m[8][7] << 8
        bits |= sum(m[8][14 - i] << i for i in range(9, 15))
        self.assertTrue(bch_ok(bits))
        self.assertEqual((bits ^ 0x5412) >> 13, 0)  # level M bits are 00

    def test_golden_matrix(self):
        # Matrix was decoded back to its text with two independent decoders (zxing-cpp, OpenCV);
        # this hash guards against accidental changes to the encoder.
        m = qr.encode("https://example.com/abc")
        digest = hashlib.sha256("".join("1" if c else "0" for row in m for c in row).encode()).hexdigest()
        self.assertEqual(digest, GOLDEN)

    def test_too_long(self):
        with self.assertRaises(qr.QRTooLong):
            qr.encode("x" * 3000)

    def test_unicode_and_svg_is_wellformed(self):
        svg = qr.to_svg("https://example.com/åäö")
        root = ET.fromstring(svg)
        self.assertTrue(root.tag.endswith("svg"))

    @unittest.skipUnless(__import__("importlib").util.find_spec("zxingcpp"), "zxing-cpp not installed")
    def test_roundtrip_with_independent_decoder(self):
        import numpy as np
        import zxingcpp
        for text in ("a", "https://example.com/" + "z" * 100, "https://x.io/" + "q" * 400):
            m = qr.encode(text)
            n, s = len(m) + 8, 6
            img = np.full((n * s, n * s), 255, np.uint8)
            for y, row in enumerate(m):
                for x, v in enumerate(row):
                    if v:
                        img[(y + 4) * s:(y + 5) * s, (x + 4) * s:(x + 5) * s] = 0
            self.assertEqual(zxingcpp.read_barcodes(img)[0].text, text)


GOLDEN = "ffee102542d80ece221a0af805caead1f9e56f1a4222aaf6b5dcd09322aabf75"

if __name__ == "__main__":
    unittest.main()
