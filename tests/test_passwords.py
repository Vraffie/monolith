import unittest

from hitchly.passwords import hash_password, verify_password


class PasswordTests(unittest.TestCase):
    def test_roundtrip_and_salting(self):
        a, b = hash_password("correct horse"), hash_password("correct horse")
        self.assertNotEqual(a, b)  # random salt
        self.assertTrue(verify_password("correct horse", a))
        self.assertFalse(verify_password("correct horse ", a))
        self.assertFalse(verify_password("", a))
        self.assertNotIn("correct horse", a)

    def test_malformed_records_never_verify(self):
        for stored in ("", "plain", "scrypt$x", "md5$1$1$1$00$00", "scrypt$16384$8$1$zz$zz", "scrypt$1$1$1$00$00"):
            with self.subTest(stored=stored):
                self.assertFalse(verify_password("anything", stored))


if __name__ == "__main__":
    unittest.main()
