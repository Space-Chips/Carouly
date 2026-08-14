/**
 * The agent loop.
 *
 * There is exactly one genuinely open-ended step in this pipeline — finding out
 * what else a site says beyond its landing page — and this is the only thing
 * that runs as a loop. Everything else has a known output shape, so a loop that
 * can wander just costs more and fails in more ways.
 *
 * That restraint is the main departure from how this is usually built. There is
 * no sandboxed VM here and no shell: the agent gets a small set of typed tools
 * and a hard step limit, because every capability it actually needs is an HTTP
 * request.
 */

import { parseJson } from "@/lib/agent/llm";

export type ToolDef = {
  name: string;
  description: string;
  /** Human wording for the thread. The tool name itself is for the model. */
  label?: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  run: (args: Record<string, string>) => Promise<string>;
};

export type ToolCallReport = {
  id: string;
  name: string;
  detail: string;
  ms: number;
  ok: boolean;
  result: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

/**
 * Run a tool-calling loop to completion and parse the final answer as JSON.
 *
 * `maxSteps` is a budget, not a safety net: research that has not found what it
 * needs in six calls is not going to find it in sixteen, and every extra round
 * trip is latency the user watches.
 */
export const runAgent = async ({
  system,
  goal,
  tools,
  model,
  maxSteps = 6,
  onToolCall = () => {},
}: {
  system: string;
  goal: string;
  tools: ToolDef[];
  model: string;
  maxSteps?: number;
  onToolCall?: (report: ToolCallReport) => void;
}): Promise<Record<string, unknown>> => {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: goal },
  ];

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const schema = tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  for (let step = 0; step < maxSteps; step++) {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPEN_ROUTER_API?.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          "X-Title": "Carouly",
        },
        body: JSON.stringify({ model, messages, tools: schema, max_tokens: 2500 }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `agent step failed (${response.status}): ${(await response.text()).slice(0, 300)}`
      );
    }

    const message = (await response.json())?.choices?.[0]?.message as
      | ChatMessage
      | undefined;

    if (!message) throw new Error("agent returned no message");

    messages.push(message);

    const calls = message.tool_calls ?? [];

    if (!calls.length) {
      // No more tools wanted — this is the answer.
      return parseJson<Record<string, unknown>>(message.content ?? "{}");
    }

    for (const call of calls) {
      const tool = byName.get(call.function.name);
      const started = Date.now();

      let args: Record<string, string> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      const detail = Object.values(args)[0] ?? call.function.name;
      let result: string;
      let ok = true;

      if (!tool) {
        ok = false;
        result = `no such tool: ${call.function.name}`;
      } else {
        try {
          result = await tool.run(args);
        } catch (error) {
          ok = false;
          result = `error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      onToolCall({
        id: call.id,
        name: call.function.name,
        detail: String(detail).slice(0, 120),
        ms: Date.now() - started,
        ok,
        // The thread shows a one-line receipt, not the payload. A 40KB page dump
        // in the transcript is not transparency, it is noise.
        result: result.slice(0, 200).replace(/\s+/g, " "),
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.slice(0, 12_000),
      });
    }
  }

  // Out of steps. Ask for the answer with what it has rather than returning
  // nothing: partial research is still worth more than none.
  messages.push({
    role: "user",
    content:
      "You have used your tool budget. Reply now with ONLY the JSON object, " +
      "using what you found. Leave unknown fields null.",
  });

  const final = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPEN_ROUTER_API?.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 1500 }),
  });

  const content = (await final.json())?.choices?.[0]?.message?.content ?? "{}";
  return parseJson<Record<string, unknown>>(content);
};
