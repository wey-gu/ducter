// 密钥 / Keys a task asks the person for (D233, design/autofill.md §8). A task on the home calls
// ask_for_key({ env, name, why }); a key kept under that env is given at once, else the person gets
// a card ({task} 需要一个密钥 / {task} needs a key) that stays like any decision until answered,
// across restarts and after the task's run ended. The value never passes through a model, the
// conversation or the Log: it goes from the card's Go (one frame) into Autofill's encrypted store
// and into the task's key file on the home (<dataDir>/task-keys/<taskId>.env, 0600, gone when the
// task ends), which the task sources inside the one command that needs it. Every event the Log
// takes is scrubbed of every key value, so a command that prints one still shows dots on every
// screen and in every model call Ducter makes. Honest limit (said in the card and the docs): the
// task's own agent sees what its command prints; a task that prints the key on purpose sees it.
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { MCP_CALL_WAIT } from "@ducter/protocol/src/harness-facts.ts";
import { HIDDEN } from "@ducter/protocol/src/redact.ts";
import type { KeyAsk, KeyView } from "@ducter/protocol/src/saved.ts";
import type { CoreMcpHub, Ctx } from "../mcp.ts";
import type { Decisions } from "../decisions.ts";
import type { CoreRegistry } from "../registry.ts";
import { checkEnv, SavedError, type SavedStore } from "./store.ts";
import { keyAskedText, keyReadyText, keyRefusedText, keysOffText, shq } from "./key-words.ts";

export interface Keys {
  /** The person's answer on a key card: the key (kept, or just this once), or 不给 / Don't give. */
  answer(decisionId: string, a: { value: string; once?: boolean } | "refuse"): void;
  /** Whether a decision is a key card. */
  isKeyAsk(decisionId: string): boolean;
  /** Where a task's key file is on the home. */
  fileOf(taskId: string): string;
  /** A Log event's body with every key value hidden (core wraps the Log's append with it). */
  scrub<T>(body: T): T;
  stop(): void;
}

/** A task's run has ended for good: what it was given goes. */
const ended = (c: { attention: string; residency: string } | undefined) => !c || c.attention === "done" || c.attention === "dropped" || c.residency === "archived";

export function createKeys(o: {
  dataDir: string;
  mcp: CoreMcpHub;
  log: LogStore;
  decisions: Decisions;
  store: SavedStore;
  tasks: CoreRegistry;
  /** How long one call waits for the person (tests); default per harness (MCP_CALL_WAIT). */
  waitMs?: (harness: string) => number;
}): Keys {
  const { store, tasks, decisions, log } = o;
  const dir = join(o.dataDir, "task-keys");
  const fileOf = (taskId: string) => join(dir, `${taskId.replace(/[^A-Za-z0-9_-]+/g, "_")}.env`);
  const waitFor = o.waitMs ?? ((h: string) => MCP_CALL_WAIT[h as HarnessId]?.value ?? 50_000);
  // A call waiting for the person, by task and variable: the answer comes back in it.
  const waiters = new Map<string, (text: string) => void>();
  const waitKey = (taskId: string, env: string) => `${taskId} ${env}`;

  // ---------- the task's key file ----------
  const writeFile = (taskId: string) => {
    const file = fileOf(taskId);
    let grants: { env: string; value: string }[] = [];
    try {
      grants = store.grantsFor(taskId);
    } catch {
      /* the store can't be opened: no keys */
    }
    if (!grants.length) return void rmSync(file, { force: true });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const body = [
      "# Keys the person gave this task through Ducter (D233). Source this file inside the one command",
      "# that needs them; never print it. It is removed when the task ends.",
      ...grants.map((g) => `export ${g.env}=${shq(g.value)}`),
      "",
    ].join("\n");
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  };
  const endTask = (taskId: string) => {
    try {
      store.endGrants(taskId);
    } catch (err) {
      console.warn(`[keys] couldn't end ${taskId}'s keys:`, (err as Error).message);
    }
    rmSync(fileOf(taskId), { force: true });
  };
  /** Each live task's key file says what it holds now; a file no task holds goes. */
  const rewrite = () => {
    const live = safe(() => store.grantedTasks(), []).filter((id) => !ended(tasks.get(id)));
    for (const id of live) writeFile(id);
    const keep = new Set(live.map((id) => basename(fileOf(id))));
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".env") && !keep.has(f)) rmSync(join(dir, f), { force: true });
  };
  /** At start: tasks that ended while Ducter was off lose what they were given. */
  const sync = () => {
    for (const id of safe(() => store.grantedTasks(), [])) if (ended(tasks.get(id))) endTask(id);
    rewrite();
  };

  // ---------- what the Log never takes ----------
  let values: string[] | undefined;
  const list = () => {
    if (values) return values;
    try {
      values = store.keyValues().filter((v) => v.length >= 6).sort((a, b) => b.length - a.length);
    } catch {
      values = [];
    }
    return values;
  };
  const hide = (s: string, vs: string[]) => {
    let out = s;
    for (const v of vs) if (out.includes(v)) out = out.split(v).join(HIDDEN);
    return out;
  };
  const walk = (v: unknown, vs: string[]): unknown => {
    if (typeof v === "string") return hide(v, vs);
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = walk(x, vs);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (v && typeof v === "object") {
      let out: Record<string, unknown> | undefined;
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const y = walk(x, vs);
        if (y !== x) (out ??= { ...(v as Record<string, unknown>) })[k] = y;
      }
      return out ?? v;
    }
    return v;
  };

  const offChange = store.onChange(() => {
    values = undefined;
    // An edit, a removal or a new grant: every task's file says what it holds now.
    rewrite();
  });

  const unsubscribe = log.subscribe((e: LogEvent) => {
    if (e.kind !== "task_state") return;
    const b = e.body as Bodies["task_state"];
    if (b.attention === "done" || b.attention === "dropped" || b.residency === "archived") {
      if (safe(() => store.grantedTasks(), []).includes(b.taskId) || existsSync(fileOf(b.taskId))) endTask(b.taskId);
    }
  });
  sync();

  // ---------- the task's tool ----------
  const openAsk = (taskId: string, env: string) => tasks.pendingDecisions(taskId).find((id) => decisions.isPending(id) && decisions.get(id)?.key?.env === env);

  const ask = (taskId: string, k: KeyAsk) => {
    const card = tasks.get(taskId);
    const title = card?.title ?? "A task";
    const q = { id: "key", text: `${title} needs a key: ${k.name} (${k.env})${k.why ? `. ${k.why}` : ""}`, blocking: true, reversible: false, key: k };
    const body: Bodies["report"] = { taskId, state: "needs_input", summary: `Needs a key: ${k.name} (${k.env}).`, questions: [q], evidence: [] };
    log.append({ persona: card?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
    tasks.setState(taskId, "needs_you", (card?.residency as never) ?? "hot");
  };

  const wait = (taskId: string, k: KeyAsk, ms: number) =>
    new Promise<string>((resolve) => {
      const key = waitKey(taskId, k.env);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (text: string) => {
        clearTimeout(timer);
        if (waiters.get(key) === done) waiters.delete(key);
        resolve(text);
      };
      // An earlier call still waiting on the same key: it ends now, this one waits.
      waiters.get(key)?.(keyAskedText(k));
      waiters.set(key, done);
      timer = setTimeout(() => done(keyAskedText(k)), Math.max(0, ms));
    });

  o.mcp.registerWhen(
    "task",
    "ask_for_key",
    "Ask the person for a key you need (an API or deploy token), by the environment variable your command reads. You never see it: you get a file to load in the one command that needs it. A kept key comes at once, else they get a card. Never ask for keys in words.",
    {
      type: "object",
      properties: {
        env: { type: "string", description: "The variable: DO_TOKEN" },
        name: { type: "string", description: "What it is: DigitalOcean deploy token" },
        why: { type: "string", description: "Why you need it, one line" },
        again: { type: "boolean", description: "true if the key you got didn't work" },
      },
      required: ["env", "name"],
    },
    async (args, ctx) => {
      const taskId = ctx.taskId!;
      const card = tasks.get(taskId);
      if (!card) throw new Error("this task isn't known to Ducter");
      let env: string;
      try {
        env = checkEnv(args.env);
      } catch (err) {
        throw new Error((err as Error).message);
      }
      const name = String(args.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120) || env;
      const why = String(args.why ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
      const device = (card.place as { device?: string }).device;
      if (device && device !== "local")
        return `This task runs on another computer, and Ducter can't hand a key to a task there yet. Don't ask for ${env} again; carry on without it, and say in your report which key you need (${env}), what it is and why, so the person can do that step from a task on the home.`;
      const file = fileOf(taskId);
      const again = args.again === true;
      const k: KeyAsk = { env, name, ...(why ? { why } : {}), file };
      // Given to this task already (and not said to be broken).
      if (!again && store.grantsFor(taskId).some((g) => g.env === env)) return writeFile(taskId), keyReadyText(k);
      const kept: KeyView | undefined = store.keyFor(env);
      if (kept && !again) {
        store.grant({ taskId, env, keyId: kept.id, name: kept.name, task: card.title });
        writeFile(taskId);
        return keyReadyText({ ...k, name: kept.name });
      }
      if (!store.askKeys()) return keysOffText(env);
      if (!openAsk(taskId, env)) ask(taskId, { ...k, ...(kept ? { saved: true, name: kept.name } : {}) });
      return wait(taskId, k, waitFor(card.harness));
    },
    (ctx: Ctx) => {
      const c = ctx.taskId ? tasks.get(ctx.taskId) : undefined;
      return !!c && c.place.kind !== "browser";
    },
  );

  return {
    answer(decisionId, a) {
      const d = decisions.get(decisionId);
      if (!d?.key || !d.taskId) throw new Error("that isn't a key card");
      if (!decisions.isPending(decisionId)) throw new Error("that card was answered already");
      const taskId = d.taskId;
      const card = tasks.get(taskId);
      if (card?.attention === "dropped") throw new Error("That task was dropped. Undo the drop first, then answer.");
      const env = d.key.env;
      const w = waiters.get(waitKey(taskId, env));
      if (a === "refuse") {
        store.record({ handle: `key:${env}`, label: d.key.name, site: "", what: "refused", taskId, ...(card?.title ? { task: card.title } : {}) });
        w?.(keyRefusedText(d.key));
        decisions.decide(decisionId, "hold", undefined, w ? { delivered: true } : undefined);
        return;
      }
      const value = String(a.value ?? "");
      if (!value.trim()) throw new SavedError("invalid", "paste the key first");
      if (a.once) store.grant({ taskId, env, value, name: d.key.name, ...(card?.title ? { task: card.title } : {}) });
      else {
        const kv = store.put({ kind: "key", env, name: d.key.name, value }) as KeyView;
        store.grant({ taskId, env, keyId: kv.id, name: kv.name, ...(card?.title ? { task: card.title } : {}) });
      }
      writeFile(taskId);
      w?.(keyReadyText(d.key));
      decisions.decide(decisionId, "go", undefined, w ? { delivered: true } : undefined);
    },
    isKeyAsk: (id) => !!decisions.get(id)?.key,
    fileOf,
    scrub(body) {
      const vs = list();
      return vs.length ? (walk(body, vs) as typeof body) : body;
    },
    stop() {
      offChange();
      unsubscribe();
      for (const w of [...waiters.values()]) w("Ducter is restarting; the card stays. End your turn now; you'll be resumed when the key is there.");
      waiters.clear();
    },
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
