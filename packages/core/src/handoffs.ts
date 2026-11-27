// D609: a hand-off is a thing, not a message. One record per item, in the home's Log: given → taken
// → done | returned | declined, plus unclaimed after HELPER_TAKE_MS. Every local door (open_pr's
// hand_to, keep_change hand, a helper's own agent_message) and Bridge mail to a helper in any Space
// comes through here, so a second hand-off of the same item to the same helper merges into the open
// record and is never a second one. "Taken" is only a claim by one of the helper's tasks; a record is
// never left silent: an outcome is said back to the sender (a task by task_send, an agent in its
// Space), and an untaken one is said to the person once by the partner.
import { randomUUID } from "node:crypto";
import type { Bodies, Helper, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { detect, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { helperQuestions, handoffItem, handoffKey, handoffStateWord, HANDOFF_TERMINAL, HANDOFF_WORDS, type HandoffBody, type HandoffFrom, type HandoffItem, type HandoffSettle, type HandoffTo } from "@ducter/protocol/src/handoff.ts";
import { HELPER_TAKE_MS, isHelperWork, localHandoff, LOCAL_MSG } from "@ducter/protocol/src/helpers.ts";

export interface Handoffs {
  /** The latest step of every record, oldest first. */
  all(): HandoffBody[];
  get(handoffId: string): HandoffBody | undefined;
  byMessage(messageId: string): HandoffBody | undefined;
  open(): HandoffBody[];
  ofTask(taskId: string): HandoffBody | undefined;
  ofHelper(helperId: string): HandoffBody[];
  /** A local door handed work to a helper: writes the record and (when it is new) the arrival that wakes it. */
  giveLocal(a: { helper: Helper; text: string; fromTask?: string; fromTaskTitle?: string; fromName: string; head?: string; item?: Partial<HandoffItem>; ask?: string; persona?: string; at?: string }): { handoff: HandoffBody; created: boolean; message?: LogEvent<"bridge_msg"> };
  /** Bridge mail to a helper, already logged as bridge_msg: records it as work or merges it. */
  givenAgent(a: { body: Bodies["bridge_msg"]; at: string; persona?: string }): HandoffBody | undefined;
  /** A helper's task took the record one of its messages is the arrival of. */
  claim(messageId: string, taskId: string, at?: string): HandoffBody | undefined;
  /** Done, returned, declined or withdrawn; `say` sends the outcome back to the sender (default true). */
  finish(handoffId: string, state: "done" | "returned" | "declined" | "withdrawn", o?: { why?: string; outcome?: string; say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  finishForTask(taskId: string, state: "done" | "returned" | "declined" | "withdrawn", o?: { why?: string; outcome?: string; say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  wake(handoffId: string, at?: string): HandoffBody | undefined;
  withdraw(handoffId: string, o?: { say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  /** The person was told once that nobody took it; true when this call marked it. */
  unclaim(handoffId: string, at?: string): boolean;
  /** Given records past HELPER_TAKE_MS that were never said unclaimed. */
  dueUnclaimed(now: number): HandoffBody[];
  /** D633: a PR's or an issue's true state read from GitHub by the holdings path: merged/closed settles
   *  its open hand-offs exactly as D628 does, whether or not Ducter ever watched the PR itself. */
  observeGithub(ref: string, state: "open" | "merged" | "closed", kind: "pr" | "issue"): void;
  /** The partner's way back to the agent a record came from (its Space and D595 reply route). */
  setTellAgent(fn: ((h: HandoffBody, text: string) => Promise<boolean>) | undefined): void;
}

const newId = () => `ho_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

export function createHandoffs(o: {
  log: LogStore;
  helper: (id: string) => Helper | undefined;
  now: () => number;
  /** Tell the task that gave it something (the runner's send, or a note into a finished task). */
  tellTask?: (taskId: string, text: string) => Promise<boolean>;
  /** The partner's answer into the sender's Space; absent in a home with no partner. */
  tellAgent?: (h: HandoffBody, text: string) => Promise<boolean>;
  /** The language a record's words read as, for the outcome said back to an agent. */
  lang?: () => string;
  /** A task's title, for the sender a view shows. */
  taskTitle?: (taskId: string) => string | undefined;
  onChange?: () => void;
  /** Read the bridge_msg events already in the Log into records (D609's migration). Default true. */
  backfill?: boolean;
  /** D628: an issue's true state, read from GitHub once a PR in its repository merged. */
  issueState?: (ref: string) => Promise<HandoffSettle | undefined>;
}): Handoffs {
  const { log } = o;
  const byId = new Map<string, HandoffBody>();
  const latestByKey = new Map<string, string>();
  const byMessage = new Map<string, string>();
  let tellAgent = o.tellAgent;
  let backfilling = false;
  // D628: the true state of a PR, from Ducter's own owned look. A hand-off about it settles
  // by itself when it merges or closes; code reads the fact, never the words around it.
  const prState = new Map<string, { state?: "open" | "merged" | "closed" | "not_ours"; letGo?: boolean }>();
  const byPr = (ref: string) => prState.get(ref.trim().toLowerCase());

  const remember = (h: HandoffBody) => {
    byId.set(h.handoffId, h);
    latestByKey.set(h.key, h.handoffId);
    for (const m of h.messages ?? []) byMessage.set(m, h.handoffId);
    if (h.from.messageId) byMessage.set(h.from.messageId, h.handoffId);
  };

  // D645 (research/245 §3.7, B7): one record per `repo#n`. Older homes (hel, 11-26) made two
  // for one item, `issue:…` and `pr:…`; they are one record when read, never rewritten in the Log.
  const RANK: Record<HandoffBody["state"], number> = { settled: 9, done: 8, declined: 7, returned: 7, withdrawn: 6, taken: 5, unclaimed: 4, given: 3 };
  const mergeOld = (a: HandoffBody, b: HandoffBody): HandoffBody => {
    const [win, lose] = RANK[b.state] > RANK[a.state] || (RANK[b.state] === RANK[a.state] && b.at > a.at) ? [b, a] : [a, b];
    const adds = [...(a.adds ?? []), ...(b.adds ?? [])].sort((x, y) => x.at.localeCompare(y.at));
    return {
      ...lose,
      ...win,
      givenAt: a.givenAt < b.givenAt ? a.givenAt : b.givenAt,
      messages: [...new Set([...(a.messages ?? []), ...(b.messages ?? []), ...(a.from.messageId ? [a.from.messageId] : []), ...(b.from.messageId ? [b.from.messageId] : [])])],
      ...(adds.length ? { adds } : {}),
      ...(win.taskId || lose.taskId ? { taskId: win.taskId ?? lose.taskId } : {}),
      ...(win.why || lose.why ? { why: win.why ?? lose.why } : {}),
      ...(win.outcome || lose.outcome ? { outcome: win.outcome ?? lose.outcome } : {}),
      ...(win.settledBy || lose.settledBy ? { settledBy: win.settledBy ?? lose.settledBy } : {}),
      ...(win.unclaimedAt || lose.unclaimedAt ? { unclaimedAt: win.unclaimedAt ?? lose.unclaimedAt } : {}),
      ...(win.wakeAt || lose.wakeAt ? { wakeAt: [win.wakeAt, lose.wakeAt].filter(Boolean).sort().at(-1) } : {}),
    };
  };
  {
    const byNorm = new Map<string, HandoffBody[]>();
    for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["handoff"] })) {
      const h = e.body as HandoffBody;
      const key = handoffKey(h.from, h.to, h.item);
      const list = byNorm.get(key) ?? [];
      // Only the old issue:/pr: pair for one GitHub number is one item; a later re-give of the same
      // kind is a new ask and keeps its own record.
      const i = list.findIndex((x) => x.item.kind !== h.item.kind);
      if (i >= 0) list[i] = mergeOld(list[i]!, { ...h, key });
      else list.push({ ...h, key });
      byNorm.set(key, list);
    }
    for (const list of byNorm.values()) for (const h of list) remember(h);
  }
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["owned_news"] })) {
    const b = e.body as Bodies["owned_news"];
    if (b?.pr) prState.set(b.pr.toLowerCase(), { state: b.seen?.state, ...(b.seen?.letGo ? { letGo: true } : {}) });
  }

  const put = (h: HandoffBody): HandoffBody => {
    const copy: HandoffBody = { ...h, ...(h.messages ? { messages: [...h.messages] } : {}), ...(h.adds ? { adds: h.adds.map((x) => ({ ...x })) } : {}) };
    const persona = o.helper(h.to.helper)?.persona;
    log.append({ stream: "channel", origin: "system", kind: "handoff", body: copy, ...(persona ? { persona } : {}) } as never);
    remember(copy);
    o.onChange?.();
    return copy;
  };

  /** D628: settle a record about a PR from the world's own state; never a message to anyone. */
  const settle = (h: HandoffBody, by: HandoffSettle): HandoffBody =>
    HANDOFF_TERMINAL.has(h.state) ? h : put({ ...h, state: "settled", at: iso(o.now()), settledBy: by });

  const GITHUB_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/;
  const settleIfOver = (h: HandoffBody): HandoffBody => {
    // D645 (research/245 §3.7, B7): repo#n is one item, so either the PR's merge/close or the
    // issue's close settles it, whichever kind the record was first written as.
    if (!GITHUB_REF.test(h.item.ref)) return h;
    const p = byPr(h.item.ref);
    return p?.state === "merged" || p?.state === "closed" ? settle(h, p.state) : h;
  };

  const settleAll = () => {
    for (const h of [...byId.values()]) if (!HANDOFF_TERMINAL.has(h.state)) settleIfOver(h);
  };

  const settleIssues = async (repo?: string) => {
    if (!o.issueState) return;
    for (const h of [...byId.values()]) {
      if (h.state !== "given" && h.state !== "unclaimed" && h.state !== "taken") continue;
      if (!GITHUB_REF.test(h.item.ref)) continue;
      const [owner] = h.item.ref.split("#");
      if (repo && owner?.toLowerCase() !== repo.toLowerCase()) continue;
      const by = await o.issueState(h.item.ref).catch(() => undefined);
      const cur = byId.get(h.handoffId);
      if (by && cur && !HANDOFF_TERMINAL.has(cur.state)) settle(cur, by);
    }
  };

  const openOf = (h: HandoffBody | undefined): h is HandoffBody => !!h && !HANDOFF_TERMINAL.has(h.state);

  const byKey = (key: string) => {
    const id = latestByKey.get(key);
    return id ? byId.get(id) : undefined;
  };

  /** The record a new hand-off joins: the open one under its key, if any. */
  const sameFrom = (x: HandoffFrom, y: HandoffFrom) => (x.task ? x.task === y.task : !y.task && x.agent === y.agent && (x.space ?? "") === (y.space ?? ""));
  const join = (a: { from: HandoffFrom; to: HandoffTo; item: HandoffItem; said: string; ask?: string; messageId?: string; at: string; persona?: string; backfilled?: true }): { handoff: HandoffBody; created: boolean } => {
    // Words with no reference (a follow-up on the work: "只差 /lgtm 了") are the same item as the one
    // open record from this sender to this helper; only a reference makes a second item.
    let item = a.item;
    if (item.kind === "text") {
      const prior = [...byId.values()].find((h) => h.to.helper === a.to.helper && !HANDOFF_TERMINAL.has(h.state) && sameFrom(h.from, a.from));
      if (prior) item = prior.item;
    }
    const key = handoffKey(a.from, a.to, item);
    const prev = byKey(key);
    if (openOf(prev)) {
      const at = a.at;
      const next: HandoffBody = {
        ...prev,
        item,
        givenAt: prev.givenAt ?? prev.at,
        said: prev.said,
        ...(a.messageId ? { messages: [...new Set([...(prev.messages ?? []), a.messageId])] } : {}),
        adds: [...(prev.adds ?? []), { at, text: a.said, ...(a.messageId ? { messageId: a.messageId } : {}) }],
      };
      if (!prev.from.messageId && a.messageId) next.from = { ...prev.from, messageId: a.messageId };
      return { handoff: settleIfOver(put(next)), created: false };
    }
    const from: HandoffFrom = { ...a.from, ...(a.messageId ? { messageId: a.messageId } : {}) };
    const body: HandoffBody = {
      handoffId: newId(),
      key,
      from,
      to: a.to,
      item,
      said: a.said,
      ...(a.ask ? { ask: a.ask } : {}),
      state: "given",
      at: a.at,
      ...(a.messageId ? { messages: [a.messageId] } : {}),
      givenAt: a.at,
      ...(a.backfilled ? { backfilled: true as const } : {}),
    };
    const made = put(body);
    if (made.item.kind === "issue") void settleIssues(made.item.ref.split("#")[0]);
    return { handoff: settleIfOver(made), created: true };
  };

  const say = async (h: HandoffBody, state: "done" | "returned" | "declined" | "withdrawn", why: string): Promise<void> => {
    const lang = (detect(h.said)?.lang ?? o.lang?.()) as LangTag | undefined;
    const w = words(HANDOFF_WORDS, lang);
    const item = h.item.title?.trim() || h.item.ref;
    const line = `${w[state].replace("{helper}", h.to.name).replace("{item}", item)}${why ? w.why.replace("{why}", why) : ""}`;
    if (h.from.task) {
      const body = state === "done" ? w.taskDone : state === "withdrawn" ? w.taskWithdrawn : w.taskBack;
      const text = body.replaceAll("{helper}", h.to.name).replaceAll("{item}", item).replaceAll("{why}", why || line).replaceAll("{state}", handoffStateWord(lang ?? "en", state));
      const p = o.tellTask?.(h.from.task, text);
      if (p) await p.catch(() => false);
      return;
    }
    if (h.from.agent || h.from.space) {
      const p = tellAgent?.(h, line);
      if (p) await p.catch(() => false);
    }
  };

  const finish = async (handoffId: string, state: "done" | "returned" | "declined" | "withdrawn", opt?: { why?: string; outcome?: string; say?: boolean; at?: string }): Promise<HandoffBody | undefined> => {
    const h = byId.get(handoffId);
    if (!h || HANDOFF_TERMINAL.has(h.state)) return undefined;
    // Only a withdraw may end a record nobody took; done/returned/declined need a claim.
    if ((h.state === "given" || h.state === "unclaimed") && state !== "withdrawn") return undefined;
    const why = (opt?.why ?? "").trim().slice(0, 600);
    const next = put({ ...h, state, at: opt?.at ?? iso(o.now()), ...(why ? { why } : {}), ...(opt?.outcome ? { outcome: opt.outcome.slice(0, 600) } : {}) });
    if (opt?.say !== false) await say(next, state, why || opt?.outcome || "");
    return next;
  };

  // D609's migration: older bridge_msg events already handed work to helpers. Read them once so a
  // record exists for work handed before this version, never a second one when it is seen again.
  if (o.backfill !== false) {
    backfilling = true;
    try {
      const evs = log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 5000 });
      const questions = helperQuestions(evs);
      const seen = new Set(byMessage.keys());
      for (const e of evs) {
        const b = e.body as Bodies["bridge_msg"];
        if (b.direction === "out" && b.helper && b.inReplyTo && b.taskId && b.state === "sent") {
          const id = byMessage.get(b.inReplyTo);
          const h = id ? byId.get(id) : undefined;
          if (h && (h.state === "given" || h.state === "unclaimed")) put({ ...h, state: "taken", taskId: b.taskId, at: e.ts });
          continue;
        }
        if (b.direction !== "in" || !b.helper || seen.has(b.messageId) || !isHelperWork(b, questions)) continue;
        const helper = o.helper(b.helper);
        if (!helper) continue;
        const item = handoffItem({ text: b.text, refs: b.refs });
        const from: HandoffFrom = b.fromTask
          ? { task: b.fromTask, ...(b.from ? { name: b.from } : {}), ...(o.taskTitle?.(b.fromTask) ? { taskTitle: o.taskTitle(b.fromTask) } : {}) }
          : b.local
            ? { name: b.from ?? "you" }
            : { agent: b.agent ?? b.from ?? "agent", ...(b.from ? { name: b.from } : {}), ...(b.space ? { space: b.space } : {}), ...(b.spaceLabel ? { spaceLabel: b.spaceLabel } : {}) };
        join({ from, to: { helper: helper.id, name: helper.name }, item, said: b.text ?? "", messageId: b.messageId, at: e.ts, ...(e.persona ? { persona: e.persona } : {}), backfilled: true });
        seen.add(b.messageId);
      }
    } finally {
      backfilling = false;
    }
  }

  const api: Handoffs = {
    all: () => [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)),
    get: (id) => byId.get(id),
    byMessage: (id) => (byMessage.has(id) ? byId.get(byMessage.get(id)!) : undefined),
    open: () => [...byId.values()].filter((h) => !HANDOFF_TERMINAL.has(h.state)),
    ofTask: (taskId) => [...byId.values()].reverse().find((h) => h.taskId === taskId && !HANDOFF_TERMINAL.has(h.state)),
    ofHelper: (helperId) => [...byId.values()].filter((h) => h.to.helper === helperId).sort((a, b) => a.at.localeCompare(b.at)),
    giveLocal(a) {
      const helper = a.helper;
      const item = handoffItem({ ...(a.item ?? {}), text: a.text });
      const messageId = `${LOCAL_MSG}${randomUUID()}`;
      const at = a.at ?? iso(o.now());
      const title = a.fromTaskTitle ?? (a.fromTask ? o.taskTitle?.(a.fromTask) : undefined);
      const from: HandoffFrom = a.fromTask ? { task: a.fromTask, name: a.fromName, ...(title ? { taskTitle: title } : {}) } : { name: a.fromName };
      const r = join({ from, to: { helper: helper.id, name: helper.name }, item, said: a.text, ...(a.ask ? { ask: a.ask } : {}), messageId, at, ...(a.persona ? { persona: a.persona } : {}) });
      if (!r.created) return { handoff: r.handoff, created: false };
      const message = log.append({
        stream: "channel",
        origin: "peer",
        kind: "bridge_msg",
        body: localHandoff({ id: messageId.slice(LOCAL_MSG.length), helper: helper.id, text: a.text, from: a.fromName, ...(a.fromTask ? { fromTask: a.fromTask } : {}), ...(a.head ? { head: a.head } : {}) }),
        ...(a.persona ? { persona: a.persona } : {}),
      } as never) as LogEvent<"bridge_msg">;
      return { handoff: r.handoff, created: true, message };
    },
    givenAgent(a) {
      const b = a.body;
      if (!b?.helper || b.direction !== "in") return undefined;
      if (b.state) return undefined;
      const helper = o.helper(b.helper);
      if (!helper) return undefined;
      const questions = helperQuestions(log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 5000 }));
      if (!isHelperWork(b, questions)) return undefined;
      const item = handoffItem({ text: b.text, refs: b.refs });
      const from: HandoffFrom = b.fromTask
        ? { task: b.fromTask, ...(b.from ? { name: b.from } : {}), ...(o.taskTitle?.(b.fromTask) ? { taskTitle: o.taskTitle(b.fromTask) } : {}) }
        : { agent: b.agent ?? b.from ?? "agent", ...(b.from ? { name: b.from } : {}), ...(b.space ? { space: b.space } : {}), ...(b.spaceLabel ? { spaceLabel: b.spaceLabel } : {}) };
      return join({ from, to: { helper: helper.id, name: helper.name }, item, said: b.text ?? "", messageId: b.messageId, at: a.at, ...(a.persona ? { persona: a.persona } : {}) }).handoff;
    },
    claim(messageId, taskId, at) {
      const id = byMessage.get(messageId);
      const h = id ? byId.get(id) : undefined;
      if (!h || h.state === "taken" || HANDOFF_TERMINAL.has(h.state)) return h;
      return put({ ...h, state: "taken", taskId, at: at ?? iso(o.now()) });
    },
    finish,
    wake(handoffId, at) {
      const h = byId.get(handoffId);
      if (!h || (h.state !== "given" && h.state !== "unclaimed")) return h;
      const now = at ?? iso(o.now());
      if (h.wakeAt && Date.parse(now) - Date.parse(h.wakeAt) < 60_000) return h;
      const helper = o.helper(h.to.helper);
      if (!helper) return h;
      const messageId = `${LOCAL_MSG}${randomUUID()}`;
      const from = h.from.taskTitle?.trim() || h.from.name?.trim() || h.from.agent?.trim() || "you";
      const next = put({ ...h, wakeAt: now, messages: [...new Set([...(h.messages ?? []), messageId])] });
      log.append({
        stream: "channel",
        origin: "peer",
        kind: "bridge_msg",
        body: localHandoff({ id: messageId.slice(LOCAL_MSG.length), helper: helper.id, text: h.said, from, ...(h.from.task ? { fromTask: h.from.task } : {}) }),
      } as never);
      return next;
    },
    withdraw: (handoffId, opt) => finish(handoffId, "withdrawn", { why: "you stopped following it", ...(opt ?? {}) }),
    finishForTask: (taskId, state, opt) => {
      const h = api.ofTask(taskId);
      return h ? finish(h.handoffId, state, opt) : Promise.resolve(undefined);
    },
    unclaim(handoffId, at) {
      const h = byId.get(handoffId);
      if (!h || h.state !== "given" || h.unclaimedAt) return false;
      const t = at ?? iso(o.now());
      put({ ...h, state: "unclaimed", at: t, unclaimedAt: t });
      return true;
    },
    dueUnclaimed(now) {
      return [...byId.values()].filter((h) => h.state === "given" && !h.unclaimedAt && !h.taskId && now - Date.parse(h.at) >= HELPER_TAKE_MS && now - Date.parse(h.at) <= DAY);
    },
    observeGithub(ref, state, kind) {
      const r = ref.trim().toLowerCase();
      if (kind === "pr") {
        prState.set(r, { state });
        if (state === "merged" || state === "closed") settleAll();
        return;
      }
      if (state !== "closed") return;
      // D645 (research/245 §3.7, B7): the same ref, whichever kind the record carries.
      for (const h of [...byId.values()]) {
        if (h.item.ref.trim().toLowerCase() !== r) continue;
        if (!HANDOFF_TERMINAL.has(h.state)) settle(h, "closed");
      }
    },
    setTellAgent(fn) {
      tellAgent = fn;
    },
  };
  // D628: a merge or close ends every hand-off about that PR. The record is the truth's, not
  // a reminder: it is not said back to the sender, and the helper's page stops counting it.
  log.subscribe((e) => {
    if (e.kind !== "owned_news") return;
    const b = e.body as Bodies["owned_news"];
    if (!b?.pr) return;
    prState.set(b.pr.toLowerCase(), { state: b.seen?.state, ...(b.seen?.letGo ? { letGo: true } : {}) });
    if (b.seen?.state === "merged" || b.seen?.state === "closed") {
      settleAll();
      // A merged PR is the usual way an issue closes; the issue's own state is still the guard.
      if (b.seen.state === "merged" && o.issueState) void settleIssues(b.pr.split("#")[0]);
    }
  });
  settleAll();
  void settleIssues();
  // A claim from one of the helper's tasks always means taken, whichever door made the record.
  log.subscribe((e) => {
    if (backfilling || e.kind !== "bridge_msg") return;
    const b = e.body as Bodies["bridge_msg"];
    if (b.direction !== "out" || !b.helper || !b.inReplyTo || !b.taskId || b.state !== "sent" || b.by === "task") return;
    api.claim(b.inReplyTo, b.taskId, e.ts);
  });
  return api;
}
