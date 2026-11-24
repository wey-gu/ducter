// D534: what the composers' @ and / lists hold between renders (design/mentions.md): the home's
// answer for what is typed after @ (asked as the words change, the newest answer kept), each
// composer's / list (asked once per place, kept for five minutes) and what a picked entry does.
// The popover itself is composer.tsx's MentionPop; the words and the picked references are the
// composer's (A.refsFor).
import type { MentionItem, Ref, ServerFrame, SlashEntry } from "@ducter/protocol";
import { MENTION_ROWS, rank } from "@ducter/protocol";
import { A } from "./app.ts";

type MentionRes = Extract<ServerFrame, { t: "mention_list" }>;
type SlashRes = Extract<ServerFrame, { t: "slash_list" }>;

export const M = {
  n: 0,
  /** The @ list's newest ask, and its answer. */
  asked: "",
  q: "",
  where: "",
  items: undefined as MentionItem[] | undefined,
  timer: 0 as ReturnType<typeof setTimeout> | 0,
  /** The / lists by place ("" the partner's), with when they came. */
  slash: new Map<string, { entries: SlashEntry[]; harness?: string; at: number }>(),
  slashAsked: new Map<string, string>(),
};

const FRESH = 5 * 60_000;

/** Asks the home for the @ list for q (a moment after the last keystroke). */
export function askMentions(where: string, q: string) {
  if (M.timer) clearTimeout(M.timer);
  if (M.where !== where || M.q !== q) M.items = M.where === where ? M.items : undefined;
  M.where = where;
  M.q = q;
  M.timer = setTimeout(() => {
    M.timer = 0;
    M.asked = `m${++M.n}`;
    A.send({ t: "mention_find", id: M.asked, q, ...(where ? { taskId: where } : {}) });
  }, 90);
}

/** The / list for a place, asked when missing or old. */
export function slashOf(where: string): { entries: SlashEntry[]; harness?: string } | undefined {
  const have = M.slash.get(where);
  if ((!have || Date.now() - have.at > FRESH) && !M.slashAsked.has(where)) {
    const id = `s${++M.n}`;
    M.slashAsked.set(where, id);
    A.send({ t: "slash_find", id, ...(where ? { taskId: where } : {}) });
  }
  return have;
}

/** The home's answers (app.ts hands them here); a stale @ answer is dropped. */
export function onMentionFrame(f: MentionRes | SlashRes) {
  if (f.t === "mention_list") {
    if (f.id !== M.asked) return;
    M.items = f.items;
  } else {
    const where = f.taskId ?? "";
    if (M.slashAsked.get(where) !== f.id) return;
    M.slashAsked.delete(where);
    M.slash.set(where, { entries: f.entries, ...(f.harness ? { harness: f.harness } : {}), at: Date.now() });
  }
  A.changed();
}
queueMicrotask(() => (A.mentionFrame = onMentionFrame));

/** Forgets the @ list (the popover closed). */
export function closeMentions() {
  if (M.timer) clearTimeout(M.timer);
  M.timer = 0;
  M.asked = "";
  M.items = undefined;
  M.q = "";
}

/** One section of the popover: its name's key and its rows. */
export interface PopSection {
  key: string;
  rows: PopRow[];
}
export type PopRow = { kind: "ref"; item: MentionItem } | { kind: "slash"; entry: SlashEntry };

const REF_GROUPS: { key: string; kinds: MentionItem["kind"][] }[] = [
  { key: "mention.group.tasks", kinds: ["task"] },
  { key: "mention.group.files", kinds: ["file"] },
  { key: "mention.group.keeps", kinds: ["keep"] },
  { key: "mention.group.partners", kinds: ["partner"] },
  { key: "mention.group.code", kinds: ["pr", "issue"] },
];

/** The @ list in its sections (the home ranked it). */
export function mentionSections(items: MentionItem[]): PopSection[] {
  return REF_GROUPS.map((g) => ({ key: g.key, rows: items.filter((i) => g.kinds.includes(i.kind)).map((item): PopRow => ({ kind: "ref", item })) })).filter((s) => s.rows.length);
}

/** The / list for q in its sections: Ducter's own entries by their words, the rest by name. */
export function slashSections(entries: SlashEntry[], q: string, word: (e: SlashEntry) => string): PopSection[] {
  const order: SlashEntry["group"][] = ["task", "ducter", "native", "skills"];
  const out: PopSection[] = [];
  for (const g of order) {
    const of = entries.filter((e) => e.group === g);
    const hits = rank(of, q, (e) => (e.group === "ducter" || e.group === "task" ? `${e.name} ${word(e)}` : e.name), (e) => e.about ?? "").slice(0, g === "native" || g === "skills" ? 60 : MENTION_ROWS);
    if (hits.length) out.push({ key: `slash.group.${g}`, rows: hits.map((entry): PopRow => ({ kind: "slash", entry })) });
  }
  return out;
}

/** Runs one of Ducter's own / entries at once, its sheet opening where it has one. */
export async function runSlash(run: NonNullable<SlashEntry["run"]>, where: string) {
  switch (run) {
    case "new_task":
      return A.openNewTask();
    case "find":
      return A.command("switch");
    case "handover":
      return (await import("./handover.tsx")).openHand({ door: "find" });
    case "pause":
      return void (where && A.taskAction(where, "interrupt"));
    case "switch":
      return void (where && A.openSwitch(where));
    case "fork": {
      const task = where ? A.S.tasks.get(where) : undefined;
      if (!task) return;
      const { harnessOf, title } = await import("./store.ts");
      (await import("./past-preview.tsx")).startRedo({ taskId: task.id, title: title(task), harness: harnessOf(task) });
      return;
    }
  }
}

/** Adds a picked reference to a composer's (once). */
export function pickRef(where: string, r: Ref) {
  const have = A.refsFor.get(where) ?? [];
  if (!have.some((x) => x.kind === r.kind && x.id === r.id && x.label === r.label)) A.refsFor.set(where, [...have, r]);
}
