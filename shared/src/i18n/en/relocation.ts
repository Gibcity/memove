import type { TranslationStrings } from '../types';

const relocation: TranslationStrings = {
  // ── Library panel ──
  'relocation.topCandidates': 'Top Candidates',
  'relocation.sort': 'Sort by',
  'relocation.sortScore': 'Match Score',
  'relocation.sortRent': 'Rent (low to high)',
  'relocation.sortName': 'Name (A–Z)',
  'relocation.searchCities': 'Search cities or states…',
  'relocation.filters': 'Filters',
  'relocation.filterDisable': 'Disable filter',
  'relocation.filterEnable': 'Enable filter',
  'relocation.filterMin': 'Minimum {name}',
  'relocation.filterMax': 'Maximum {name}',
  'relocation.applyFilters': 'Apply Filters',
  'relocation.noCandidates': 'No candidates match your filters.',
  'relocation.ofTotal': 'of',
  'relocation.saved': 'Saved',

  // ── Compare bar ──
  'relocation.compareSelected': '{count} selected for compare',
  'relocation.compareClear': 'Clear',
  'relocation.compareButton': 'Compare ({count})',
  'relocation.compareMinHint': 'Pick at least 2',
  'relocation.compareTitle': 'Compare',

  // ── Detail sheet ──
  'relocation.rank': 'Rank',
  'relocation.matchScore': 'Match Score',
  'relocation.matchExcellent': 'Excellent match',
  'relocation.matchGood': 'Good match',
  'relocation.matchFair': 'Fair match',
  'relocation.matchLow': 'Below average',
  'relocation.keyMetrics': 'Key Metrics',
  'relocation.costOfLiving': 'Cost of Living',
  'relocation.medianHome': 'Median Home',
  'relocation.medianRent': 'Median Rent',
  'relocation.hotDays': 'Hot Days (≥90°F/yr)',
  'relocation.violentCrime': 'Violent Crime /100k',
  'relocation.broadband': 'Broadband ≥100Mbps %',
  'relocation.healthcare': 'Healthcare Access',
  'relocation.incomeTax': 'State Income Tax',
  'relocation.whyThisCandidate': 'Why this candidate?',
  'relocation.analyzing': 'Analyzing…',
  'relocation.dataSources': 'Data Sources',

  // ── Map ──
  'relocation.scoreLegend': 'Score',
  'relocation.showingMetros': 'Showing {count} metros',
  'relocation.showingMetro': 'Showing {count} metro',

  // ── Error / status ──
  'relocation.loadError': 'Failed to load relocation data.',
  'relocation.scoreDegraded': 'Score engine unavailable — showing default rankings',

  // ── Elicitation ──
  'relocation.elicitation.title': 'Tell us about your move',
  'relocation.elicitation.help': 'Answer a few questions to personalize your rankings.',
  'relocation.elicitation.start': 'Start',
  'relocation.elicitation.placeholder': 'Type your answer…',
  'relocation.elicitation.skip': 'Skip question',
  'relocation.elicitation.skipAll': 'Skip all',
  'relocation.elicitation.complete': 'Profile complete — rankings updated!',
  'relocation.elicitationStartError': 'Could not start the questionnaire. Try again later.',
  'relocation.elicitationResponseError': 'Could not save your answer. Try again.',

  // ── Hard filter ──
  'relocation.hardFilterPrompt.title': 'Hide {name}?',
  'relocation.hardFilterPrompt.hint': "You've dismissed this {count} times. Hide it permanently?",
  'relocation.hardFilterPrompt.confirm': 'Yes, hide it',
  'relocation.hardFilterPrompt.dismiss': 'Not now',
  'relocation.hardFilterConfirmed': 'Location hidden from results.',
  'relocation.hardFilterFailed': 'Failed to apply filter.',

  // ── Candidate row ──
  'relocation.candidateDetail': 'View details for {name}',
  'relocation.save': 'Save candidate',
  'relocation.dismiss': 'Dismiss candidate',

  // ── Timeline panel ──
  'relocation.myMove': 'My Move',
  'relocation.applyChecklist': 'Apply Checklist',
  'relocation.agentActivitySoon': 'Agent activity stream coming soon',

  // ── Chat ──
  'relocation.chatTitle': 'Ask memove',
  'relocation.chatSubtitle': 'Chat with your relocation agent',
  'relocation.chatPlaceholder': 'Ask about cities, costs, timelines, paperwork…',
  'relocation.chatSend': 'Send message',
  'relocation.chatClear': 'Clear conversation',
  'relocation.chatEmptyTitle': 'What would you like to know?',
  'relocation.chatEmptyBody':
    'I can discover cities, compare cost of living, build your move timeline, and walk you through state-by-state paperwork.',
  'relocation.chatTyping': 'Agent is typing',
};
export default relocation;
