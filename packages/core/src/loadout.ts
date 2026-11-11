// Who does the tasks (D89): picks who does a new task (fw_candidates v0), lists who else could
// (换谁来做 / Switch who does it), moves a task when the person switches it, keeps 你的规则 / Your
// rules, and after two switches the same way asks the partner to offer a rule once.
import type { Bodies, Candidate, DeviceHarness, LogEvent, Place, TaskNeeds } from "@ducter/protocol";
import { harnessName } from "@ducter/protocol";
import type { BodyChoice, LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import { blockOf, chooseBody, computersOf, fwCandidates, type Computer, NO_PHONE } from "./candidates.ts";
import { checkEffort, type ModelCatalog } from "./models.ts";

/** D202: how long a task's open waits for the chosen model's effort levels it doesn't have yet. */
const EFFORT_CHECK_MS = 10_000;
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
  choose(work: { title: string; brief?: string; place?: Place; harness?: string; model?: string; effort?: string; by?: "you"; needs?: TaskNeeds }): Promise<BodyChoice | { none: string } | undefined>;
  candidates(taskId: string): Promise<Candidate[]>;
  /** D128: who could do new work at this place, best first (the New task card's 谁来做 / Who does it).
   *  D157: with two or more computers, on every computer (anyComputer: a No folder card). */
  candidatesFor(work: { title: string; brief?: string; place?: Place; needs?: TaskNeeds }, opts?: { every?: true }): Promise<Candidate[]>;
  /** D157: the computers that run tasks, as the ranking sees them (undefined without device info). */
  computers(): Promise<Computer[] | undefined>;
  /** 换到 X 接着做 / Continue on X; D157: on another computer (device: its id or name), the task moves there. */
  switchTask(taskId: string, harness: string, model: string | undefined, runner: Runner | undefined, device?: string): Promise<{ ok: boolean; message?: string }>;
}

export function createLoadout(o: {
  log: LogStore;
  tasks: CoreRegistry;
  settings: SettingsStore;
  rules: RulesStore;
  devices: () => DevicesView | undefined;
  /** D157: the sites Ducter's own browser on a computer is signed in to. */
  sites?: (deviceId: string) => string[];
  /** D202: each agent's models on each computer, to check an effort against the chosen model. */
  models?: ModelCatalog;
}): Loadout {
  /** D157: every computer that runs tasks, from the devices frame. */
  const computers = async (): Promise<Computer[] | undefined> => {
    const v = o.devices();
    if (!v) return undefined;
    const f = await v.frame().catch((err) => (console.warn("[loadout] devices:", (err as Error).message), undefined));
    if (!f) return undefined;
    return computersOf(f.devices, o.sites);
  };
  /** A computer the user named in the place (not the home's "local" default), for a place that can go anywhere. */
  const pinOf = (place?: Place) => {
    if (!place || place.kind === "repo" || place.kind === "folder") return undefined;
    const d = place.device?.trim();
    return d && d !== "local" ? d : undefined;
  };
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

  /** D202: the effort asked for, kept only when the chosen model on its computer offers it. */
  const withEffort = async <P extends { harness: string; model?: string; deviceId?: string }>(pick: P, effort: string): Promise<P & { effort?: string; effortDropped?: string }> => {
    const list = await o.models?.get(pick.deviceId ?? "local", pick.harness, EFFORT_CHECK_MS);
    const r = checkEffort(pick.harness, pick.model, effort, list);
    return r.ok ? { ...pick, effort } : { ...pick, effortDropped: `effort ${effort} was left out: ${r.why}` };
  };

  const api: Loadout = {
    computers,

    async choose(work) {
      const comps = await computers();
      // D217: work on an app on a phone needs Ducter's phone somewhere; without it, nothing opens.
      if (work.needs?.phone && comps && !comps.some((c) => c.phone)) return { none: NO_PHONE };
      // D157: two or more computers: one ranking over all of them, from what the task needs.
      const multi = comps && comps.length > 1 && comps.some((c) => c.harnesses.length);
      const hs = multi ? [] : await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined);
      if (!multi && !hs) return undefined;
      const pinDevice = pinOf(work.place);
      // One computer: still the ranking's view of it (whether it can browse), with the agents on the place's device.
      const one = !multi && comps?.length === 1 && (comps[0]!.web || comps[0]!.phone) ? [{ ...comps[0]!, harnesses: hs! }] : undefined;
      const pick = chooseBody({
        work,
        ...(multi ? { computers: comps } : one ? { computers: one } : { harnesses: hs }),
        ...(work.needs ? { needs: work.needs } : {}),
        ...(work.place ? { place: work.place } : {}),
        ...(pinDevice ? { pinDevice } : {}),
        settings: o.settings.get(),
        rules: o.rules.list(),
        ...(work.harness ? { pinned: { harness: work.harness, ...(work.model ? { model: work.model } : {}) } } : {}),
        ...(work.by ? { pinnedBy: work.by } : {}),
      });
      // The person's own pick can't run: their one line, never a silent move.
      if (pick && "problem" in pick) return { none: pick.problem };
      if (pick) return work.effort ? withEffort(pick, work.effort) : pick;
      const why = (multi ? comps!.flatMap((c) => c.harnesses.map((h) => ({ h, on: c.name }))) : (hs ?? []).map((h) => ({ h, on: "" })))
        .map(({ h, on }) => `${harnessName(h.harness)}${on ? ` on ${on}` : ""}: ${blockOf(h, o.settings.get()) ?? "can't do what this task needs there"}`)
        .join(", ");
      return { none: `no AI agent can take this task right now (${why}). Tell the user in one line and offer what would make one available.` };
    },

    async candidatesFor(work, opts) {
      const comps = await computers();
      if (comps && comps.length > 1) {
        const pinDevice = pinOf(work.place);
        return fwCandidates({ work, computers: comps, ...(work.place ? { place: work.place } : {}), ...(work.needs ? { needs: work.needs } : {}), ...(pinDevice ? { pinDevice } : {}), settings: o.settings.get(), rules: o.rules.list(), ...(opts?.every ? { every: true as const } : {}) });
      }
      const hs = (await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined)) ?? [];
      return fwCandidates({ work, harnesses: hs, settings: o.settings.get(), rules: o.rules.list(), ...(opts?.every ? { every: true as const } : {}) });
    },

    async candidates(taskId) {
      const card = o.tasks.get(taskId);
      if (!card) throw new Error(`unknown task ${taskId}`);
      // The latest: a task opened before its brief was written logs the brief in a second one (D120).
      const open = o.log.read({ stream: taskStream(taskId), kinds: ["task_open"], limit: 1000 }).at(-1)?.body as Bodies["task_open"] | undefined;
      const comps = await computers();
      const current = { harness: card.harness, ...(card.model ? { model: card.model } : {}) };
      if (comps && comps.length > 1) {
        // D157: who and where together (the switch sheet groups by computer). The task keeps its
        // needs; a browser place needs a browser wherever it goes.
        const sel = o.log.read({ stream: taskStream(taskId), kinds: ["body_selected"], limit: 1000 }).at(-1)?.body as Bodies["body_selected"] | undefined;
        const device = card.place.device || "local";
        return fwCandidates({
          work: { title: card.title, brief: open?.brief },
          computers: comps,
          place: card.place,
          ...(open?.needs ? { needs: open.needs } : {}),
          settings: o.settings.get(),
          rules: o.rules.list(),
          current: { ...current, device, ...(sel?.why.where?.uses === "chrome" || sel?.why.where?.uses === "ducter" ? { uses: sel.why.where.uses } : {}) },
        });
      }
      const hs = (await harnessesFor("device" in card.place ? card.place.device : undefined)) ?? [];
      return fwCandidates({
        work: { title: card.title, brief: open?.brief },
        harnesses: hs,
        settings: o.settings.get(),
        rules: o.rules.list(),
        current,
      });
    },

    async switchTask(taskId, harness, model, runner, device) {
      const card = o.tasks.get(taskId);
      if (!card) return { ok: false, message: "I can't find that task." };
      if (card.attention === "dropped") return { ok: false, message: "That task was dropped. Undo the drop first." };
      // D157: another computer: the task moves there (E3), with who does it there.
      if (device) {
        const comps = (await computers()) ?? [];
        const to = comps.find((x) => x.id === device || x.name === device);
        const here = comps.find((x) => (card.place.device && card.place.device !== "local" ? x.id === card.place.device || x.name === card.place.device : x.home));
        if (to && here && to.id !== here.id) {
          const list = await api.candidates(taskId);
          const c = list.find((x) => x.device === to.id && x.harness === harness && (x.model ?? "") === (model ?? "")) ?? list.find((x) => x.device === to.id && x.harness === harness);
          if (!c) return { ok: false, message: `${harnessName(harness)} can't take this task on ${to.name}.` };
          if (c.blocked) return { ok: false, message: `${harnessName(harness)} can't take it on ${to.name} right now (${c.blocked}).` };
          if (c.waits) return { ok: false, message: `${to.name} is ${c.waits === "asleep" ? "asleep" : "out of reach"}; move it once it's back.` };
          if (!runner?.moveTask) return { ok: false, message: "Moving a task to another computer isn't available here." };
          const home = comps.find((x) => x.home)?.name;
          const r = await runner.moveTask(taskId, { device: to.home ? "local" : to.name, name: to.name, ...(home ? { homeName: home } : {}) }, harness, model);
          if (!r.ok) return r;
          o.log.append({
            stream: "channel",
            origin: "user",
            kind: "job_status",
            body: { jobId: `${BODY_NOTE_PREFIX}${taskId}_${Date.now().toString(36)}`, taskId, state: "done", text: `the user moved this task from ${here.name} to ${to.name} (${harnessName(harness)}); it continues there from its saved progress.` } as Bodies["job_status"],
          });
          return { ok: true };
        }
      }
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
        device: { type: "string", description: "D157: only when the rule names a computer (\"要登录的网页都在 MacBook 上做\"): its name from the [devices] line" },
        match: { type: "array", items: { type: "string" }, description: "3–10 words that mark this kind of work in a task title or brief, in both Chinese and English (e.g. [\"后端\", \"backend\", \"api\", \"server\"])" },
      },
      required: ["text", "harness", "match"],
    },
    async (a: { text?: unknown; harness?: unknown; model?: unknown; match?: unknown; device?: unknown }) => {
      try {
        const r = rules.add({
          text: String(a.text ?? ""),
          harness: String(a.harness ?? ""),
          ...(typeof a.model === "string" && a.model.trim() ? { model: a.model.trim() } : {}),
          match: Array.isArray(a.match) ? a.match.map(String) : [],
          ...(typeof a.device === "string" && a.device.trim() ? { device: a.device.trim() } : {}),
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
