"""Bounded, expiring preview artifacts, never a job ledger or retry store."""
from collections import OrderedDict
from dataclasses import replace
from secrets import token_urlsafe
from threading import Lock
from time import monotonic

from app.engine.pipeline import prepare_bitmap


class PreviewArtifacts:
    def __init__(self, *, budget=64 * 1024 * 1024, ttl=900):
        self.budget, self.ttl = budget, ttl
        self.entries = OrderedDict()
        self.lock = Lock()

    def put(self, output):
        size = len(output.payload) + len(output.bitmap.bitmap_png)
        if size > self.budget:
            return None
        with self.lock:
            self._expire()
            while self.entries and (len(self.entries) >= 256 or sum(value[2] for value in self.entries.values()) + size > self.budget):
                self.entries.popitem(last=False)
            identity = token_urlsafe(32)
            self.entries[identity] = (monotonic() + self.ttl, output, size)
            return identity

    def _expire(self):
        for key, value in list(self.entries.items()):
            if value[0] <= monotonic():
                del self.entries[key]

    def get_many(self, identities, copies):
        with self.lock:
            self._expire()
            outputs = [self.entries[key][1] for key in identities]
        # Reuse the exact bound bitmap. SAP, layout resolution and raster are absent.
        return [replace(output, copies=1) if copies == 1 else prepare_bitmap(output.bitmap, copies=copies)
                for output in outputs]

artifacts = PreviewArtifacts()
