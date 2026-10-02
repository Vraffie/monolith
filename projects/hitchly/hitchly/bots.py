"""Heuristic bot detection from the User-Agent header.

This is a heuristic, not a guarantee: it catches the common crawlers, link-preview
fetchers and scripting clients that otherwise inflate click counts. Deliberate
traffic faking by someone who sends a browser User-Agent is out of scope.
"""

from __future__ import annotations

import re

_BOT_RE = re.compile(
    r"bot\b|bot/|crawl|spider|slurp|scrape|fetch|preview|monitor|uptime|pingdom|lighthouse|"
    r"facebookexternalhit|facebot|whatsapp|slack|discord|telegram|skype|linkedin|pinterest|"
    r"curl/|wget|httpie|python-|aiohttp|httpx|go-http-client|java/|apache-httpclient|okhttp/|libwww|"
    r"node-fetch|axios|undici|scrapy|headless|phantomjs|selenium|puppeteer|playwright|hitch-check",
    re.IGNORECASE,
)


def is_bot(user_agent: str | None) -> bool:
    """True for empty User-Agents and known crawler / preview / script signatures."""
    if not user_agent or not user_agent.strip():
        return True
    return bool(_BOT_RE.search(user_agent))
