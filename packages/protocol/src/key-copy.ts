// D539: 复制密钥 / Copy a key. A key the person already has on one of their computers (a variable
// in their shell there, or Ducter's own key file there) copied to another of their computers, for
// Ducter's tasks there only, on the person's one Go (design/autofill.md §9, design/system.md
// "Keys copied between computers"). Browser-safe: types and words only; the sealing is
// key-seal.ts (node:crypto), the store on each computer is runner/src/key-shelf.ts.

/** Where a key is read on the computer that has it. */
export type KeySource = "shell" | "ducter";

/** One computer in a copy, by its device id ("local" = the home) and the name the person knows it by. */
export interface KeyComputer {
  device: string;
  name: string;
}

/**
 * The 复制密钥 / Copy a key card (a decision). Set only by Ducter's code (the partner's key_copy,
 * or a task's ask_for_key that Ducter found on another computer), never by report_to_main. No
 * default ever: Go is the person's own tap, never a countdown, a standing permission or a reply.
 */
export interface CopyKeyAsk {
  env: string;
  /** What it is, in words ("Prow log MCP key"); the variable itself when nobody said. */
  name: string;
  from: KeyComputer;
  to: KeyComputer[];
  /** Where on `from` Ducter found it (checked by code before the card is shown). */
  source: KeySource;
  /** The asker's own words, one line. */
  why?: string;
  /** The tasks that get it on Go (each on one of `to`); a task waiting in ask_for_key is resumed with it. */
  taskIds?: string[];
}

/** A key Ducter keeps on one computer, as every client sees it: names and times, never a value. */
export interface KeptKeyView {
  env: string;
  name: string;
  /** The computer it was copied from (its name then). */
  from?: string;
  /** When it was copied here. */
  at: string;
  /** When a task last got it. */
  usedAt?: string;
}

/** What a computer answers for its keys: the list, or why it can't say. */
export type KeptKeysAnswer = { ok: true; keys: KeptKeyView[] } | { ok: false; why: "offline" | "unsupported" | "failed" };

/** The card's words: one place for every client and the chat apps. */
export const COPY_KEY_WORDS = {
  zh: {
    title: (env: string, from: string, to: string) => `把 ${from} 上的 ${env} 复制到 ${to}？`,
    note: "只给 Ducter 的任务用，不显示，不进聊天记录。",
    go: "复制",
    hold: "先不",
    done: (to: string) => `已复制到 ${to}`,
    held: "没有复制",
    failed: (to: string) => `没能复制到 ${to}`,
  },
  en: {
    title: (env: string, from: string, to: string) => `Copy ${env} from ${from} to ${to}?`,
    note: "Only for Ducter's tasks there. Never shown, never in the conversation.",
    go: "Copy",
    hold: "Not now",
    done: (to: string) => `Copied to ${to}`,
    held: "Not copied",
    failed: (to: string) => `Couldn't copy to ${to}`,
  },
} as const;

/** The computers a card names, joined as a person says them ("hel 和 haswell" / "hel and haswell"). */
export function computersWords(names: string[], lang: "zh" | "en"): string {
  if (names.length <= 1) return names[0] ?? "";
  if (lang === "zh") return `${names.slice(0, -1).join("、")} 和 ${names.at(-1)}`;
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
