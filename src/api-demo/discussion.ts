import type { ApiDemoConfig } from "./config.js";
import { requestModel } from "./providers.js";
import { sanitizeTerminal } from "../security/sanitize.js";
import { performLiveResearch } from "./search.js";

export interface DiscussionCallbacks {
  thinking(round: number): () => void;
  nodeEvent?(agentIndex: number, event: "computing" | "ready" | "pass" | "error", latencyMs?: number, kind?: string): void;
  speak(agentIndex: number, message: string, kind: string): Promise<void>;
  error(agentIndex: number, message: string): Promise<void>;
  metric(savedTokens: number, routedTokens: number): void;
}

export interface DiscussionResult {
  responsiveModels: number;
  turns: number;
  routedTokens: number;
  savedTokens: number;
  resolved: boolean;
  verdictProduced: boolean;
}

interface Bid {
  agentIndex: number;
  status: "SPEAK" | "RESOLVED";
  urgency: number;
  kind: string;
  message: string;
}

export const MAX_ROUNDS = 3;
const SYSTEM = "You are a participant in a high-density, machine-to-machine AI deliberation protocol. You communicate using dense symbolic DSL notation for intermediate debate, eliminating conversational filler and maximizing propositional information density. State claims, discrepancies, hypotheses, and evidence with formal conciseness.";

export async function conductDiscussion(config: ApiDemoConfig, task: string, callbacks: DiscussionCallbacks): Promise<DiscussionResult> {
  const transcript: string[] = [];
  const unavailable = new Set<number>();
  const responsive = new Set<number>();
  const timesSpoken = new Map<number, number>();
  let routedTokens = Math.ceil(task.length / 4);
  let savedTokens = 0;
  let resolved = false;
  let verdictProduced = false;
  let electedVerdictModel: number | undefined;

  // Retrieve live web & arXiv research grounding before deliberation
  const searchResults = await performLiveResearch(task.slice(0, 300));
  const researchIntel = searchResults.length
    ? searchResults.map(r => `• [${r.source || "WEB"}] ${r.title} (${r.url})\n  ${r.snippet}`).join("\n")
    : "No external search results retrieved.";

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const completeDiscussion = transcript.join("\n\n");
    const shared = completeDiscussion.slice(-config.maxSharedCharacters);
    savedTokens += Math.ceil(Math.max(0, completeDiscussion.length - shared.length) / 4) * (config.agents.length - unavailable.size);
    const prompt = buildPrompt(task, shared, round, researchIntel);
    const stopThinking = callbacks.thinking(round);
    const results = await Promise.allSettled(config.agents.map(async (agent, agentIndex) => {
      if (unavailable.has(agentIndex)) return undefined;
      callbacks.nodeEvent?.(agentIndex, "computing");
      const start = Date.now();
      const identity = `MODEL ${String.fromCharCode(65 + agentIndex)}`;
      try {
        const raw = await requestModel({ agent, system: `${SYSTEM} You are ${identity}; do not describe ${identity} as a different participant.`, prompt, timeoutMs: config.requestTimeoutMs });
        routedTokens += Math.ceil((prompt.length + raw.length) / 4);
        responsive.add(agentIndex);
        const bid = parseBid(raw, agentIndex);
        callbacks.nodeEvent?.(agentIndex, bid ? "ready" : "pass", Date.now() - start, bid?.kind);
        return bid;
      } catch (err) {
        callbacks.nodeEvent?.(agentIndex, "error", Date.now() - start);
        throw err;
      }
    }));
    stopThinking();

    const bids: Bid[] = [];
    for (const [agentIndex, result] of results.entries()) {
      if (result.status === "rejected") {
        unavailable.add(agentIndex);
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        await callbacks.error(agentIndex, message);
      } else if (result.value) bids.push(result.value);
    }
    callbacks.metric(savedTokens, routedTokens);

    if (bids.length === 0) break;
    const resolutionVotes = bids.filter(bid => bid.status === "RESOLVED");
    const pool = resolutionVotes.length >= 3 && transcript.length >= 2 ? resolutionVotes : bids;
    const remaining = [...pool];
    for (let slot = 0; slot < 2 && remaining.length; slot += 1) {
      const selected = selectSpeaker(remaining, timesSpoken, round + slot);
      remaining.splice(remaining.indexOf(selected), 1);
      const modelName = `MODEL ${String.fromCharCode(65 + selected.agentIndex)}`;
      transcript.push(`${modelName} [${selected.kind}]: ${selected.message}`);
      timesSpoken.set(selected.agentIndex, (timesSpoken.get(selected.agentIndex) ?? 0) + 1);
      electedVerdictModel = selected.agentIndex;
      await callbacks.speak(selected.agentIndex, selected.message, selected.kind);
    }

    if (resolutionVotes.length >= 3 && transcript.length >= 3) {
      resolved = true;
      break;
    }
  }

  const verdictAgentIndex = electedVerdictModel ?? responsive.values().next().value;
  if (verdictAgentIndex !== undefined) {
    const completeDiscussion = transcript.join("\n\n");
    const shared = completeDiscussion.slice(-config.maxSharedCharacters);
    savedTokens += Math.ceil(Math.max(0, completeDiscussion.length - shared.length) / 4);
    const verdictPrompt = `USER TASK:
${task}

SYMBOLIC DELIBERATION TRANSCRIPT:
${shared || "No participant spoke."}

You were dynamically elected to synthesize and deliver the final verdict to the user.

FORMAT INSTRUCTIONS:
Deliver a concise, punchy, high-impact final verdict in clean Markdown. DO NOT write a massive essay.
1. **EXACT RANKING & PICKS**: Clear summary table / list of the top recommendations.
2. **KEY REASONS WHY**: For each recommendation, provide 2–3 crisp, powerful bullet points covering the novel angle, safety signal, and main risk/mitigation.
3. **DECISION CRITERIA**: Exactly why #1 beats the others.
4. **IMMEDIATE NEXT STEPS**: 2 actionable bullets to execute right away.

Keep the entire output tightly structured, direct, and under 400 words.`;
    const stopThinking = callbacks.thinking(0);
    let verdict: string | undefined;
    let verdictError: string | undefined;
    try {
      const agent = config.agents[verdictAgentIndex]!;
      const identity = `MODEL ${String.fromCharCode(65 + verdictAgentIndex)}`;
      verdict = sanitizeTerminal(await requestModel({ agent, system: `You are ${identity}. Synthesize the final decision concisely, giving the exact answer and a few sharp reasons why without unnecessary fluff.`, prompt: verdictPrompt, timeoutMs: config.requestTimeoutMs }));
      routedTokens += Math.ceil((verdictPrompt.length + verdict.length) / 4);
    } catch (error) {
      verdictError = error instanceof Error ? error.message : String(error);
    } finally {
      stopThinking();
    }
    if (verdict) {
      const identity = `MODEL ${String.fromCharCode(65 + verdictAgentIndex)}`;
      transcript.push(`${identity} [VERDICT]: ${verdict}`);
      await callbacks.speak(verdictAgentIndex, verdict, "VERDICT");
      verdictProduced = true;
    } else if (verdictError) await callbacks.error(verdictAgentIndex, verdictError);
    callbacks.metric(savedTokens, routedTokens);
  }

  return { responsiveModels: responsive.size, turns: transcript.length, routedTokens, savedTokens, resolved, verdictProduced };
}

function buildPrompt(task: string, discussion: string, round: number, researchIntel: string): string {
  return `USER TASK:\n${task}\n\nLIVE WEB & ARXIV RESEARCH INTEL:\n${researchIntel}\n\nLIVE DISCUSSION (SYMBOLIC DSL):\n${discussion || "NIL"}\n\nROUND ${round}/${MAX_ROUNDS}:
Deliberate on concrete technical research ideas. Leverage the grounded web and arXiv intelligence to cite real 2025–2026 work, benchmarks, and avoid saturated baselines.

Use Dense Symbolic DSL notation:
- PROPOSAL: PROP:<id> | PREM:[<premises>] | CONC:<core_idea> | IMPL:<impact>
- DISCREPANCY / FLAW: DISP:<target_model_or_id> | FLAW:<exact_gap_or_flaw> | FIX:<proposed_solution>
- EVIDENCE / METRIC: EVID:<benchmark_or_empirical_test> | RISK:<confound>
- CONSENSUS: SYNTH:[<agreed_points>] | DELTA:[<resolved_conflicts>]

Output format (choose exactly one):
PASS

SPEAK|<urgency 1-100>|<DISCREPANCY, CORRECTION, PROPOSAL, EVIDENCE, or SYNTHESIS>
<dense symbolic DSL payload, maximum 150 words, concrete technical substance only>

RESOLVED|<confidence 1-100>|SYNTHESIS
<final synthesized resolution in dense symbolic DSL, maximum 150 words>`;
}

export function parseBid(raw: string, agentIndex: number): Bid | undefined {
  const clean = sanitizeTerminal(raw).replace(/^```[^\n]*\n?|```$/g, "").trim();
  const [header = "", ...body] = clean.split(/\r?\n/);
  if (/^PASS\b/i.test(header.trim())) return undefined;
  const match = header.trim().match(/^(SPEAK|RESOLVED)\s*\|\s*(\d{1,3})\s*\|\s*([A-Z -]+)/i);
  if (!match) return clean ? { agentIndex, status: "SPEAK", urgency: 40, kind: "CONTRIBUTION", message: clean } : undefined;
  const message = body.join("\n").trim();
  if (!message) return undefined;
  return {
    agentIndex,
    status: match[1]!.toUpperCase() as "SPEAK" | "RESOLVED",
    urgency: Math.max(1, Math.min(100, Number(match[2]))),
    kind: match[3]!.trim().toUpperCase(),
    message
  };
}

function selectSpeaker(bids: Bid[], timesSpoken: Map<number, number>, round: number): Bid {
  const urgent = bids.filter(bid => /DISCREPANCY|CORRECTION/.test(bid.kind));
  const pool = urgent.length ? urgent : bids;
  return [...pool].sort((left, right) => {
    const leftScore = left.urgency - (timesSpoken.get(left.agentIndex) ?? 0) * 7;
    const rightScore = right.urgency - (timesSpoken.get(right.agentIndex) ?? 0) * 7;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return ((left.agentIndex - round + 5) % 5) - ((right.agentIndex - round + 5) % 5);
  })[0]!;
}
