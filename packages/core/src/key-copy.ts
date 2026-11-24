// D539: 复制密钥 / Copy a key, the home's side (design/autofill.md §9, design/system.md "Keys copied
// between computers"). A key the person already has on one of their computers (a variable in their
// shell there, or Ducter's key file there) goes to another of their computers for Ducter's tasks
// there, on their one Go. Who judges what (principle 21): the model says which variable a piece of
// work needs and where it is (the partner's key_copy, or a task's ask_for_key, where Ducter itself
// looks on the person's other computers); code checks that the variable is really there, that every
// computer is one of the person's paired ones, and that only the person's own tap on the card copies.
//
// The value never passes through here in clear: the computer that will keep it makes a key pair
// for this one copy (keys_offer), the computer that has it seals the value to it (keys_seal), and
// the sealed box is handed on (keys_take). The home holds only ciphertext, in memory, for the
// seconds a copy takes. The Log takes names only (`key_copy`: which variable, from where, to where,
// on whose Go). Each computer keeps what it was given in its own shelf (protocol/src/key-shelf.ts).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore, SessionSpec, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import { COPY_KEY_WORDS, computersWords, type CopyKeyAsk, type KeptKeysAnswer, type KeptKeyView, type KeyComputer, type KeySource } from "@ducter/protocol/src/key-copy.ts";
import type { SealedKey } from "@ducter/protocol/src/key-seal.ts";
import { channelOf } from "@ducter/protocol/src/partners.ts";
import { createKeyShelf, keyEnvOk, type KeyShelf } from "@ducter/protocol/src/key-shelf.ts";
import type { CoreMcpHub } from "./mcp.ts";
import type { Decisions } from "./decisions.ts";
import type { CoreRegistry } from "./registry.ts";

/** Calls an op on a computer ("local" = the home itself). Rejects with offline / old where it can't. */
export type KeyCall = (device: string, op: string, args: object, timeoutMs?: number) => Promise<unknown>;

export interface KeyCopy {
  /** The variables a task holds (its session gets them at start, on its computer). */
  refsFor(taskId: string): string[];
  /** A session on the home with the kept keys it names. */
  withKeys(spec: SessionSpec): SessionSpec;
  /** Every value kept on the home (the Log's scrub takes them out of every event). */
  homeValues(): string[];
  isCopyAsk(decisionId: string): boolean;
  /** The person's answer on the card: Go copies (and answers its tasks), Hold doesn't. */
  answer(decisionId: string, option: "go" | "hold"): Promise<void>;
  /** A copy proposed (the partner's key_copy): checked, then the card. */
  propose(p: ProposeInput): Promise<{ ok: true; decisionId: string; already?: string[] } | { ok: false; error: string }>;
  /**
   * D539 in ask_for_key: a task needs `env` on its computer. Kept there: given at once (the file's
   * path to load it from). On another of the person's computers: a copy card for this task.
   * Undefined: nowhere Ducter can find it (the D233 paste card, or the worker's words, follow).
   */
  forTask(taskId: string, a: { env: string; name: string; why?: string; again?: boolean; device: string }): Promise<{ text: string } | { wait: Promise<string> } | undefined>;
  /** Settings: the keys kept on a computer, names only. */
  list(device: string): Promise<KeptKeysAnswer>;
  remove(device: string, env: string): Promise<{ ok: true; removed: boolean } | { ok: false; why: "offline" | "unsupported" | "failed" }>;
  stop(): void;
}

export interface ProposeInput {
  env: string;
  name?: string;
  from: string;
  to: string[];
  why?: string;
  persona?: string;
  taskIds?: string[];
}

interface Grants {
  v: 1;
  /** taskId -> the variables it holds (kept on the computer it runs on). */
  tasks: Record<string, string[]>;
}

const oldOp = (err: unknown) => /unknown op/i.test(String((err as Error)?.message ?? err));
const offline = (err: unknown) => !!(err as { offline?: boolean })?.offline || /not connected|offline/i.test(String((err as Error)?.message ?? err));
const newCopyId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const ended = (a: string | undefined, r?: string) => a === "done" || a === "dropped" || r === "archived";

/** The tool's answer when a kept key is ready for a task: where to load it, never its value. */
export function keptReadyText(env: string, name: string, file: string | null, where: string): string {
  const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  return (
    `${env} (${name}) is kept by Ducter on ${where} for its tasks there, and it is yours now. A new session of this task starts with it in its environment` +
    (file ? `; for this session, load it only inside the one command that needs it, in the same shell line: . ${q(file)} && <command> (the command then reads $${env}).` : ".") +
    ` Never print, echo, cat or log it, nor write it into a file, a commit, a config or your report; a config refers to it by name ($${env}).`
  );
}

export function createKeyCopy(o: {
  dataDir: string;
  log: LogStore;
  decisions: Decisions;
  tasks: CoreRegistry;
  mcp: CoreMcpHub;
  workers: () => WorkerLinks | undefined;
  /** The person's computers: the home's name, the workers paired with it. */
  homeName: () => string;
  computers: () => { id: string; name: string; online: boolean }[];
  lang: () => string;
  /** How long a task's ask_for_key call waits in it for the person (per harness). */
  waitMs: (harness: string) => number;
  /** Test and eval seams: the home's shelf, and how an op is called on a computer. */
  shelf?: KeyShelf;
  call?: KeyCall;
}): KeyCopy {
  const { log, decisions, tasks } = o;
  const shelf = o.shelf ?? createKeyShelf({ dataDir: o.dataDir });
  const grantsFile = join(o.dataDir, "key-grants.json");
  let grants: Grants = { v: 1, tasks: {} };
  try {
    if (existsSync(grantsFile)) grants = { v: 1, tasks: (JSON.parse(readFileSync(grantsFile, "utf8")) as Grants).tasks ?? {} };
  } catch {
    /* a damaged file: no grants (tasks ask again) */
  }
  const saveGrants = () => {
    const tmp = `${grantsFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(grants), { mode: 0o600 });
    renameSync(tmp, grantsFile);
  };
  const grant = (taskId: string, env: string) => {
    const have = grants.tasks[taskId] ?? [];
    if (have.includes(env)) return;
    grants.tasks[taskId] = [...have, env];
    saveGrants();
  };

  const call: KeyCall =
    o.call ??
    (async (device, op, args, timeoutMs = 20_000) => {
      if (device === "local") {
        const fn = shelf.ops[op];
        if (!fn) throw new Error(`unknown op ${op}`);
        return fn(args);
      }
      const link = o.workers()?.link(device);
      if (!link) throw Object.assign(new Error(`${device} isn't one of your computers`), { notPaired: true });
      if (!link.online()) throw Object.assign(new Error(`${link.name} is not connected`), { offline: true });
      return link.call(op, args, timeoutMs);
    });

  /** A computer by what the model or a client called it: "local", the home's name, a worker's id or name. */
  const resolve = (said: string): KeyComputer | undefined => {
    const s = clip(said, 80).toLowerCase();
    if (!s) return undefined;
    const home = o.homeName();
    if (s === "local" || s === home.toLowerCase()) return { device: "local", name: home };
    const ws = o.computers();
    const w = ws.find((c) => c.id.toLowerCase() === s || c.name.toLowerCase() === s) ?? ws.find((c) => c.name.toLowerCase().includes(s) || s.includes(c.name.toLowerCase()));
    return w ? { device: w.id, name: w.name } : undefined;
  };
  const nameOf = (device: string) => (device === "local" ? o.homeName() : (o.computers().find((c) => c.id === device)?.name ?? device));

  /** Where a variable is on a computer; undefined when it isn't (or the computer can't say). */
  const has = async (device: string, env: string, timeoutMs = 15_000): Promise<{ source: KeySource | "kept" } | "offline" | "old" | undefined> => {
    try {
      const r = (await call(device, "keys_has", { env }, timeoutMs)) as { has?: boolean; source?: KeySource | "kept" };
      return r?.has ? { source: r.source ?? "shell" } : undefined;
    } catch (err) {
      if (oldOp(err)) return "old";
      if (offline(err)) return "offline";
      return undefined;
    }
  };

  // ---------- the card ----------
  const lang = (): "zh" | "en" => (o.lang().toLowerCase().startsWith("zh") ? "zh" : "en");
  const questionOf = (a: CopyKeyAsk) => {
    const w = COPY_KEY_WORDS[lang()];
    return `${w.title(a.env, a.from.name, computersWords(a.to.map((t) => t.name), lang()))} ${w.note}`;
  };
  const copyOf = (decisionId: string): CopyKeyAsk | undefined => decisions.get(decisionId)?.copyKey;

  // A task's ask_for_key call waiting in it for the person, by decision.
  const waiters = new Map<string, (text: string) => void>();
  const running = new Set<string>();

  /** Gives a task the variables kept on its computer: its grant, and its file there for this session. */
  const giveTo = async (taskId: string, env: string, name: string): Promise<string> => {
    const card = tasks.get(taskId);
    const device = (card?.place as { device?: string } | undefined)?.device || "local";
    grant(taskId, env);
    let file: string | null = null;
    try {
      file = ((await call(device, "keys_file", { taskId, envs: grants.tasks[taskId] ?? [env] })) as { file?: string | null })?.file ?? null;
    } catch {
      /* the next session still starts with it */
    }
    return keptReadyText(env, name, file, nameOf(device));
  };

  /** One copy, A to each of B: offer there, seal here-and-there, take there. */
  const copy = async (a: CopyKeyAsk): Promise<{ to: KeyComputer[]; failed: { name: string; why: string }[] }> => {
    const done: KeyComputer[] = [];
    const failed: { name: string; why: string }[] = [];
    for (const t of a.to) {
      const id = newCopyId();
      try {
        const offer = (await call(t.device, "keys_offer", { env: a.env, copy: id })) as { pub?: string };
        if (!offer?.pub) throw new Error("no offer");
        // Only the sealed box passes through here, and only in memory.
        const sealed = (await call(a.from.device, "keys_seal", { env: a.env, pub: offer.pub, copy: id })) as SealedKey;
        await call(t.device, "keys_take", { env: a.env, name: a.name, from: a.from.name, copy: id, sealed });
        done.push(t);
      } catch (err) {
        failed.push({ name: t.name, why: oldOp(err) ? "old" : offline(err) ? "offline" : (err as Error).message?.includes("isn't on this computer") ? "gone" : "failed" });
      }
    }
    return { to: done, failed };
  };

  const answer = async (decisionId: string, option: "go" | "hold") => {
    const a = copyOf(decisionId);
    if (!a) throw new Error("that isn't a copy card");
    if (!decisions.isPending(decisionId)) throw new Error("that card was answered already");
    const w = waiters.get(decisionId);
    if (option === "hold") {
      waiters.delete(decisionId);
      w?.(`The person chose not to copy ${a.env} to this computer. Don't ask for it again in this task; carry on with what you can do without it, and say in your report what is left undone and why it needs ${a.env}.`);
      decisions.decide(decisionId, "hold", undefined, w ? { delivered: true } : undefined);
      return;
    }
    if (running.has(decisionId)) return;
    running.add(decisionId);
    try {
      const r = await copy(a);
      const body: Bodies["key_copy"] = { decisionId, env: a.env, name: a.name, from: a.from.name, to: r.to.map((t) => t.name), by: "go", ...(r.failed.length ? { failed: r.failed } : {}) };
      log.append({ stream: "keys", origin: "system", kind: "key_copy", body });
      // Nothing went: the card stays, saying why, so the person can try again.
      if (!r.to.length) return;
      const got = new Set(r.to.map((t) => t.device));
      let text = "";
      for (const id of a.taskIds ?? []) {
        const dev = (tasks.get(id)?.place as { device?: string } | undefined)?.device || "local";
        if (got.has(dev)) text = await giveTo(id, a.env, a.name);
      }
      waiters.delete(decisionId);
      if (w) w(text ? `The person copied it here. ${text}` : `The person copied ${a.env} to ${r.to.map((t) => t.name).join(", ")}.`);
      decisions.decide(decisionId, "go", undefined, { copied: true, ...(w ? { delivered: true } : {}) });
    } finally {
      running.delete(decisionId);
    }
  };

  const card = (a: CopyKeyAsk, stream: string, persona?: string) => {
    const decisionId = `d_${newCopyId()}`;
    const body: Bodies["decision"] = { decisionId, question: questionOf(a), goLabel: COPY_KEY_WORDS[lang()].go, holdLabel: COPY_KEY_WORDS[lang()].hold, defaultOption: "hold", reversible: false, copyKey: a };
    log.append({ ...(persona ? { persona } : {}), stream, origin: "system", kind: "decision", body });
    return decisionId;
  };

  // ---------- the partner's tool ----------
  o.mcp.registerWhen(
    "partner",
    "key_copy",
    "Copy a key the person already has on one of their computers (a variable in their shell there, or Ducter's key file there) to others of theirs, for Ducter's tasks there only. Use it whenever work on a computer needs a key that is on another: never ask them to set or paste it by hand. Ducter checks it is there and shows a card; only their Go copies it. The value is never shown to anyone, you included.",
    {
      type: "object",
      properties: {
        env: { type: "string", description: "The variable: STI_MCP_API_KEY" },
        name: { type: "string", description: "What it is, a few words" },
        from: { type: "string", description: "The computer that has it, by name" },
        to: { type: "array", items: { type: "string" }, description: "The computers that need it, by name" },
        why: { type: "string", description: "One line, for the card" },
      },
      required: ["env", "from", "to"],
    },
    async (args, ctx) => {
      const r = await api.propose({ env: String(args.env ?? ""), from: String(args.from ?? ""), to: Array.isArray(args.to) ? args.to.map(String) : [String(args.to ?? "")], ...(args.name ? { name: String(args.name) } : {}), ...(args.why ? { why: String(args.why) } : {}), ...(ctx.persona ? { persona: ctx.persona } : {}) });
      if (!r.ok) return { ok: false, error: r.error };
      if (!r.decisionId) return { ok: true, note: `Already there: ${r.already?.join(", ")} keep ${String(args.env)} for Ducter's tasks. Nothing to copy; carry on.` };
      return { ok: true, needsGo: true, note: `The card is on screen: it says what goes where, with Copy and Not now. Say one short line at most, or nothing: the card speaks for itself (never name its buttons, never the key, no steps for them to do by hand). Then end your turn; on their Go it copies by itself${r.already?.length ? ` (${r.already.join(", ")} already had it)` : ""}.` };
    },
    () => o.computers().length > 0,
  );

  const api: KeyCopy = {
    refsFor: (taskId) => [...(grants.tasks[taskId] ?? [])],
    withKeys: (spec) => shelf.withKeys(spec),
    homeValues: () => shelf.values(),
    isCopyAsk: (id) => !!copyOf(id),
    answer,
    async propose(p) {
      let env: string;
      try {
        env = keyEnvOk(p.env);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      const from = resolve(p.from);
      if (!from) return { ok: false, error: `${p.from || "That"} isn't one of the person's computers. Theirs: ${[o.homeName(), ...o.computers().map((c) => c.name)].join(", ")}.` };
      const to: KeyComputer[] = [];
      for (const said of p.to) {
        const t = resolve(said);
        if (!t) return { ok: false, error: `${said || "That"} isn't one of the person's computers. Theirs: ${[o.homeName(), ...o.computers().map((c) => c.name)].join(", ")}.` };
        if (t.device !== from.device && !to.some((x) => x.device === t.device)) to.push(t);
      }
      if (!to.length) return { ok: false, error: "Name at least one other computer to copy it to." };
      const there = await has(from.device, env);
      if (there === "offline") return { ok: false, error: `${from.name} isn't connected now, so Ducter can't read ${env} there. Tell the person in one line it copies once ${from.name} is on.` };
      if (there === "old") return { ok: false, error: `${from.name} runs an older Ducter that can't copy keys yet; it can once it is updated.` };
      if (!there) return { ok: false, error: `${env} isn't on ${from.name}: Ducter looked in the person's shell there and in Ducter's own keys. Check the name, or where it is.` };
      const already: string[] = [];
      const need: KeyComputer[] = [];
      for (const t of to) {
        const h = await has(t.device, env);
        if (h && h !== "offline" && h !== "old" && h.source === "kept") already.push(t.name);
        else if (h === "offline") return { ok: false, error: `${t.name} isn't connected now, so nothing can be copied to it yet.` };
        else if (h === "old") return { ok: false, error: `${t.name} runs an older Ducter that can't keep copied keys yet; it can once it is updated.` };
        else need.push(t);
      }
      if (!need.length) return { ok: true, decisionId: "", already };
      const a: CopyKeyAsk = { env, name: clip(p.name, 120) || env, from, to: need, source: there.source === "kept" ? "ducter" : there.source, ...(clip(p.why, 300) ? { why: clip(p.why, 300) } : {}), ...(p.taskIds?.length ? { taskIds: p.taskIds } : {}) };
      return { ok: true, decisionId: card(a, channelOf(p.persona), p.persona), ...(already.length ? { already } : {}) };
    },
    async forTask(taskId, a) {
      const env = keyEnvOk(a.env);
      const device = a.device || "local";
      const here = await has(device, env);
      if (here && here !== "offline" && here !== "old" && here.source === "kept" && !a.again) return { text: await giveTo(taskId, env, a.name) };
      if (a.again) return undefined;
      // An open copy card for this task and key: wait on it again.
      const open = tasks.pendingDecisions(taskId).find((id) => decisions.isPending(id) && copyOf(id)?.env === env);
      const ask = (decisionId: string, harness: string) => ({
        wait: new Promise<string>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const done = (text: string) => {
            clearTimeout(timer);
            if (waiters.get(decisionId) === done) waiters.delete(decisionId);
            resolve(text);
          };
          waiters.get(decisionId)?.(asked(env));
          waiters.set(decisionId, done);
          timer = setTimeout(() => done(asked(env)), Math.max(0, o.waitMs(harness)));
        }),
      });
      const card0 = tasks.get(taskId);
      if (open) return ask(open, card0?.harness ?? "");
      // Where else the person has it: the home and every connected computer but this one.
      const others = [{ device: "local", name: o.homeName() }, ...o.computers().filter((c) => c.online).map((c) => ({ device: c.id, name: c.name }))].filter((c) => c.device !== device);
      const found = (await Promise.all(others.map(async (c) => ({ c, h: await has(c.device, env, 10_000) })))).find((x) => x.h && x.h !== "offline" && x.h !== "old");
      if (!found) return undefined;
      const src = (found.h as { source: KeySource | "kept" }).source;
      const ca: CopyKeyAsk = { env, name: clip(a.name, 120) || env, from: found.c, to: [{ device, name: nameOf(device) }], source: src === "kept" ? "ducter" : src, ...(clip(a.why, 300) ? { why: clip(a.why, 300) } : {}), taskIds: [taskId] };
      // The task waits on the person: its card, in 等你 (a report that asks, like D233's key card).
      const q = { id: "copy-key", text: questionOf(ca), blocking: true, reversible: false, copyKey: ca };
      const body: Bodies["report"] = { taskId, state: "needs_input", summary: `Needs ${env} on ${nameOf(device)}; it is on ${found.c.name}.`, questions: [q], evidence: [] };
      log.append({ persona: card0?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
      tasks.setState(taskId, "needs_you", (card0?.residency as never) ?? "hot");
      const id = tasks.pendingDecisions(taskId).find((x) => decisions.isPending(x) && copyOf(x)?.env === env);
      if (!id) return { text: asked(env) };
      return ask(id, card0?.harness ?? "");
    },
    async list(device) {
      try {
        const r = (await call(device, "keys_list", {})) as { keys?: KeptKeyView[] };
        return { ok: true, keys: (r?.keys ?? []).map((k) => ({ env: k.env, name: k.name, at: k.at, ...(k.from ? { from: k.from } : {}), ...(k.usedAt ? { usedAt: k.usedAt } : {}) })) };
      } catch (err) {
        return { ok: false, why: oldOp(err) ? "unsupported" : offline(err) ? "offline" : "failed" };
      }
    },
    async remove(device, env) {
      try {
        const e = keyEnvOk(env);
        const r = (await call(device, "keys_remove", { env: e })) as { removed?: boolean };
        if (r?.removed) {
          const body: Bodies["key_copy"] = { env: e, name: e, from: "", to: [], removed: nameOf(device), by: "user" };
          log.append({ stream: "keys", origin: "user", kind: "key_copy", body });
          for (const [id, envs] of Object.entries(grants.tasks)) {
            const dev = (tasks.get(id)?.place as { device?: string } | undefined)?.device || "local";
            if (dev === device && envs.includes(e)) grants.tasks[id] = envs.filter((x) => x !== e);
          }
          saveGrants();
        }
        return { ok: true, removed: !!r?.removed };
      } catch (err) {
        return { ok: false, why: oldOp(err) ? "unsupported" : offline(err) ? "offline" : "failed" };
      }
    },
    stop() {
      unsubscribe();
      for (const w of [...waiters.values()]) w("Ducter is restarting; the card stays. End your turn now; you'll be resumed when the key is there.");
      waiters.clear();
    },
  };

  // A task that ends gives back what it held: its grant here, its file there.
  const unsubscribe = log.subscribe((e: LogEvent) => {
    if (e.kind !== "task_state") return;
    const b = e.body as Bodies["task_state"];
    if (!ended(b.attention, b.residency) || !grants.tasks[b.taskId]) return;
    const dev = (tasks.get(b.taskId)?.place as { device?: string } | undefined)?.device || "local";
    delete grants.tasks[b.taskId];
    saveGrants();
    void call(dev, "keys_drop", { taskId: b.taskId }).catch(() => {});
  });
  return api;
}

function asked(env: string): string {
  return `Ducter found ${env} on another of the person's computers and asked them to copy it here; the card stays until they answer. End your turn now (say in one short line that you're waiting for that key); you'll be resumed when it is here or if they say no. Don't ask them to set it by hand, in your words or in a report.`;
}
