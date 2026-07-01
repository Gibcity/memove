import { Injectable } from '@nestjs/common';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { complete } from '../../services/llm/client';

// ponytail: same response shape the controller returned before the extraction.
// The FE renders on `role` + `content`, with optional `type`/`cities`/`phase`/
// `shortlist`/`shortlistCount`. Anything outside this union is what the chat
// handler already produced — no contract change.
export interface ChatResponse {
  role: 'agent';
  content: string;
  type?:
    | 'city_list'
    | 'compare_prompt'
    | 'timeline_prompt'
    | 'cost_prompt'
    | 'admin_prompt'
    | 'assistant'
    | 'clarify';
  cities?: unknown[];
  phase?: string;
  shortlist?: string[];
  shortlistCount?: number;
}

export interface ChatHistoryItem {
  role: string;
  content: string;
}

@Injectable()
export class RelocationChatService {
  constructor(
    private readonly relocation: RelocationService,
    private readonly journey: RelocationJourneyService,
  ) {}

  /**
   * Handle a user chat message.
   *
   * Regex fast-path first (greeting/help, find, compare, timeline, cost,
   * admin). Anything that falls through is sent to the LLM as a last resort,
   * with a hardcoded clarify reply if the LLM is unavailable.
   */
  async handle(
    userId: string,
    message: string,
    history?: ChatHistoryItem[],
  ): Promise<ChatResponse> {
    const text = message?.toLowerCase() ?? '';
    const journey = this.journey.getJourney(Number(userId));

    // Intent: greeting / help
    if (!text || text.length < 5 || /^(hi|hey|hello|help|start)/.test(text)) {
      return {
        role: 'agent' as const,
        content:
          `Welcome to your relocation journey! I can help you:\n\n` +
          `🔍 **Discover** — Find cities that match your priorities\n` +
          `💰 **Compare** — Cost of living, taxes, salary adjustments\n` +
          `📦 **Plan** — Move timeline, cost estimates, utility setup\n` +
          `📋 **Admin** — DMV, voter registration, insurance, address changes\n` +
          `🏥 **Settle** — Healthcare, schools, community fit\n\n` +
          `You're currently in the **${journey.currentPhase}** phase${
            journey.shortlistedLocations.length > 0
              ? ` with ${journey.shortlistedLocations.length} shortlisted ${
                  journey.shortlistedLocations.length === 1 ? 'city' : 'cities'
                }`
              : ''
          }.\n\n` +
          `What would you like to explore?`,
        phase: journey.currentPhase,
        shortlistCount: journey.shortlistedLocations.length,
      };
    }

    // Intent: find/search cities
    if (/find|search|look|recommend|suggest|best|warm|cheap|affordable|sunny|safe/.test(text)) {
      const results = this.relocation.scoreLocations({
        limit: 5,
        weights: this.inferWeights(text),
      });
      const top = results.topMatches.slice(0, 5);
      return {
        role: 'agent' as const,
        content:
          `Here are 5 cities that match what you're looking for:\n\n` +
          top
            .map(
              (m, i) =>
                `${i + 1}. **${m.name}** — Score: ${m.matchScore}/100\n` +
                `   💰 $${m.keyMetrics.medianHomeValue?.toLocaleString() ?? 'N/A'} median home | Rent: $${m.keyMetrics.medianRent?.toLocaleString() ?? 'N/A'}/mo\n` +
                `   🌡️ ${m.keyMetrics.daysMaxGt90FAnnual ?? '?'} hot days/yr | ☀️ Sunshine data available\n` +
                `   🏥 Healthcare: ${m.keyMetrics.healthcareAccessScore ?? '?'}/100\n` +
                `   ${m.trace.slice(0, 2).join(' | ')}`,
            )
            .join('\n\n'),
        type: 'city_list' as const,
        cities: top,
        phase: journey.currentPhase,
      };
    }

    // Intent: compare
    if (/compare|vs|versus|difference|better/.test(text)) {
      return {
        role: 'agent' as const,
        content:
          `I can compare cities side-by-side across 15+ dimensions: cost of living, taxes, climate, crime, healthcare, and more.\n\nWhich cities would you like to compare? For example:\n• "Compare Austin and Denver"\n• "Austin TX vs Nashville TN"`,
        type: 'compare_prompt' as const,
        shortlist: journey.shortlistedLocations,
      };
    }

    // Intent: move timeline / logistics
    if (/timeline|plan|move|moving|checklist|when|schedule/.test(text)) {
      return {
        role: 'agent' as const,
        content:
          `I'll help you plan your move! I can generate a personalized timeline with tasks from 8 weeks before your move through your first month in the new city.\n\nWhen are you planning to move? (e.g., "September 2026" or "in 3 months")`,
        type: 'timeline_prompt' as const,
        phase: journey.currentPhase,
      };
    }

    // Intent: cost / tax / salary
    if (/cost|tax|salary|money|budget|expensive|afford|income/.test(text)) {
      const cities =
        journey.shortlistedLocations.length > 0
          ? `\n\nYour shortlisted cities: ${journey.shortlistedLocations.join(', ')}`
          : '\n\nSearch for a city first, then I can give you a detailed cost breakdown.';
      return {
        role: 'agent' as const,
        content:
          `I can analyze costs across multiple dimensions:\n\n` +
          `• **Cost of Living Index** — How expensive is the city vs national average?\n` +
          `• **Tax Impact** — Income tax, property tax, and overall burden\n` +
          `• **Salary Adjustment** — What salary do you need to maintain your lifestyle?\n` +
          `• **Full Cost Breakdown** — Housing, food, transport, healthcare, utilities\n` +
          cities,
        type: 'cost_prompt' as const,
      };
    }

    // Intent: DMV / admin / license
    if (/dmv|license|registration|vote|voter|insurance|address|paperwork/.test(text)) {
      return {
        role: 'agent' as const,
        content:
          `I can guide you through the administrative side of moving:\n\n` +
          `• **Driver's License** — State-specific requirements, deadlines, fees\n` +
          `• **Vehicle Registration** — Title transfer, registration deadlines\n` +
          `• **Voter Registration** — Deadlines, online registration, requirements\n` +
          `• **Insurance Changes** — Auto, home/renters, health insurance impact\n` +
          `• **Address Change** — Comprehensive list of who to notify\n\n` +
          `Which state are you moving to?`,
        type: 'admin_prompt' as const,
      };
    }

    // Default: LLM fallback. The regex chain above covers the common intents;
    // anything that falls through here is either ambiguous or out-of-pattern.
    // ponytail: graceful degradation — same payload shape the client already
    // understands (text/content), unknown `type` so the renderer degrades to
    // plain text. No new files, no service split. Upgrade path: stream tokens,
    // attach MCP tool calls (server/src/mcp/), or run tool-call loop in-process.
    try {
      const sysPrompt =
        `You are the memove relocation assistant. Help the user plan a move to a US city.\n` +
        `Current journey phase: ${journey.currentPhase}.\n` +
        `Shortlisted cities: ${
          journey.shortlistedLocations.length > 0 ? journey.shortlistedLocations.join(', ') : 'none yet'
        }.\n` +
        `You can recommend cities, compare costs, outline timelines, and explain admin tasks ` +
        `(DMV, voter registration, insurance, address changes). Keep replies concise and actionable. ` +
        `If you need data you don't have, say what you'd need.`;
      const trimmedHistory = (history ?? []).slice(-10).map((h) => ({
        role: (h.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: h.content,
      }));
      const messages = [
        { role: 'system' as const, content: sysPrompt },
        ...trimmedHistory,
        { role: 'user' as const, content: message },
      ];
      const reply = await complete(messages, { temperature: 0.6, maxTokens: 600 });
      return {
        role: 'agent' as const,
        content: reply || `I couldn't reach the assistant right now — could you rephrase that?`,
        type: 'assistant' as const,
      };
    } catch (_e) {
      // ponytail: LLM unavailable (no API key, network, rate limit) → original
      // clarify response. Same payload the client rendered before this change.
      return {
        role: 'agent' as const,
        content:
          `I understand you're asking about: "${message}"\n\nI can help with finding cities, comparing costs, planning your move, handling paperwork, and settling in. Could you give me a bit more detail about what you need? For example:\n\n` +
          `• "Find warm cities under $300k homes"\n` +
          `• "Compare Austin TX and Raleigh NC"\n` +
          `• "Plan a move for October 2026"\n` +
          `• "What do I need to register my car in Texas?"`,
        type: 'clarify' as const,
      };
    }
  }

  // ponytail: keyword weight bumps over the engine's default. Lives in the
  // service because the regex chain lives here; coupling to the LLM prompt
  // and weight logic in one place keeps the intent↔scoring mapping auditable.
  private inferWeights(message: string): Record<string, number> {
    const w: Record<string, number> = { cost: 3, climate: 3, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 };
    if (/cheap|afford|budget|inexpensive|low cost/.test(message)) w.cost = 5;
    if (/warm|sunny|hot|sun/.test(message)) {
      w.climate = 5;
      w.outdoors = 4;
    }
    if (/safe|low crime|secure/.test(message)) w.safety = 5;
    if (/hospital|doctor|health|medical/.test(message)) w.healthcare = 5;
    if (/job|career|work|remote|internet|broadband/.test(message)) w.jobs = 5;
    if (/outdoor|hike|nature|mountain|beach/.test(message)) w.outdoors = 5;
    return w;
  }
}