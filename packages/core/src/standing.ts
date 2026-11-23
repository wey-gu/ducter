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
import { STANDING_ACTIONS, type StandingAction, type StandingView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const STANDING_FILE = "standing.json";

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
   */
  covers(action: StandingAction, at: { taskId: string; owner?: string }): StandingView | undefined;
  /** Keep a saying (grant: kept or widened; revoke: ended), once per saying key. What changed. */
  hear(key: string, s: StandingSaying, at: string, seq?: number): { kept?: StandingView; revoked?: StandingView[] } | undefined;
  /** 收回 / Take back, by id. */
  revoke(id: string): boolean;
  /** The first use of this permission: true once (the one line in the conversation), then false. */
  firstUse(id: string): boolean;
  onChange(fn: () => void): () => void;
  /** Ongoing (D413): a grant was kept: post what waits inside it now. */
  onGrant(fn: (s: StandingView) => void): () => void;
}

export type Heard = { kind: "kept"; standing: StandingView } | { kind: "revoked"; text: string };

interface File {
  items: StandingView[];
  /** Saying keys heard → what came of them (a record; D413's said:<seq> keys from before D495 stay). */
  heard: Record<string, Heard>;
}

export function openStanding(o: { log?: LogStore; dataDir: string; now?: () => Date; reviewOrgs?: () => string[]; /** D499: a task still open (a permission kept for one task ends with it). */ alive?: (taskId: string) => boolean }): StandingStore {
  const now = o.now ?? (() => new Date());
  const path = join(o.dataDir, STANDING_FILE);
  let st: File = { items: [], heard: {} };
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      st = {
        items: Array.isArray(raw?.items) ? raw.items.filter((x: StandingView) => x && typeof x.id === "string" && STANDING_ACTIONS.includes(x.action) && typeof x.text === "string") : [],
        heard: raw?.heard && typeof raw.heard === "object" ? raw.heard : {},
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
      return st.items.find((s) => s.action === action && !s.taskId && (!s.orgs?.length || s.orgs.includes(owner)));
    },
    covers(action, at) {
      const owner = at.owner?.toLowerCase();
      const mine = st.items.find((s) => s.action === action && s.taskId === at.taskId && live(s));
      return mine ?? st.items.find((s) => s.action === action && !s.taskId && (!s.orgs?.length || (!!owner && s.orgs.includes(owner))));
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
      const orgs = s.taskId ? [] : (s.orgs ?? (s.action === "pr_review" ? (o.reviewOrgs?.() ?? []).map((x) => x.toLowerCase()) : []));
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
