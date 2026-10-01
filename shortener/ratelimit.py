"""In-memory sliding-window rate limiter (per process, per key)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Callable


class RateLimiter:
    """Allow at most `limit` events per `window` seconds for each key."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit, self.window, self.clock = limit, window, clock
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._events[key]
        while q and q[0] <= now - self.window:
            q.popleft()
        if not q:
            self._events.pop(key, None)  # don't grow unbounded with one-off clients
        return q

    def blocked_for(self, key: str) -> float:
        """Seconds until `key` may act again; 0 if it is not currently limited."""
        with self._lock:
            now = self.clock()
            q = self._prune(key, now)
            if len(q) < self.limit:
                return 0.0
            return max(0.0, q[0] + self.window - now)

    def record(self, key: str) -> None:
        with self._lock:
            now = self.clock()
            self._prune(key, now)
            self._events[key].append(now)
