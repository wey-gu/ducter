// HarnessPort over OAR. This is the ONLY module that imports OAR values, and it imports the
// per-runtime entries (never the root entry: ~50 MB heap, and it fails to load under Bun 1.3.1
// because runtimes/kimi imports node:util getSystemErrorMap). No OAR type crosses this file's
// exports: callers see only Ducter's HarnessPort / HarnessSession / HarnessEvent.
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import type { Runtime, Session, SessionOptions, McpServer } from "@botiverse/oar/browser";
import { Normalizer } from "./normalize.ts";

export type HarnessId = SessionSpec["harness"];

const OAR_ID: Record<HarnessId, string> = { "claude-code": "claude", codex: "codex", pi: "pi" };

/** Native features that compete with Ducter (it owns waits, wakes, and talking to the human). */
const DISALLOWED: Partial<Record<HarnessId, string[]>> = {
  "claude-code": ["EnterPlanMode", "ExitPlanMode", "ScheduleWakeup", "CronCreate", "CronList", "CronDelete", "AskUserQuestion"],
};

export type RuntimeLoader = (harness: HarnessId) => Promise<Runtime | undefined>;

/** Lazy per-runtime import. A failed load is retried next time, never cached. */
const defaultLoader: RuntimeLoader = async (harness) => {
  const cache = loaded.get(harness);
  if (cache) return cache;
  let rt: Runtime | undefined;
  switch (harness) {
    case "claude-code":
      rt = (await import("@botiverse/oar/runtimes/claude")).claudeRuntime as unknown as Runtime;
      break;
    case "codex":
      rt = (await import("@botiverse/oar/runtimes/codex")).codexRuntime as unknown as Runtime;
      break;
    case "pi": {
      const m: any = await import("@botiverse/oar/runtimes/pi");
      // In-process Pi re-enters the host; prefer one native RPC process per session.
      rt = (m.createPiRuntime ? m.createPiRuntime({ execution: "subprocess" }) : m.piRuntime) as Runtime;
      break;
    }
  }
  if (rt) loaded.set(harness, rt);
  return rt;
};
const loaded = new Map<HarnessId, Runtime>();

export interface OarPortOptions {
  /** Test seam: supply runtimes (e.g. @botiverse/oar/testing scriptedRuntime). */
  loadRuntime?: RuntimeLoader;
  /** Env overlay for every session/probe (e.g. captured login-shell env). Never logged. */
  env?: Record<string, string | null>;
  /** Bound retained records per session (OAR retainedBytes). */
  retainedBytes?: number;
}

export function createOarHarnessPort(opts: OarPortOptions = {}): HarnessPort {
  const load = opts.loadRuntime ?? defaultLoader;
  return {
    async start(spec) {
      const rt = await load(spec.harness);
      if (!rt) throw new Error(`harness ${spec.harness} is not supported`);
      const inst = await rt.installation?.({ env: opts.env });
      if (!inst || inst.kind !== "available") throw new Error(`harness ${spec.harness} is not installed`);
      const options: SessionOptions = {
        cwd: spec.cwd,
        model: spec.model,
        systemPrompt: spec.systemPrompt,
        appendSystemPrompt: spec.appendSystemPrompt,
        // D16 bypass: OAR launches claude with --dangerously-skip-permissions and codex with
        // approvalPolicy "never" + danger-full-access by default, so no extra option is needed.
        mcpServers: spec.mcp.map((m): McpServer =>
          "command" in m
            ? { name: m.name, command: m.command, ...(m.args ? { args: m.args } : {}), ...(m.env ? { env: m.env } : {}) }
            : { name: m.name, type: "http", url: m.url, headers: m.headers },
        ),
        disallowedTools: [...(DISALLOWED[spec.harness] ?? []), ...(spec.disallowedTools ?? [])],
        launchArgs: spec.harness === "claude-code" && spec.launchArgs?.length ? spec.launchArgs : undefined,
        resume: spec.resumeSessionId,
        env: spec.env ? { ...opts.env, ...spec.env } : opts.env,
        retainedBytes: opts.retainedBytes ?? 8 * 1024 * 1024,
        // OAR: --setting-sources project,local --strict-mcp-config + claudeMdExcludes for claude;
        // runtimes without a verified separation refuse "exclude", so only ask when wanted.
        // A browser sidecar may ask for it too (spec.userConfiguration, claude only).
        userConfiguration: spec.isolateUserConfig ? "exclude" : spec.harness === "claude-code" ? spec.userConfiguration : undefined,
      };
      // Drop undefined keys: some runtimes refuse an option by presence.
      for (const k of Object.keys(options) as (keyof SessionOptions)[]) if (options[k] === undefined) delete (options as any)[k];
      const session = await rt.session(inst, options);
      return wrapSession(session);
    },

    async available() {
      const out: { harness: string; installed: boolean; loggedIn: boolean; models?: string[] }[] = [];
      for (const harness of Object.keys(OAR_ID) as HarnessId[]) {
        let rt: Runtime | undefined;
        try {
          rt = await load(harness);
        } catch {
          rt = undefined;
        }
        if (!rt) {
          out.push({ harness, installed: false, loggedIn: false });
          continue;
        }
        try {
          const inst = await rt.installation?.({ env: opts.env });
          if (!inst || inst.kind !== "available") {
            out.push({ harness, installed: false, loggedIn: false });
            continue;
          }
          // Pi has no authStatus: logged-in means "has a usable model".
          const auth = rt.authStatus ? await rt.authStatus(inst, { env: opts.env, timeoutMs: 15_000 }).catch(() => undefined) : undefined;
          const listed = await rt.listModels?.(inst, { env: opts.env, timeoutMs: 30_000 }).catch(() => undefined);
          const models = listed?.kind === "ok" ? listed.models.filter((m) => !m.disabled).map((m) => m.id) : undefined;
          const loggedIn = auth ? auth.kind === "logged_in" : (models?.length ?? 0) > 0;
          out.push({ harness, installed: true, loggedIn, models });
        } catch {
          out.push({ harness, installed: false, loggedIn: false });
        }
      }
      return out;
    },
  };
}

/** Extra members beyond the contract's HarnessSession (see the runner's contract requests). */
export interface HarnessSessionExt extends HarnessSession {
  readonly canSteer: boolean;
  busy(): boolean;
}

function wrapSession(s: Session): HarnessSessionExt {
  const normalizer = new Normalizer(() => {
    const t = s.usage().value.total;
    return t ? { inputTokens: t.input, outputTokens: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite } : undefined;
  });
  // One buffered queue feeding one async iterator; subscription starts at open (cursor 0).
  const buf: HarnessEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  const push = (evs: HarnessEvent[]) => {
    if (evs.length === 0) return;
    buf.push(...evs);
    wake?.();
  };
  const unsubscribe = s.events((ev) => {
    push(normalizer.push(ev as any));
    if (ev.kind === "exited") {
      push(normalizer.flush());
      ended = true;
      wake?.();
    }
  });
  let iterated = false;

  const reject = (what: string, r: { kind: string; reason?: string }) => {
    if (r.kind === "rejected") throw new Error(`${what} rejected: ${r.reason ?? "unknown"}`);
  };

  return {
    get id() {
      return s.id;
    },
    canSteer: typeof s.steer === "function",
    busy() {
      const st = s.status().value;
      return st.kind === "running" || st.pendingPrompt != null;
    },
    async send(text, mode = "turn") {
      if (mode === "turn") {
        reject("prompt", await s.prompt(text, { origin: { kind: "user", source: "ducter" } }));
      } else if (mode === "steer") {
        const r = await s.steerOrQueue(text, { origin: { kind: "user", source: "ducter" } });
        if (r.landed === "rejected") throw new Error(`steer rejected: ${r.reason}`);
      } else {
        reject("queue", await s.queue(text, { origin: { kind: "user", source: "ducter" } }));
      }
    },
    async interrupt() {
      await s.abort();
    },
    async close() {
      try {
        await s.dispose();
      } finally {
        unsubscribe();
        push(normalizer.flush());
        ended = true;
        wake?.();
      }
    },
    events() {
      if (iterated) throw new Error("HarnessSession.events() supports a single consumer");
      iterated = true;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<HarnessEvent>> {
              while (buf.length === 0 && !ended) await new Promise<void>((r) => (wake = r));
              wake = undefined;
              const v = buf.shift();
              return v ? { value: v, done: false } : { value: undefined, done: true };
            },
          };
        },
      };
    },
  };
}
