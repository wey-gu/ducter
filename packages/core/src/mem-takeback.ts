// D444: 别记这个 / "don't remember that", said in the conversation, takes back what the partner just
// noted, the moment the words land (D401's way: Ducter's own bookkeeping, before the partner's turn).
// Only the memories noted under the reply to the person's previous message, and only when the words
// are a take-back and nothing else ("别记这个", "这条不用记", "forget that"): longer words go to the
// partner as they are. The take-back is D329's undo (archived in Mem, never deleted; a save still
// waiting in the outbox is dropped), so the line reads 不记了「…」 on every client.
//
// D669 (#4): a refusal is not silence. The intent is still taken back at once, but a refused
// undo marks that memory not taken back for the person (the failed ink on the Noted line) and for the
// partner's next turn (one fact under their words), and the Log keeps the failed feedback intent.
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

/** At most this long after the noted line: later, a bare 别记这个 is about something else. */
export const TAKE_BACK_MS = 30 * 60_000;

const ZH = /^(?:(?:这个|这条|那条|刚才那条|刚才那个|这句|那个)(?:就)?)?(?:别|不要|不用|不必|先别|还是别)(?:再)?(?:帮我)?(?:记|记住|记下|记着|存)(?:了|下来|住)?(?:这个|这条|那条|它|这句)?(?:了)?(?:吧|啊|哈|呀|哦|噢)?$/;
const ZH_FORGET = /^(?:把)?(?:这个|这条|那条|它|刚才那条)?(?:忘了|忘掉|忘了吧|忘掉吧)(?:它|这条|这个)?(?:吧)?$/;
const EN = /^(?:(?:no|nah|actually|oh)[,\s]+)?(?:please\s+)?(?:(?:don'?t|do not|no need to)\s+(?:remember|keep|save|store|note)(?:\s+(?:that|this|it|that one|this one))?|forget\s+(?:that|this|it|that one|this one)|(?:that|this)\s+(?:is|'s)\s+not\s+worth\s+(?:remembering|keeping))(?:\s+please)?$/i;

/** Whether these words are a take-back and nothing else. */
export function readTakeBack(text: string): boolean {
  const t = text.trim().replace(/[\s。.!！~～,，、]+$/u, "").replace(/^[\s,，]+/u, "");
  if (!t || t.length > 40) return false;
  // A leading "算了，" / "不对，" / "嗯，" changes nothing.
  const zh = t.replace(/\s+/g, "").replace(/^(?:算了|还是算了|不对|嗯|哦|噢|啊|呃|诶|欸|哎)[,，、]?/u, "");
  return ZH.test(zh) || ZH_FORGET.test(zh) || EN.test(t);
}

/** One memory the words took back; failed: Mem refused the undo, so it is still kept. */
export type TakenBack = { seq: number; title: string; failed?: true };

export interface TakeBackPort {
  /** The memories taken back at these words (their user message's seq), with their titles. */
  heardFrom(seq: number): TakenBack[];
  /** Resolves when the undo calls these words set in motion have answered (at once when none did). */
  settled(seq: number): Promise<void>;
  stop(): void;
}

/**
 * Takes back, at the person's word, the memories noted under the reply to their previous message.
 * undo is Settings' (D329), asynchronous; what was taken back is known at once for the partner's turn,
 * and a refusal is known by the time `settled` answers.
 */
export function takeBackAtOnce(o: { log: LogStore; undo: (seq: number) => Promise<boolean>; undone?: () => readonly number[] }): TakeBackPort {
  const heard = new Map<number, TakenBack[]>();
  const settled = new Map<number, Promise<void>>();
  const stop = o.log.subscribe((e: LogEvent) => {
    if (e.kind !== "user_msg" || e.origin !== "user" || e.stream !== "channel") return;
    const b = e.body as Bodies["user_msg"];
    if (b.forwarded || b.app || !readTakeBack(b.text ?? "")) return;
    const before = o.log.read({ stream: "channel", kinds: ["user_msg"], beforeSeq: e.seq, limit: 1 }).at(-1)?.seq ?? 0;
    const at = Date.parse(e.ts);
    const done = new Set(o.undone?.() ?? []);
    const noted = o.log
      .read({ stream: "channel", kinds: ["memory_noted"], fromSeq: before + 1, limit: 20 })
      .filter((x) => x.seq < e.seq && !done.has(x.seq) && at - Date.parse(x.ts) <= TAKE_BACK_MS);
    if (!noted.length) return;
    const list = noted.map((x) => ({ seq: x.seq, title: (x.body as Bodies["memory_noted"]).title }) as TakenBack);
    heard.set(e.seq, list);
    const jobs = list.map((it) =>
      o
        .undo(it.seq)
        .then((ok) => {
          if (!ok) it.failed = true;
        })
        .catch((err) => {
          it.failed = true;
          console.warn("[mem] taking back failed:", (err as Error).message);
        }),
    );
    settled.set(e.seq, Promise.all(jobs).then(() => undefined));
  });
  return { heardFrom: (seq) => heard.get(seq) ?? [], settled: (seq) => settled.get(seq) ?? Promise.resolve(), stop };
}
