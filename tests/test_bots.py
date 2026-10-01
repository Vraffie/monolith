import unittest

from hitchly.bots import is_bot

HUMANS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
]
BOTS = [
    None, "", "   ",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Twitterbot/1.0", "TelegramBot (like TwitterBot)", "Mozilla/5.0 (compatible; Discordbot/2.0)",
    "curl/8.5.0", "Wget/1.21", "python-requests/2.31.0", "Python-urllib/3.11", "Go-http-client/2.0",
    "Mozilla/5.0 HeadlessChrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
    "hitch-check/1.1",
]


class BotTests(unittest.TestCase):
    def test_humans(self):
        for ua in HUMANS:
            with self.subTest(ua=ua[:40]):
                self.assertFalse(is_bot(ua))

    def test_bots(self):
        for ua in BOTS:
            with self.subTest(ua=ua):
                self.assertTrue(is_bot(ua))


if __name__ == "__main__":
    unittest.main()
