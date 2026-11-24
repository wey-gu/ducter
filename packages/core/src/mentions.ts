// D534: the home's side of @ and / in the composers (design/mentions.md). Three things, all plain
// lookups, never a model:
//   - find: the @ list for what is typed after @ (tasks on hand and earlier, Keeps, partners, PRs
//     and issues Ducter knows; inside a task also files in its place);
//   - slash: the / list (Ducter's actions and the person's skills for the partner's composer; the
//     task agent's own commands and skills, from its registry facts and OAR's catalogs, and
//     Ducter's task actions for a task's composer);
//   - resolve: the ids a message carries turned into the real objects (title, state, the latest
//     report, a task's changes), for the partner's turn or the task's words. What to do with them
//     is the model's judgment.
import type { PartnerInfo, PastItem, TaskCard } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import type { NativeEntry } from "@ducter/protocol/src/internal.ts";
import { labelOf, MENTION_ROWS, rank, type HeldRef, type MentionItem, type Ref, type SlashEntry } from "@ducter/protocol/src/mentions.ts";

/** What the @ list and the resolver read. Every source optional: a home without one just lists less. */
export interface MentionSources {
  persona: () => string;
  /** The live cards (every partner's: the list keeps this persona's). */
  tasks: () => TaskCard[];
  task: (id: string) => TaskCard | undefined;
  /** The Past index (D285): earlier tasks by words. */
  past?: (q: string, limit: number) => PastItem[];
  pastItem?: (id: string) => PastItem | undefined;
  /** Its last report in full, cut (Past.report). */
  pastReport?: (id: string) => string | undefined;
  keeps?: () => { id: string; title: string; life: string; persona?: string }[];
  keep?: (id: string) => { id: string; title: string; life: string; say?: string } | undefined;
  partners?: () => PartnerInfo[];
  /** Files in a task's place whose path matches q (the workbench's find). */
  files?: (taskId: string, q: string) => Promise<string[]>;
  /** A task's changed files against its base, for an @task read inside another task. */
  changes?: (taskId: string) => Promise<{ path: string; adds?: number; dels?: number }[] | undefined>;
  /** The task's agent's own commands and skills (runner.native). */
  native?: (taskId: string) => Promise<{ harness: string; commands?: NativeEntry[]; skills?: NativeEntry[] } | undefined>;
  /** The person's own skills a task can run (Claude Code's on the home), for the partner's / list. */
  skills?: () => Promise<NativeEntry[] | undefined>;
}

export interface Mentions {
  find(q: string, taskId?: string): Promise<MentionItem[]>;
  slash(taskId?: string): Promise<{ entries: SlashEntry[]; harness?: string }>;
  resolve(refs: Ref[], o?: { forTask?: string }): Promise<HeldRef[]>;
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

/** A task's state in a word the model reads (never shown). */
const STATE: Record<string, string> = { queued: "queued", working: "working", needs_you: "waiting for the person", blocked: "blocked", done_claimed: "done, unchecked", done: "done", failed: "didn't work", dropped: "dropped" };

/** Ducter's own entries in the partner's / list, in order. Worded by the client (slash.<name>). */
export const PARTNER_ACTIONS: SlashEntry[] = [
  { name: "new", group: "ducter", run: "new_task" },
  { name: "keep", group: "ducter", ref: { kind: "action", id: "keep", label: "keep" } },
  { name: "remind", group: "ducter", ref: { kind: "action", id: "remind", label: "remind" } },
  { name: "handover", group: "ducter", run: "handover" },
  { name: "find", group: "ducter", run: "find" },
];

/** Ducter's own entries in a task's / list. */
export const TASK_ACTIONS: SlashEntry[] = [
  { name: "pause", group: "task", run: "pause" },
  { name: "switch", group: "task", run: "switch" },
  { name: "fork", group: "task", run: "fork" },
];

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const prLabel = (pr: string) => {
  const m = /([^/]+)#(\d+)$/.exec(pr);
  return m ? `${m[1]}#${m[2]}` : pr;
};

/**
 * The / entries for a task's agent: its fixed ones (Ducter's /model and /effort, /compact where it
 * reaches the agent), then what its catalogs list in the task's place, minus the hidden ones.
 * Skills listed as commands (Claude Code) stay commands; skills of their own are written in the
 * agent's form (Codex $name, pi /skill:name). Exported for the tests.
 */
export function nativeEntries(harness: string, found?: { commands?: NativeEntry[]; skills?: NativeEntry[] }): SlashEntry[] {
  const facts = HARNESS_FACTS[harness as HarnessId]?.nativeCommands.value;
  if (!facts) return [];
  const hidden = new Set(facts.hidden);
  const out: SlashEntry[] = [];
  const seen = new Set<string>();
  const add = (e: SlashEntry) => {
    if (seen.has(e.name) || hidden.has(e.name) || e.name.startsWith("_")) return;
    seen.add(e.name);
    out.push(e);
  };
  for (const name of facts.fixed) add({ name, group: "native", insert: `/${name} `, source: "builtin" });
  for (const c of found?.commands ?? []) {
    if (c.userInvocable === false || !/^[\w:.-]+$/.test(c.name)) continue;
    add({ name: c.name, group: "native", insert: `/${c.name} `, ...(c.description ? { about: clip(c.description, 140) } : {}), ...(c.source ? { source: c.source } : {}) });
  }
  if (facts.skillForm)
    for (const s of found?.skills ?? []) {
      if (s.userInvocable === false || !/^[\w:.-]+$/.test(s.name)) continue;
      const form = facts.skillForm.replace("{name}", s.name);
      add({ name: form.replace(/^[/$]/, ""), group: "skills", insert: `${form} `, ...(s.description ? { about: clip(s.description, 140) } : {}), ...(s.source ? { source: s.source } : {}) });
    }
  return out;
}

export function createMentions(src: MentionSources): Mentions {
  let skillsAt = 0;
  let skillsList: NativeEntry[] | undefined;
  const nativeCache = new Map<string, { at: number; v: { harness: string; commands?: NativeEntry[]; skills?: NativeEntry[] } | undefined }>();
  const FRESH = 5 * 60_000;

  const mine = (c: { persona?: string }) => !c.persona || c.persona === src.persona();

  function taskItem(c: TaskCard): MentionItem {
    return { kind: "task", id: c.taskId, label: labelOf(c.title), sub: c.project || undefined, attention: c.attention };
  }

  return {
    async find(q, taskId) {
      const live = src
        .tasks()
        .filter((c) => mine(c) && c.taskId !== taskId && c.attention !== "dropped")
        .sort((a, b) => Number(ACTIVE.has(b.attention)) - Number(ACTIVE.has(a.attention)) || b.updatedAt.localeCompare(a.updatedAt));
      const tasks = rank(live, q, (c) => c.title, (c) => `${c.project} ${c.place.kind === "repo" ? (c.place.branch ?? "") : ""}`).map(taskItem);
      // Earlier ones from the Past index, by what anyone said (only with words: the list starts with what's on hand).
      if (q.trim() && src.past)
        for (const p of src.past(q, MENTION_ROWS)) {
          if (p.taskId === taskId || tasks.some((x) => x.id === p.taskId)) continue;
          tasks.push({ kind: "task", id: p.taskId, label: labelOf(p.title), sub: p.project || undefined, attention: p.attention });
        }
      const keeps = rank((src.keeps?.() ?? []).filter((k) => mine(k) && k.life !== "stopped"), q, (k) => k.title).map((k): MentionItem => ({ kind: "keep", id: k.id, label: labelOf(k.title) }));
      const partners = rank((src.partners?.() ?? []).filter((p) => p.id !== src.persona()), q, (p) => p.name, (p) => p.about ?? "").map((p): MentionItem => ({ kind: "partner", id: p.id, label: labelOf(p.name), ...(p.about ? { sub: clip(p.about, 40) } : {}) }));
      // PRs and issues Ducter knows: the ones its tasks opened or work on.
      const code: MentionItem[] = [];
      for (const c of src.tasks().filter(mine)) {
        for (const pr of c.prs ?? []) if (!code.some((x) => x.id === pr.url)) code.push({ kind: "pr", id: pr.url, label: prLabel(pr.pr), sub: clip(c.title, 40), attention: pr.state });
        if (c.source?.kind === "github" && c.source.url && !code.some((x) => x.id === c.source!.url))
          code.push({ kind: c.source.pr ? "pr" : "issue", id: c.source.url, label: labelOf(`${c.source.label} ${c.source.title}`), sub: c.source.where, ...(c.source.state ? { attention: c.source.state } : {}) });
      }
      const codeHits = rank(code, q, (x) => x.label, (x) => x.sub ?? "");
      let files: MentionItem[] = [];
      if (taskId && src.files && q.trim()) files = (await src.files(taskId, q).catch(() => [])).map((p) => ({ kind: "file" as const, id: p, label: labelOf(p.slice(p.lastIndexOf("/") + 1)), sub: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : undefined }));
      return [...tasks.slice(0, MENTION_ROWS), ...files.slice(0, MENTION_ROWS), ...keeps.slice(0, 3), ...partners.slice(0, 3), ...codeHits.slice(0, 4)];
    },

    async slash(taskId) {
      if (!taskId) {
        if (src.skills && Date.now() - skillsAt > FRESH) {
          skillsList = await src.skills().catch(() => undefined);
          skillsAt = Date.now();
        }
        const skills = (skillsList ?? [])
          .filter((s) => s.userInvocable !== false && /^[\w:.-]+$/.test(s.name))
          // The person's own first, then what the agent brings.
          .sort((a, b) => Number(/built/.test(a.source ?? "")) - Number(/built/.test(b.source ?? "")))
          .map((s): SlashEntry => ({ name: s.name, group: "skills", ...(s.description ? { about: clip(s.description, 140) } : {}), ...(s.source ? { source: s.source } : {}), ref: { kind: "skill", id: s.name, label: s.name } }));
        return { entries: [...PARTNER_ACTIONS, ...skills] };
      }
      const card = src.task(taskId);
      const harness = card?.harness ?? "";
      const hit = nativeCache.get(taskId);
      let found = hit && Date.now() - hit.at < FRESH ? hit.v : undefined;
      if (!found && src.native) {
        found = await src.native(taskId).catch(() => undefined);
        nativeCache.set(taskId, { at: Date.now(), v: found });
      }
      const busy = card && ACTIVE.has(card.attention) && card.attention !== "done_claimed";
      const acts = TASK_ACTIONS.filter((a) => a.run !== "pause" || busy);
      return { entries: [...nativeEntries(found?.harness ?? harness, found), ...acts], harness: found?.harness ?? harness };
    },

    async resolve(refs, o = {}) {
      const out: HeldRef[] = [];
      for (const r of refs) {
        switch (r.kind) {
          case "task": {
            const c = src.task(r.id);
            const p = c ? undefined : src.pastItem?.(r.id);
            if (!c && !p) {
              out.push({ ...r, missing: true });
              break;
            }
            const title = c?.title ?? p!.title;
            const state = STATE[c?.attention ?? p!.attention] ?? (c?.attention ?? p!.attention);
            const report = c?.lastReport?.summary ?? src.pastReport?.(r.id) ?? p?.outcome;
            const lines: string[] = [`Its title: ${clip(title, 120)}.`];
            if (report) lines.push(`Its latest report: ${clip(report, 900)}`);
            const place = c?.place;
            if (place?.kind === "repo") lines.push(`Its code: branch ${place.branch ?? "(none yet)"} off ${place.baseBranch ?? "its base"} in ${place.worktree ?? place.repoPath}${c?.changes ? `, ${c.changes.files ?? "?"} files +${c.changes.adds ?? 0} -${c.changes.dels ?? 0}` : ""}.`);
            else if (place?.kind === "folder") lines.push(`Its folder: ${place.path}.`);
            for (const pr of c?.prs ?? []) lines.push(`Its PR: ${pr.url} (${pr.state}).`);
            // Inside another task: what it changed, file by file, so that task can read or reuse it.
            if (o.forTask && c && src.changes) {
              const files = await src.changes(c.taskId).catch(() => undefined);
              if (files?.length) lines.push(`What it changed (${files.length} files): ${files.slice(0, 30).map((f) => `${f.path}${f.adds != null ? ` +${f.adds}` : ""}${f.dels != null ? ` -${f.dels}` : ""}`).join(", ")}${files.length > 30 ? ", …" : ""}. Read its full diff in its working copy with git when you need it.`);
            }
            out.push({ ...r, label: r.label, state, about: lines.join("\n") });
            break;
          }
          case "keep": {
            const k = src.keep?.(r.id);
            out.push(k ? { ...r, state: k.life, ...(k.say ? { about: clip(k.say, 600) } : {}) } : { ...r, missing: true });
            break;
          }
          case "partner": {
            const p = src.partners?.().find((x) => x.id === r.id);
            out.push(p ? { ...r, ...(p.about ? { about: `What it looks after: ${clip(p.about, 200)}` } : {}) } : { ...r, missing: true });
            break;
          }
          case "pr":
          case "issue": {
            const owner = src.tasks().find((c) => c.prs?.some((x) => x.url === r.id) || c.source?.url === r.id);
            const pr = owner?.prs?.find((x) => x.url === r.id);
            out.push({ ...r, url: r.id, ...(pr ? { state: pr.state } : owner?.source?.state ? { state: owner.source.state } : {}), ...(owner ? { about: `Ducter's task on it: "${clip(owner.title, 80)}" (${owner.taskId}).` } : {}) });
            break;
          }
          case "file":
            out.push({ ...r, about: `Path in the task's place: ${r.id}` });
            break;
          case "skill": {
            const s = (skillsList ?? []).find((x) => x.name === r.id);
            out.push({ ...r, ...(s?.description ? { about: clip(s.description, 300) } : {}) });
            break;
          }
          case "action":
            out.push({ ...r });
            break;
        }
      }
      return out;
    },
  };
}
