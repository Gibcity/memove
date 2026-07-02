import OpenAI from 'openai';
import type { ZodRawShape } from 'zod';
import { z } from 'zod';

// ponytail: LLM provider exposes an OpenAI-compatible endpoint. Provider-agnostic
// (MiniMax-M3 today, swap by changing LLM_BASE_URL + LLM_API_KEY).
// Anthropic-compatible endpoints typically live at /anthropic; OpenAI at /v1.
const baseURL = process.env.LLM_BASE_URL || 'https://api.minimax.io/v1';
const apiKey = process.env.LLM_API_KEY;

// ponytail: lazy-init so importing this module never crashes the server when
// LLM_API_KEY is unset. Callers (concierge, relocation chat) wrap `complete`
// in try/catch and fall back to hardcoded responses. Throw at call site, not
// import time — root cause for the "every endpoint 500s when key missing" class.
let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    if (!apiKey) {
      throw new Error('LLM_API_KEY env var is required');
    }
    _client = new OpenAI({ baseURL, apiKey });
  }
  return _client;
}

export const LLM_MODEL = process.env.LLM_MODEL || 'MiniMax-M3';

/**
 * Send a chat completion request to MiniMax-M3.
 * Returns the text content of the first choice.
 */
export async function complete(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await client().chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    max_tokens: opts?.maxTokens ?? 2048,
  });
  return res.choices[0]?.message?.content ?? '';
}

/**
 * Chat completion with native tool-calling. Single tool per turn — no loop.
 *
 * Returns the assistant text plus, when a tool call was made, the tool name
 * and the handler result. Callers (e.g. relocation-chat.service.ts) attach
 * these to the ChatResponse shape consumed by the FE.
 *
 * ponytail: single-hop. Multi-tool/iterative flows are out of scope; if a
 * tool's result needs follow-up reasoning, the caller can call completeWithTools
 * again with the result appended as a tool message. One tool per request keeps
 * token cost bounded and the frontend result surface predictable.
 */
export async function completeWithTools(
  messages: Array<{ role: string; content: string }>,
  tools: Array<{ name: string; description: string; inputSchema: ZodRawShape }>,
  toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>,
): Promise<{ text: string; tool?: string; data?: unknown }> {
  // ponytail: zod 4 ships `z.toJSONSchema`; no zod-to-json-schema dep needed.
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(z.object(t.inputSchema)),
    },
  }));

  const res = await client().chat.completions.create({
    model: LLM_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: openaiTools,
    tool_choice: 'auto',
    temperature: 0.6,
    max_tokens: 1000,
  });

  const message = res.choices[0]?.message;
  const rawCalls = message?.tool_calls;
  // ponytail: OpenAI SDK 6.x uses a discriminated union (`type: 'function'`)
  // instead of the old flat `ChatCompletionMessageToolCall.function`. Narrow
  // here so the rest of the file stays clean. Drop non-function calls.
  const toolCalls = rawCalls?.filter(
    (c): c is Extract<typeof c, { type: 'function'; function: { name: string; arguments: string } }> =>
      c.type === 'function',
  );
  if (toolCalls && toolCalls.length > 0) {
    // ponytail: ignore parallel calls — execute the first, drop the rest. The
    // FE renders one tool result per turn; multi-tool needs a UI redesign.
    const call = toolCalls[0];
    const name = call.function.name;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (_e) {
      throw new Error(`Model returned invalid JSON for tool '${name}': ${call.function.arguments}`, { cause: _e });
    }
    const handler = toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Model called unknown tool '${name}'`);
    }
    const result = await handler(parsed);
    return { text: message?.content ?? '', tool: name, data: result };
  }

  return { text: message?.content ?? '' };
}

/**
 * Streaming chat completion — yields text deltas as they arrive from the model.
 * Use when latency-to-first-token matters (UI chat surface); the non-streaming
 * `complete()` and `completeWithTools()` are fine for everything else.
 *
 * ponytail: additive — does not touch the two existing paths. Tool-calling
 * streaming is intentionally out of scope (would need to accumulate streaming
 * tool-call args + branch on completion); use completeWithTools() for that.
 * Skipped: backpressure handling, retry, stream cancellation beyond AbortSignal.
 */
export async function* completeStream(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): AsyncIterable<string> {
  const stream = await client().chat.completions.create(
    {
      model: LLM_MODEL,
      messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 2048,
      stream: true,
    },
    opts?.signal ? { signal: opts.signal } : undefined,
  );
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// SELF-CHECK: curl -s https://api.minimax.io/v1/models -H "Authorization: Bearer ***"
