import unittest

from shortener.domain import ValidationError, generate_slug, validate_slug, validate_ttl, validate_url


class UrlTests(unittest.TestCase):
    def test_accepts_http_and_https(self):
        self.assertEqual(validate_url(" https://example.com/a?b=1 "), "https://example.com/a?b=1")
        validate_url("http://localhost:8000/x")

    def test_rejects_bad_urls(self):
        for bad in [None, "", "   ", 5, "ftp://x.com", "javascript:alert(1)", "https://", "example.com",
                    "https://a b.com", "https://x.com:99999", "https://x.com/" + "a" * 2100]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValidationError):
                    validate_url(bad)


class SlugTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(validate_slug("my-link_1"), "my-link_1")

    def test_invalid_and_reserved(self):
        for bad in ["ab", "a" * 33, "has space", "emoji😀", "API", "health", None]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValidationError):
                    validate_slug(bad)

    def test_generated_slugs_are_valid(self):
        for _ in range(200):
            validate_slug(generate_slug())


class TtlTests(unittest.TestCase):
    def test_ttl(self):
        self.assertIsNone(validate_ttl(None))
        self.assertEqual(validate_ttl(60), 60)
        for bad in [0, -1, True, "5", 1.5, 10**10]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValidationError):
                    validate_ttl(bad)


if __name__ == "__main__":
    unittest.main()
