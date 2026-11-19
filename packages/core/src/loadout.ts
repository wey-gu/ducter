// Who does the tasks (D89): picks who does a new task (fw_candidates v0), lists who else could
// (换谁来做 / Switch who does it), moves a task when the person switches it, keeps 你的规则 / Your
// rules, and after two switches the same way asks the partner to offer a rule once.
import type { Bodies, BodyWhy, Candidate, DeviceHarness, RuleView, KindDefault, LogEvent, Place, TaskNeeds, WorkKind } from "@ducter/protocol";
import { HARNESSES, harnessName, isHarnessId, whichPhone, WORK_KINDS } from "@ducter/protocol";
import { effectiveBrain } from "./brain.ts";
import { resolveModel } from "@ducter/protocol/src/harness-facts.ts";
import type { BodyChoice, LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import { blockOf, chooseBody, computersOf, fwCandidates, kindDefaults, kindOf, smartestFor, type Computer, noPhoneLine } from "./candidates.ts";
import { checkEffort, type ModelCatalog } from "./models.ts";

/** D391: the levels tried, in order, when the model doesn't offer the one asked for in words. */
const NEAR_EFFORT: Record<string, string[]> = { high: ["medium"], low: ["minimal", "medium"] };

/** D202: how long a task's open waits for the chosen model's effort levels it doesn't have yet. */
const EFFORT_CHECK_MS = 10_000;
import type { DevicesView } from "./devices.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { taskStream, type CoreRegistry } from "./registry.ts";
import type { RulesStore } from "./rules.ts";
import type { SaidStore } from "./said.ts";
import type { SettingsStore } from "./settings.ts";

/** A hidden channel note of a switch (clients skip job_status ids with this prefix). */
export const BODY_NOTE_PREFIX = "body_";
/** The note that wakes the partner to offer a rule (core.ts triggersPartner). */
export const RULE_HINT_SUFFIX = "_rule_hint";

export interface Loadout {
  /** Who does a new task: the pick and why, "none" with a reason when nobody can, undefined without device info. */
  choose(work: { title: string; brief?: string; place?: Place; harness?: string; model?: string; effort?: string; by?: "you"; needs?: TaskNeeds; workKind?: WorkKind }): Promise<BodyChoice | { none: string } | undefined>;
  candidates(taskId: string): Promise<Candidate[]>;
  /** D128: who could do new work at this place, best first (the New task card's 谁来做 / Who does it).
   *  D157: with two or more computers, on every computer (anyComputer: a No folder card). */
  candidatesFor(work: { title: string; brief?: string; place?: Place; needs?: TaskNeeds }, opts?: { every?: true }): Promise<Candidate[]>;
  /** D157: the computers that run tasks, as the ranking sees them (undefined without device info). */
  computers(needs?: TaskNeeds): Promise<Computer[] | undefined>;
  /** 换到 X 接着做 / Continue on X; D157: on another computer (device: its id or name), the task moves there. */
  // effort (D282): the same agent with another model or effort keeps its native session.
  // by (D376): the partner moved it for the person's follow-up (the note says so); else the person did.
  switchTask(taskId: string, harness: string, model: string | undefined, runner: Runner | undefined, device?: string, effort?: string, by?: "partner"): Promise<{ ok: boolean; message?: string }>;
  /** D372: the built-in default per kind of work on the home (the Partner page's rules list). */
  defaults(): Promise<KindDefault[]>;
  /**
   * D372 (the safety net): an errand on a fast tier failed or stalled: it carries on on the
   * smartest, once, by itself (said in the task). False when there is no smarter one to take it.
   */
  retry(taskId: string, how: { stalled?: boolean; summary?: string }, runner: Runner | undefined): Promise<{ ok: boolean; message?: string }>;
}

export function createLoadout(o: {
  log: LogStore;
  tasks: CoreRegistry;
  settings: SettingsStore;
  rules: RulesStore;
  /** D379: who does which work, said by the person and never saved as a rule. */
  said?: SaidStore;
  devices: () => DevicesView | undefined;
  /** D157: the sites Ducter's own browser on a computer is signed in to. */
  sites?: (deviceId: string) => string[];
  /** D202: each agent's models on each computer, to check an effort against the chosen model. */
  models?: ModelCatalog;
  /** D238: the person's own phone is added (用这台手机): work on a phone app can run on any computer. */
  handset?: () => boolean;
  /** D247: the person's Android app is connected without 用这台手机: a phone task opens and its card offers to turn it on. */
  handsetOffer?: () => string | undefined;
}): Loadout {
  /** The paired clients (phones among them), from the last devices frame read. */
  let clients: Parameters<typeof noPhoneLine>[0];
  /** D157: every computer that runs tasks, from the devices frame. */
  /** D251: `phone` on each computer means "can serve this phone work": which phone the work needs decides it. */
  const computers = async (needs?: TaskNeeds): Promise<Computer[] | undefined> => {
    const v = o.devices();
    if (!v) return undefined;
    const f = await v.frame().catch((err) => (console.warn("[loadout] devices:", (err as Error).message), undefined));
    if (!f) return undefined;
    clients = f.reach?.clients;
    const comps = computersOf(f.devices, o.sites);
    const which = whichPhone(needs);
    // D251: Ducter's own phone only where it is on (用手机); the person's phone never stands in.
    if (which === "ducter") return comps;
    // D238: the tools drive the person's own phone from the home, wherever the task runs.
    if (o.handset?.()) return comps.map((c) => ({ ...c, phone: true }));
    // D251: their own phone: their Android app connected without 用这台手机 opens the task, and its
    // card offers to turn it on there, even where Ducter's phone could do it; else no computer can.
    if (which === "mine") return comps.map((c) => ({ ...c, phone: !!o.handsetOffer?.() }));
    // D247: no phone anywhere, but their Android app is here: the task opens, and offers it there.
    if (!comps.some((c) => c.phone) && o.handsetOffer?.()) return comps.map((c) => ({ ...c, phone: true }));
    return comps;
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
    if (r.ok) return { ...pick, effort };
    // D391: "仔细" / "carefully" asks for high, "快速" for low: a model without exactly that level
    // takes the nearest one on its own side (never an extreme one: xhigh, max).
    const near = (NEAR_EFFORT[effort] ?? []).find((e) => checkEffort(pick.harness, pick.model, e, list).ok);
    return near ? { ...pick, effort: near } : { ...pick, effortDropped: `effort ${effort} was left out: ${r.why}` };
  };

  /** D372: a task of this kind was put on a fast tier by the default before (the line was said). */
  const routedBefore = (work: WorkKind | undefined) =>
    o.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["body_selected"] }).some((e) => {
      const w = (e.body as Bodies["body_selected"]).why;
      return w.kind === "kind" && w.work === work;
    });

  /** The person's rules, and (D379) what they said and never saved that decides this kind of work now. */
  const rulesWith = (kind: WorkKind | undefined) => {
    const said = o.said?.rulesFor(kind) ?? [];
    return said.length ? [...o.rules.list(), ...said] : o.rules.list();
  };

  const api: Loadout = {
    computers,

    async defaults() {
      const comps = await computers();
      const multi = comps && comps.length > 1 && comps.some((c) => c.harnesses.length);
      const hs = multi ? undefined : await harnessesFor();
      if (!multi && !hs) return [];
      return kindDefaults({ ...(multi ? { computers: comps!.filter((c) => c.home) } : { harnesses: hs! }), settings: o.settings.get() });
    },

    async retry(taskId, how, runner) {
      const card = o.tasks.get(taskId);
      if (!card || card.attention === "dropped") return { ok: false, message: "no such task" };
      const sel = o.log.read({ stream: taskStream(taskId), kinds: ["body_selected"], limit: 1000 }).at(-1)?.body as Bodies["body_selected"] | undefined;
      const open = o.log.read({ stream: taskStream(taskId), kinds: ["task_open"], limit: 1000 }).at(-1)?.body as Bodies["task_open"] | undefined;
      const device = card.place.device || "local";
      const comps = await computers(open?.needs);
      const multi = comps && comps.length > 1;
      const hs = multi ? undefined : await harnessesFor("device" in card.place ? card.place.device : undefined);
      if (!multi && !hs) return { ok: false, message: "no device info" };
      const to = smartestFor({
        work: { title: card.title, ...(open?.brief ? { brief: open.brief } : {}), ...(sel?.why.work ? { kind: sel.why.work } : {}) },
        ...(multi ? { computers: comps } : { harnesses: hs! }),
        ...(open?.needs ? { needs: open.needs } : {}),
        place: card.place,
        settings: o.settings.get(),
        rules: rulesWith(sel?.why.work),
        current: { harness: card.harness, ...(card.model ? { model: card.model } : {}), device },
      });
      if (!to) return { ok: false, message: "no smarter AI agent can take it here" };
      if (runner?.switchBody) {
        const r = await runner.switchBody(taskId, to.harness, to.model);
        if (!r.ok) return r;
      }
      o.log.append({
        stream: taskStream(taskId),
        origin: "system",
        kind: "body_selected",
        body: { taskId, harness: to.harness, ...(to.model ? { model: to.model } : {}), why: { kind: "retry", from: card.harness, ...(card.model ? { fromModel: card.model } : {}), ...(sel?.why.work ? { work: sel.why.work } : {}), ...(how.stalled ? { stalled: true as const } : {}) } },
      });
      // The task carries on there: the words say what happened, from Ducter (never the person's).
      const was = `${harnessName(card.harness)}${card.model ? ` (${card.model})` : ""}`;
      const text = `${was} ${how.stalled ? "stopped without a report" : "didn't get this done"}${how.summary ? ` ("${how.summary.slice(0, 300)}")` : ""}. Ducter moved the task to you (the strongest model here) once. Carry on from where it stopped; if it can't be done, report what is in the way.`;
      // A move to another agent may have started it already from its saved progress (needs_you).
      const now = o.tasks.get(taskId)?.attention;
      if (now !== "working" && now !== "queued") await runner?.send(taskId, text, undefined, "ducter").catch((err) => console.warn(`[loadout] retry ${taskId}:`, (err as Error).message));
      return { ok: true };
    },

    async choose(work) {
      const comps = await computers(work.needs);
      // D217: work on an app on a phone needs Ducter's phone somewhere; without it, nothing opens.
      // D247: never a silent task that would improvise (adb, a cable): one line naming the one thing to do.
      if (work.needs?.phone && comps && !comps.some((c) => c.phone)) return { none: noPhoneLine(clients, whichPhone(work.needs)) };
      // D157: two or more computers: one ranking over all of them, from what the task needs.
      const multi = comps && comps.length > 1 && comps.some((c) => c.harnesses.length);
      const hs = multi ? [] : await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined);
      if (!multi && !hs) return undefined;
      const pinDevice = pinOf(work.place);
      // One computer: still the ranking's view of it (whether it can browse), with the agents on the place's device.
      const one = !multi && comps?.length === 1 && (comps[0]!.web || comps[0]!.phone) ? [{ ...comps[0]!, harnesses: hs! }] : undefined;
      // D372: the kind of work, as the partner said it, else read from its needs and place.
      const kind = kindOf(work.workKind, work.needs, work.place);
      const input = {
        work: { title: work.title, ...(work.brief ? { brief: work.brief } : {}), ...(kind ? { kind } : {}) },
        ...(multi ? { computers: comps } : one ? { computers: one } : { harnesses: hs }),
        ...(work.needs ? { needs: work.needs } : {}),
        ...(work.place ? { place: work.place } : {}),
        ...(pinDevice ? { pinDevice } : {}),
        settings: o.settings.get(),
        ...(work.harness ? { pinned: { harness: work.harness, ...(work.model ? { model: work.model } : {}) } } : {}),
        ...(work.by ? { pinnedBy: work.by } : {}),
      };
      // D379: what the person said and never saved counts as their rule; a pin in the moment still
      // says who (the person's own pick is theirs alone). When the saying changes who does it (or
      // the partner's pin follows it), the task says so and the partner asks once to keep it.
      const said = work.by === "you" ? [] : (o.said?.rulesFor(kind) ?? []);
      const { pinned: _p, ...unpinned } = input;
      const pick0 = said.length
        ? saidPick(chooseBody({ ...input, rules: [...o.rules.list(), ...said] }), () => chooseBody({ ...unpinned, rules: o.rules.list() }), said)
        : chooseBody({ ...input, rules: o.rules.list() });
      // The person's own pick can't run: their one line, never a silent move.
      if (pick0 && "problem" in pick0) return { none: pick0.problem };
      // D372: the first errand the default puts on a fast tier is said once, by the partner.
      const first = pick0?.why.kind === "kind" && !routedBefore(pick0.why.work);
      const pick = pick0 && { ...pick0, why: first ? { ...pick0.why, first: true as const } : pick0.why, ...(kind ? { workKind: kind } : {}) };
      if (pick) return work.effort ? withEffort(pick, work.effort) : pick;
      const why = (multi ? comps!.flatMap((c) => c.harnesses.map((h) => ({ h, on: c.name }))) : (hs ?? []).map((h) => ({ h, on: "" })))
        .map(({ h, on }) => `${harnessName(h.harness)}${on ? ` on ${on}` : ""}: ${blockOf(h, o.settings.get()) ?? "can't do what this task needs there"}`)
        .join(", ");
      return { none: `no AI agent can take this task right now (${why}). Tell the user in one line and offer what would make one available.` };
    },

    async candidatesFor(work0, opts) {
      const comps = await computers(work0.needs);
      const kind = kindOf(undefined, work0.needs, work0.place);
      const work = { ...work0, ...(kind ? { kind } : {}) };
      if (comps && comps.length > 1) {
        const pinDevice = pinOf(work.place);
        return fwCandidates({ work, computers: comps, ...(work.place ? { place: work.place } : {}), ...(work.needs ? { needs: work.needs } : {}), ...(pinDevice ? { pinDevice } : {}), settings: o.settings.get(), rules: rulesWith(kind), ...(opts?.every ? { every: true as const } : {}) });
      }
      const hs = (await harnessesFor(work.place && "device" in work.place ? work.place.device : undefined)) ?? [];
      return fwCandidates({ work, harnesses: hs, settings: o.settings.get(), rules: rulesWith(kind), ...(opts?.every ? { every: true as const } : {}) });
    },

    async candidates(taskId) {
      const card = o.tasks.get(taskId);
      if (!card) throw new Error(`unknown task ${taskId}`);
      // The latest: a task opened before its brief was written logs the brief in a second one (D120).
      const open = o.log.read({ stream: taskStream(taskId), kinds: ["task_open"], limit: 1000 }).at(-1)?.body as Bodies["task_open"] | undefined;
      const comps = await computers(open?.needs);
      const current = { harness: card.harness, ...(card.model ? { model: card.model } : {}) };
      const kind = kindOf(open?.workKind, open?.needs, card.place);
      const work = { title: card.title, ...(open?.brief ? { brief: open.brief } : {}), ...(kind ? { kind } : {}) };
      if (comps && comps.length > 1) {
        // D157: who and where together (the switch sheet groups by computer). The task keeps its
        // needs; a browser place needs a browser wherever it goes.
        const sel = o.log.read({ stream: taskStream(taskId), kinds: ["body_selected"], limit: 1000 }).at(-1)?.body as Bodies["body_selected"] | undefined;
        const device = card.place.device || "local";
        return fwCandidates({
          work,
          computers: comps,
          place: card.place,
          ...(open?.needs ? { needs: open.needs } : {}),
          settings: o.settings.get(),
          rules: rulesWith(kind),
          current: { ...current, device, ...(sel?.why.where?.uses === "chrome" || sel?.why.where?.uses === "ducter" ? { uses: sel.why.where.uses } : {}) },
        });
      }
      const hs = (await harnessesFor("device" in card.place ? card.place.device : undefined)) ?? [];
      return fwCandidates({
        work,
        harnesses: hs,
        settings: o.settings.get(),
        rules: rulesWith(kind),
        current,
      });
    },

    async switchTask(taskId, harness, model, runner, device, effort, by) {
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
            body: { jobId: `${BODY_NOTE_PREFIX}${taskId}_${Date.now().toString(36)}`, taskId, state: "done", text: `${by === "partner" ? "you moved this task, for the user's follow-up," : "the user moved this task"} from ${here.name} to ${to.name} (${harnessName(harness)}); it continues there from its saved progress.` } as Bodies["job_status"],
          });
          return { ok: true };
        }
      }
      const effortNow = o.log.read({ stream: taskStream(taskId), kinds: ["body_selected"], limit: 1000 }).at(-1)?.body as Bodies["body_selected"] | undefined;
      if (card.harness === harness && (card.model ?? "") === (model ?? "") && (!effort || effort === effortNow?.effort)) return { ok: true };
      // D282: the same agent, another model or effort: no candidate check (it is the one doing it).
      if (card.harness === harness) {
        if (runner?.switchBody) {
          const r = await runner.switchBody(taskId, harness, model, effort);
          if (!r.ok) return r;
        }
        const keep = effort ?? ((model ?? "") === (card.model ?? "") ? effortNow?.effort : undefined);
        o.log.append({ stream: taskStream(taskId), origin: "user", kind: "body_selected", body: { taskId, harness, ...(model ? { model } : {}), ...(keep ? { effort: keep } : {}), why: { kind: "you", from: harness } } });
        return { ok: true };
      }
      const list = await api.candidates(taskId);
      const c = list.find((x) => x.harness === harness && (x.model ?? "") === (model ?? "")) ?? list.find((x) => x.harness === harness);
      if (!c) return { ok: false, message: `${harnessName(harness)} can't take this task here.` };
      if (c.blocked) return { ok: false, message: `${harnessName(harness)} can't take it right now (${c.blocked}).` };
      const from = card.harness;
      // A running task continues on the new one from its saved progress (the runner's handoff).
      if (runner?.switchBody) {
        const r = await runner.switchBody(taskId, harness, model, effort);
        if (!r.ok) return r;
      }
      o.log.append({ stream: taskStream(taskId), origin: "user", kind: "body_selected", body: { taskId, harness, ...(model ? { model } : {}), ...(effort ? { effort } : {}), why: { kind: "you", from } } });
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
    "Save one of the user's rules for who does which kind of work (shown on the Partner page as Your rules). Only after the user said it or agreed to it: restate it in one line first. Newest wins over an older rule for the same kind of work. \"别用 Claude Code 订酒店\": never, claude-code, kind errand. The user removes rules on the Partner page; never remove one yourself.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: 'The rule in one line, in the user\'s language, as "<kind of work> → <AI agent>", e.g. "后端的事 → Codex" or "跑腿的事 → 不用 Claude Code"' },
        harness: { type: "string", enum: ["claude-code", "codex", "pi", "deepseek-harness"] },
        model: { type: "string", description: "Only when the user named a model" },
        device: { type: "string", description: "D157: only when the rule names a computer (\"要登录的网页都在 MacBook 上做\"): its name from the [devices] line" },
        match: { type: "array", items: { type: "string" }, description: "3–10 words that mark this kind of work in a task title or brief, in both Chinese and English (e.g. [\"后端\", \"backend\", \"api\", \"server\"])" },
        kind: { type: "array", items: { type: "string", enum: [...WORK_KINDS] }, description: "The task_open kinds it covers (订酒店、看机票这类: errand)" },
        never: { type: "boolean", description: "NOT this agent (or model) for it" },
      },
      required: ["text", "harness"],
    },
    async (a: { text?: unknown; harness?: unknown; model?: unknown; match?: unknown; device?: unknown; kind?: unknown; never?: unknown }) => {
      try {
        const r = rules.add({
          text: String(a.text ?? ""),
          harness: String(a.harness ?? ""),
          ...(typeof a.model === "string" && a.model.trim() ? { model: a.model.trim() } : {}),
          match: Array.isArray(a.match) ? a.match.map(String) : [],
          ...(typeof a.device === "string" && a.device.trim() ? { device: a.device.trim() } : {}),
          // A kind said as one word, or as a list.
          ...(Array.isArray(a.kind) ? { kinds: a.kind.map(String) } : typeof a.kind === "string" ? { kinds: [a.kind] } : {}),
          ...(a.never === true ? { never: true } : {}),
        });
        return { ok: true, rule: r, note: "Saved. It shows on the Partner page under Your rules." };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
  mcp.register("partner", "rule_list", "The user's rules for who does which kind of work, oldest first.", { type: "object", properties: {} }, async () => rules.list());
}

/** How long task_switch waits for an agent's model list it doesn't have yet. */
const SWITCH_LIST_MS = 8_000;

/**
 * D352: the partner's task_switch: "这个任务换成 6.2 sol", "use Opus for this one", "let Codex do
 * it". The model is matched to the agent's own list as the person said it (the live list, else
 * the registry): the same agent keeps its own session and runs the new model from its next turn
 * (a running turn finishes on the old one, D282); another agent carries on from saved progress.
 */
export function registerSwitchTool(mcp: CoreMcpHub, o: { loadout: Loadout; tasks: CoreRegistry; models?: ModelCatalog; runner: () => Runner | undefined }) {
  mcp.register(
    "partner",
    "task_switch",
    "When the user asks to change a task's model, effort or AI agent (\"这个任务换成 6.2 sol\", \"use Opus for this\"), or a follow-up needs another computer. The same agent keeps its session and uses them from its next turn; another agent carries on from saved progress. model: as the user said it (matched to the agent's own list). Call it first, with no line before; after, at most one short line.",
    {
      type: "object",
      properties: {
        taskId: { type: "string" },
        harness: { type: "string", enum: ["claude-code", "codex", "pi", "deepseek-harness"], description: "Only to change the agent" },
        model: { type: "string" },
        effort: { type: "string" },
        device: {
          type: "string",
          description:
            "Move it to this computer (its [devices] name) with its brief, progress and last report, when the user names it or the follow-up needs what only it has (their signed-in Chrome, an app). Then task_send it the follow-up.",
        },
        confirmed: { type: "boolean", description: "Only after the user's go to pushing a code task's branch" },
      },
      required: ["taskId"],
    },
    async (a: { taskId?: unknown; harness?: unknown; model?: unknown; effort?: unknown; device?: unknown; confirmed?: unknown }) => {
      const taskId = String(a.taskId ?? "");
      const card = o.tasks.get(taskId);
      if (!card) return { ok: false, error: "I can't find that task." };
      const harness = typeof a.harness === "string" && a.harness ? a.harness : card.harness;
      if (!isHarnessId(harness)) return { ok: false, error: `${harness} isn't an AI agent Ducter runs.` };
      const said = typeof a.model === "string" ? a.model.trim() : "";
      const effort = typeof a.effort === "string" && a.effort.trim() ? a.effort.trim().toLowerCase() : undefined;
      // D376: another computer, checked here so a name that isn't one never quietly does nothing.
      const named = typeof a.device === "string" ? a.device.trim() : "";
      let to: Computer | undefined;
      if (named) {
        const comps = await o.loadout.computers();
        if (!comps || comps.length < 2) return { ok: false, error: "There is no other computer to move it to." };
        const hit = computerNamed(comps, named);
        if (!hit) return { ok: false, error: `No computer called "${named}". The [devices] line lists them: ${comps.map((c) => (c.home ? `${c.name} (local)` : c.name)).join(", ")}.` };
        const dev = (card.place as { device?: string }).device;
        const here = comps.find((c) => (dev && dev !== "local" ? c.id === dev || c.name === dev : c.home));
        if (here?.id !== hit.id) {
          if (card.place.kind === "folder") return { ok: false, error: `Its folder is on ${here?.name ?? "this computer"}; a folder task can't move. Say so in one line.` };
          // E3: a code task moves through its pushed branch: something leaves the computer, so only on the user's go.
          if (card.place.kind === "repo" && a.confirmed !== true) return { ok: false, error: `Moving a code task pushes its branch so ${hit.name} can check it out. Ask the user first (ask: Go = push its branch and carry on on ${hit.name}, default hold); on go, call task_switch again with confirmed: true.` };
          if (hit.state !== "awake") return { ok: false, error: `${hit.name} is ${hit.state === "asleep" ? "asleep" : "out of reach"}; it can move once it's back. Say so in one line.` };
          to = hit;
        }
      }
      if (!to && !said && !effort && harness === card.harness) return { ok: false, error: named ? `It is already on ${named}: task_send it the follow-up.` : "Say which model, effort or AI agent." };
      const on = (card.place as { device?: string }).device;
      const device = to ? (to.home ? "local" : to.id) : on && on !== "local" ? on : "local";
      const list = await o.models?.get(device, harness, SWITCH_LIST_MS);
      let model: string | undefined;
      if (said) {
        const r = resolveModel(harness, said, list);
        if ("ambiguous" in r) return { ok: false, error: `"${said}" could be ${r.ambiguous.join(", ")}. Ask the user which, in one line.` };
        if ("none" in r) {
          // Nothing to check it against (no list, an empty registry): as they said it; the agent refuses an unknown one.
          if (!r.none.length) model = said;
          else return { ok: false, error: `${harnessName(harness)} has no model "${said}" here. It offers: ${r.none.join(", ")}.` };
        } else model = r.id;
      } else if (harness === card.harness) model = card.model;
      if (effort) {
        const ok = checkEffort(harness, model, effort, list);
        if (!ok.ok) return { ok: false, error: ok.why };
      }
      const r = await o.loadout.switchTask(taskId, harness, model, o.runner(), to?.id, effort, to ? "partner" : undefined).catch((err) => ({ ok: false, message: (err as Error).message }));
      if (!r.ok) return { ok: false, error: r.message ?? "That switch didn't go through." };
      const entry = model ? list?.find((m) => m.id === model) : undefined;
      const running = card.attention === "working" || card.attention === "queued";
      const same = harness === card.harness;
      if (to) {
        // D376: where it browses there, so the line can say whose sign-ins it uses.
        const web = card.place.kind === "browser" ? (to.web?.where === "chrome" ? " There it browses in the user's own Chrome, with their sign-ins." : " There it browses in Ducter's own browser.") : "";
        return {
          ok: true,
          moved: to.name,
          harness,
          ...(model ? { model } : {}),
          note: running
            ? `Moved to ${to.name}: it carries on there now from its saved progress and last report.${web} The task shows the move itself.`
            : `Moved to ${to.name} with its brief, saved progress and last report; not running yet.${web} Now task_send it the follow-up. Your one line names the action and where ("我到你 ${to.name} 上接着看机票。"), never the move.`,
        };
      }
      return {
        ok: true,
        harness,
        ...(model ? { model, label: entry?.label ?? model } : {}),
        ...(effort ? { effort } : entry?.defaultEffort ? { effort: entry.defaultEffort } : {}),
        note: same
          ? running
            ? "Done: the turn it is in finishes as it was; the next one uses the new choice. The task shows the change itself."
            : "Done: its next turn uses the new choice. The task shows the change itself."
          : running || card.attention === "needs_you"
            ? "Done: it carries on there from saved progress. The task shows the change itself."
            : // D372: a failed or waiting task stays as it is until it hears something.
              "Done. It is not running: if the user wants it to carry on now, task_send it one line to carry on.",
      };
    },
  );
}

/** D376: a computer as the partner names it: its id, its name (any case), "local" for the home, else the one name it is part of. */
export function computerNamed(comps: Computer[], named: string): Computer | undefined {
  const want = named.trim().toLowerCase();
  if (!want) return undefined;
  const exact = comps.find((c) => c.id === named || c.name.toLowerCase() === want);
  if (exact) return exact;
  if (want === "local" || want === "home" || want.startsWith("local ")) return comps.find((c) => c.home);
  const part = comps.filter((c) => c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase()));
  return part.length === 1 ? part[0] : undefined;
}

/** A user-origin note that should wake the partner: the second switch the same way. */
export function isRuleHint(e: LogEvent): boolean {
  if (e.kind !== "job_status" || e.origin !== "user") return false;
  const id = (e.body as Bodies["job_status"]).jobId;
  return id.startsWith(BODY_NOTE_PREFIX) && id.includes(RULE_HINT_SUFFIX);
}

/**
 * D379: the pick with what the person said and never saved. When that changed who does it (a
 * "never" moved it off the one the default would pick, or "always" put it on the one named, by
 * the saying or by the partner's pin following it), its why says so with their words, so the
 * partner can ask once to keep it. Otherwise the pick as it is.
 */
export function saidPick<P extends { harness: string; why: BodyWhy }>(
  withSaid: P | { problem: string } | undefined,
  without: (() => P | { problem: string } | undefined) | undefined,
  said: RuleView[],
): P | { problem: string } | undefined {
  if (!without || !withSaid || "problem" in withSaid) return withSaid;
  const why = withSaid.why;
  const named = why.kind === "rule" ? said.find((r) => r.id === why.ruleId) : undefined;
  let r = named;
  if (!r) {
    // Who the default would pick with neither the saying nor a pin: a saying that moved it (or a
    // pin that follows the saying) is what decided it.
    const plain = without();
    if (plain && !("problem" in plain) && plain.harness !== withSaid.harness)
      r = said.find((x) => (x.never ? x.harness === plain.harness : x.harness === withSaid.harness));
  }
  if (!r) return withSaid;
  const { ruleId: _r, text: _t, ...rest } = why;
  return { ...withSaid, why: { ...rest, kind: "said", text: r.text, said: { key: r.id, harness: r.harness, ...(r.never ? { never: true as const } : {}), kinds: r.kinds ?? [] } } };
}

/**
 * D390: 用 astra 跟我聊 / "switch yourself to Opus": what the partner itself thinks with, as the
 * person said it in the conversation: the setting Settings › Partner writes (Settings.brain), the
 * model matched to its agent's live list on the home. It takes effect from the person's next
 * message (the session ends and the next one starts on it, partner.ts runKey).
 */
export function registerBrainSwitchTool(mcp: CoreMcpHub, o: { settings: SettingsStore; models?: ModelCatalog; home: () => Pick<DeviceHarness, "harness" | "loggedIn">[] | undefined }) {
  mcp.register(
    "partner",
    "brain_switch",
    "When the user asks YOU to think or talk with another model or AI agent (\"用 astra 跟我聊\", \"switch yourself to Opus\"); a task's model is task_switch. model: as the user said it (matched to the agent's own list). It takes effect from their next message. Call it first; after, one short line.",
    {
      type: "object",
      properties: {
        model: { type: "string" },
        harness: { type: "string", enum: ["claude-code", "codex", "pi", "deepseek-harness"], description: "Only to change the agent" },
      },
    },
    async (a: { model?: unknown; harness?: unknown }) => {
      const home = o.home();
      const cur = effectiveBrain(o.settings.get().brain, o.settings.brainChosen(), home);
      const harness = typeof a.harness === "string" && a.harness ? a.harness : cur.harness;
      if (!isHarnessId(harness) || !HARNESSES[harness].partner) return { ok: false, error: `${harness} can't be what you think with.` };
      if (home && !home.find((x) => x.harness === harness)?.loggedIn) return { ok: false, error: `${harnessName(harness)} isn't signed in on the computer Ducter runs on. Say so in one line.` };
      const said = typeof a.model === "string" ? a.model.trim() : "";
      if (!said && harness === cur.harness) return { ok: false, error: "Say which model or AI agent." };
      const list = await o.models?.get("local", harness, SWITCH_LIST_MS);
      let model: string | undefined;
      if (said) {
        const r = resolveModel(harness, said, list);
        if ("ambiguous" in r) return { ok: false, error: `"${said}" could be ${r.ambiguous.join(", ")}. Ask the user which, in one line.` };
        if ("none" in r) {
          if (!r.none.length) model = said;
          else return { ok: false, error: `${harnessName(harness)} has no model "${said}" here. It offers: ${r.none.join(", ")}.` };
        } else model = r.id;
      }
      const label = model ? (list?.find((m) => m.id === model)?.label ?? model) : undefined;
      const named = { harness, ...(model ? { model, label } : {}) };
      if (harness === cur.harness && model === cur.model && !cur.auto) return { ok: true, already: true, ...named, note: "Already so: say it in one short line." };
      o.settings.set({ brain: { harness, ...(model ? { model } : {}) } });
      return { ok: true, ...named, note: "Done: from the user's next message you think with it; your name, memory and this conversation stay. One short line, nothing about sessions." };
    },
  );
}
