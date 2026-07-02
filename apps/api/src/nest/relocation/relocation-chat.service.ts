import { Injectable } from '@nestjs/common';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { completeWithTools } from '../../services/llm/client';
import {
  ALL_RELOCATION_TOOLS,
  type RelocationServices,
  type ToolDefinition,
} from '../../mcp/tool-registry';

// ponytail: response shape the FE renders. `text` is required; `tool`/`data`
// surface what the LLM invoked, so the FE can show tool-attribution.
export interface ChatResponse {
  role: 'agent';
  text: string;
  tool?: string;
  data?: unknown;
}

export interface ChatHistoryItem {
  role: string;
  content: string;
}

const SYSTEM_PROMPT = `You are a relocation planning assistant. You help users discover, evaluate, and compare places to live. You have tools to search locations, score them by weighted criteria, compare head-to-head, check fiscal health, explain scores, and more.

Always use the most relevant tool when the user asks a factual question. After getting tool results, explain your findings concisely in 2-3 sentences. Don't make up data — if you don't have a tool for what's needed, say so.

Hard rules:
- Never invent numbers, prices, statistics, or rankings. Every factual claim must come from a tool result.
- If no tool fits the question, reply exactly: "I don't have data for that." Do not guess.`;

@Injectable()
export class RelocationChatService {
  constructor(
    private readonly relocation: RelocationService,
    private readonly journey: RelocationJourneyService,
  ) {}

  /**
   * LLM-driven tool-calling agent. Replaces the previous regex-keyword chain.
   *
   * Flow per request:
   *   1. Build messages (system prompt + history + user turn)
   *   2. Send tool-augmented prompt via completeWithTools()
   *   3. Execute at most ONE tool call → return `{ text, tool, data }`
   *   4. On error: return fallback text (FE still renders a message).
   */
  async handle(
    userId: string,
    message: string,
    history?: ChatHistoryItem[],
  ): Promise<ChatResponse> {
    const uid = String(userId);
    const journeyState = this.journey.getJourney(Number(uid));
    const messages = this.buildMessages(uid, message, history, journeyState);

    const services: RelocationServices = {
      relocation: this.relocation,
      journey: this.journey,
    };
    const tools = this.buildChatTools();
    const handlers = this.buildChatHandlers(services, uid);

    try {
      const result = await completeWithTools(messages, tools, handlers);
      return {
        role: 'agent',
        text: result.text,
        tool: result.tool,
        data: result.data,
      };
    } catch (_e) {
      // ponytail: LLM unavailable (no key, network, rate limit). Same payload
      // shape so the FE renders a graceful error without a separate code path.
      return {
        role: 'agent',
        text: "I'm having trouble connecting to my tools right now. Please try again.",
      };
    }
  }

  /**
   * Streaming variant of `handle()` — yields text tokens incrementally so the
   * UI can render before the full response lands.
   *
   * Tool-grounded: runs `handle()` first (LLM tool-calling + handler execution)
   * to produce a grounded result, then streams the final synthesis text word
   * by word so the SSE wire shape stays compatible with the FE's streaming
   * UI. Previously this called `completeStream()` directly (plain LLM, no
   * tools) — which is why "compare Austin vs Raleigh for taxes" returned
   * invented numbers instead of tool data.
   *
   * ponytail: streaming is purely a display optimization once the answer is
   * grounded — we already paid the tool-call latency. True mid-tool-call SSE
   * tokens (accumulate streaming tool args, branch on finish) is out of scope.
   */
  async *handleStream(
    userId: string,
    message: string,
    history?: ChatHistoryItem[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const result = await this.handle(userId, message, history);
    const tokens = result.text.split(/(\s+)/); // keep whitespace as its own token
    for (const tok of tokens) {
      if (signal?.aborted) return;
      yield tok;
      // ponytail: tiny yield-tick so the FE paints between tokens. Skipped
      // real per-token delays (would drag the final word out). The UI sees
      // a single fast burst instead of a 200ms-per-word typewriter.
      if (tok.trim().length > 0) await new Promise((r) => setTimeout(r, 4));
    }
  }

  private buildMessages(
    _userId: string,
    message: string,
    history: ChatHistoryItem[] | undefined,
    journey: ReturnType<RelocationJourneyService['getJourney']>,
  ): Array<{ role: string; content: string }> {
    const sysCtx = `Current journey phase: ${journey.currentPhase}.${
      journey.shortlistedLocations.length > 0
        ? ` Shortlisted cities: ${journey.shortlistedLocations.join(', ')}.`
        : ' No cities shortlisted yet.'
    }`;
    const trimmedHistory = (history ?? []).slice(-20).map((h) => ({
      role: h.role === 'agent' ? 'assistant' : 'user',
      content: h.content,
    }));
    return [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${sysCtx}` },
      ...trimmedHistory,
      { role: 'user', content: message },
    ];
  }

  /**
   * Expose the registry's tool metadata in the shape completeWithTools expects.
   * Chat path includes ALL relocation tools — the LLM picks the most relevant.
   */
  private buildChatTools(): Array<{
    name: string;
    description: string;
    inputSchema: import('zod').ZodRawShape;
  }> {
    return ALL_RELOCATION_TOOLS.map((d: ToolDefinition) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema,
    }));
  }

  private buildChatHandlers(
    services: RelocationServices,
    userId: string,
  ): Map<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const handlers = new Map<
      string,
      (args: Record<string, unknown>) => Promise<unknown>
    >();
    for (const def of ALL_RELOCATION_TOOLS) {
      handlers.set(def.name, async (args) => def.handler(services, args, userId));
    }
    return handlers;
  }
}
