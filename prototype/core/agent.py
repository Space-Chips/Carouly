"""The agent loop: model + toolbox + goal -> tool calls until it produces a final answer.

Deliberately small. Everything interesting lives in the tools and the prompts.
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable

from core import config, llm
from core.tools import Toolbox
from core.trace import TRACE


class Agent:
    def __init__(
        self,
        name: str,
        system: str,
        toolbox: Toolbox,
        *,
        model: str | None = None,
        max_steps: int = 24,
        temperature: float = 0.3,
        on_tool: Callable[[str, dict, Any], None] | None = None,
    ):
        self.name = name
        self.system = system
        self.toolbox = toolbox
        self.model = model or config.MODEL_AGENT
        self.max_steps = max_steps
        self.temperature = temperature
        self.on_tool = on_tool
        self.messages: list[dict] = []

    def run(self, goal: str, *, expect_json: bool = False) -> Any:
        self.messages = [
            {"role": "system", "content": self.system},
            {"role": "user", "content": goal},
        ]
        TRACE.step(f"agent «{self.name}» starting ({self.model}, tools: {', '.join(self.toolbox.names())})")

        for step in range(self.max_steps):
            msg = llm.chat(
                self.messages,
                model=self.model,
                tools=self.toolbox.schemas(),
                temperature=self.temperature,
            )
            calls = msg.get("tool_calls") or []
            content = msg.get("content") or ""

            # Some free models emit prose alongside calls; keep both in history.
            self.messages.append(
                {
                    "role": "assistant",
                    "content": content,
                    **({"tool_calls": calls} if calls else {}),
                }
            )

            if not calls:
                if content.strip():
                    TRACE.think(content)
                if expect_json:
                    try:
                        return llm.extract_json(content)
                    except llm.LLMError:
                        self.messages.append(
                            {"role": "user", "content": "Reply with only the final JSON object."}
                        )
                        continue
                return content

            if content.strip():
                TRACE.think(content)

            for call in calls:
                self._execute(call)

        TRACE.warn(f"agent «{self.name}» hit max_steps={self.max_steps}")
        return self._force_finish(expect_json)

    def _execute(self, call: dict) -> None:
        fn = call.get("function", {})
        name = fn.get("name", "")
        raw_args = fn.get("arguments") or "{}"
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            args = {}

        tool = self.toolbox.get(name)
        t0 = time.time()
        if tool is None:
            result = f"ERROR: no such tool '{name}'. Available: {', '.join(self.toolbox.names())}"
            ok = False
        else:
            try:
                out = tool(**args)
                result = out if isinstance(out, str) else json.dumps(out, default=str)
                ok = True
            except Exception as e:  # noqa: BLE001 - surface failure back to the model
                result = f"ERROR: {type(e).__name__}: {e}"
                ok = False

        ms = int((time.time() - t0) * 1000)
        TRACE.tool(name, args, result, ms, ok)
        if self.on_tool:
            self.on_tool(name, args, result)

        # Long tool output blows the context on 200k-limited free models.
        if len(result) > 24000:
            result = result[:24000] + f"\n…[truncated, {len(result)} chars total]"

        self.messages.append(
            {"role": "tool", "tool_call_id": call.get("id", name), "name": name, "content": result}
        )

    def _force_finish(self, expect_json: bool) -> Any:
        self.messages.append(
            {"role": "user", "content": "Stop calling tools. Give your final answer now."}
        )
        msg = llm.chat(self.messages, model=self.model, temperature=self.temperature)
        content = msg.get("content") or ""
        if expect_json:
            try:
                return llm.extract_json(content)
            except llm.LLMError:
                return {}
        return content
