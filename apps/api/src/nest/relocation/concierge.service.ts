import { Injectable } from '@nestjs/common';
import { RelocationService } from './relocation.service';
import { complete } from '../../services/llm/client';

// ponytail: in-memory log, upgrade to agent_runs table when persistence ships.
const queryLog: { userId: string; query: string; category: string; ts: string; handled: boolean }[] = [];

// ponytail: short system prompt for the fallback LLM path. Keep tight — token cost per non-categorized query.
const CONCIERGE_SYSTEM_PROMPT =
  'You are a practical relocation concierge for someone moving within the US. ' +
  'Answer concisely (under 120 words) about housing, costs, logistics, utilities, ' +
  'pets, insurance, mail, banking, schools, or community. No fluff, no medical/legal advice.';

@Injectable()
export class ConciergeService {
  constructor(private readonly relocation: RelocationService) {}

  /**
   * Handle a relocation question that no dedicated lane covers.
   * Returns a best-effort answer + logs the query for future lane promotion.
   */
  async handleQuery(userId: string, query: string): Promise<{ answer: string; category: string; logged: boolean }> {
    const category = this.classifyQuery(query);
    const isGeneral = category === 'general';

    // ponytail: async is fine — controller just returns the promise, response shape unchanged.
    if (isGeneral) {
      try {
        const answer = await complete(
          [
            { role: 'system', content: CONCIERGE_SYSTEM_PROMPT },
            { role: 'user', content: query },
          ],
          { temperature: 0.4, maxTokens: 300 },
        );
        if (answer && answer.trim()) {
          // ponytail: tag LLM-path so stats can compare table hits vs model synthesis.
          this.log(userId, query, 'general_llm');
          return { answer: answer.trim(), category: 'general_llm', logged: true };
        }
      } catch {
        // fall through to hardcoded general response below
      }
    }

    this.log(userId, query, category);
    return { answer: this.buildResponse(query, category), category, logged: true };
  }

  private log(userId: string, query: string, category: string): void {
    if (queryLog.length > 1000) queryLog.shift();
    queryLog.push({ userId, query, category, ts: new Date().toISOString(), handled: true });
  }

  /**
   * Return the query log for admin review (lane-promotion pipeline).
   * Group by category + count, sorted by frequency desc.
   */
  getQueryStats(): { category: string; count: number; sampleQueries: string[] }[] {
    const groups: Record<string, string[]> = {};
    for (const entry of queryLog) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry.query);
    }
    return Object.entries(groups)
      .map(([category, queries]) => ({ category, count: queries.length, sampleQueries: queries.slice(0, 5) }))
      .sort((a, b) => b.count - a.count);
  }

  private classifyQuery(query: string): string {
    const q = query.toLowerCase();
    // ponytail: keyword regex, not ML. Upgrade to embedding classifier when query volume justifies.
    if (/scam|fraud|legit|fake|trust|reliable/.test(q)) return 'safety';
    if (/pet|dog|cat|animal/.test(q)) return 'pets';
    if (/insur|cover|claim|deductible/.test(q)) return 'insurance';
    if (/utility|electric|water|gas|internet|wifi/.test(q)) return 'utilities';
    if (/storage|unit|pod/.test(q)) return 'storage';
    if (/clean|paint|repair|fix|damage/.test(q)) return 'maintenance';
    if (/bank|account|transfer|direct deposit/.test(q)) return 'banking';
    if (/mail|address|forward|usps/.test(q)) return 'mail';
    if (/lonely|friend|community|meet|social/.test(q)) return 'social';
    if (/stress|anxious|worried|overwhelm/.test(q)) return 'emotional';
    return 'general';
  }

  private buildResponse(query: string, category: string): string {
    // ponytail: lookup table, not dynamic generation. Upgrade to LLM synthesis when richer replies are needed.
    const responses: Record<string, string> = {
      safety: 'For rental scams: never wire money before seeing a property in person, verify the landlord owns the property through county records, and use established platforms (Zillow, Apartments.com). Red flags: pressure to sign immediately, below-market rent, landlord "out of the country".',
      pets: 'For pet-friendly housing: filter for pet policies on Zillow/Apartments.com, budget for pet rent ($25-100/mo) and pet deposit ($200-500). Ask about breed/weight restrictions before applying.',
      insurance: "For renter's insurance: typical cost is $15-30/mo for $30K coverage. Major providers: Lemonade, State Farm, Geico. Your landlord may require proof before move-in.",
      utilities: 'For utility setup: contact providers 2 weeks before move-in. Electric and gas usually have same-week availability; internet can take 1-2 weeks for installation slots.',
      storage: 'For storage: compare traditional units ($50-200/mo depending on size) vs portable containers (PODS, U-Pack). Climate-controlled costs ~30% more but recommended for electronics and furniture.',
      maintenance: 'For move-in/move-out: document all pre-existing damage with photos/video on day 1. Request repairs in writing. Keep all correspondence.',
      banking: 'For banking: update your address with your bank 2 weeks before moving. If switching banks, keep the old account open for 60 days to avoid missed deposits.',
      mail: 'For mail forwarding: set up USPS forwarding at moversguide.usps.com 1 week before move. Update address directly with banks, subscriptions, and employer — forwarding expires after 12 months.',
      social: 'For building community: join local Facebook/Nextdoor groups, attend neighborhood events, use Meetup.com for interest-based groups. The first 90 days are the hardest — it gets better.',
      emotional: "Moving is consistently ranked among life's most stressful events. Your feelings are normal. Break tasks into small steps, celebrate progress, and lean on your support network.",
      general: 'I can help with housing, costs, logistics, taxes, schools, healthcare, and career questions about your destination. What specific aspect would you like to explore?',
    };
    return responses[category] || responses.general;
  }
}

