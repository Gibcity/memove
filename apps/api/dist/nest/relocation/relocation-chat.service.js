"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelocationChatService = void 0;
const common_1 = require("@nestjs/common");
const relocation_service_1 = require("./relocation.service");
const relocation_journey_service_1 = require("./relocation-journey.service");
const client_1 = require("../../services/llm/client");
const tool_registry_1 = require("../../mcp/tool-registry");
const SYSTEM_PROMPT = `You are a relocation planning assistant. You help users discover, evaluate, and compare places to live. You have tools to search locations, score them by weighted criteria, compare head-to-head, check fiscal health, explain scores, and more.

Always use the most relevant tool when the user asks a factual question. After getting tool results, explain your findings concisely in 2-3 sentences. Don't make up data — if you don't have a tool for what's needed, say so.`;
let RelocationChatService = class RelocationChatService {
    relocation;
    journey;
    constructor(relocation, journey) {
        this.relocation = relocation;
        this.journey = journey;
    }
    /**
     * LLM-driven tool-calling agent. Replaces the previous regex-keyword chain.
     *
     * Flow per request:
     *   1. Build messages (system prompt + history + user turn)
     *   2. Send tool-augmented prompt via completeWithTools()
     *   3. Execute at most ONE tool call → return `{ text, tool, data }`
     *   4. On error: return fallback text (FE still renders a message).
     */
    async handle(userId, message, history) {
        const uid = String(userId);
        const journeyState = this.journey.getJourney(Number(uid));
        const messages = this.buildMessages(uid, message, history, journeyState);
        const services = {
            relocation: this.relocation,
            journey: this.journey,
        };
        const tools = this.buildChatTools();
        const handlers = this.buildChatHandlers(services, uid);
        try {
            const result = await (0, client_1.completeWithTools)(messages, tools, handlers);
            return {
                role: 'agent',
                text: result.text,
                tool: result.tool,
                data: result.data,
            };
        }
        catch (_e) {
            // ponytail: LLM unavailable (no key, network, rate limit). Same payload
            // shape so the FE renders a graceful error without a separate code path.
            return {
                role: 'agent',
                text: "I'm having trouble connecting to my tools right now. Please try again.",
            };
        }
    }
    buildMessages(_userId, message, history, journey) {
        const sysCtx = `Current journey phase: ${journey.currentPhase}.${journey.shortlistedLocations.length > 0
            ? ` Shortlisted cities: ${journey.shortlistedLocations.join(', ')}.`
            : ' No cities shortlisted yet.'}`;
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
    buildChatTools() {
        return tool_registry_1.ALL_RELOCATION_TOOLS.map((d) => ({
            name: d.name,
            description: d.description,
            inputSchema: d.inputSchema,
        }));
    }
    buildChatHandlers(services, userId) {
        const handlers = new Map();
        for (const def of tool_registry_1.ALL_RELOCATION_TOOLS) {
            handlers.set(def.name, async (args) => def.handler(services, args, userId));
        }
        return handlers;
    }
};
exports.RelocationChatService = RelocationChatService;
exports.RelocationChatService = RelocationChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [relocation_service_1.RelocationService,
        relocation_journey_service_1.RelocationJourneyService])
], RelocationChatService);
