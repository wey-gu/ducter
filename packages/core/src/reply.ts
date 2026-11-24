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
  /** D443: a task's open questions (decisions.ts); absent in older stubs. */
  pendingOf?(taskId: string): string[];
  decide(decisionId: string, option: "go" | "hold" | "reply", text?: string, extra?: { msgSeq?: number }): unknown;
}

/** The decisions a reply may answer by itself: a task's question or the partner's own ask. The
 *  rest (paying, a call, a sign-in, a calendar change, a find's step…) have their own buttons;
 *  a reply to them is words to the partner, who decides what they mean. */
export function plainDecision(d: Bodies["decision"]): boolean {
  return !(d.pay || d.checkout || d.fill || d.phone || d.where || d.closing || d.anywhere || d.signIn || d.signInWhere || d.cal || d.call || d.memPlugin || d.routineId || d.findId || d.asker || d.trust || d.saying);
}

/** The tasks a user message started: the jobs whose ack answered it. */
function tasksStartedBy(log: LogStore, userSeq: number, stream = "channel"): string[] {
  const acks = log.read({ stream, fromSeq: userSeq + 1, limit: 400, kinds: ["ack"] }).filter((e) => (e.body as Bodies["ack"]).replyTo === userSeq);
  if (!acks.length) return [];
  const jobs = new Set(acks.map((e) => (e.body as Bodies["ack"]).jobId));
  const out = new Set<string>();
  for (const e of log.read({ stream, fromSeq: acks[0]!.seq, limit: 2000, kinds: ["job_status"] })) {
    const b = e.body as Bodies["job_status"];
    if (jobs.has(b.jobId) && b.taskId) out.add(b.taskId);
  }
  return [...out];
}

function taskOfJob(log: LogStore, jobId: string, from: number, stream = "channel"): string | undefined {
  for (const e of log.read({ stream, fromSeq: from, limit: 2000, kinds: ["job_status"] })) {
    const b = e.body as Bodies["job_status"];
    if (b.jobId === jobId && b.taskId) return b.taskId;
  }
  return undefined;
}

/**
 * The ReplyRef for what the client named, read from the Log. Throws when it names nothing the
 * user could have replied to (a task's own stream, a seq that isn't there).
 */
export function resolveReply(log: LogStore, decisions: Pick<ReplyDecisions, "get" | "pendingOf">, want: ReplyWant, stream = "channel"): ReplyRef {
  const seq = Math.floor(Number(want.seq));
  const e = Number.isFinite(seq) && seq > 0 ? log.read({ fromSeq: seq, limit: 1 })[0] : undefined;
  if (!e || e.seq !== seq || e.stream !== stream) throw new Error("that message isn't in the conversation");
  let from: ReplyRef["from"] = "partner";
  let kind: ReplyRef["kind"] = "message";
  let words = "";
  let taskIds: string[] = [];
  let decisionId: string | undefined;
  let findId: string | undefined;
  let media: MediaRef[] | undefined;
  let line: { i: number; words: string } | undefined;
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
      taskIds = tasksStartedBy(log, e.seq, stream);
      // D430: 回复这一条 / Reply to this one: one line under it, its words and its own task only.
      if (want.ask !== undefined) {
        const i = Math.floor(Number(want.ask));
        const at = log.read({ stream, fromSeq: e.seq + 1, limit: Number.MAX_SAFE_INTEGER, kinds: ["asks"] }).filter((x) => (x.body as Bodies["asks"]).msgSeq === e.seq).at(-1);
        const l = at && Number.isInteger(i) && i >= 0 ? (at.body as Bodies["asks"]).lines[i] : undefined;
        if (l) {
          line = { i, words: l.words };
          taskIds = l.taskId ? [l.taskId] : [];
          // D443: a line that waits for the person waits on its task's question: a reply to the line
          // is that question's answer (as a reply to its card is, D236), when there is exactly one
          // plain question open; otherwise it stays words to the partner.
          if (l.state === "needs_you" && l.taskId) {
            const open = (decisions.pendingOf?.(l.taskId) ?? []).filter((id) => {
              const d = decisions.get(id);
              return !!d && plainDecision(d);
            });
            if (open.length === 1) decisionId = open[0];
          }
        }
      }
      break;
    }
    case "ai_msg": {
      const b = e.body as Bodies["ai_msg"];
      words = plainWords(b.text);
      media = b.media;
      if (b.decisionId) ofDecision(b.decisionId);
      else if (b.replyTo) taskIds = tasksStartedBy(log, b.replyTo, stream);
      break;
    }
    case "ack": {
      const b = e.body as Bodies["ack"];
      words = b.text;
      const t = taskOfJob(log, b.jobId, e.seq, stream);
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
  // A part the user picked: only words the message really has (or the line under it they replied to).
  const part = line ? flat(line.words) : want.part ? flat(String(want.part)) : "";
  const picked = line ? part : part && whole.includes(part) ? part : "";
  const q = clipQuote(picked || whole);
  const ref: ReplyRef = { seq: e.seq, from, kind, quote: q.text, ts: e.ts };
  if (picked) ref.part = true;
  if (line) ref.ask = line.i;
  if (q.clipped || (picked && !line && picked.length < whole.length)) ref.clipped = true;
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
  m: { text: string; clientId?: string; media?: MediaRef[]; reply?: ReplyWant; via?: Bodies["user_msg"]["via"]; forwarded?: Bodies["user_msg"]["forwarded"]; /** D405: about one of the person's apps, or its ask. */ app?: Bodies["user_msg"]["app"]; /** D309: a second partner's conversation (channelOf); absent: the default's. */ stream?: string },
): LogEvent<"user_msg"> {
  let reply: ReplyRef | undefined;
  if (m.reply) {
    try {
      reply = resolveReply(log, decisions, m.reply, m.stream ?? "channel"); // D312: a reply within its own conversation
    } catch (err) {
      console.warn("[reply]", (err as Error).message);
    }
  }
  const id = reply?.decisionId;
  const d = id ? decisions.get(id) : undefined;
  // D276: forwarded words are someone else's: they never answer a question by themselves.
  const answers = !!(reply && id && d && m.text.trim() && !m.forwarded && decisions.isPending(id) && plainDecision(d));
  if (answers) reply!.answers = true;
  const body: Bodies["user_msg"] = {
    text: m.text,
    ...(m.clientId ? { clientId: m.clientId } : {}),
    ...(m.media?.length ? { media: m.media } : {}),
    ...(reply ? { reply } : {}),
    ...(m.via ? { via: m.via } : {}),
    ...(m.forwarded ? { forwarded: m.forwarded } : {}),
    ...(m.app ? { app: m.app } : {}),
  };
  const e = log.append({ stream: m.stream ?? "channel", origin: "user", kind: "user_msg", body });
  if (answers) {
    try {
      decisions.decide(id!, "reply", m.text.trim(), { msgSeq: e.seq });
    } catch (err) {
      console.warn("[reply] answering the question:", (err as Error).message); // e.g. its task was dropped
    }
  }
  return e as LogEvent<"user_msg">;
}
