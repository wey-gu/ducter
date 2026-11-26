// D599: 用一次性码登录 / Sign in with a one-time code (design/device-signin.md). A task whose sign-in
// command printed a page and a code calls sign_in_with_code; the runner also gives a needs_input
// question that holds a known CLI's page and code this shape (runner tools.ts). The card carries the
// page, the code and when it runs out. While it waits, Ducter runs that CLI's own status command where
// the task runs (its computer, its folder; checks.ts allows only the reading form) every few seconds;
// when it says signed in, the card settles (已登录 GitHub / Signed in to GitHub) and the task goes on:
// in the call it is waiting in, or told so. A CLI Ducter can't check is settled by the task's own word
// (signed_in true) after its command ends (D515 wakes it then). Nobody replies 「已授权」.
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { MCP_CALL_WAIT } from "@ducter/protocol/src/harness-facts.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import type { CheckSpec } from "@ducter/protocol";
import { cliOf, codeExpired, DEVICE_CHECK_MS, DEVICE_CODE_MINUTES, deviceSignedInText, pageOf, serviceName, statusCheck, type DeviceSignInAsk } from "@ducter/protocol/src/device-signin.ts";
import { describeCheck } from "@ducter/protocol/src/checks.ts";
import type { CoreMcpHub, Ctx } from "./mcp.ts";
import type { Decisions } from "./decisions.ts";
import type { CoreRegistry } from "./registry.ts";

export interface DeviceSignIn {
  /** Runs one look now for every waiting card (tests). */
  lookNow(): Promise<void>;
  stop(): void;
}

const CODE_OK = /^[A-Za-z0-9-]{4,24}$/;

export function createDeviceSignIn(o: {
  log: LogStore;
  mcp: CoreMcpHub;
  decisions: Decisions;
  tasks: CoreRegistry;
  /** One check where the task runs (work.look). */
  look: (spec: CheckSpec, taskId: string) => Promise<CheckResult>;
  /** How long one call waits (tests); default per harness (MCP_CALL_WAIT). */
  waitMs?: (harness: string) => number;
  everyMs?: number;
  now?: () => number;
}): DeviceSignIn {
  const { log, decisions, tasks } = o;
  const now = o.now ?? Date.now;
  const every = o.everyMs ?? DEVICE_CHECK_MS;
  const waitFor = o.waitMs ?? ((h: string) => MCP_CALL_WAIT[h as HarnessId]?.value ?? 50_000);
  // A call waiting on its task's sign-in, by task: the news comes back in it.
  const waiters = new Map<string, (text: string) => void>();
  // Cards being looked at, by decision.
  const watched = new Map<string, { taskId: string; ask: DeviceSignInAsk; timer?: ReturnType<typeof setTimeout>; busy?: boolean }>();
  let stopped = false;

  const openCard = (taskId: string) => tasks.pendingDecisions(taskId).find((id) => decisions.isPending(id) && !!decisions.get(id)?.deviceSignIn);

  /** Signed in: the card settles, the task hears it (in its waiting call, or as a message from core). */
  const settle = (decisionId: string, told = false) => {
    const d = decisions.get(decisionId);
    if (!d?.deviceSignIn || !d.taskId || !decisions.isPending(decisionId)) return;
    const w = waiters.get(d.taskId);
    unwatch(decisionId);
    log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId, option: "go", by: "ended", settled: true, signedIn: true, ...(w || told ? { delivered: true } : {}) } });
    w?.(deviceSignedInText(d.deviceSignIn.service));
  };

  const unwatch = (id: string) => {
    const w = watched.get(id);
    if (w?.timer) clearTimeout(w.timer);
    watched.delete(id);
  };

  const lookOnce = async (id: string) => {
    const w = watched.get(id);
    if (!w || w.busy || stopped) return;
    if (!decisions.isPending(id) || codeExpired(w.ask, now())) return unwatch(id);
    w.busy = true;
    const r = await o.look(statusCheck(w.ask.cli!), w.taskId).catch(() => undefined);
    w.busy = false;
    if (watched.get(id) !== w) return;
    if (r?.ok && r.met) return settle(id);
  };

  const schedule = (id: string) => {
    const w = watched.get(id);
    if (!w || stopped) return;
    w.timer = setTimeout(async () => {
      await lookOnce(id);
      schedule(id);
    }, every);
  };

  const watch = (d: Bodies["decision"]) => {
    if (!d.deviceSignIn?.cli || !d.taskId || watched.has(d.decisionId) || !decisions.isPending(d.decisionId) || codeExpired(d.deviceSignIn, now())) return;
    watched.set(d.decisionId, { taskId: d.taskId, ask: d.deviceSignIn });
    schedule(d.decisionId);
  };

  const unsubscribe = log.subscribe((e: LogEvent) => {
    if (e.kind === "decision") watch(e.body as Bodies["decision"]);
    else if (e.kind === "decision_resolved") unwatch((e.body as Bodies["decision_resolved"]).decisionId);
  });
  // After a restart: the cards still waiting are looked at again.
  queueMicrotask(() => {
    for (const id of decisions.openIds()) {
      const d = decisions.get(id);
      if (d) watch(d);
    }
  });

  const waitText = (a: DeviceSignInAsk) =>
    `The person has a card with ${a.service}'s page${a.code ? " and the code" : ""}: Open and Copy are on it. End your turn now and leave your sign-in command running. ` +
    (a.cli
      ? `Ducter runs \`${describeCheck(statusCheck(a.cli))}\` where you run and resumes you the moment it says signed in. `
      : `When your sign-in command ends you're woken: check with its own status command, then call sign_in_with_code with signed_in true (the card closes) and carry on. `) +
    `Don't write the page or the code in a reply or a question, and don't ask the person to say they did it. If the code runs out, don't start a new one yourself: the card offers them a new code, and you're told if they ask for it.`;

  const wait = (taskId: string, a: DeviceSignInAsk, ms: number) =>
    new Promise<string>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (text: string) => {
        clearTimeout(timer);
        if (waiters.get(taskId) === done) waiters.delete(taskId);
        resolve(text);
      };
      waiters.get(taskId)?.(waitText(a));
      waiters.set(taskId, done);
      timer = setTimeout(() => done(waitText(a)), Math.max(0, ms));
    });

  o.mcp.registerWhen(
    "task",
    "sign_in_with_code",
    "When a sign-in command you run (gh auth login, codex login --device-auth, az login --use-device-code…) shows a page and a one-time code for the person, call this with them instead of writing them in words; keep the command running in the background. They get Open and Copy; Ducter sees when they're signed in and tells you. signed_in: your own check says signed in now.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "The page: https://github.com/login/device" },
        code: { type: "string", description: "The one-time code: 8694-B656" },
        service: { type: "string", description: "Who they sign in to: GitHub" },
        cli: { type: "string", description: "The command you ran: gh" },
        minutes: { type: "number", description: "How long the code works, if it says (default 15)" },
        signed_in: { type: "boolean" },
      },
    },
    async (args, ctx) => {
      const taskId = ctx.taskId!;
      const card = tasks.get(taskId);
      if (!card) throw new Error("this task isn't known to Ducter");
      if (args.signed_in === true) {
        const id = openCard(taskId);
        if (!id) return "Nothing was waiting on that sign-in. Carry on.";
        const service = decisions.get(id)!.deviceSignIn!.service;
        settle(id, true);
        return `The card now says the person is signed in to ${service}. Carry on.`;
      }
      const url = String(args.url ?? "").trim();
      let ok = false;
      try {
        ok = new URL(url).protocol === "https:" && url.length <= 500;
      } catch {
        ok = false;
      }
      if (!ok) throw new Error("url must be the https page the sign-in command printed");
      const code = String(args.code ?? "").trim();
      if (code && !CODE_OK.test(code)) throw new Error("code is the one-time code as printed (letters, digits and dashes)");
      const cli = cliOf(args.cli) ?? pageOf(url);
      const service = serviceName(args.service, cli, url);
      const minutes = Math.min(60, Math.max(1, Number(args.minutes) || DEVICE_CODE_MINUTES));
      const ask: DeviceSignInAsk = { service, url, ...(code ? { code } : {}), until: new Date(now() + minutes * 60_000).toISOString(), ...(cli ? { cli } : {}) };
      // A new code takes the old card's place.
      for (const id of tasks.pendingDecisions(taskId)) if (decisions.isPending(id) && decisions.get(id)?.deviceSignIn) decisions.close(id);
      const q = { id: "sign_in", text: code ? `Sign in to ${service}: open ${url} and enter ${code}.` : `Sign in to ${service}: open ${url}.`, blocking: true, reversible: false, deviceSignIn: ask };
      const body: Bodies["report"] = { taskId, state: "needs_input", summary: `Sign in to ${service}.`, questions: [q], evidence: [] };
      log.append({ persona: card.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
      tasks.setState(taskId, "needs_you", (card.residency as never) ?? "hot");
      return wait(taskId, ask, waitFor(card.harness));
    },
    (ctx: Ctx) => {
      const c = ctx.taskId ? tasks.get(ctx.taskId) : undefined;
      return !!c && c.place.kind !== "browser";
    },
  );

  return {
    async lookNow() {
      await Promise.all([...watched.keys()].map((id) => lookOnce(id)));
    },
    stop() {
      stopped = true;
      unsubscribe();
      for (const id of [...watched.keys()]) unwatch(id);
      for (const w of [...waiters.values()]) w("Ducter is restarting; the card stays. End your turn now; you'll be resumed when the person is signed in.");
      waiters.clear();
    },
  };
}
