// 我要合电脑了 / Move before closing (D157, design/where.md §7): one decision for the whole computer.
// Go (the default: the user stated the intent) moves what can move to a computer that stays awake,
// from its saved progress; what can only run there (a folder, a Mac app, the user's Chrome when
// nothing else has it) stays and continues when it wakes. Nothing moves toward more access.
import type { Bodies, ClosingPlan, LogEvent } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { Loadout } from "./loadout.ts";
import type { CoreRegistry } from "./registry.ts";
import type { CoreMcpHub } from "./mcp.ts";

/** How long the closing card waits before its default (move) applies: the lid is about to close. */
export const CLOSING_DEFAULT_MS = 90_000;

const ACTIVE = new Set(["working", "queued", "needs_you", "blocked"]);

export interface Closing {
  /** What would move where, and what stays, for one computer (by id or name). */
  plan(device: string): Promise<ClosingPlan | undefined>;
  /** Asks the one decision (or says there's nothing to move). */
  ask(device: string, zh: boolean): Promise<{ ok: true; decisionId?: string; none?: boolean; plan?: ClosingPlan } | { ok: false; message: string }>;
  stop(): void;
}

export function createClosing(o: { log: LogStore; tasks: CoreRegistry; loadout: Loadout; runner: () => Runner | undefined; now?: () => number; defaultMs?: number }): Closing {
  const now = o.now ?? Date.now;

  async function plan(device: string): Promise<ClosingPlan | undefined> {
    const comps = (await o.loadout.computers()) ?? [];
    const src = comps.find((c) => c.id === device || c.name.toLowerCase() === device.toLowerCase());
    if (!src) return undefined;
    const on = (d: string | undefined) => (src.home ? !d || d === "local" || d === src.name : d === src.id || d === src.name);
    const out: ClosingPlan = { device: src.id, name: src.name, moves: [], stays: [] };
    for (const card of o.tasks.list()) {
      if (!ACTIVE.has(card.attention) || !on(card.place.device)) continue;
      if (card.place.kind === "folder") {
        out.stays.push({ taskId: card.taskId, title: card.title, why: "folder" });
        continue;
      }
      const cands = await o.loadout.candidates(card.taskId).catch(() => []);
      // The best row on another computer that can start now and doesn't widen access.
      const to = cands.find((c) => !c.blocked && !c.waits && !c.current && !c.widens && c.device && c.device !== src.id);
      if (!to) {
        out.stays.push({ taskId: card.taskId, title: card.title, why: "only_here" });
        continue;
      }
      out.moves.push({ taskId: card.taskId, title: card.title, to: to.device!, toName: to.deviceName ?? to.device!, harness: to.harness, ...(to.model ? { model: to.model } : {}) });
    }
    return out;
  }

  const words = (p: ClosingPlan, zh: boolean) => {
    const q = (t: string) => (zh ? `「${t}」` : `"${t}"`);
    const moved = p.moves.map((m) => q(m.title)).join(zh ? "" : ", ");
    const stay = p.stays.map((s) => q(s.title)).join(zh ? "" : ", ");
    const dst = p.moves[0]?.toName ?? "";
    if (zh) return [moved && `合上之前：${moved}转到 ${dst} 上接着做`, stay && `${stay}只能在 ${p.name} 上做，醒了接着`].filter(Boolean).join("；") + "。";
    return [moved && `Before you close it: ${moved} move to ${dst} and carry on`, stay && `${stay} can only run on ${p.name} and continue when it wakes`].filter(Boolean).join("; ") + ".";
  };

  // Go (by the user, or the default) moves them, each from its saved progress (E3).
  const unsubscribe = o.log.subscribe((e: LogEvent) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    if (r.option !== "go") return;
    const d = o.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).find((x) => (x.body as Bodies["decision"]).decisionId === r.decisionId)?.body as Bodies["decision"] | undefined;
    if (!d?.closing) return;
    void (async () => {
      for (const m of d.closing!.moves) {
        const res = await o.loadout.switchTask(m.taskId, m.harness, m.model, o.runner(), m.to).catch((err) => ({ ok: false, message: (err as Error).message }));
        if (!res.ok) console.warn(`[closing] ${m.title} stayed on ${d.closing!.name}: ${res.message}`);
      }
    })();
  });

  return {
    plan,
    async ask(device, zh) {
      const p = await plan(device);
      if (!p) return { ok: false, message: `No computer called ${device}.` };
      if (!p.moves.length && !p.stays.length) return { ok: true, none: true, plan: p };
      const decisionId = "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
      const movable = p.moves.length > 0;
      const body: Bodies["decision"] = {
        decisionId,
        question: words(p, zh),
        goLabel: zh ? "转移" : "Move them",
        // Nothing to move (all of it can only run there): no default, it just says so.
        defaultOption: movable ? "go" : "hold",
        reversible: movable,
        ...(movable ? { defaultAt: new Date(now() + (o.defaultMs ?? CLOSING_DEFAULT_MS)).toISOString() } : {}),
        closing: p,
      };
      o.log.append({ stream: "channel", origin: "system", kind: "decision", body });
      return { ok: true, decisionId, plan: p };
    },
    stop: unsubscribe,
  };
}

/** The partner's way in: the user said 我要合电脑了 (or "I'm closing my laptop"). */
export function registerClosingTool(mcp: CoreMcpHub, closing: Closing, zh: () => boolean) {
  mcp.register(
    "partner",
    "move_before_closing",
    "The user is about to close (or sleep) one of their computers: \"我要合电脑了\", \"I'm closing my laptop\". Ducter puts one card up for that computer: what moves to a computer that stays awake (the default, from saved progress), and what can only run there and waits. Call it with the computer's name from the [devices] line, then say nothing more about it unless the result says there's nothing running there.",
    { type: "object", properties: { device: { type: "string", description: "The computer's name (\"MacBook\")" } }, required: ["device"] },
    async (a: { device?: unknown }) => {
      const r = await closing.ask(String(a.device ?? ""), zh());
      if (!r.ok) return { ok: false, error: r.message };
      if (r.none) return { ok: true, note: `Nothing is running on ${r.plan?.name ?? a.device}: tell the user in one short line that they can close it.` };
      return { ok: true, note: "The card is up. Don't repeat it.", moves: r.plan?.moves.length ?? 0, stays: r.plan?.stays.length ?? 0 };
    },
  );
}
