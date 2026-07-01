import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { completeWithTools, completeStream } from '../../services/llm/client';
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

Always use the most relevant tool when the user asks a factual question. After getting tool results, explain your findings concisely in 2-3 sentences. Don't make up data — if you don't have a tool for what's needed, say so.`;

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
   * UI can render before the full response lands. Plain LLM only (no tools);
   * tool-calling streaming stays in the non-streaming path because we'd need
   * to accumulate streaming tool-call args and branch on completion.
   */
  async *handleStream(
    userId: string,
    message: string,
    history?: ChatHistoryItem[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const uid = String(userId);
    const journeyState = this.journey.getJourney(Number(uid));
    const messages = this.buildMessages(uid, message, history, journeyState);
    yield* completeStream(
      messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      { temperature: 0.6, maxTokens: 1000, signal },
    );
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
    const trimmedHistory = (history ?? []).slice(-10).map((h) => ({
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
