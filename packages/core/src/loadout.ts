// Who does the tasks (D89): picks who does a new task (fw_candidates v0), lists who else could
// (换谁来做 / Switch who does it), moves a task when the person switches it, keeps 你的规则 / Your
// rules, and after two switches the same way asks the partner to offer a rule once.
import type { Bodies, BodyWhy, Candidate, DeviceHarness, LogEvent, Place } from "@ducter/protocol";
import { harnessName } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import { blockOf, chooseBody, fwCandidates } from "./candidates.ts";
import type { DevicesView } from "./devices.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { taskStream, type CoreRegistry } from "./registry.ts";
import type { RulesStore } from "./rules.ts";
import type { SettingsStore } from "./settings.ts";

/** A hidden channel note of a switch (clients skip job_status ids with this prefix). */
export const BODY_NOTE_PREFIX = "body_";
/** The note that wakes the partner to offer a rule (core.ts triggersPartner). */
export const RULE_HINT_SUFFIX = "_rule_hint";

export interface Loadout {
  /** Who does a new task: the pick and why, "none" with a reason when nobody can, undefined without device info. */
  choose(work: { title: string; brief?: string; place?: Place; harness?: string; model?: string; by?: "you" }): Promise<{ harness: string; model?: string; why: BodyWhy } | { none: string } | undefined>;
  candidates(taskId: string): Promise<Candidate[]>;
  /** D128: who could do new work at this place, best first (the New task card's 谁来做 / Who does it). */
  candidatesFor(work: { title: string; brief?: string; place?: Place }): Promise<Candidate[]>;
  /** 换到 X 接着做 / Continue on X. */
  switchTask(taskId: string, harness: string, model: string | undefined, runner: Runner | undefined): Promise<{ ok: boolean; message?: string }>;
}

export function createLoadout(o: {
  log: LogStore;
  tasks: CoreRegistry;
  settings: SettingsStore;
  rules: RulesStore;
  devices: () => DevicesView | undefined;
}): Loadout {
  /** The AI agents on the device a task runs on (home unless the place names a worker). */
  const harnessesFor = async (device?: string): Promise<DeviceHarness[] | undefined> => {
    const v = o.devices();
    if (!v) return undefined;
    // A probe that fails must never stop a task from opening: no info, no opinion.
    const f = await v.frame().catch((err) => (console.warn("[loadout] devices:", (err as Error).message), undefined));
    if (!f) return undefined;
    const d = !device || device === "local" ? f.devices.find((x) => x.home) : f.devices.find((x) => x.id === device || x.name === device);
    // A worker that doesn't say what it has: nothing to choose by, so no opinion (the runner decides).
    return d?.harnesses.length ? d.harnesses : undefined;
  };

  const api: Loadout = {
    async choose(work) {
      const hs = await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined);
      if (!hs) return undefined;
      const pick = chooseBody({
        work,
        harnesses: hs,
        settings: o.settings.get(),
        rules: o.rules.list(),
        ...(work.harness ? { pinned: { harness: work.harness, ...(work.model ? { model: work.model } : {}) } } : {}),
        ...(work.by ? { pinnedBy: work.by } : {}),
      });
      // The person's own pick can't run: their one line, never a silent move.
      if (pick && "problem" in pick) return { none: pick.problem };
      if (pick) return pick;
      const why = hs.map((h) => `${harnessName(h.harness)}: ${blockOf(h, o.settings.get()) ?? "ok"}`).join(", ");
      return { none: `no AI agent can take this task right now (${why}). Tell the user in one line and offer what would make one available.` };
    },

    async candidatesFor(work) {
      const hs = (await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined)) ?? [];
      return fwCandidates({ work, harnesses: hs, settings: o.settings.get(), rules: o.rules.list() });
    },

    async candidates(taskId) {
      const card = o.tasks.get(taskId);
      if (!card) throw new Error(`unknown task ${taskId}`);
      // The latest: a task opened before its brief was written logs the brief in a second one (D120).
      const open = o.log.read({ stream: taskStream(taskId), kinds: ["task_open"], limit: 1000 }).at(-1)?.body as Bodies["task_open"] | undefined;
      const hs = (await harnessesFor("device" in card.place ? card.place.device : undefined)) ?? [];
      return fwCandidates({
        work: { title: card.title, brief: open?.brief },
        harnesses: hs,
        settings: o.settings.get(),
        rules: o.rules.list(),
        current: { harness: card.harness, ...(card.model ? { model: card.model } : {}) },
      });
    },

    async switchTask(taskId, harness, model, runner) {
      const card = o.tasks.get(taskId);
      if (!card) return { ok: false, message: "I can't find that task." };
      if (card.attention === "dropped") return { ok: false, message: "That task was dropped. Undo the drop first." };
      if (card.harness === harness && (card.model ?? "") === (model ?? "")) return { ok: true };
      const list = await api.candidates(taskId);
      const c = list.find((x) => x.harness === harness && (x.model ?? "") === (model ?? "")) ?? list.find((x) => x.harness === harness);
      if (!c) return { ok: false, message: `${harnessName(harness)} can't take this task here.` };
      if (c.blocked) return { ok: false, message: `${harnessName(harness)} can't take it right now (${c.blocked}).` };
      const from = card.harness;
      // A running task continues on the new one from its saved progress (the runner's handoff).
      if (runner?.switchBody) {
        const r = await runner.switchBody(taskId, harness, model);
        if (!r.ok) return r;
      }
      o.log.append({ stream: taskStream(taskId), origin: "user", kind: "body_selected", body: { taskId, harness, ...(model ? { model } : {}), why: { kind: "you", from } } });
      // The partner must know (it read the old harness on the card); the note is hidden from clients.
      const prior = o.log
        .read({ stream: "channel", kinds: ["job_status"], limit: 500 })
        .filter((e) => e.origin === "user" && (e.body as Bodies["job_status"]).jobId.startsWith(BODY_NOTE_PREFIX))
        .map((e) => e.body as Bodies["job_status"] & { from?: string; to?: string })
        .filter((b) => b.from === from && b.to === harness && b.taskId !== taskId);
      const once = prior.length === 1 && from !== harness;
      const asked = o.log
        .read({ stream: "channel", kinds: ["job_status"], limit: 500 })
        .some((e) => (e.body as Bodies["job_status"]).jobId.endsWith(`${RULE_HINT_SUFFIX}:${from}>${harness}`));
      const fromN = harnessName(from);
      const toN = harnessName(harness);
      const other = prior[0] ? o.tasks.get(prior[0].taskId ?? "")?.title : undefined;
      const hint =
        once && !asked
          ? ` This is the second time the user moved work from ${fromN} to ${toN} (the other: "${other ?? "an earlier task"}"). Ask them once whether to make it a rule: name the kind of work both tasks share in a few words, restate the rule in one line, and use ask (Go = make it the rule, default hold). On go, save it with rule_save. If they hold, don't ask again.`
          : "";
      o.log.append({
        stream: "channel",
        origin: "user",
        kind: "job_status",
        body: {
          jobId: `${BODY_NOTE_PREFIX}${taskId}_${Date.now().toString(36)}${hint ? `${RULE_HINT_SUFFIX}:${from}>${harness}` : ""}`,
          taskId,
          state: "done",
          text: `the user moved this task from ${fromN} to ${toN}${model ? ` (${model})` : ""}; it continues there from its saved progress.${hint}`,
          // Kept on the note so the next switch can count directions (not read by clients).
          from,
          to: harness,
        } as Bodies["job_status"],
      });
      return { ok: true };
    },
  };
  return api;
}

/** The partner's rule tools: save a rule the person agreed to, list the rules (role "partner"). */
export function registerRuleTools(mcp: CoreMcpHub, rules: RulesStore) {
  mcp.register(
    "partner",
    "rule_save",
    "Save one of the user's rules for who does which kind of work (shown on the Partner page as Your rules). Only after the user said it or agreed to it: restate it in one line first. Newest wins over an older rule for the same kind of work. The user removes rules on the Partner page; never remove one yourself.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: 'The rule in one line, in the user\'s language, as "<kind of work> → <AI agent>", e.g. "后端的事 → Codex" or "Interface work → Claude Code"' },
        harness: { type: "string", enum: ["claude-code", "codex", "pi", "deepseek-harness"] },
        model: { type: "string", description: "Only when the user named a model" },
        match: { type: "array", items: { type: "string" }, description: "3–10 words that mark this kind of work in a task title or brief, in both Chinese and English (e.g. [\"后端\", \"backend\", \"api\", \"server\"])" },
      },
      required: ["text", "harness", "match"],
    },
    async (a: { text?: unknown; harness?: unknown; model?: unknown; match?: unknown }) => {
      try {
        const r = rules.add({
          text: String(a.text ?? ""),
          harness: String(a.harness ?? ""),
          ...(typeof a.model === "string" && a.model.trim() ? { model: a.model.trim() } : {}),
          match: Array.isArray(a.match) ? a.match.map(String) : [],
        });
        return { ok: true, rule: r, note: "Saved. It shows on the Partner page under Your rules." };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
  mcp.register("partner", "rule_list", "The user's rules for who does which kind of work, oldest first.", { type: "object", properties: {} }, async () => rules.list());
}

/** A user-origin note that should wake the partner: the second switch the same way. */
export function isRuleHint(e: LogEvent): boolean {
  if (e.kind !== "job_status" || e.origin !== "user") return false;
  const id = (e.body as Bodies["job_status"]).jobId;
  return id.startsWith(BODY_NOTE_PREFIX) && id.includes(RULE_HINT_SUFFIX);
}
