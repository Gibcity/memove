import OpenAI from 'openai';

// ponytail: MiniMax-M3 exposes an OpenAI-compatible endpoint.
// Anthropic-compatible endpoint is at /anthropic; OpenAI is at /v1.
const baseURL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const apiKey = process.env.MINIMAX_API_KEY;

// ponytail: lazy-init so importing this module never crashes the server when
// MINIMAX_API_KEY is unset. Callers (concierge, relocation chat) wrap `complete`
// in try/catch and fall back to hardcoded responses. Throw at call site, not
// import time — root cause for the "every endpoint 500s when key missing" class.
let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY env var is required');
    }
    _client = new OpenAI({ baseURL, apiKey });
  }
  return _client;
}

export const LLM_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3';

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

// SELF-CHECK: curl -s https://api.minimax.io/v1/models -H "Authorization: Bearer $MINIMAX_API_KEY"
