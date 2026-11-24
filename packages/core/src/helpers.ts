// D494: 帮手 / Helpers, kept on the home (helpers.json). A helper is a named address of the person's in
// Nowledge Bridge that their other agents hand one kind of work to. The home owns it: it enrolls the
// helper's Mem identity with its name and card, holds the one connection for it, and the partner's
// Bridge loop reads its mail beside the partner's own; every piece of work it is handed becomes a task
// the partner opens (or joins the one already on it), woken by Ducter's waits, never by polling.
//
// Code guards the invariants only: at most HELPERS_MAX, a unique name, one connection per helper, a
// stopped helper's connection ended (so Mem tells senders its mailbox is closed). Which work joins
// which task, and what a task may do, is the partner's judgment from the person's words (principle 21).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { paneName } from "@ducter/protocol/src/settings-panes.ts";
import { cleanBrief, cleanHelperName, cleanLine, HELPER_ABOUT_MAX, HELPERS_MAX, helperCard, helperIdentity, type Helper, type HelperItem, type HelperView } from "@ducter/protocol/src/helpers.ts";
import type { TaskCard } from "@ducter/protocol";
import { prGoesOn, prOf, prSaid } from "@ducter/protocol/src/pr-state.ts";

/**
 * D507: what one helper keeps now, the one model of its state (protocol HelperItem). A helper keeps a
 * task until it ends, and a finished one while the PR it owns is still open: a merge or a close lets
 * it go (to 今天做完 with the helper's name, then Past tasks). A task dropped lets it go at once.
 */
export function helperItems(id: string, d: { tasksOf: () => Iterable<[string, string]>; card: (taskId: string) => TaskCard | undefined }): HelperItem[] {
  const out: HelperItem[] = [];
  for (const [taskId, h] of d.tasksOf()) {
    if (h !== id) continue;
    const c = d.card(taskId);
    if (!c) continue;
    const a = c.attention;
    if (a === "dropped" || a === "superseded") continue;
    // D508: one model of where a PR stands (the card's PRs, pr-state.ts): a finished task stays while
    // its PR goes on; ready to merge waits for the person; merged or closed lets it go.
    const goes = prGoesOn(c.prs);
    const ended = a === "done" || a === "done_claimed" || a === "failed";
    if (ended && !goes) continue;
    const p = goes?.pr ?? prOf(c.prs);
    const said = p ? (goes?.said ?? prSaid(p)) : undefined;
    const at: HelperItem["at"] = a === "needs_you" || a === "failed" ? "you" : ended && goes?.stands === "needs" ? "ready" : "work";
    const yours = at === "you" ? (c.pendingDecision?.question ?? c.reason) : undefined;
    out.push({
      taskId,
      title: c.title,
      at,
      ...(yours ? { yours } : {}),
      ...(p ? { pr: p.pr } : {}),
      ...(said ? { said } : {}),
    });
  }
  // What waits for the person first (a question, then a PR ready to merge), then what is under way.
  // D508: a PR ready to merge waits for the person too, so it comes right after their questions.
  const rank = { you: 0, ready: 1, work: 2 } as const;
  return out.sort((x, y) => rank[x.at] - rank[y.at]);
}

export const HELPERS_FILE = "helpers.json";
/** How soon a helper whose address is still waiting on Mem is tried again. */
export const HELPER_RETRY_MS = 10 * 60_000;

/** D507: the partner's one line when a helper's address became ready or Mem refused it (D292: a table per language). */
const SAID = {
  en: {
    ready: "{name} is ready: your agents find it in Nowledge Mem by this name and hand it work. Each piece they hand it shows up in On hand, under its name.",
    refused: "Nowledge Mem didn't take the name “{name}”, so your agents can't find it yet. Tell me another name and I'll make it again; this one can be stopped in {pane}.",
  },
  zh: {
    ready: "{name} 好了：你的 agent 在 Nowledge Mem 里按这个名字找到它，就能把活交给它。交给它的每件活都会出现在手头的事里，挂在它名下。",
    refused: "Nowledge Mem 没让登记「{name}」这个名字，你的 agent 现在还找不到它。换个名字跟我说一声，我重新开一个；这个可以在 {pane} 里停下。",
  },
};

/** D507: the line the partner says once when a helper's address is ready, or Mem refused its name. */
export function helperSaidWords(lang: LangTag, h: { name: string }, how: "ready" | "refused"): string {
  return fill(words(SAID, lang)[how], { name: h.name, pane: paneName("peers", lang) });
}

export interface HelperLink {
  connectAs(agentId: string, name: string, card: string): Promise<{ ok: true; context: string; connectionId: string; spaceId: string } | { ok: false; why: "waiting" | "refused"; detail: string }>;
  revokeConnection(connectionId: string): Promise<boolean>;
}

export interface Helpers {
  list(): Helper[];
  get(id: string): Helper | undefined;
  byName(name: string): Helper | undefined;
  /** The person asked for one: kept at once; its address is made in the background. */
  make(a: { name: string; about: string; brief: string; persona?: string }): { ok: true; helper: Helper } | { ok: false; error: "empty" | "taken" | "full" };
  set(id: string, a: { about?: string; brief?: string }): Helper | undefined;
  /** Stopped: its connection ended (senders hear its mailbox is closed); its work on hand keeps going. */
  stop(id: string): Promise<Helper | undefined>;
  resume(id: string): Helper | undefined;
  /** The helpers whose mail the home reads now: on, address confirmed. */
  listening(): { id: string; name: string; context: string }[];
  /** Make the address of every on helper that has none yet (at start, when Mem becomes ready, every 10 min). */
  tick(): Promise<void>;
  views(count: (helperId: string) => { open: number; week: number }): HelperView[];
  onChange(fn: () => void): () => void;
}

export function createHelpers(o: {
  dataDir: string;
  link: () => HelperLink | undefined;
  partnerName: () => string;
  home: () => string;
  now?: () => number;
  /** D507: the partner's one line when an address it said was being made became ready, or Mem refused it (once each). */
  say?: (h: Helper, how: "ready" | "refused") => void;
}): Helpers {
  const path = join(o.dataDir, HELPERS_FILE);
  const now = o.now ?? Date.now;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());
  const tried = new Map<string, number>();
  let running: Promise<void> | undefined;
  let again = false;
  const read = (): Helper[] => {
    try {
      if (!existsSync(path)) return [];
      const j = JSON.parse(readFileSync(path, "utf8"));
      return Array.isArray(j?.helpers) ? (j.helpers as Helper[]).filter((h) => h && typeof h.id === "string" && typeof h.name === "string" && typeof h.agentId === "string") : [];
    } catch {
      return [];
    }
  };
  const write = (hs: Helper[]) => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ helpers: hs }, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path);
    changed();
  };
  const update = (id: string, f: (h: Helper) => Helper): Helper | undefined => {
    const hs = read();
    const i = hs.findIndex((h) => h.id === id);
    if (i < 0) return undefined;
    hs[i] = f(hs[i]!);
    write(hs);
    return hs[i];
  };
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const card = (h: Helper) => helperCard(h, o.partnerName(), o.home());

  async function connect(h: Helper) {
    const link = o.link();
    if (!link) return;
    tried.set(h.id, now());
    update(h.id, (x) => ({ ...x, mem: "connecting" }));
    const r = await link.connectAs(h.agentId, h.name, card(h)).catch((e: Error) => ({ ok: false as const, why: "waiting" as const, detail: e.message }));
    const cur = read().find((x) => x.id === h.id);
    if (!cur) return;
    if (r.ok) {
      // Stopped meanwhile: the connection just made is ended again at once.
      if (cur.state === "stopped") return void (await link.revokeConnection(r.connectionId).catch(() => false));
      const h1 = update(h.id, (x) => {
        const { detail: _d, ...rest } = x;
        return { ...rest, link: { context: r.context, connectionId: r.connectionId, spaceId: r.spaceId }, mem: "ready", said: "ready" };
      });
      // D507: the partner said the address was being made; now it is: said once, in the conversation.
      if (h1 && cur.said !== "ready") o.say?.(h1, "ready");
    } else {
      const h1 = update(h.id, (x) => ({ ...x, mem: r.why, detail: r.detail, ...(r.why === "refused" ? { said: "refused" as const } : {}) }));
      // A wait comes back by itself (Settings says so); a refusal needs the person: said once, with what to do.
      if (h1 && r.why === "refused" && cur.said !== "refused") o.say?.(h1, "refused");
    }
  }

  const api: Helpers = {
    list: read,
    get: (id) => read().find((h) => h.id === id),
    byName: (name) => {
      const n = cleanHelperName(name);
      return read().find((h) => same(h.name, n));
    },
    make(a) {
      const name = cleanHelperName(a.name);
      if (!name) return { ok: false, error: "empty" };
      const hs = read();
      if (hs.some((h) => same(h.name, name))) return { ok: false, error: "taken" };
      if (hs.length >= HELPERS_MAX) return { ok: false, error: "full" };
      const agentId = helperIdentity(name, (id) => hs.some((h) => h.agentId === id));
      const helper: Helper = {
        id: agentId.replace(/^ducter-helper-/, "").slice(0, 40) || `h${now().toString(36)}`,
        name,
        about: cleanLine(a.about, HELPER_ABOUT_MAX),
        brief: cleanBrief(a.brief),
        persona: a.persona ?? "default",
        agentId,
        state: "on",
        createdAt: new Date(now()).toISOString(),
        mem: "connecting",
      };
      write([...hs, helper]);
      void api.tick();
      return { ok: true, helper };
    },
    set(id, a) {
      return update(id, (h) => ({ ...h, ...(a.about !== undefined ? { about: cleanLine(a.about, HELPER_ABOUT_MAX) } : {}), ...(a.brief !== undefined ? { brief: cleanBrief(a.brief) } : {}) }));
    },
    async stop(id) {
      const h = read().find((x) => x.id === id);
      if (!h) return undefined;
      const link = o.link();
      const ended = h.link && link ? await link.revokeConnection(h.link.connectionId).catch(() => false) : true;
      return update(id, (x) => {
        const { link: kept, ...rest } = x;
        // One Mem didn't end yet stays on the record, so the next stop or resume tries again.
        return { ...rest, state: "stopped", ...(ended ? {} : kept ? { link: kept } : {}) };
      });
    },
    resume(id) {
      const h = update(id, (x) => ({ ...x, state: "on", ...(x.link ? {} : { mem: "connecting" as const }) }));
      if (h && !h.link) void api.tick();
      return h;
    },
    listening: () => read().filter((h) => h.state === "on" && h.mem === "ready" && h.link).map((h) => ({ id: h.id, name: h.name, context: h.link!.context })),
    tick() {
      // One at a time; a helper made meanwhile is looked at once more before it ends.
      if (running) return (again = true), running;
      return (running = (async () => {
        do {
          again = false;
          for (const h of read()) {
            if (h.state !== "on" || h.link || h.mem === "refused") continue;
            if (h.mem === "waiting" && now() - (tried.get(h.id) ?? 0) < HELPER_RETRY_MS) continue;
            await connect(h);
          }
        } while (again);
      })().finally(() => (running = undefined)));
    },
    views: (count) => read().map((h) => ({ id: h.id, name: h.name, about: h.about, state: h.state, mem: h.mem, ...(h.detail ? { detail: h.detail } : {}), ...count(h.id) })),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}
