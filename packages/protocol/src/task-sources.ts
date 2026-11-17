// D340 (design/task-sources.md): 待办来源 / To-do sources. The person's to-dos kept in other apps
// (GitHub issues and pull requests assigned to them; Obsidian Tasks lines in a vault on the home),
// which a Ducter task can be bound to. The outside app owns WHAT the to-do is and whether it is
// open; Ducter owns HOW it gets done. Shared by core and every client.

/** The apps a source can be. jira is designed (an adapter later) and shown as coming soon. */
export const SOURCE_KINDS = ["github", "obsidian", "jira"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** The kinds built now (the others are shown as 即将推出 / Coming soon). */
export const SOURCE_KINDS_BUILT: readonly SourceKind[] = ["github", "obsidian"];

/**
 * One outside to-do as a task carries it (TaskCard.source, a card's src): enough to draw the chip
 * (the app's mark and the label) and open it in its app, never its whole text.
 */
export interface SourceItemRef {
  /** The source's id in 待办来源 (src_…). */
  source: string;
  kind: SourceKind;
  /**
   * The item's stable key inside its source. github: "owner/repo#123". obsidian: "<path in the
   * vault>::<key>", the key being the line's 🆔 or ^block id, else a hash of its words.
   */
  ref: string;
  /** The chip's words: github "#123" (the repo beside it when it isn't the only one), obsidian the note's name. */
  label: string;
  /** github: the repository ("owner/repo"); obsidian: the note's path in the vault. */
  where?: string;
  /** Its title (an issue's title; a to-do line's words without the Tasks signifiers). */
  title: string;
  /** Opens it in its own app: the issue page; obsidian://open?vault=…&file=… for a vault line. */
  url?: string;
  /** github: a pull request rather than an issue. */
  pr?: boolean;
}

/** An item as a list shows it (the composer's pick, the partner's list). */
export interface SourceItem extends SourceItemRef {
  state: "open" | "closed";
  /** Its text beyond the title, cut (issue body; for a vault line nothing). Untrusted: written by whoever wrote it. */
  body?: string;
  /** github updated_at; obsidian the file's change time. */
  updatedAt?: string;
  /** Obsidian Tasks 📅 due date, YYYY-MM-DD. */
  due?: string;
  /** Obsidian Tasks priority: highest ⏫🔺, high 🔼, low 🔽, lowest ⏬. */
  priority?: "highest" | "high" | "low" | "lowest";
  /** github labels (names only). */
  labels?: string[];
  /** Obsidian Tasks 🔁: a repeating to-do (Ducter never ticks one: the Tasks plugin makes the next). */
  repeats?: boolean;
  /** The live task already bound to it, so a pick opens that task instead of a second one. */
  taskId?: string;
}

/** 新的来了 / When a new one comes. tell: the partner offers it; take: it starts without asking (the standing go); quiet: only when asked. */
export type WhenNew = "tell" | "take" | "quiet";
/**
 * 做完以后 / When it's done. github: ask (a Go card each time), comment (comment by itself), close
 * (comment and close by itself). obsidian: tick (tick the line by itself), ask, leave (never touch it).
 */
export type WhenDone = "ask" | "comment" | "close" | "tick" | "leave";

export const WHEN_DONE: Record<"github" | "obsidian", readonly WhenDone[]> = {
  github: ["ask", "comment", "close"],
  obsidian: ["tick", "ask", "leave"],
};
export const DEFAULT_WHEN: Record<"github" | "obsidian", { whenNew: WhenNew; whenDone: WhenDone }> = {
  github: { whenNew: "tell", whenDone: "ask" },
  obsidian: { whenNew: "quiet", whenDone: "tick" },
};

/** A source as Settings › 待办来源 / To-do sources shows it. */
export interface SourceView {
  id: string;
  kind: SourceKind;
  /** GitHub: the account's login; Obsidian: the vault's name. */
  name: string;
  /**
   * ok         reads now
   * no_tool    github: gh isn't on the home (D272's install line)
   * signed_out github: gh isn't signed in on the home (D272's sign-in)
   * missing    obsidian: the vault's folder isn't there (moved, or not synced to this computer)
   * error      the last look failed (error says why, in English, for Details)
   */
  state: "ok" | "no_tool" | "signed_out" | "missing" | "error";
  error?: string;
  /** github: only these repositories ("owner/repo"); absent = every repository. */
  repos?: string[];
  /** github: only with this label; obsidian: only lines with this tag ("#ducter"). */
  label?: string;
  /** obsidian: the folder inside the vault it reads ("" = the whole vault). */
  folder?: string;
  /** obsidian: the vault's folder on the home. */
  path?: string;
  whenNew: WhenNew;
  whenDone: WhenDone;
  /** The standing goes, and how they came: after the person took (or let it write) twice in 14 days, or set here. */
  standing?: { take?: { at: string; after?: number }; write?: { at: string; after?: number } };
  /** Open items in scope at the last look, and how many have a live task. */
  open?: number;
  taken?: number;
  /** When it last looked. */
  checkedAt?: string;
}

/** What the home could add without asking anything: gh signed in, vaults Obsidian knows. */
export interface SourcesFound {
  github?: { state: "ok" | "no_tool" | "signed_out"; login?: string; computer?: string };
  /** Vaults listed in Obsidian's own list on the home (names and folders only, never read). */
  vaults: { name: string; path: string }[];
}

export interface SourcesView {
  sources: SourceView[];
  found: SourcesFound;
}

/** One write to an outside app on the person's behalf. tick/untick: obsidian; comment/close: github. */
export type SourceOp = "comment" | "close" | "tick" | "untick";

/**
 * A card about a bound to-do (Bodies.decision.src).
 *   write   在 {where}#{n} 下留言？/ Comment on …? (close: and close it). Go writes it once, by core.
 *   closed  {label} 在 {app} 上关掉了。这件事停下吗？/ … was closed in {app}. Stop this task? Go stops it (reversible: the default after the wait).
 *   trust   以后 {app} 上…直接接下？/ the standing go offered once (take) or 直接留言 (write).
 */
export interface SourceAsk {
  kind: "write" | "closed" | "trust";
  item: SourceItemRef;
  /** write: the comment, exactly as it goes out (the card shows it whole). */
  text?: string;
  /** write: and close it (Go = 留言并关掉 / Comment and close). */
  close?: boolean;
  /** closed, write: the task it is about. */
  taskId?: string;
  /** trust: which standing go. */
  trust?: "take" | "write";
}

export type SourcesClientFrame =
  // Answered with a sources frame; the socket stays subscribed (a fresh frame on every change).
  | { t: "sources" }
  // 加上 / Add: github (the home's gh), or an Obsidian vault by its folder on the home.
  | { t: "source_add"; kind: SourceKind; path?: string }
  | { t: "source_set"; id: string; whenNew?: WhenNew; whenDone?: WhenDone; folder?: string; label?: string; repos?: string[] }
  // 移除 / Remove: the source is forgotten; tasks bound to its items keep their chip.
  | { t: "source_remove"; id: string }
  // The composer's 从待办里选 / Pick from your to-dos: open items, newest first (query matches words and labels).
  | { t: "source_items"; id?: string; query?: string; clientId?: string };

export type SourcesServerFrame =
  | ({ t: "sources" } & SourcesView)
  | { t: "source_items_result"; clientId?: string; items: SourceItem[]; errors?: { source: string; error: string }[] }
  | { t: "source_result"; op: "add" | "set" | "remove"; ok: boolean; id?: string; reason?: "no_tool" | "signed_out" | "missing" | "exists" | "unknown" };

/** The chip's words on a task: "#123" (with the repo when asked), or the note's name. */
export function sourceChip(r: Pick<SourceItemRef, "kind" | "label" | "where">, withWhere = false): string {
  if (r.kind === "github" && withWhere && r.where) return `${r.where}${r.label}`;
  return r.label;
}
