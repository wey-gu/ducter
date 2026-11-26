// Reports -> attention + decisions (D10). Reversible defaults auto-resolve; resolutions are
// forwarded to the task through the onDecision hook (main.ts wires it to runner.send).
import type { Attention, Bodies, EvidenceRef, LogEvent, Question, StandingAction } from "@ducter/protocol";
import { STEP_WORDS } from "@ducter/protocol/src/standing.ts";
import { hideMemSecrets } from "@ducter/protocol/src/mem-plugins.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";
import { keyReadyText, keyRefusedText } from "./saved/key-words.ts";
import { destructiveChoice } from "@ducter/protocol/src/destructive.ts";
import { laterable, laterRefusal } from "@ducter/protocol/src/later.ts";
import { detect, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { codeExpired, deviceNewCodeText, deviceSaidInText, deviceSignedInText } from "@ducter/protocol/src/device-signin.ts";

/** The Go of a task's question that names none, in the task's language (the card reads "好，继续", never "好，Continue"). */
const GO_PLAIN = { en: "Continue", zh: "继续", "zh-Hant": "繼續", ja: "続ける", ko: "계속" } as const;

export type DecisionHook = (taskId: string, text: string, resolved: Bodies["decision_resolved"]) => void | Promise<void>;

export interface Decisions {
  /** extra.delivered (D233): the task already has the answer; it is not forwarded. extra.msgSeq (D236): the reply message that answered it, when the answer was a reply in the conversation. */
  decide(decisionId: string, option: "go" | "hold" | "reply", text?: string, extra?: { delivered?: boolean; msgSeq?: number; copied?: true }): LogEvent<"decision_resolved">;
  get(decisionId: string): Bodies["decision"] | undefined;
  isPending(decisionId: string): boolean;
  /** D443: a task's questions still open (oldest first), for a reply to its line under a message. */
  pendingOf(taskId: string): string[];
  /**
   * D382: 晚点再问我 / Ask me later: put an open question off to `until` (ms), or bring it back
   * now (null, 现在就定 / Decide now). Throws in the person's terms when it can't.
   */
  later(decisionId: string, until: number | null): void;
  /** D382: when an open question comes back (ms), while it is put off. */
  laterUntil(decisionId: string): number | undefined;
  setHook(fn: DecisionHook): void;
  /**
   * The user (or the partner) answered the task directly with a message: resolve its open
   * decisions as "reply" without forwarding (the message itself is the answer). Without this a
   * later Go re-woke a task that had already finished (working -> done flap). D585: the person's
   * own words (by "user") came in the task itself: resolved `inTask`, so they wake nobody (the
   * partner answered "都有哪些 space?" in the conversation while the task answered it too, hel 11-22).
   */
  answeredByMessage(taskId: string, text: string, by: "user" | "partner"): void;
  /**
   * D499: Go for the person, under what they said (a kept 不用问我的 covering this step): only a
   * task's plain question (plainAsk), open; forwarded to the task as their go, with the words.
   */
  goOnTheirWord(decisionId: string, w: { said: string; action: StandingAction; standing: string }): LogEvent<"decision_resolved">;
  /**
   * Answers resolved before a restart that never reached their task (the process died between
   * decision_resolved and the forward). Returned once; core hands them over when the runner is wired.
   */
  takeUnforwarded(): { taskId: string; text: string; decisionId: string; from: "user" | "ducter" }[];
  /** D481: every question open now (On hand's openAsks: the one source of truth for "open"). */
  openIds(): string[];
  /** D481: the Log seqs that make a question what it is: its decision event, then its later/back/seen and its resolution. */
  seqsOf(decisionId: string): number[];
  /** D481: the resolution of a question, once it has one. */
  resolution(decisionId: string): Bodies["decision_resolved"] | undefined;
  /**
   * D481: closed by what happened, not by an answer (its task finished or was replaced, a loop card
   * whose moment passed): by "ended", never forwarded, no attention flip. False when it wasn't open.
   */
  close(decisionId: string): boolean;
  stop(): void;
}

export const DEFAULT_DELAY_MS = 30 * 60 * 1000;

/**
 * D284: who an answer's forward is from: a reply is the person's own words ("user"); a Go (and
 * a key given or refused) is Ducter relaying their press in its own words ("ducter"), which the
 * task's page draws as a quiet chip, never as the person's bubble.
 */
export function forwardFrom(r: Bodies["decision_resolved"]): "user" | "ducter" {
  return r.option === "reply" ? "user" : "ducter";
}


/**
 * D499: a task's plain question, the only kind Ducter may answer for the person: no card of its own
 * kind (a payment, a checkout, a key, a sign-in, a fill, a phone or computer tap, a lent phone, where it
 * runs, a message to another agent, a call), nothing another AI still flagged in what it sends, and a
 * Go that deletes nothing (D340). The floor (D61 GQ5) is these kinds; none of them ever goes for them.
 */
export function plainAsk(d: Bodies["decision"]): boolean {
  if (!d.taskId) return false;
  if (d.pay || d.checkout || d.key || d.copyKey || d.signIn || d.deviceSignIn || d.signInWhere || d.fill || d.phone || d.computer || d.handset || d.where || d.relay || d.call || d.anywhere) return false;
  if (d.routineId || d.forApp || d.loop || d.board || d.memPlugin || d.src || d.saying || d.findId || d.cal || d.closing || d.offer || d.draft || d.asker || d.trust || d.sender) return false;
  if (d.look?.left.length) return false;
  return !destructiveChoice(d.question, d.goLabel);
}

export function forwardText(d: Bodies["decision"], r: Bodies["decision_resolved"]): string {
  // D499: answered for the person by their own word: the task goes, and learns not to ask about it again.
  if (r.option === "go" && r.by === "said" && r.action)
    return `Go: ${d.goLabel}. Ducter answered this for the user: they already allowed ${STEP_WORDS[r.action]} ("${(r.said ?? "").slice(0, 200)}"). From now on in this task, do that without asking and say it in your report; anything else that reaches other people still asks.`;
  // D151: the user signed in themselves in the live view; the task checks the page again.
  // D157: where it runs is the runner's to change (it re-places the task); the task hears nothing.
  if (d.where) return "";
  // D505 (rev.): where a sign-in happens: Go moves the task (its first turn there says why), Hold puts the
  // sign-in card up where it is; either way the next thing the task hears comes from that.
  if (d.signInWhere) return "";
  // D448: a task's message to another agent: the partner tells the task what came of it.
  if (d.relay) return "";
  // D233: the task got the answer in the call it was waiting in; nothing to send again.
  if (r.delivered) return "";
  // D599: a one-time-code sign-in: signed in (Ducter's check saw it), the person's word that they
  // approved it, or a new code asked for once it ran out; 先不用 is a wait, as any Hold.
  if (d.deviceSignIn) {
    if (r.signedIn) return deviceSignedInText(d.deviceSignIn.service);
    if (r.option === "go") return codeExpired(d.deviceSignIn, Date.now()) ? deviceNewCodeText(d.deviceSignIn.service) : deviceSaidInText(d.deviceSignIn.service);
    if (r.option === "hold") return "";
  }
  // D238: the phone answers that one itself (handset/index.ts tells the task once it is on, or why not).
  if (d.handset) return "";
  // D539: copied to its computer (its ask_for_key now gives it at once), or not.
  if (d.copyKey) return r.option === "go" ? `The person copied ${d.copyKey.env} (${d.copyKey.name}) to this computer for you. Call ask_for_key for ${d.copyKey.env} again now: it comes at once. Carry on with the work that needed it.` : r.option === "hold" ? `The person chose not to copy ${d.copyKey.env} here. Don't ask for it again in this task; carry on with what you can do without it, and say in your report what is left undone and why.` : "";
  // D233: a key given (it is in the task's key file now) or refused; both resume the task.
  if (d.key) return r.option === "go" ? keyReadyText(d.key, true) : r.option === "hold" ? keyRefusedText(d.key) : "";
  // D436: the errand's stop. 付好了 is the person's word that they paid, not something the task saw.
  if (r.option === "go" && d.checkout)
    return `The user says they paid on ${d.checkout.site} themselves, in a live view of your tab (you saw nothing of it; you never press pay). browser_read the page now: if it shows the order went through, report done with what the site confirmed (the order number, what, when, the total) and attach the page as evidence. If it shows it wasn't paid (still the checkout, an error), say so in one line and report needs_input; never press pay yourself.`;
  if (r.option === "hold" && d.checkout)
    return `The user isn't buying now (先不买 / Not now). Leave the cart and the page as they are, press nothing, and report done in one line: it stopped at the checkout on ${d.checkout.site} and the cart is kept.`;
  if (r.option === "go" && d.signIn?.step)
    return `The user says they did the step on ${d.signIn.site} themselves (${d.signIn.step.slice(0, 120)}); you saw nothing of it. browser_read the page to check, then carry on.`;
  if (r.option === "go" && d.signIn)
    return `The user says they're signed in to ${d.signIn.site} in Ducter's browser (they did it themselves; you saw nothing of it). browser_read the page to check, then carry on.`;
  // D191: a payment Go, or the OK for a saved thing's first use on a site.
  if (r.option === "go" && d.pay)
    return `The user said Go: pay ${d.pay.currency} ${d.pay.amount} at ${d.pay.site} with ${d.pay.card}. Within 15 minutes, fill the card with browser_fill (use "${d.pay.handle}": number, exp, cvc, name as the form asks), place the order once, then report what the site confirmed (its order number).`;
  // D228: Go on creating the tunnel in the person's Cloudflare account (the setup task asked it).
  if (r.option === "go" && d.anywhere) return `The user said Go: create the tunnel in their Cloudflare account and point ${d.anywhere.hostname} at this computer. Run the create step again now with --hostname ${d.anywhere.hostname}, then the run step.`;
  if (r.option === "go" && d.fill) return `The user said OK to use ${d.fill.label} on ${d.fill.site}. Call browser_fill again now.`;
  // D253: the person's own step on a phone: their Done is what they said, not what the task saw.
  if (r.option === "go" && d.phone?.kind === "user")
    return `The user says they're done on the phone (${d.question.slice(0, 160)}). That is their word, not something you saw: phone_look first and check it really happened (the right app and screen; for a recording, that it is running or saved) before you go on. If it didn't, say what you see in one line and ask again.`;
  if (r.option === "go") return `User says Go: ${d.goLabel}.`;
  // Hold is not forwarded: the task already ended its turn waiting, and a "pause" turn would
  // only flip it back to working and earn a nudge. The card shows Waiting (Hold).
  if (r.option === "hold") return "";
  return r.text ?? "";
}

const newId = () => "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);

/** done? -> done by the mechanical check alone: a ref Ducter verified, and none it found missing. */
export function evidenceHolds(evidence: EvidenceRef[]): boolean {
  return evidence.some((e) => e.check === "verified") && !evidence.some((e) => e.check === "missing");
}

/** The partner may confirm a done claim in its result: nothing Ducter checked came back missing. */
export function evidenceConfirmable(evidence: EvidenceRef[]): boolean {
  return !evidence.some((e) => e.check === "missing");
}

export function createDecisions(opts: {
  log: LogStore;
  tasks: CoreRegistry;
  clock?: Clock;
  defaultDelayMs?: number;
  /** The user's setting (D71), read when a decision is asked; defaultDelayMs (env, tests) wins. */
  delayMs?: () => number;
  onDecision?: DecisionHook;
  /** A task whose done reports don't finish it (a keep-going loop that is still on, D113). */
  holds?: (taskId: string) => boolean;
  /** D279: a task resting on a wait of its own: a progress report leaves it on Waiting. */
  rests?: (taskId: string) => boolean;
  /** D427: a task in rounds: a round's done or failed report ends the round, never the task. */
  keeps?: (taskId: string) => boolean;
}): Decisions {
  const { log, tasks } = opts;
  const clock = opts.clock ?? realClock;
  const delay = () => opts.defaultDelayMs ?? opts.delayMs?.() ?? DEFAULT_DELAY_MS;
  let hook: DecisionHook | undefined = opts.onDecision;
  const all = new Map<string, Bodies["decision"]>();
  const resolved = new Set<string>();
  const silent = new Set<string>(); // resolutions that must not be forwarded
  const timers = new Map<string, unknown>();
  // D382: questions put off (until, ms), their wake timers, a countdown restarted on return, and
  // when each was asked (for the countdown's length).
  const laterAt = new Map<string, number>();
  const wakes = new Map<string, unknown>();
  const restarted = new Map<string, string>();
  const askedTs = new Map<string, number>();
  // D382: back at its time and not yet seen: the seq of its return. Its countdown waits for the
  // first read past that seq (the conversation seen on any client), then runs its first length.
  const unseen = new Map<string, number>();
  let readTo = 0;
  // D481: each question's own events (its decision, later/back/seen, its resolution) by seq, and its resolution.
  const seqs = new Map<string, number[]>();
  const answers = new Map<string, Bodies["decision_resolved"]>();
  const note = (id: string, seq: number) => {
    const l = seqs.get(id);
    if (!l) return void seqs.set(id, [seq]);
    if (!l.includes(seq)) l.push(seq);
  };

  const setAttention = (taskId: string, attention: Attention, reason?: string) => {
    const c = tasks.get(taskId);
    if (!c || (c.attention === attention && (reason === undefined || c.reason === reason))) return;
    tasks.setState(taskId, attention, c.residency, reason);
  };
  // Report reactions run after the current dispatch, so they reconcile with whatever the
  // report_to_main handler (runner) set right after appending, instead of racing it.
  const later = (fn: () => void) =>
    queueMicrotask(() => {
      try {
        fn();
      } catch (err) {
        console.error("[decisions] report reaction failed:", err);
      }
    });

  // A dropped task's open question stays open (Undo brings it back as it was), but nothing acts
  // on it meanwhile: soak, answering it flipped the dropped task to "working" and the restart
  // after that ran it again.
  const dropped = (taskId: string | undefined) => !!taskId && tasks.get(taskId)?.attention === "dropped";

  const schedule = (d0: Bodies["decision"]) => {
    const r = restarted.get(d0.decisionId);
    const d = r ? { ...d0, defaultAt: r } : d0;
    if (!d.reversible || !d.defaultAt) return;
    if (laterAt.has(d.decisionId)) return; // D382: put off: its countdown waits until it is back
    if (unseen.has(d.decisionId)) return; // D382: back but not seen yet: no default on a card nobody saw
    // D340: a card whose Go deletes something never goes by itself, whoever made it.
    if (d.defaultOption === "go" && destructiveChoice(d.question, d.goLabel)) return;
    const ms = Date.parse(d.defaultAt) - clock.now();
    const fire = () => {
      timers.delete(d.decisionId);
      if (resolved.has(d.decisionId)) return;
      if (dropped(d.taskId)) return; // no default for a dropped task; it waits for Undo

      log.append({
        stream: "channel",
        origin: "system",
        kind: "decision_resolved",
        body: { decisionId: d.decisionId, option: d.defaultOption, by: "default" },
      });
    };
    timers.set(d.decisionId, clock.setTimeout(fire, Math.max(0, ms)));
  };

  /** A task's language: what its brief was written for, else its question's own. */
  const langOf = (taskId: string, text: string): LangTag | undefined => {
    const open = log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as Bodies["task_open"] | undefined;
    return open?.language ?? detect(text)?.lang;
  };
  const onReport = (r: Bodies["report"]) => {
    let blocking = r.questions.filter((q) => q.blocking && q.text.trim());
    if (r.state === "needs_input" && !blocking.length) blocking = r.questions.filter((q) => q.text.trim());
    if (r.state === "needs_input" || blocking.length) {
      const qs: Question[] = blocking.length ? blocking : [{ id: "q", text: r.summary, blocking: true, reversible: false }];
      for (const q of qs) {
        // D340: a task's question whose Go would delete or wipe something has no default: it waits.
        const named = !!q.default?.trim();
        const hasDefault = named && !destructiveChoice(q.text, q.default);
        const body: Bodies["decision"] = {
          decisionId: newId(),
          taskId: r.taskId,
          question: q.text,
          goLabel: named ? q.default!.trim() : words(GO_PLAIN, langOf(r.taskId, q.text)),
          defaultOption: hasDefault ? "go" : "hold",
          reversible: q.reversible,
          ...(q.signIn ? { signIn: q.signIn } : {}),
          ...(q.pay ? { pay: q.pay, goLabel: "Pay", defaultOption: "hold" as const } : {}),
          // D436: the checkout stop: Go is the person's 付好了 / I've paid; no default, ever.
          ...(q.checkout ? { checkout: q.checkout, goLabel: "I've paid", defaultOption: "hold" as const, reversible: false } : {}),
          ...(q.fill ? { fill: q.fill } : {}),
          // D233: a key: no default ever; Go carries the value, Hold is 不给 / Don't give.
          ...(q.key ? { key: q.key, goLabel: "Save and continue", defaultOption: "hold" as const } : {}),
          // D539: copy a key from another of the person's computers: no default ever; only their own Go copies.
          ...(q.copyKey ? { copyKey: q.copyKey, goLabel: "Copy", holdLabel: "Not now", defaultOption: "hold" as const, reversible: false } : {}),
          // D217: a commit on Ducter's phone has no default (Go taps it once); the user's turn on it is Done.
          ...(q.phone ? { phone: q.phone, ...(q.phone.kind === "go" ? { goLabel: "Go", defaultOption: "hold" as const } : { goLabel: "Done", defaultOption: "hold" as const }) } : {}),
          // D235: the same in the person's apps: Go does that one action; their own turn is Done.
          ...(q.computer ? { computer: q.computer, ...(q.computer.kind === "go" ? { goLabel: "Go", defaultOption: "hold" as const } : { goLabel: "Done", defaultOption: "hold" as const }) } : {}),
          ...(q.where ? { where: q.where } : {}),
          // D505 (rev.): the card's words are its code's (Go 换过去 / Move it there, Hold 我在这里登录 / I'll sign
          // in here); unanswered it waits, no countdown (reversible, a Hold default with no time).
          // D599: a one-time-code sign-in: no default, never on its own; Go is only the new code once it ran out.
          ...(q.deviceSignIn ? { deviceSignIn: q.deviceSignIn, goLabel: "Get a new code", defaultOption: "hold" as const, reversible: false } : {}),
          ...(q.signInWhere ? { signInWhere: { site: q.signInWhere.site, url: q.signInWhere.url, to: q.signInWhere.to }, goLabel: q.default?.trim() || "Move it there", defaultOption: "hold" as const, reversible: true, ...(q.signInWhere.hold ? { holdLabel: q.signInWhere.hold } : {}) } : {}),
          // D238: may it use the person's own phone now: no default ever (silence never lends a phone).
          ...(q.handset ? { handset: q.handset, goLabel: "Go", defaultOption: "hold" as const } : {}),
          // D437: what another AI still found in what this Go sends: said on the card, plainly.
          ...(r.look?.left.length ? { look: { by: r.look.by, left: r.look.left } } : {}),
          // D587: a direct done's own ask: nobody relays it, its card says it.
          ...(r.direct && r.state === "done" ? { direct: true as const } : {}),
        };
        if (q.reversible && hasDefault && !q.deviceSignIn) body.defaultAt = new Date(clock.now() + delay()).toISOString();
        log.append({ stream: "channel", origin: "system", kind: "decision", body });
      }
      later(() => setAttention(r.taskId, "needs_you"));
      return;
    }
    later(() => {
      switch (r.state) {
        case "blocked":
          return setAttention(r.taskId, "blocked", r.summary.slice(0, 120));
        case "failed":
          // D427: a failed round of a loop: the next round still comes (the keeper counts it).
          if (opts.keeps?.(r.taskId)) return setAttention(r.taskId, opts.rests?.(r.taskId) ? "blocked" : "working");
          return setAttention(r.taskId, "failed", r.summary.slice(0, 120));
        case "progress":
          // D279: a progress report written after it armed its own wait (a loop's "back at
          // 21:59") doesn't put it back on Working; the wake does.
          if (opts.rests?.(r.taskId) && tasks.get(r.taskId)?.attention === "blocked") return;
          return setAttention(r.taskId, "working");
        case "done":
          // A try of a keep-going loop (D113): the loop decides when it is done, not the try.
          if (opts.holds?.(r.taskId)) return setAttention(r.taskId, "working");
          // D427: a round of a loop is done, not the loop (hel, round 185: its "done" ended the review loop).
          if (opts.keeps?.(r.taskId)) return setAttention(r.taskId, opts.rests?.(r.taskId) ? "blocked" : "working");
          // C checks evidence mechanically (the runner set each ref's `check` before the report
          // was logged): a ref verified and none missing -> done. Otherwise it stays "Done ·
          // checking" until the partner confirms it in its result (evidenceConfirmable).
          return setAttention(r.taskId, evidenceHolds(r.evidence) ? "done" : "done_claimed");
      }
    });
  };

  const onResolved = (r: Bodies["decision_resolved"]) => {
    resolved.add(r.decisionId);
    const t = timers.get(r.decisionId);
    if (t !== undefined) clock.clearTimeout(t), timers.delete(r.decisionId);
    clearWake(r.decisionId);
    laterAt.delete(r.decisionId);
    unseen.delete(r.decisionId);
    const d = all.get(r.decisionId);
    if (!d) return;
    // D481: closed by what happened (its task ended): nothing to forward, no card to move.
    // D599: a one-time-code sign-in that went through is closed by what happened too, and its task goes on.
    if (r.by === "ended" && !r.signedIn) return void silent.delete(r.decisionId);
    // A partner-level decision (the partner's own ask, no task): resolving it only wakes the
    // partner (decision_resolved is a trigger); nothing to forward, no card to move.
    if (!d.taskId) return;
    const taskId = d.taskId;
    if (dropped(taskId)) return; // resolved (e.g. by a direct message) while dropped: no turn, no flip
    // D448: a task's message to another agent: the partner carries it out, tells the task, and says
    // where the task stands (waiting for the answer, or at work again); nothing to flip or forward here.
    if (d.relay) return;
    const left = tasks.pendingDecisions(taskId).filter((id) => id !== r.decisionId && !resolved.has(id));
    if (left.length && left.every((id) => laterAt.has(id))) setAttention(taskId, "blocked"); // D382: only put-off ones left
    // D585: closed by the person's words in the task: the runner sets it working as their turn starts
    // (and back to where it stood if that turn owes nothing), so the card is not moved here.
    else if (!left.length && !r.inTask) {
      // D233: 不给 / Don't give on a key is an answer the task carries on with, not a wait.
      if (r.option === "hold" && !d.key && !d.copyKey && !d.checkout) setAttention(taskId, "blocked"); // no reason text: the card shows Waiting (D436: 先不买 is an answer it finishes on)
      else setAttention(taskId, "working");
    }
    const text = silent.delete(r.decisionId) ? "" : forwardText(d, r);
    if (hook && text) {
      Promise.resolve()
        .then(() => hook!(taskId, text, r))
        .catch((err) => console.error(`[decisions] forwarding ${r.decisionId} to ${taskId} failed:`, err));
    }
  };

  // ---------- D382: 晚点再问我 / Ask me later ----------
  const clearWake = (id: string) => {
    const w = wakes.get(id);
    if (w !== undefined) clock.clearTimeout(w), wakes.delete(id);
  };
  /** At its time it comes back (a restart past its time brings it back at once). */
  const armWake = (id: string) => {
    clearWake(id);
    const until = laterAt.get(id);
    if (until === undefined) return;
    const MAX = 2 ** 31 - 1;
    const hop = () => {
      const ms = until - clock.now();
      if (ms > 1000) return void wakes.set(id, clock.setTimeout(hop, Math.min(ms, MAX)));
      wakes.delete(id);
      if (!laterAt.has(id) || resolved.has(id)) return;
      back(id, "time");
    };
    hop();
  };
  /** Its countdown again, as long as it was first given (no countdown, none). */
  const restartAt = (id: string): string | undefined => {
    const d = all.get(id);
    if (!d?.reversible || !d.defaultAt) return undefined;
    const asked = askedTs.get(id);
    const len = asked !== undefined && Number.isFinite(asked) ? Math.max(60_000, Date.parse(d.defaultAt) - asked) : delay();
    return new Date(clock.now() + len).toISOString();
  };
  // Brought back by the person (Decide now), it is in front of them: its countdown runs at once.
  // Back at its time, it runs from when it is first seen (seen() below).
  const back = (id: string, by: "time" | "user") => {
    const defaultAt = by === "user" ? restartAt(id) : undefined;
    log.append({ stream: "channel", origin: by === "user" ? "user" : "system", kind: "decision_back", body: { decisionId: id, by, ...(defaultAt ? { defaultAt } : {}) } });
  };
  /** Its countdown, once it needs one, from the first read past its return. */
  const counts = (id: string) => {
    const d = all.get(id);
    return !!d?.reversible && !!d.defaultAt;
  };
  const seen = () => {
    for (const [id, seq] of [...unseen]) {
      if (readTo < seq) continue;
      unseen.delete(id);
      if (resolved.has(id) || laterAt.has(id)) continue;
      const defaultAt = restartAt(id);
      if (defaultAt) log.append({ stream: "channel", origin: "system", kind: "decision_seen", body: { decisionId: id, defaultAt } });
    }
  };
  const onLater = (b: Bodies["decision_later"]) => {
    if (resolved.has(b.decisionId)) return;
    unseen.delete(b.decisionId);
    laterAt.set(b.decisionId, Date.parse(b.until));
    const t = timers.get(b.decisionId);
    if (t !== undefined) clock.clearTimeout(t), timers.delete(b.decisionId);
    armWake(b.decisionId);
    const taskId = all.get(b.decisionId)?.taskId;
    if (!taskId || dropped(taskId)) return;
    // Out of Needs you unless something else of this task still asks now.
    const open = tasks.pendingDecisions(taskId).filter((id) => !resolved.has(id) && !laterAt.has(id));
    if (!open.length) setAttention(taskId, "blocked");
  };
  const onBack = (b: Bodies["decision_back"], seq: number) => {
    clearWake(b.decisionId);
    laterAt.delete(b.decisionId);
    if (resolved.has(b.decisionId)) return;
    if (b.defaultAt) restarted.set(b.decisionId, b.defaultAt);
    else if (counts(b.decisionId)) unseen.set(b.decisionId, seq);
    const d = all.get(b.decisionId);
    if (d) schedule(d);
    if (d?.taskId && !dropped(d.taskId)) setAttention(d.taskId, "needs_you");
  };

  // Rebuild from the Log (no side effects for history), then re-arm pending defaults.
  const askedAt = new Map<string, number>(); // decisionId -> seq of the decision event
  const lastAnswer = new Map<string, LogEvent<"decision_resolved">>(); // taskId -> its latest resolution
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["decision", "decision_resolved", "decision_later", "decision_back", "decision_seen", "read_receipt"] })) {
    if (e.kind === "read_receipt") {
      readTo = Math.max(readTo, (e.body as Bodies["read_receipt"]).upToSeq);
      continue;
    }
    note((e.body as { decisionId: string }).decisionId, e.seq);
    if (e.kind === "decision_resolved") answers.set((e.body as Bodies["decision_resolved"]).decisionId, e.body as Bodies["decision_resolved"]);
    if (e.kind === "decision_seen") {
      const b = e.body as Bodies["decision_seen"];
      unseen.delete(b.decisionId);
      restarted.set(b.decisionId, b.defaultAt);
      continue;
    }
    if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      all.set(d.decisionId, d);
      askedAt.set(d.decisionId, e.seq);
      askedTs.set(d.decisionId, Date.parse(e.ts));
    } else if (e.kind === "decision_later") {
      const b = e.body as Bodies["decision_later"];
      laterAt.set(b.decisionId, Date.parse(b.until));
    } else if (e.kind === "decision_back") {
      const b = e.body as Bodies["decision_back"];
      laterAt.delete(b.decisionId);
      if (b.defaultAt) restarted.set(b.decisionId, b.defaultAt);
      else if (counts(b.decisionId)) unseen.set(b.decisionId, e.seq);
    } else {
      const r = e.body as Bodies["decision_resolved"];
      resolved.add(r.decisionId);
      const taskId = all.get(r.decisionId)?.taskId;
      if (taskId) lastAnswer.set(taskId, e as LogEvent<"decision_resolved">);
    }
  }
  for (const id of [...laterAt.keys()]) if (resolved.has(id)) laterAt.delete(id);
  for (const id of [...unseen.keys()]) if (resolved.has(id) || laterAt.has(id)) unseen.delete(id);
  for (const d of all.values()) if (!resolved.has(d.decisionId)) schedule(d);

  // Answers the process died before handing to their task: the latest resolution of a task
  // whose forward text never shows up as task input after the question was asked. The runner
  // logs every input before delivering it, and a task answered by message (silent) has that
  // message as input, so both count as handed over.
  const unforwarded: { taskId: string; text: string; decisionId: string; from: "user" | "ducter" }[] = [];
  for (const [taskId, e] of lastAnswer) {
    const d = all.get(e.body.decisionId)!;
    const text = forwardText(d, e.body);
    if (!text || tasks.get(taskId)?.attention === "dropped") continue;
    // It asked something newer since: it got past this one.
    if ([...all.values()].some((x) => x.taskId === taskId && (askedAt.get(x.decisionId) ?? 0) > e.seq)) continue;
    const after = askedAt.get(d.decisionId) ?? 0;
    const inputs = log.read({ stream: `task:${taskId}`, fromSeq: after + 1, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_event"] });
    const handed = inputs.some((x) => {
      const b = x.body as Bodies["task_event"];
      return b.role === "user" && (b.text === text || (e.body.option === "reply" && b.text === e.body.text));
    });
    if (!handed) unforwarded.push({ taskId, text, decisionId: d.decisionId, from: forwardFrom(e.body) });
  }

  /** D481: a task that finished (done, or set aside for another) asks nothing any more. */
  const ENDS = new Set<Attention>(["done", "done_claimed", "superseded"]);
  const closeEnded = (taskId: string) => {
    for (const id of tasks.pendingDecisions(taskId)) if (all.has(id) && !resolved.has(id)) api.close(id);
  };

  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "decision" || e.kind === "decision_resolved" || e.kind === "decision_later" || e.kind === "decision_back" || e.kind === "decision_seen") note((e.body as { decisionId: string }).decisionId, e.seq);
    if (e.kind === "decision_resolved") answers.set((e.body as Bodies["decision_resolved"]).decisionId, e.body as Bodies["decision_resolved"]);
    if (e.kind === "task_state" && ENDS.has((e.body as Bodies["task_state"]).attention)) {
      const taskId = (e.body as Bodies["task_state"]).taskId;
      queueMicrotask(() => ENDS.has(tasks.get(taskId)?.attention as Attention) && closeEnded(taskId));
    }
    if (e.kind === "report") onReport(e.body as Bodies["report"]);
    else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      all.set(d.decisionId, d);
      askedTs.set(d.decisionId, Date.parse(e.ts));
      schedule(d);
    } else if (e.kind === "decision_later") onLater(e.body as Bodies["decision_later"]);
    else if (e.kind === "decision_back") onBack(e.body as Bodies["decision_back"], e.seq);
    else if (e.kind === "decision_seen") {
      const b = e.body as Bodies["decision_seen"];
      restarted.set(b.decisionId, b.defaultAt);
      const d = all.get(b.decisionId);
      if (d && !resolved.has(b.decisionId)) schedule(d);
    } else if (e.kind === "read_receipt") {
      readTo = Math.max(readTo, (e.body as Bodies["read_receipt"]).upToSeq);
      if (unseen.size) seen();
    } else if (e.kind === "decision_resolved") onResolved(e.body as Bodies["decision_resolved"]);
    else if (e.kind === "task_event") {
      // The partner answering a task with task_send (the runner logs it first, from "partner").
      // Decision forwards are logged from "user"; the user's own task_send goes through ws.
      const b = e.body as Bodies["task_event"];
      if (b.role === "user" && b.from === "partner" && b.text) api.answeredByMessage(b.taskId, b.text, "partner");
    }
  });

  // D382: put-off questions wait for their time again (one past it while down comes back now).
  queueMicrotask(() => {
    for (const id of [...laterAt.keys()]) armWake(id);
    seen(); // read past its return while down (the countdown was never logged): it runs from now
    // D481: a task that finished with a question still open (before D481 nothing closed it): closed now.
    for (const d of all.values()) if (d.taskId && !resolved.has(d.decisionId) && ENDS.has(tasks.get(d.taskId)?.attention as Attention)) api.close(d.decisionId);
  });

  const api: Decisions = {
    answeredByMessage(taskId, text, by) {
      for (const id of tasks.pendingDecisions(taskId)) {
        if (resolved.has(id) || !all.has(id)) continue;
        // D233: a key is never answered by a message (a key never goes through the conversation):
        // its card stays until the person gives it or says no.
        if (all.get(id)!.key || all.get(id)!.copyKey) continue;
        silent.add(id);
        log.append({
          stream: "channel",
          origin: by,
          kind: "decision_resolved",
          body: { decisionId: id, option: "reply", text: hideMemSecrets(text.slice(0, 2000)).text, by: "user", ...(by === "user" ? { inTask: true as const } : {}) },
        });
      }
    },
    goOnTheirWord(decisionId, w) {
      const d = all.get(decisionId);
      if (!d) throw new Error(`unknown decision ${decisionId}`);
      if (resolved.has(decisionId)) throw new Error("That was answered already.");
      if (!plainAsk(d)) throw new Error("Only a task's plain question can be answered for the user.");
      if (dropped(d.taskId)) throw new Error("That task was dropped.");
      return log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId, option: "go", by: "said", said: w.said.slice(0, 400), action: w.action, standing: w.standing } });
    },
    decide(decisionId, option, text, extra) {
      if (!all.has(decisionId)) throw new Error(`unknown decision ${decisionId}`);
      if (resolved.has(decisionId)) throw new Error(`decision ${decisionId} is already resolved`);
      if (option === "reply" && !text?.trim()) throw new Error("reply needs text");
      if (dropped(all.get(decisionId)!.taskId)) throw new Error("That task was dropped. Undo the drop first, then answer.");
      // D539: a copy card's Go is the person's tap on that card, after the copy ran (key-copy.ts): never another path.
      if (option === "go" && all.get(decisionId)!.copyKey && !extra?.copied) throw new Error("a copy card is answered on the card itself");
      const body: Bodies["decision_resolved"] = { decisionId, option, by: "user" };
      // D597: a Mem connect link or key typed into a reply never reaches the task or the Log.
      if (text) body.text = hideMemSecrets(text).text;
      if (extra?.delivered) body.delivered = true;
      if (extra?.msgSeq) body.msgSeq = extra.msgSeq;
      return log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body });
    },
    later(decisionId, until) {
      const d = all.get(decisionId);
      if (!d) throw new Error(`unknown decision ${decisionId}`);
      if (resolved.has(decisionId)) throw new Error("That was answered already.");
      if (dropped(d.taskId)) throw new Error("That task was dropped. Undo the drop first, then answer.");
      if (until === null) {
        if (laterAt.has(decisionId)) back(decisionId, "user");
        return; // else it is here already
      }
      if (!laterable(d)) throw new Error("This one can't wait for later: answer it now.");
      const why = laterRefusal(until, clock.now());
      if (why === "past") throw new Error("Pick a time a little later than now.");
      if (why === "far") throw new Error("Pick a time within the next 30 days.");
      log.append({ stream: "channel", origin: "user", kind: "decision_later", body: { decisionId, until: new Date(until).toISOString(), by: "user" } });
    },
    laterUntil: (id) => (resolved.has(id) ? undefined : laterAt.get(id)),
    takeUnforwarded: () => unforwarded.splice(0),
    openIds: () => [...all.keys()].filter((id) => !resolved.has(id)),
    seqsOf: (id) => [...(seqs.get(id) ?? [])].sort((a, b) => a - b),
    resolution: (id) => answers.get(id),
    close(decisionId) {
      if (!all.has(decisionId) || resolved.has(decisionId)) return false;
      silent.add(decisionId);
      log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId, option: "hold", by: "ended", settled: true } });
      return true;
    },
    get: (id) => all.get(id),
    isPending: (id) => all.has(id) && !resolved.has(id),
    pendingOf: (taskId) => tasks.pendingDecisions(taskId).filter((id) => all.has(id) && !resolved.has(id)),
    setHook: (fn) => void (hook = fn),
    stop() {
      unsubscribe();
      for (const t of timers.values()) clock.clearTimeout(t);
      timers.clear();
      for (const w of wakes.values()) clock.clearTimeout(w);
      wakes.clear();
    },
  };
  return api;
}
