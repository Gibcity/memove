"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_MODEL = void 0;
exports.complete = complete;
exports.completeWithTools = completeWithTools;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
// ponytail: MiniMax-M3 exposes an OpenAI-compatible endpoint.
// Anthropic-compatible endpoint is at /anthropic; OpenAI is at /v1.
const baseURL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const apiKey = process.env.MINIMAX_API_KEY;
// ponytail: lazy-init so importing this module never crashes the server when
// MINIMAX_API_KEY is unset. Callers (concierge, relocation chat) wrap `complete`
// in try/catch and fall back to hardcoded responses. Throw at call site, not
// import time — root cause for the "every endpoint 500s when key missing" class.
let _client = null;
function client() {
    if (!_client) {
        if (!apiKey) {
            throw new Error('MINIMAX_API_KEY env var is required');
        }
        _client = new openai_1.default({ baseURL, apiKey });
    }
    return _client;
}
exports.LLM_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3';
/**
 * Send a chat completion request to MiniMax-M3.
 * Returns the text content of the first choice.
 */
async function complete(messages, opts) {
    const res = await client().chat.completions.create({
        model: exports.LLM_MODEL,
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
async function completeWithTools(messages, tools, toolHandlers) {
    // ponytail: zod 4 ships `z.toJSONSchema`; no zod-to-json-schema dep needed.
    const openaiTools = tools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: zod_1.z.toJSONSchema(zod_1.z.object(t.inputSchema)),
        },
    }));
    const res = await client().chat.completions.create({
        model: exports.LLM_MODEL,
        messages: messages,
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
    const toolCalls = rawCalls?.filter((c) => c.type === 'function');
    if (toolCalls && toolCalls.length > 0) {
        // ponytail: ignore parallel calls — execute the first, drop the rest. The
        // FE renders one tool result per turn; multi-tool needs a UI redesign.
        const call = toolCalls[0];
        const name = call.function.name;
        let parsed;
        try {
            parsed = JSON.parse(call.function.arguments);
        }
        catch (_e) {
            throw new Error(`Model returned invalid JSON for tool '${name}': ${call.function.arguments}`);
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
// SELF-CHECK: curl -s https://api.minimax.io/v1/models -H "Authorization: Bearer ***"
