// Automatic pre-turn recall (design/memory.md "Recall"): before a turn, a lexical search over the
// Log outside the verbatim window, keyed on the user's message, admitted only past a precision
// gate. Conservative on purpose: it fires only on recall intent ("上次", "we decided", "what did I
// say"), and a hit must share most of the message's distinctive terms. Off by default until its
// precision is measured on real channels (DUCTER_AUTO_RECALL=1 turns it on). The model's own
// log_search is the main recall path; this only covers the times it wouldn't think to look.
import type { Bodies, LogEvent } from "../../../protocol/src/index.ts";
import type { LogStore } from "../../../protocol/src/internal.ts";
import { bigramTokens } from "../../../protocol/src/search.ts";

const INTENT = /上次|上回|之前|以前|那次|那天|前几天|我(?:说|讲|提)过|我们(?:定|决定|说|聊)过|定过|说好|还记得|记得吗|原话|last time|earlier|before|we (?:decided|agreed|said)|did i (?:say|ask)|i (?:said|told you)|remember|what was (?:it|the)/i;

// Words that carry the intent, not the topic: they must not count as a match.
const STOP = new Set([
  "上次", "上回", "之前", "以前", "那次", "那天", "我们", "你们", "什么", "怎么", "那个", "这个", "一下", "还记", "记得", "得吗", "说过", "讲过", "定过", "决定", "说的", "的是", "是什", "么来", "来着", "原话", "我说", "过的", "我们", "们说", "们定",
  "the", "and", "what", "that", "this", "did", "was", "were", "have", "about", "last", "time", "earlier", "before", "remember", "said", "say", "told", "you", "we", "decided", "agreed", "again", "with", "for", "which",
]);

export function recallIntent(text: string): boolean {
  return INTENT.test(text);
}

/** The message's distinctive terms (CJK bigrams and words), intent words removed. */
export function recallTerms(text: string): string[] {
  return [...new Set(bigramTokens(text).filter((t) => !STOP.has(t) && ([...t].length >= 2 || /[a-z]{3,}/.test(t)) && !/^\d+$/.test(t)))];
}

export interface RecallHit {
  seq: number;
  ts: string;
  who: string;
  text: string;
  overlap: number;
}

export interface RecallResult {
  query: string;
  admitted: RecallHit[];
  considered: number[];
}

const textOf = (e: LogEvent): string => {
  const b = e.body as Record<string, unknown>;
  if (e.kind === "report") return String((b as Bodies["report"]).summary ?? "");
  return typeof b.text === "string" ? b.text : typeof b.question === "string" ? String(b.question) : "";
};

/**
 * Recall for one message, or null when the gate keeps it closed. `beforeSeq` is where the
 * verbatim window starts: anything after it is already in front of the model.
 */
export function autoRecall(log: LogStore, message: string, beforeSeq: number, opts: { minOverlap?: number; max?: number } = {}): RecallResult | null {
  if (!recallIntent(message)) return null;
  const terms = recallTerms(message);
  if (terms.length < 2) return null;
  const query = terms.join(" ");
  const hits = log.search(query, { stream: "channel", beforeSeq, limit: 8 });
  const minOverlap = opts.minOverlap ?? 0.5;
  const admitted: RecallHit[] = [];
  const kept = hits.filter((e) => ["user_msg", "ai_msg", "ack", "report", "decision"].includes(e.kind));
  const toks = kept.map((e) => new Set(bigramTokens(textOf(e))));
  // Bigrams that cross a word boundary ("库是", "么定") match nothing; only terms some hit has count.
  const live = terms.filter((t) => toks.some((s) => s.has(t)));
  for (const [k, e] of kept.entries()) {
    const text = textOf(e);
    const have = toks[k]!;
    const shared = live.filter((t) => have.has(t)).length;
    const overlap = live.length ? shared / live.length : 0;
    if (shared < 2 || overlap < minOverlap) continue;
    admitted.push({ seq: e.seq, ts: e.ts, who: e.kind === "user_msg" ? "user" : e.kind === "report" ? "task report" : "you", text, overlap });
    if (admitted.length >= (opts.max ?? 3)) break;
  }
  return { query, admitted, considered: hits.map((e) => e.seq) };
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

/** The L4 delta for admitted hits. Background for the model; never quoted as "I searched". */
export function renderRecall(r: RecallResult): string | null {
  if (!r.admitted.length) return null;
  return [
    "[possibly relevant, from earlier in the conversation; log_read or log_search for more]",
    ...r.admitted.map((h) => `  #${h.seq} ${h.ts.slice(0, 10)} ${h.who}: ${clip(h.text, 400)}`),
  ].join("\n");
}
