"""Console tracing + a jsonl run log, so a failed run is debuggable without a rerun."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

C = {
    "dim": "\033[2m", "red": "\033[31m", "grn": "\033[32m", "yel": "\033[33m",
    "blu": "\033[34m", "mag": "\033[35m", "cyn": "\033[36m", "b": "\033[1m", "x": "\033[0m",
}
if not sys.stdout.isatty():
    C = dict.fromkeys(C, "")


class Trace:
    def __init__(self, path: Path | None = None):
        self.path = path
        self.t0 = time.time()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("")

    def _log(self, kind: str, **data) -> None:
        if not self.path:
            return
        with self.path.open("a") as f:
            f.write(json.dumps({"t": round(time.time() - self.t0, 2), "kind": kind, **data}) + "\n")

    def stage(self, name: str) -> None:
        print(f"\n{C['b']}{C['mag']}━━ {name}{C['x']}")
        self._log("stage", name=name)

    def step(self, msg: str) -> None:
        print(f"  {C['dim']}·{C['x']} {msg}")
        self._log("step", msg=msg)

    def tool(self, name: str, args: dict, result: str, ms: int, ok: bool = True) -> None:
        colour = C["grn"] if ok else C["red"]
        arg_s = json.dumps(args)[:110]
        print(f"  {colour}▸{C['x']} {C['b']}{name}{C['x']} {C['dim']}{arg_s}{C['x']}")
        print(f"    {C['dim']}{result[:180].replace(chr(10), ' ')} ({ms}ms){C['x']}")
        self._log("tool", name=name, args=args, result=result[:4000], ms=ms, ok=ok)

    def think(self, text: str) -> None:
        # Some free models leak raw harmony/channel control tokens into content.
        cleaned = re.sub(r"<\|?[a-z_]+\|?>|<channel\|>|^thought$", "", text,
                         flags=re.MULTILINE).strip()
        if not cleaned:
            return
        print(f"  {C['cyn']}💭{C['x']} {cleaned[:400]}")
        self._log("think", text=cleaned[:4000])

    def ok(self, msg: str) -> None:
        print(f"  {C['grn']}✓{C['x']} {msg}")
        self._log("ok", msg=msg)

    def warn(self, msg: str) -> None:
        print(f"  {C['yel']}!{C['x']} {msg}")
        self._log("warn", msg=msg)

    def error(self, msg: str) -> None:
        print(f"  {C['red']}✗{C['x']} {msg}")
        self._log("error", msg=msg)


TRACE = Trace()


def set_trace(t: Trace) -> None:
    """Point the shared tracer at a new log file, in place.

    Every module does `from core.trace import TRACE`, which binds the object at
    import time. Rebinding this module's global would leave all of them holding
    the original, so mutate the existing instance instead.
    """
    TRACE.path = t.path
    TRACE.t0 = t.t0
