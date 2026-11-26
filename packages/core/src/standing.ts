// D413: 不用问我的 / Without asking. What the person says Ducter may do for them from now on without
// asking ("review 做好了直接发别和我确认", "just post the reviews, don't ask me") is kept in their words,
// like a rule: no card, no Go. The review routine then posts its drafts on the PRs inside it through
// the same audited write (Done for you), and asks only for what is outside it (another org). Said the
// other way, or 收回 / Take back on the Partner page, ends it.
//
// D495 (principle 21): the model judges, code guards. The partner records a permission with its
// without_asking tool (keep / take_back), quoting the person's own words, which code checks were said
// (never what they mean). Code holds the invariants: only actions with an audited write that honours
// them (STANDING_ACTIONS) can be kept, so the floor (D61 GQ5: paying, passwords and sign-ins,
// deleting, what an untrusted source asked for) can never become standing; where it holds is the
// owners recorded, else where the review routine looks. No regex reads the person's words here.
import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { STANDING_ACTIONS, STANDING_COVERS, fill, words, type LangTag, type StandingAction, type StandingView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const STANDING_FILE = "standing.json";

/**
 * D596: the one line the first time a pr_open go is used (pushed, the PR with its link, who it goes
 * to next); after that, silence: every one is in Done for you. A table per language (D292).
 */
const PR_FIRST = {
  zh: { line: "按你说的，「{title}」验证好了，我直接推了分支、开了 PR：{link}{hand}。以后照这样做，不再一一说；都在「替你做过的」里，想收回说一声。", hand: "，接着交给 {who} 跟进" },
  en: { line: "As you said, “{title}” is verified, so I pushed its branch and opened the PR: {link}{hand}. From now on I'll do this without a word each time; it's all in Done for you, and you can take it back any time.", hand: ", and it goes to {who} next" },
};

export function prFirstLine(lang: LangTag | undefined, v: { title: string; link: string; who?: string }): string {
  const w = words(PR_FIRST, lang);
  const title = [...v.title].length > 60 ? `${[...v.title].slice(0, 59).join("")}…` : v.title;
  return fill(w.line, { title, link: v.link, hand: v.who ? fill(w.hand, { who: v.who }) : "" });
}

/** What the partner recorded about asking first (their words in quote). */
export type StandingSaying =
  | { kind: "grant"; action: StandingAction; orgs?: string[]; quote: string; taskId?: string; taskTitle?: string }
  | { kind: "revoke"; action: StandingAction; quote: string; taskId?: string };

export interface StandingStore {
  list(): StandingView[];
  /** The standing permission that lets this action on ref (owner/repo#n) go without asking, if any. */
  allows(action: StandingAction, ref: string): StandingView | undefined;
  /**
   * D499: the permission that covers this step of this task, if any: one kept for this task, or one
   * for the action where its owners hold (owner: the task's repo owner; unbounded holds anywhere).
   * D596: repo (owner/repo) matches a permission bounded by repos; a pr_open go covers branch_push.
   */
  covers(action: StandingAction, at: { taskId: string; owner?: string; repo?: string }): StandingView | undefined;
  /** Keep a saying (grant: kept or widened; revoke: ended), once per saying key. What changed. */
  hear(key: string, s: StandingSaying, at: string, seq?: number): { kept?: StandingView; revoked?: StandingView[] } | undefined;
  /**
   * D601: kept by a tap on a card's 以后这类直接做 / Always do this: the action, where the card acted
   * (its owners), the button's label as its text, by "tap". Said or tapped before for that action:
   * widened to these owners too (one permission per action; their own words stay its words). quiet:
   * no onGrant (the card's own Go does what waits on it now). Undefined for an action that can't stand.
   */
  tap(action: StandingAction, where: string[], at: string, label: string, opts?: { quiet?: boolean }): StandingView | undefined;
  /** 收回 / Take back, by id. */
  revoke(id: string): boolean;
  /** The first use of this permission: true once (the one line in the conversation), then false. */
  firstUse(id: string): boolean;
  /** D596: true the first time this key is asked on this home, then false (kept in the file). */
  once(key: string): boolean;
  onChange(fn: () => void): () => void;
  /** Ongoing (D413): a grant was kept: post what waits inside it now. */
  onGrant(fn: (s: StandingView) => void): () => void;
}

export type Heard = { kind: "kept"; standing: StandingView } | { kind: "revoked"; text: string };

interface File {
  items: StandingView[];
  /** Saying keys heard → what came of them (a record; D413's said:<seq> keys from before D495 stay). */
  heard: Record<string, Heard>;
  /** D596: one-time notes already given (key → ISO time). */
  told?: Record<string, string>;
}

export function openStanding(o: {
  log?: LogStore;
  dataDir: string;
  now?: () => Date;
  reviewOrgs?: () => string[];
  /** D499: a task still open (a permission kept for one task ends with it). */
  alive?: (taskId: string) => boolean;
  /** D596: the GitHub owners the person's tasks work in now: where a pr_open go holds when none were named. */
  taskOwners?: () => string[];
}): StandingStore {
  const now = o.now ?? (() => new Date());
  const path = join(o.dataDir, STANDING_FILE);
  let st: File = { items: [], heard: {} };
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      st = {
        items: Array.isArray(raw?.items) ? raw.items.filter((x: StandingView) => x && typeof x.id === "string" && STANDING_ACTIONS.includes(x.action) && typeof x.text === "string") : [],
        heard: raw?.heard && typeof raw.heard === "object" ? raw.heard : {},
        ...(raw?.told && typeof raw.told === "object" ? { told: raw.told } : {}),
      };
    } catch (err) {
      console.warn(`[standing] ${path} is unreadable; starting with none:`, (err as Error).message);
    }
  }
  const subs = new Set<() => void>();
  const grants = new Set<(s: StandingView) => void>();
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(st, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  const changed = () => {
    try {
      save();
    } catch (err) {
      console.warn("[standing] couldn't save:", (err as Error).message);
    }
    for (const fn of subs) fn();
  };
  const ownerOf = (ref: string) => ref.split("/")[0]!.toLowerCase();
  /** D499: a permission kept for one task holds while that task is open. */
  const live = (s: StandingView) => !s.taskId || !o.alive || o.alive(s.taskId);

  const store: StandingStore = {
    list: () => st.items.filter(live),
    allows(action, ref) {
      const owner = ownerOf(ref);
      const repo = ref.split("#")[0]!.toLowerCase();
      return st.items.find((s) => s.action === action && !s.taskId && (!s.orgs?.length || s.orgs.includes(owner) || s.orgs.includes(repo)));
    },
    covers(action, at) {
      const owner = at.owner?.toLowerCase();
      const repo = at.repo?.toLowerCase();
      // D596: a go for opening the PR covers pushing its branch.
      const fits = (s: StandingView) => s.action === action || !!STANDING_COVERS[s.action]?.includes(action);
      const holds = (s: StandingView) => !s.orgs?.length || s.orgs.some((x) => (x.includes("/") ? !!repo && x === repo : !!owner && x === owner));
      const mine = st.items.find((s) => fits(s) && s.taskId === at.taskId && live(s));
      return mine ?? st.items.find((s) => s.action === action && !s.taskId && holds(s)) ?? st.items.find((s) => fits(s) && !s.taskId && holds(s));
    },
    tap(action, where, at, label, opts) {
      if (!STANDING_ACTIONS.includes(action)) return undefined;
      const orgs = [...new Set(where.map((x) => x.toLowerCase()).filter(Boolean))];
      if (!orgs.length) return undefined; // a tap holds where the card acted, never everywhere
      const had = st.items.find((x) => x.action === action && !x.taskId);
      if (had && (!had.orgs?.length || orgs.every((o) => had.orgs!.includes(o)))) return had;
      const kept: StandingView = had
        ? { ...had, orgs: [...new Set([...(had.orgs ?? []), ...orgs])] }
        : { id: `st_${randomBytes(5).toString("hex")}`, action, orgs, text: label.slice(0, 80), createdAt: at, by: "tap" };
      st.items = [...st.items.filter((x) => x.id !== kept.id), kept];
      changed();
      if (!opts?.quiet) for (const fn of grants) fn(kept);
      return kept;
    },
    hear(key, s, at, seq) {
      if (st.heard[key]) return undefined;
      if (!STANDING_ACTIONS.includes(s.action)) return undefined;
      if (s.kind === "revoke") {
        // Taken back for the action (D499: only that task's, when one is named).
        const hit = (x: StandingView) => x.action === s.action && (!s.taskId || x.taskId === s.taskId);
        const gone = st.items.filter(hit);
        st.items = st.items.filter((x) => !hit(x));
        st.heard[key] = { kind: "revoked", text: gone[0]?.text ?? s.quote };
        changed();
        return { revoked: gone };
      }
      // Bounded by the orgs named, else by where the review routine looks now (a later org asks first).
      // Said again: one permission per action, its words the newest; unbounded if either is.
      // D415: a comment on issues names its owners or holds wherever the person's issues are.
      // D499: one kept for a task is its own (the task bounds it; owners don't apply).
      // D596: a pr_open go names owners or repos, else holds where the person's tasks work now.
      const fallback = s.action === "pr_review" ? (o.reviewOrgs?.() ?? []) : s.action === "pr_open" ? (o.taskOwners?.() ?? []) : [];
      const orgs = s.taskId ? [] : (s.orgs ?? fallback.map((x) => x.toLowerCase()));
      const had = st.items.find((x) => x.action === s.action && x.taskId === s.taskId);
      const bound = had ? (had.orgs?.length && orgs.length ? [...new Set([...had.orgs, ...orgs])] : []) : [...new Set(orgs)];
      const kept: StandingView = {
        id: had?.id ?? `st_${randomBytes(5).toString("hex")}`,
        action: s.action,
        ...(bound.length ? { orgs: bound } : {}),
        ...(s.taskId ? { taskId: s.taskId, ...(s.taskTitle ? { taskTitle: s.taskTitle.slice(0, 80) } : {}) } : {}),
        text: s.quote,
        createdAt: at,
        ...(seq !== undefined ? { seq } : {}),
        ...(had?.usedAt ? { usedAt: had.usedAt } : {}),
      };
      st.items = [...st.items.filter((x) => x.id !== kept.id), kept];
      st.heard[key] = { kind: "kept", standing: kept };
      changed();
      for (const fn of grants) fn(kept);
      return { kept };
    },
    revoke(id) {
      const n = st.items.length;
      st.items = st.items.filter((x) => x.id !== id);
      if (st.items.length === n) return false;
      changed();
      return true;
    },
    once(key) {
      if (st.told?.[key]) return false;
      st.told = { ...st.told, [key]: now().toISOString() };
      changed();
      return true;
    },
    firstUse(id) {
      const s = st.items.find((x) => x.id === id);
      if (!s || s.usedAt) return false;
      s.usedAt = now().toISOString();
      changed();
      return true;
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    onGrant(fn) {
      grants.add(fn);
      return () => grants.delete(fn);
    },
  };
  return store;
}
