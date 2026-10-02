import unittest

from hitchly.ratelimit import RateLimiter


class RateLimiterTests(unittest.TestCase):
    def setUp(self):
        self.t = 100.0
        self.rl = RateLimiter(limit=3, window=60, clock=lambda: self.t)

    def test_blocks_after_limit_then_recovers(self):
        for _ in range(3):
            self.assertEqual(self.rl.blocked_for("ip"), 0)
            self.rl.record("ip")
        self.assertEqual(self.rl.blocked_for("ip"), 60)
        self.t += 45
        self.assertEqual(self.rl.blocked_for("ip"), 15)
        self.t += 15
        self.assertEqual(self.rl.blocked_for("ip"), 0)

    def test_keys_are_independent(self):
        for _ in range(3):
            self.rl.record("a")
        self.assertGreater(self.rl.blocked_for("a"), 0)
        self.assertEqual(self.rl.blocked_for("b"), 0)


if __name__ == "__main__":
    unittest.main()
