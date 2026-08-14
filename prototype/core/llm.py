"""Thin OpenRouter client: chat completions, tool calling, JSON extraction, usage tracking."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from core import config

API = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    models: dict[str, int] = field(default_factory=dict)

    def add(self, resp: dict) -> None:
        self.calls += 1
        u = resp.get("usage") or {}
        self.prompt_tokens += u.get("prompt_tokens", 0)
        self.completion_tokens += u.get("completion_tokens", 0)
        m = resp.get("model", "?")
        self.models[m] = self.models.get(m, 0) + 1

    def summary(self) -> str:
        models = ", ".join(f"{k}×{v}" for k, v in sorted(self.models.items()))
        return (
            f"{self.calls} calls · {self.prompt_tokens}in/{self.completion_tokens}out tokens · {models}"
        )


USAGE = Usage()


class LLMError(RuntimeError):
    pass


def chat(
    messages: list[dict],
    *,
    model: str | None = None,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 8000,
    response_format: dict | None = None,
    retries: int = 4,
) -> dict:
    """One chat completion. Returns the raw assistant message dict."""
    body: dict[str, Any] = {
        "model": model or config.MODEL_AGENT,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = tool_choice or "auto"
    if response_format:
        body["response_format"] = response_format

    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                API,
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": f"Bearer {config.require_openrouter()}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://carouly.eu",
                    "X-Title": "Carouly Prototype",
                },
            )
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.load(r)
            if "error" in resp and not resp.get("choices"):
                raise LLMError(str(resp["error"])[:400])
            USAGE.add(resp)
            msg = resp["choices"][0]["message"]
            msg["_model"] = resp.get("model", "?")
            return msg
        except urllib.error.HTTPError as e:
            detail = e.read()[:500].decode(errors="replace")
            last = LLMError(f"HTTP {e.code}: {detail}")
            # 4xx other than 429 will not fix themselves
            if e.code not in (408, 429, 500, 502, 503, 520, 524):
                raise last
        except Exception as e:  # noqa: BLE001 - network layer, retry everything
            last = e
        time.sleep(2 * (attempt + 1))
    raise LLMError(f"chat failed after {retries} attempts: {last}")


def extract_json(text: str) -> Any:
    """Free models wrap JSON in prose and fences. Recover it."""
    if not text:
        raise LLMError("empty response")
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        if t[:4].lower() in ("json", "json"):
            t = t[4:]
        t = t.strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # Fall back to brace/bracket matching on the largest balanced span.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = t.find(opener)
        if start == -1:
            continue
        depth, in_str, esc = 0, False, False
        for i in range(start, len(t)):
            c = t[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c == opener:
                depth += 1
            elif c == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start : i + 1])
                    except json.JSONDecodeError:
                        break
    raise LLMError(f"no JSON found in: {text[:300]}")


def json_call(
    system: str,
    user: str,
    *,
    model: str | None = None,
    schema_hint: str = "",
    temperature: float = 0.3,
    max_tokens: int = 8000,
    retries: int = 3,
) -> Any:
    """Ask for JSON and keep asking until it parses. Repairs on the model's own output."""
    messages = [
        {"role": "system", "content": system + ("\n\n" + schema_hint if schema_hint else "")},
        {"role": "user", "content": user},
    ]
    err = ""
    for _ in range(retries):
        msg = chat(
            messages,
            model=model or config.MODEL_SYNTH,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        raw = msg.get("content") or ""
        try:
            return extract_json(raw)
        except LLMError as e:
            err = str(e)
            messages += [
                {"role": "assistant", "content": raw[:2000]},
                {
                    "role": "user",
                    "content": f"That did not parse as JSON ({err}). Reply with ONLY the raw JSON object, no prose, no code fences.",
                },
            ]
    raise LLMError(f"json_call failed: {err}")
