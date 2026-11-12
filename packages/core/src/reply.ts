// D236: 回复 / Reply to one message. The client names the message it answers (a seq, and a find or
// a part of its words inside it); core turns that into a ReplyRef from the Log and logs it inside
// the user_msg, so the quote travels with the reply for good (design/context.md "Replies").
// A reply to a question that is still open is that question's answer: core resolves it here, the
// same as the card's 回复… / Reply…, so a task hears it without the partner passing it on.
import type { Bodies, LogEvent, MediaRef, ReplyRef, ReplyWant } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { clipQuote, plainWords } from "@ducter/protocol/src/reply.ts";

export { clipQuote, plainWords };
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** What reply.ts needs of the decisions (decisions.ts implements it). */
export interface ReplyDecisions {
  get(decisionId: string): Bodies["decision"] | undefined;
  isPending(decisionId: string): boolean;
  decide(decisionId: string, option: "go" | "hold" | "reply", text?: string, msgSeq?: number): unknown;
}

/** The decisions a reply may answer by itself: a task's question or the partner's own ask. The
 *  rest (paying, a call, a sign-in, a calendar change, a find's step…) have their own buttons;
 *  a reply to them is words to the partner, who decides what they mean. */
export function plainDecision(d: Bodies["decision"]): boolean {
  return !(d.pay || d.fill || d.phone || d.where || d.closing || d.anywhere || d.signIn || d.cal || d.call || d.memPlugin || d.routineId || d.findId || d.asker || d.trust);
}

/** The tasks a user message started: the jobs whose ack answered it. */
function tasksStartedBy(log: LogStore, userSeq: number): string[] {
  const acks = log.read({ stream: "channel", fromSeq: userSeq + 1, limit: 400, kinds: ["ack"] }).filter((e) => (e.body as Bodies["ack"]).replyTo === userSeq);
  if (!acks.length) return [];
  const jobs = new Set(acks.map((e) => (e.body as Bodies["ack"]).jobId));
  const out = new Set<string>();
  for (const e of log.read({ stream: "channel", fromSeq: acks[0]!.seq, limit: 2000, kinds: ["job_status"] })) {
    const b = e.body as Bodies["job_status"];
    if (jobs.has(b.jobId) && b.taskId) out.add(b.taskId);
  }
  return [...out];
}

function taskOfJob(log: LogStore, jobId: string, from: number): string | undefined {
  for (const e of log.read({ stream: "channel", fromSeq: from, limit: 2000, kinds: ["job_status"] })) {
    const b = e.body as Bodies["job_status"];
    if (b.jobId === jobId && b.taskId) return b.taskId;
  }
  return undefined;
}

/**
 * The ReplyRef for what the client named, read from the Log. Throws when it names nothing the
 * user could have replied to (a task's own stream, a seq that isn't there).
 */
export function resolveReply(log: LogStore, decisions: Pick<ReplyDecisions, "get">, want: ReplyWant): ReplyRef {
  const seq = Math.floor(Number(want.seq));
  const e = Number.isFinite(seq) && seq > 0 ? log.read({ fromSeq: seq, limit: 1 })[0] : undefined;
  if (!e || e.seq !== seq || e.stream !== "channel") throw new Error("that message isn't in the conversation");
  let from: ReplyRef["from"] = "partner";
  let kind: ReplyRef["kind"] = "message";
  let words = "";
  let taskIds: string[] = [];
  let decisionId: string | undefined;
  let findId: string | undefined;
  let media: MediaRef[] | undefined;
  const ofDecision = (id: string) => {
    const d = decisions.get(id);
    decisionId = id;
    kind = "question";
    if (d?.taskId) taskIds = [d.taskId];
    return d;
  };
  switch (e.kind) {
    case "user_msg": {
      const b = e.body as Bodies["user_msg"];
      from = "you";
      words = b.text;
      media = b.media;
      taskIds = tasksStartedBy(log, e.seq);
      break;
    }
    case "ai_msg": {
      const b = e.body as Bodies["ai_msg"];
      words = plainWords(b.text);
      media = b.media;
      if (b.decisionId) ofDecision(b.decisionId);
      else if (b.replyTo) taskIds = tasksStartedBy(log, b.replyTo);
      break;
    }
    case "ack": {
      const b = e.body as Bodies["ack"];
      words = b.text;
      const t = taskOfJob(log, b.jobId, e.seq);
      if (t) taskIds = [t];
      break;
    }
    case "decision": {
      const b = e.body as Bodies["decision"];
      words = b.question;
      ofDecision(b.decisionId);
      break;
    }
    case "finds": {
      const b = e.body as Bodies["finds"];
      const f = want.findId ? b.finds.find((x) => x.findId === want.findId) : b.finds.length === 1 ? b.finds[0] : undefined;
      if (f) {
        kind = "find";
        findId = f.findId;
        words = f.text;
        if (f.decisionId) decisionId = f.decisionId;
      } else words = [b.opening, ...b.finds.map((x) => x.text)].filter(Boolean).join(" ");
      break;
    }
    case "living_msg": {
      const b = e.body as Bodies["living_msg"];
      words = b.items.map((it) => it.text || it.title).join("；");
      taskIds = [...new Set(b.items.map((it) => it.taskId))];
      break;
    }
    default:
      throw new Error("that can't be replied to");
  }
  const whole = flat(words);
  // A part the user picked: only words the message really has.
  const part = want.part ? flat(String(want.part)) : "";
  const picked = part && whole.includes(part) ? part : "";
  const q = clipQuote(picked || whole);
  const ref: ReplyRef = { seq: e.seq, from, kind, quote: q.text, ts: e.ts };
  if (picked) ref.part = true;
  if (q.clipped || (picked && picked.length < whole.length)) ref.clipped = true;
  if (taskIds.length) ref.taskIds = taskIds.slice(0, 3);
  if (decisionId) ref.decisionId = decisionId;
  if (findId) ref.findId = findId;
  if (media?.length) ref.media = media.slice(0, 4);
  return ref;
}

/**
 * Logs what the user said, with what it replies to; a reply to an open question answers it.
 * A reply to a message that can't be found is logged as a plain message (nothing is lost).
 */
export function logUserMessage(
  log: LogStore,
  decisions: ReplyDecisions,
  m: { text: string; clientId?: string; media?: MediaRef[]; reply?: ReplyWant },
): LogEvent<"user_msg"> {
  let reply: ReplyRef | undefined;
  if (m.reply) {
    try {
      reply = resolveReply(log, decisions, m.reply);
    } catch (err) {
      console.warn("[reply]", (err as Error).message);
    }
  }
  const id = reply?.decisionId;
  const d = id ? decisions.get(id) : undefined;
  const answers = !!(reply && id && d && m.text.trim() && decisions.isPending(id) && plainDecision(d));
  if (answers) reply!.answers = true;
  const body: Bodies["user_msg"] = { text: m.text, ...(m.clientId ? { clientId: m.clientId } : {}), ...(m.media?.length ? { media: m.media } : {}), ...(reply ? { reply } : {}) };
  const e = log.append({ stream: "channel", origin: "user", kind: "user_msg", body });
  if (answers) {
    try {
      decisions.decide(id!, "reply", m.text.trim(), e.seq);
    } catch (err) {
      console.warn("[reply] answering the question:", (err as Error).message); // e.g. its task was dropped
    }
  }
  return e as LogEvent<"user_msg">;
}
