"""Workflow graph engine.

A template IS a workflow: a JSON DAG of nodes. Nodes reference each other with
`{{node_id.field}}` placeholders; the engine derives edges from those references,
topologically sorts, and executes.

Two things make this cheap to iterate on:
  * content-hash caching — a node whose type+resolved params are unchanged is
    replayed from run.json instead of re-billed.
  * `foreach` — a single node can fan out over a list (3 script beats -> 3 clips)
    without needing subgraph plumbing.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from core.trace import TRACE

REF = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)((?:\.[a-zA-Z0-9_\[\]]+)*)\s*\}\}")

NODE_TYPES: dict[str, Callable[["NodeCtx"], Any]] = {}


def node_type(name: str):
    def deco(fn):
        NODE_TYPES[name] = fn
        return fn
    return deco


class GraphError(RuntimeError):
    pass


# ─────────────────────────── reference resolution ───────────────────────────


def _dig(obj: Any, path: str) -> Any:
    """Walk 'a.b[0].c' into nested dicts/lists."""
    for part in filter(None, re.split(r"\.", path)):
        m = re.match(r"(\w+)((?:\[\d+\])*)$", part)
        if not m:
            return None
        key, idx = m.group(1), m.group(2)
        if isinstance(obj, dict):
            obj = obj.get(key)
        else:
            obj = getattr(obj, key, None)
        for i in re.findall(r"\[(\d+)\]", idx or ""):
            if isinstance(obj, (list, tuple)) and int(i) < len(obj):
                obj = obj[int(i)]
            else:
                return None
        if obj is None:
            return None
    return obj


def resolve(value: Any, scope: dict) -> Any:
    """Substitute {{refs}} in any nested structure.

    A string that is *exactly* one reference keeps the referent's native type
    (list/dict/number); references embedded in longer strings are stringified.
    """
    if isinstance(value, str):
        whole = REF.fullmatch(value.strip())
        if whole:
            root, path = whole.group(1), whole.group(2).lstrip(".")
            base = scope.get(root)
            return _dig(base, path) if path else base

        def sub(m: re.Match) -> str:
            root, path = m.group(1), m.group(2).lstrip(".")
            base = scope.get(root)
            out = _dig(base, path) if path else base
            if out is None:
                return ""
            return out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)

        return REF.sub(sub, value)
    if isinstance(value, list):
        return [resolve(v, scope) for v in value]
    if isinstance(value, dict):
        return {k: resolve(v, scope) for k, v in value.items()}
    return value


def refs_in(value: Any) -> set[str]:
    """Every root id referenced anywhere inside a structure."""
    found: set[str] = set()
    if isinstance(value, str):
        found |= {m.group(1) for m in REF.finditer(value)}
    elif isinstance(value, list):
        for v in value:
            found |= refs_in(v)
    elif isinstance(value, dict):
        for v in value.values():
            found |= refs_in(v)
    return found


# ─────────────────────────── model ───────────────────────────


@dataclass
class Node:
    id: str
    type: str
    params: dict = field(default_factory=dict)
    foreach: str | None = None      # e.g. "{{script.shots}}"
    as_: str = "item"               # loop variable name inside params
    cache: bool = True

    @staticmethod
    def from_dict(d: dict) -> "Node":
        return Node(
            id=d["id"],
            type=d["type"],
            params={k: v for k, v in d.items() if k not in ("id", "type", "foreach", "as", "cache")},
            foreach=d.get("foreach"),
            as_=d.get("as", "item"),
            cache=d.get("cache", True),
        )


@dataclass
class NodeCtx:
    """What a node implementation gets. `params` are already fully resolved."""
    node: Node
    params: dict
    scope: dict
    workdir: Path
    brand: dict


@dataclass
class Workflow:
    id: str
    name: str
    description: str = ""
    inputs: dict = field(default_factory=dict)
    nodes: list[Node] = field(default_factory=list)
    match: dict = field(default_factory=dict)
    output: str = ""
    meta: dict = field(default_factory=dict)

    @staticmethod
    def load(path: Path) -> "Workflow":
        d = json.loads(Path(path).read_text())
        return Workflow(
            id=d.get("id", Path(path).stem),
            name=d.get("name", d.get("id", "")),
            description=d.get("description", ""),
            inputs=d.get("inputs", {}),
            nodes=[Node.from_dict(n) for n in d.get("nodes", [])],
            match=d.get("match", {}),
            output=d.get("output", ""),
            meta={k: v for k, v in d.items()
                  if k not in ("id", "name", "description", "inputs", "nodes", "match", "output")},
        )

    def order(self) -> list[Node]:
        """Topological sort. Edges come from {{refs}}, not from hand-written wiring."""
        by_id = {n.id: n for n in self.nodes}
        if len(by_id) != len(self.nodes):
            raise GraphError("duplicate node ids")

        deps: dict[str, set[str]] = {}
        for n in self.nodes:
            r = refs_in(n.params) | (refs_in(n.foreach) if n.foreach else set())
            deps[n.id] = {d for d in r if d in by_id and d != n.id}

        ordered, done = [], set()
        while len(ordered) < len(self.nodes):
            ready = [n for n in self.nodes if n.id not in done and deps[n.id] <= done]
            if not ready:
                stuck = [n.id for n in self.nodes if n.id not in done]
                raise GraphError(f"cycle or missing dependency among: {stuck}")
            ready.sort(key=lambda n: [x.id for x in self.nodes].index(n.id))
            for n in ready:
                ordered.append(n)
                done.add(n.id)
        return ordered

    def validate_inputs(self, values: dict) -> list[str]:
        problems = []
        for key, spec in self.inputs.items():
            if spec.get("required", True) and key not in values:
                problems.append(f"missing required input '{key}': {spec.get('description','')}")
        return problems


# ─────────────────────────── execution ───────────────────────────


def _hash(node: Node, params: dict) -> str:
    blob = json.dumps({"t": node.type, "p": params}, sort_keys=True, default=str)
    return hashlib.sha1(blob.encode()).hexdigest()[:16]


def _has_dry_run(value: Any) -> bool:
    """Did this cached output come from a stubbed generation call?"""
    if isinstance(value, dict):
        if value.get("dry_run") is True:
            return True
        return any(_has_dry_run(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_dry_run(v) for v in value)
    return False


class Run:
    """Executes a Workflow and persists node outputs so reruns are near-free."""

    def __init__(self, wf: Workflow, workdir: Path, *, brand: dict | None = None, fresh: bool = False):
        self.wf = wf
        self.workdir = workdir
        self.brand = brand or {}
        self.state_path = workdir / "run.json"
        workdir.mkdir(parents=True, exist_ok=True)
        self.state = {} if fresh else self._load_state()

    def _load_state(self) -> dict:
        if self.state_path.exists():
            try:
                return json.loads(self.state_path.read_text())
            except json.JSONDecodeError:
                return {}
        return {}

    def _save(self) -> None:
        self.state_path.write_text(json.dumps(self.state, indent=2, default=str, ensure_ascii=False))

    def execute(self, inputs: dict) -> dict:
        problems = self.wf.validate_inputs(inputs)
        if problems:
            raise GraphError("; ".join(problems))

        scope: dict[str, Any] = {"inputs": inputs, "brand": self.brand}
        order = self.wf.order()
        TRACE.step(f"graph «{self.wf.id}» — {len(order)} nodes: {' → '.join(n.id for n in order)}")

        for node in order:
            impl = NODE_TYPES.get(node.type)
            if impl is None:
                raise GraphError(f"node '{node.id}': unknown type '{node.type}'. "
                                 f"Known: {', '.join(sorted(NODE_TYPES))}")

            if node.foreach:
                items = resolve(node.foreach, scope) or []
                if not isinstance(items, list):
                    raise GraphError(f"node '{node.id}': foreach did not resolve to a list")
                out = []
                for i, item in enumerate(items):
                    loop_scope = {**scope, node.as_: item, "index": i}
                    out.append(self._run_one(node, loop_scope, suffix=f"[{i}]"))
                scope[node.id] = out
            else:
                scope[node.id] = self._run_one(node, scope)
            self.state.setdefault("outputs", {})[node.id] = scope[node.id]
            self._save()

        result = resolve(self.wf.output, scope) if self.wf.output else scope
        self.state["result"] = result
        self._save()
        return {"scope": scope, "result": result}

    def _run_one(self, node: Node, scope: dict, suffix: str = "") -> Any:
        params = resolve(node.params, scope)
        key = _hash(node, params)
        cached = (self.state.get("cache") or {}).get(key)
        if node.cache and cached is not None:
            # A cached placeholder from a stubbed run must never be served once a
            # real key is present, or adding FAL_KEY would silently replay
            # dry-run URLs and look like a successful render.
            from tools import falai

            if _has_dry_run(cached) and not falai.dry_run():
                TRACE.warn(f"  {node.id}{suffix} — discarding dry-run cache, regenerating for real")
            else:
                TRACE.step(f"  {node.id}{suffix} ⟲ cached")
                return cached

        TRACE.step(f"  {node.id}{suffix} ({node.type})")
        out = NODE_TYPES[node.type](
            NodeCtx(node=node, params=params, scope=scope, workdir=self.workdir, brand=self.brand)
        )
        if node.cache:
            self.state.setdefault("cache", {})[key] = out
            self._save()
        return out


def load_presets(directory: Path) -> list[Workflow]:
    return [Workflow.load(p) for p in sorted(directory.glob("*.json"))]
