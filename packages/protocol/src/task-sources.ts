// D341 (design/task-sources.md): 待办来源 / To-do sources. The person's to-dos kept in other apps
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
  /** github: who opened it (a review request's author). */
  author?: string;
  /** D428: github: who it is assigned to (logins; the person is one of them for an assigned one). */
  assignees?: string[];
  /** D428: github: who assigned it to the person (the last assignment's actor), when GitHub's timeline was read. */
  assignedBy?: string;
  /** D428: github created_at. */
  createdAt?: string;
  /** D428: github: its milestone's title. */
  milestone?: string;
  /**
   * github: a pull request waiting for the person's review (review requested, not assigned). It is
   * opened, never taken (D341 offers only what is assigned).
   */
  review?: boolean;
  /** github: how many comments it has (a sign of a discussion, for the sort). */
  comments?: number;
}

/**
 * D357: one of the few to-dos On hand shows under its to-dos group (at most GLANCE_MAX), and why it
 * is one of them: a PR waiting for the person's review, an assigned one that mentions them, an
 * Obsidian line due soonest, else the most recently updated.
 */
export interface SourceGlance extends SourceItem {
  why: "review" | "mentioned" | "due" | "recent";
  /** D359: a PR waiting for review that the partner already read (我看过了 / I've read it). */
  read?: PreReadSummary;
}

// ---------- D359: the pile (your to-dos sorted, handed over, shrinking) ----------

/**
 * D359: the few honest groups the sort puts each open to-do in (the words are the glossary's):
 *   do      我能直接做完的 / I can just do: clear what is wanted, small enough for one task
 *   decide  要你拿主意的 / Need your call: a choice only the person can make
 *   close   看起来可以关掉的 / Look ready to close: done already, stale, a duplicate, no longer wanted
 *   later   先放着的 / Can wait: big, vague, or nothing to do now
 * Every count shown is code's count of these per-item verdicts, never a number a model wrote.
 */
export const PILE_GROUPS = ["do", "decide", "close", "later"] as const;
export type PileGroup = (typeof PILE_GROUPS)[number];
export type PilePick = "hand" | "close" | "later";

/** D443: does the to-do's one line already say its size (说得清楚，改动小 / a small change)? Then the
 *  size pill would only repeat it, and is left off. The Mac's protocol/pile.go SizeSaid passes the
 *  same cases (fixtures/size-said.json). */
const SIZE_WORDS: Record<"small" | "medium" | "large", RegExp> = {
  small: /改动(很|比较|都|也)?(小|不大)|小改动|小修|改得少|一行的事|\b(small|tiny|minor|trivial|one-line|quick)\s+(change|fix|edit|tweak)\b|\btiny\b|\btrivial\b|^\s*(small|tiny)\b/i,
  medium: /改动(中等|适中)|中等/i,
  large: /改动(很|比较|挺)?大|大改|\b(big|large|sizable|major)\s+(change|rewrite|one)\b|^\s*(big|large)\b/i,
};
export function sizeSaid(why: string | undefined, size: PileItem["size"] | "" | undefined): boolean {
  if (!why || !size) return false;
  return SIZE_WORDS[size].test(why);
}

/** D359: one open to-do as the sort left it: its group, why in one line, and what goes with it. */
export interface PileItem {
  item: SourceItem;
  group: PileGroup;
  /** One line, in the person's language: why it is in this group. */
  why: string;
  /** do: how big it looks (the queue starts the small ones first). */
  size?: "small" | "medium" | "large";
  /** decide: the one question for the person, in their language. */
  ask?: string;
  /** decide: the suggested answer (the sheet marks it 建议 / Suggested; it is the default). */
  pick?: PilePick;
  /** close: the one line left on it when it is closed, in the issue's own language. */
  comment?: string;
  /** The person's own answer: a decide answered, a close kept open (keep). */
  chosen?: PilePick | "keep";
  /** Handed over: waiting in line (its task opens when one ends). */
  queued?: boolean;
  /** D385: what it is about, a few words in the person's language (the sort's; one name per subject). */
  subject?: string;
}

/** D359: handed-over to-dos run this many at a time; the next starts when one ends. */
export const PILE_CAP = 3;
/** D359: what 交给{name} hands over by default (the sheet can take more or fewer). */
export const PILE_HAND_DEFAULT = 6;

/** D359: the pile as On hand draws it: the true count and its change, the sort's groups, the queue. */
export interface PileView {
  /** Open to-dos across the sources that read (GitHub's search total; atLeast: only a lower bound). */
  open: number;
  atLeast?: boolean;
  /** How many Ducter closed or ticked for the person today (each one a write in Done for you), and yesterday. */
  clearedToday: number;
  clearedYesterday?: number;
  /** The sort running: how many read so far, of how many it will read. */
  sorting?: { read: number; of: number };
  /** When the last sort finished. */
  sortedAt?: string;
  /** Open to-dos with a verdict, and open ones not read closely (past the cost cap, or new since). */
  read: number;
  unread: number;
  /** Code's counts of the verdicts: still open, not handed over, not answered away. */
  groups: Record<PileGroup, number>;
  /** Handed over: tasks working now and to-dos waiting in line. */
  queue: { running: number; waiting: number; cap: number };
  /** Why the last sort stopped short: no AI agent to read with, the cost cap, or an error. */
  failed?: "no_model" | "budget" | "error";
  /**
   * D385: 讲的是 / Subjects: what the open ones are about, most first, each with its count (only past
   * SUBJECTS_PAST open, a subject with SUBJECT_MIN or more, at most SUBJECTS_SHOWN; absent otherwise).
   */
  subjects?: { name: string; n: number; own?: boolean }[];
  /** D385: how many more subjects there are past the ones shown. */
  subjectsMore?: number;
}

/**
 * D415: the person's own 分类 / subjects. put: these to-dos are in this subject (made if new);
 * take: out of every subject; rename: this subject is called `to` now (to an existing one: merged);
 * remove: no such subject (the sort's own name for it too); make: a subject with nothing in it yet.
 * Kept by the pile: a sort never moves a to-do the person placed, nor brings back what they removed.
 */
export type SubjectOp = "put" | "take" | "rename" | "remove" | "make";
/** D415: an own subject's name, at most this long (the sort's are 1–4 words). */
export const SUBJECT_NAME_MAX = 40;

/** D359: a PR waiting for the person's review, read by the partner (read-only, the cheap model). */
export interface PreReadSummary {
  problems: number;
  suggestions: number;
  at: string;
  /** drafted: nothing sent yet; sent: the kept comments went as one review; dropped: set aside. */
  state: "drafted" | "sent" | "dropped";
}
export interface PreReadNote {
  kind: "problem" | "suggestion";
  path?: string;
  line?: number;
  /** The drafted comment, in the PR's own language. */
  text: string;
}
export interface PreRead extends PreReadSummary {
  ref: string;
  title: string;
  url?: string;
  notes: PreReadNote[];
  /** D540: the review's own words (its conclusion, what was checked), in the PR's language: with no
   *  notes it is the whole review, so a PR with nothing to change still gets one. */
  body?: string;
  /** One line in the person's language: what the PR does. */
  gist?: string;
  /** D394: read by a task of the person's (a review that runs every so often), at this head. */
  byTask?: string;
  head?: string;
}

/** D394: where a review task's requests stand after its last round (the Ongoing card's line). */
export interface ReviewStanding {
  /** Requests waiting on the person (review requests and mentions, after dedupe). */
  waiting: number;
  /** Of those, reviewed again this round because their head moved. */
  again: number;
  /** Of those, unchanged since they were reviewed. */
  same: number;
  /** D413: posted this round without asking, under a standing permission the person said. */
  posted?: number;
  /** Drafted reviews not yet sent (on the round's card). */
  drafted: number;
  at: string;
}

/** D357: never more than this many to-dos stand on On hand; the rest are folded. */
export const GLANCE_MAX = 3;
/** D357: a page of the fold (more come with 再看 {n} 个 / Show {n} more). */
export const BROWSE_PAGE = 30;

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
  /**
   * Open items in scope at the last look (GitHub: search's total over the scope, not the one page
   * read), and how many have a live task. openAtLeast: only a lower bound was known ("at least").
   */
  open?: number;
  openAtLeast?: boolean;
  /** github: open PRs waiting for the person's review (review requested), in the same scope. */
  review?: number;
  taken?: number;
  /** When it last looked. Counts are shown only after a look that read the list (checkedAt and open). */
  checkedAt?: string;
  /** A look is running now (正在看… / Looking…). */
  looking?: boolean;
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
  /** D357: the few On hand shows (≤ GLANCE_MAX), across the sources, none with a live task. */
  glance?: SourceGlance[];
  /** D359: the pile, once a source read its list. */
  pile?: PileView;
}

/** One write to an outside app on the person's behalf. tick/untick: obsidian; comment/close: github. */
export type SourceOp = "comment" | "close" | "tick" | "untick" | "review";

/**
 * A card about a bound to-do (Bodies.decision.src).
 *   write   在 {where}#{n} 下留言？/ Comment on …? (close: and close it). Go writes it once, by core.
 *   closed  {label} 在 {app} 上关掉了。这个任务停下吗？/ … was closed in {app}. Stop this task? Go stops it (reversible: the default after the wait).
 *   trust   以后 {app} 上…直接接下？/ the standing go offered once (take) or 直接留言 (write).
 */
export interface SourceAsk {
  /*
   * D359: batch   关掉这 {n} 个，各留一句？ the reviewed close batch (its Go given on the sheet that showed every line)
   *       picks   今天能替你清掉这 {n} 个 the morning's picks, inside the note (Go hands them over)
   *       review  发出这 {n} 条？ a pre-read's drafted review comments (its Go given on the sheet)
   */
  /*
   * D415: hand_comment 先在这 {n} 个下面留一句，再开始？ the note asked to tell the issues first: Go
   *                    comments (text, on each of items) and starts; the other way starts without.
   */
  kind: "write" | "closed" | "trust" | "batch" | "picks" | "review" | "plan" | "where_rule" | "group_review" | "reviews" | "hand_comment";
  item: SourceItemRef;
  /** write: the comment, exactly as it goes out (the card shows it whole). */
  text?: string;
  /** write: and close it (Go = 留言并关掉 / Comment and close). */
  close?: boolean;
  /** closed, write: the task it is about. */
  taskId?: string;
  /** trust: which standing go. */
  trust?: "take" | "write";
  /** batch, picks: the to-dos (batch: with the line each one gets). */
  items?: { item: SourceItemRef; text?: string }[];
  /*
   * D394: reviews  {n} 个 PR 的评审写好了，发到 GitHub？ a review task's round: its drafted reviews,
   *                each opened as its pre-read (items), posted on Go as one COMMENT review each.
   */
  /** review: the drafted comments that go out. */
  notes?: PreReadNote[];
  /*
   * D385: plan         {group}：方案 / {group}: the plan: 照这个做 / Go with this (its parts open), 先等等 /
   *                    Hold, 回复… / Reply… (to the plan's own task, which plans again). No default runs on it.
   *       where_rule   以后写代码的事都去 {computer} 上做？ the note's lasting where, asked once (Go keeps it as a rule).
   *       group_review 在这 {n} 个下面留言 / Comment on these {n}: review together's batch (its Go given on the sheet).
   */
  groupId?: string;
  plan?: import("./handover.ts").HandPlan;
  /** plan: the group's name (the card's title). */
  group?: string;
  /** where_rule: the computer (device id and name), the person's words, and the agent the rule keeps. */
  device?: string;
  deviceName?: string;
  quote?: string;
  harness?: string;
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
  // D357: On hand's fold pages through them too: page (1-based, BROWSE_PAGE each), a repository or
  // an Obsidian folder (where), a tag or label, or the PRs waiting for the person's review.
  | { t: "source_items"; id?: string; query?: string; clientId?: string; page?: number; where?: string; tag?: string; review?: boolean }
  // D359: the pile. pile_sort: sort again now (再理一遍). pile_items: one group's to-dos.
  | { t: "pile_sort" }
  | { t: "pile_items"; group: PileGroup; clientId?: string }
  // 交给{name}这 {n} 个 / Hand these {n} to {name}. D385: with the sheet's note (给{name}的话), a note
  // per to-do (给这个的话…), the shape, where and who; group: into that live group (加进「{group}」);
  // subject: the set's name (the group's); setId: the conversation's set card it came from.
  | {
      t: "pile_hand";
      refs: string[];
      clientId?: string;
      note?: string;
      notes?: Record<string, string>;
      shape?: import("./handover.ts").HandShape;
      group?: string;
      device?: string;
      harness?: string;
      subject?: string;
      bySubject?: boolean;
      setId?: string;
    }
  // D385: find across the pile by words and by meaning (找… / Find…), a 讲的是 chip's subject, or a
  // set card's refs: every sort group, each item with how it was found.
  // D396: words: the person's whole sentence ("关于 distill 的，先别动数据库"): core splits what to find
  // from the note (said) and finds by the first; none of the four: only the suggestions (suggest).
  | { t: "pile_find"; query?: string; words?: string; subject?: string; setId?: string; clientId?: string; drop?: string[] }
  // D415: the person's own subjects (分类): answered with pile_result op "subject" (name: as kept).
  | { t: "pile_subject"; op: SubjectOp; name: string; to?: string; refs?: string[]; clientId?: string }
  // D385: the sheet's how for the ticked set and the note so far (sent as they change).
  | { t: "pile_how"; refs: string[]; note?: string; bySubject?: boolean; subject?: string; clientId?: string }
  // D385: a plan card's answer: go (its parts open, with the notes said on them), hold, or reply (to the plan's task).
  | { t: "plan_answer"; groupId: string; option: "go" | "hold" | "reply"; text?: string; notes?: Record<string, string>; clientId?: string }
  // D385: 一起过目 / Review together: read a done group's rows; send its comments (keep: the to-dos' refs whose line goes out).
  | { t: "group_review"; groupId: string; clientId?: string }
  | { t: "group_review_send"; groupId: string; keep: string[]; clientId?: string }
  // A decide answered (hand, close, later), or a close kept open (keep).
  | { t: "pile_choose"; ref: string; pick: PilePick | "keep" }
  // The close batch's Go, given on the sheet that showed every line: these refs, each with its line.
  | { t: "pile_close"; refs: string[]; clientId?: string }
  // A PR's pre-read: read it now, or send its drafted comments (the Go; keep = the notes kept, by index).
  | { t: "pre_read"; ref: string; clientId?: string }
  | { t: "pre_read_send"; ref: string; keep: number[]; clientId?: string };

export type SourcesServerFrame =
  | ({ t: "sources" } & SourcesView)
  | {
      t: "source_items_result";
      clientId?: string;
      items: SourceItem[];
      errors?: { source: string; error: string }[];
      /** D357: the page answered, and whether another follows. */
      page?: number;
      more?: boolean;
      /** D357: the chips the fold offers: repositories or folders, and tags, most common first. */
      wheres?: string[];
      tags?: string[];
      /** D357: GitHub asked to slow down (its rate limit): try again in a minute. */
      limited?: boolean;
    }
  | { t: "source_result"; op: "add" | "set" | "remove"; ok: boolean; id?: string; reason?: "no_tool" | "signed_out" | "missing" | "exists" | "unknown" }
  | { t: "pile_items_result"; clientId?: string; group: PileGroup; items: PileItem[] }
  // D359: what a pile action did: handed (into the queue), closed (done, failed), a review sent, a pre-read made.
  | { t: "pile_result"; clientId?: string; op: "hand" | "close" | "review" | "pre_read" | "plan" | "group_review" | "subject"; ok: boolean; done?: number; failed?: number; read?: PreRead; error?: string; groupId?: string; name?: string; asked?: string }
  // D385: a find's answer (the sheet's find field, a chip, a set card), and the sheet's how.
  | { t: "pile_find_result"; clientId?: string; query?: string; subject?: string; found: import("./handover.ts").FindSummary; items: import("./handover.ts").FoundItem[]; ticked: string[]; setId?: string; said?: import("./handover.ts").FindSaid; suggest?: string[]; handedOver?: import("./handover.ts").HandedItem[] }
  | { t: "pile_how_result"; clientId?: string; how: import("./handover.ts").HandHow }
  | { t: "group_review_result"; clientId?: string; review?: import("./handover.ts").GroupReview; error?: string };

/** The chip's words on a task: "#123" (with the repo when asked), or the note's name. */
export function sourceChip(r: Pick<SourceItemRef, "kind" | "label" | "where">, withWhere = false): string {
  if (r.kind === "github" && withWhere && r.where) return `${r.where}${r.label}`;
  return r.label;
}
