"""@tool decorator — derives an OpenAI/OpenRouter function schema from a Python signature.

Keeps tool definitions next to their implementation so there is no schema drift.
Docstring format:

    Summary line becomes the tool description.

    Args:
        url: what this param means
        depth: what this one means
"""
from __future__ import annotations

import inspect
import re
import typing
from dataclasses import dataclass
from typing import Any, Callable, get_args, get_origin

_PY_TO_JSON = {str: "string", int: "integer", float: "number", bool: "boolean"}


def _schema_for(annotation: Any) -> dict:
    if annotation is inspect.Parameter.empty or annotation is Any:
        return {"type": "string"}
    origin = get_origin(annotation)
    if origin is typing.Union or (origin is not None and str(origin) == "types.UnionType"):
        args = [a for a in get_args(annotation) if a is not type(None)]
        return _schema_for(args[0]) if args else {"type": "string"}
    if origin in (list, set, tuple):
        args = get_args(annotation)
        return {"type": "array", "items": _schema_for(args[0]) if args else {"type": "string"}}
    if origin is dict:
        return {"type": "object"}
    if annotation in _PY_TO_JSON:
        return {"type": _PY_TO_JSON[annotation]}
    if isinstance(annotation, type) and issubclass(annotation, str):
        return {"type": "string"}
    return {"type": "string"}


def _parse_doc(doc: str) -> tuple[str, dict[str, str]]:
    doc = inspect.cleandoc(doc or "")
    parts = re.split(r"\n\s*Args:\s*\n", doc, maxsplit=1)
    desc = parts[0].strip()
    params: dict[str, str] = {}
    if len(parts) == 2:
        current = None
        for line in parts[1].splitlines():
            m = re.match(r"\s*(\w+)\s*:\s*(.*)", line)
            if m:
                current = m.group(1)
                params[current] = m.group(2).strip()
            elif current and line.strip():
                params[current] += " " + line.strip()
    return desc, params


@dataclass
class Tool:
    name: str
    fn: Callable
    schema: dict

    def __call__(self, **kwargs):
        return self.fn(**kwargs)


def tool(fn: Callable) -> Tool:
    desc, param_docs = _parse_doc(fn.__doc__ or "")
    sig = inspect.signature(fn)
    props, required = {}, []
    for name, p in sig.parameters.items():
        if name in ("self", "ctx"):
            continue
        s = _schema_for(p.annotation)
        if name in param_docs:
            s["description"] = param_docs[name]
        props[name] = s
        if p.default is inspect.Parameter.empty:
            required.append(name)
    return Tool(
        name=fn.__name__,
        fn=fn,
        schema={
            "type": "function",
            "function": {
                "name": fn.__name__,
                "description": desc,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    "required": required,
                },
            },
        },
    )


class Toolbox:
    """A named set of tools handed to an Agent."""

    def __init__(self, *tools: Tool):
        self._tools: dict[str, Tool] = {}
        for t in tools:
            self.add(t)

    def add(self, t: Tool) -> None:
        self._tools[t.name] = t

    def schemas(self) -> list[dict]:
        return [t.schema for t in self._tools.values()]

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools)

    def subset(self, names: list[str]) -> "Toolbox":
        return Toolbox(*[self._tools[n] for n in names if n in self._tools])
