// D233: a task asks the person for a key, through the real core (MCP, decisions, the Log, the
// clients' socket): the card, the answer in the waiting call, the run-ended case resumed by a
// message, a restart in between, 不给 / Don't give, just this once, the switch off, a kept key
// given at once, a task on another computer. The value is never in the Log, a tool's answer, a
// client frame or the message that resumes the task; it is only in the task's 0600 key file.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const KEY = "dop_v1_9c1e5a77b2d34f0e8a6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d";
const OTHER = "tok-2b8f71c4e9a05d36";

let core: Core;
let td: ReturnType<typeof tempDir>;
let sends: { taskId: string; text: string }[];
let frames: ServerFrame[];
let sockets: WebSocket[];

const start = (keyWaitMs: number) => {
  core = startCore({ dataDir: td.dir, port: 0, push: false, browser: false, keyWaitMs });
  core.setRunner({ send: async (taskId: string, text: string) => void sends.push({ taskId, text }) } as never);
};
const openTask = (taskId: string, title: string, place: Bodies["task_open"]["place"] = { kind: "none" }) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place, harness: "codex", brief: "Deploy the site." } });
const ask = (taskId: string, args: object) => core.mcp.call({ role: "task", taskId }, "ask_for_key", args) as Promise<string>;
const keyCards = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).filter((d) => d.key);
const resolutions = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision_resolved"] }).map((e) => e.body as Bodies["decision_resolved"]);
const until = async (pred: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (pred()) return;
    await Bun.sleep(10);
  }
  throw new Error("timed out");
};

async function socket() {
  const ws = new WebSocket(core.url);
  sockets.push(ws);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: "hello" }));
  return (f: object) => ws.send(JSON.stringify(f));
}

function nowhere(values: string[], extra: string[] = []) {
  const all = JSON.stringify(core.log.read({ fromSeq: 0, limit: 100_000 })) + JSON.stringify(frames) + JSON.stringify(sends) + extra.join("\n");
  for (const v of values) expect(all).not.toContain(v);
}

beforeEach(() => {
  td = tempDir();
  sends = [];
  frames = [];
  sockets = [];
});
afterEach(async () => {
  for (const s of sockets) s.close();
  await core.stop();
  td.cleanup();
});

describe("ask_for_key", () => {
  test("asks on a card; the key comes back in the waiting call, only into the task's key file", async () => {
    start(5000);
    openTask("t1", "Deploy the blog");
    expect(core.mcp.tools("task")).toContain("ask_for_key");
    const call = ask("t1", { env: "DO_TOKEN", name: "DigitalOcean deploy token", why: "to push the new build" });
    await until(() => keyCards().length === 1);
    const d = keyCards()[0]!;
    expect(d.key).toMatchObject({ env: "DO_TOKEN", name: "DigitalOcean deploy token", why: "to push the new build" });
    expect(d.defaultOption).toBe("hold");
    expect(d.defaultAt).toBeUndefined();
    expect(core.tasks.get("t1")?.attention).toBe("needs_you");
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go", key: `${KEY}\n` });
    const out = await call;
    expect(out).toContain("DO_TOKEN (DigitalOcean deploy token) is ready");
    expect(out).toContain(d.key!.file);
    expect(out).not.toContain(KEY);
    // The file: 0600, one export, sourced by a shell to the value.
    const file = d.key!.file;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).toContain(`export DO_TOKEN='${KEY}'`);
    const sh = Bun.spawnSync(["sh", "-c", `. '${file}' && printf %s "$DO_TOKEN"`]);
    expect(sh.stdout.toString()).toBe(KEY);
    // Answered in the call: not sent again, not even after a restart.
    await until(() => resolutions().length === 1);
    expect(resolutions()[0]).toMatchObject({ option: "go", delivered: true });
    await Bun.sleep(30);
    expect(sends).toEqual([]);
    expect(core.tasks.get("t1")?.attention).toBe("working");
    // Remembered (the default): kept in Autofill, the use listed.
    const v = core.autofill.store.view();
    expect(v.keys.map((k) => k.env)).toEqual(["DO_TOKEN"]);
    expect(v.uses[0]).toMatchObject({ handle: "key:DO_TOKEN", what: "given", task: "Deploy the blog" });
    expect(v.uses[0]!.once).toBeUndefined();
    // A command that printed it: the Log and every screen show dots.
    core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", text: `curl -H "Authorization: Bearer ${KEY}" ok`, raw: { out: [KEY] } } });
    expect(JSON.stringify(core.log.read({ stream: "task:t1", fromSeq: 0, limit: 1000 }))).toContain("••••••");
    nowhere([KEY], [out]);
  });

  test("the run ended before the person answered: the card stays, and the task is resumed with the key", async () => {
    start(20);
    openTask("t2", "Ship the docs");
    const out = await ask("t2", { env: "NETLIFY_AUTH_TOKEN", name: "Netlify token", why: "deploy" });
    expect(out).toContain("the card stays");
    expect(out).toContain("End your turn");
    const d = keyCards()[0]!;
    // A message to the task doesn't answer a key card (a key never goes through the conversation).
    core.decisions.answeredByMessage("t2", "any update?", "user");
    expect(core.decisions.isPending(d.decisionId)).toBe(true);
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go", key: OTHER });
    await until(() => sends.length === 1);
    expect(sends[0]!.taskId).toBe("t2");
    expect(sends[0]!.text).toContain("The person gave you the key you asked for: NETLIFY_AUTH_TOKEN");
    expect(sends[0]!.text).toContain(d.key!.file);
    expect(readFileSync(d.key!.file, "utf8")).toContain(`export NETLIFY_AUTH_TOKEN='${OTHER}'`);
    expect(resolutions()[0]!.delivered).toBeUndefined();
    nowhere([OTHER]);
  });

  test("a restart in between: the card is still there, and answering it resumes the task", async () => {
    start(20);
    openTask("t3", "Rotate the webhook");
    await ask("t3", { env: "HOOK_SECRET", name: "Webhook secret" });
    const id = keyCards()[0]!.decisionId;
    await core.stop();
    start(20);
    expect(core.decisions.isPending(id)).toBe(true);
    expect(core.tasks.get("t3")?.attention).toBe("needs_you");
    const send = await socket();
    send({ t: "decide", decisionId: id, option: "go", key: OTHER, once: true });
    await until(() => sends.length === 1);
    expect(sends[0]!.text).toContain("HOOK_SECRET");
    nowhere([OTHER]);
  });

  test("不给 / Don't give: the task is told plainly and carries on; nothing is kept", async () => {
    start(20);
    openTask("t4", "Publish the package");
    await ask("t4", { env: "NPM_TOKEN", name: "npm publish token" });
    const d = keyCards()[0]!;
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "hold" });
    await until(() => sends.length === 1);
    expect(sends[0]!.text).toContain("chose not to give you NPM_TOKEN");
    expect(core.tasks.get("t4")?.attention).not.toBe("blocked");
    expect(core.autofill.store.view().keys).toHaveLength(0);
    expect(core.autofill.store.view().uses[0]).toMatchObject({ handle: "key:NPM_TOKEN", what: "refused" });
    expect(existsSync(d.key!.file)).toBe(false);
  });

  test("refused while the call waits: the answer comes back in it", async () => {
    start(5000);
    openTask("t5", "Publish the package");
    const call = ask("t5", { env: "NPM_TOKEN", name: "npm publish token" });
    await until(() => keyCards().length === 1);
    const send = await socket();
    send({ t: "decide", decisionId: keyCards()[0]!.decisionId, option: "hold" });
    expect(await call).toContain("chose not to give you NPM_TOKEN");
    await Bun.sleep(30);
    expect(sends).toEqual([]);
  });

  test("just this once: given to this task only; the next task is asked again; the file goes when the task ends", async () => {
    start(5000);
    openTask("t6", "Deploy the blog");
    openTask("t7", "Deploy the shop");
    const call = ask("t6", { env: "DO_TOKEN", name: "DigitalOcean deploy token" });
    await until(() => keyCards().length === 1);
    const d = keyCards()[0]!;
    const send = await socket();
    send({ t: "decide", decisionId: d.decisionId, option: "go", key: KEY, once: true });
    expect(await call).toContain("is ready");
    expect(core.autofill.store.view().keys).toHaveLength(0);
    expect(core.autofill.store.view().uses[0]!.once).toBe(true);
    const second = ask("t7", { env: "DO_TOKEN", name: "DigitalOcean deploy token" });
    await until(() => keyCards().length === 2);
    send({ t: "decide", decisionId: keyCards()[1]!.decisionId, option: "hold" });
    await second;
    // The first task ends: its file and its once value go.
    core.tasks.setState("t6", "done", "parked");
    await until(() => !existsSync(d.key!.file));
    expect(core.autofill.store.keyValues()).toEqual([]);
  });

  test("a kept key is given at once, with no card, and the use is listed", async () => {
    start(5000);
    core.autofill.store.put({ kind: "key", name: "DigitalOcean deploy token", env: "DO_TOKEN", value: KEY });
    openTask("t8", "Deploy the blog");
    const out = await ask("t8", { env: "DO_TOKEN", name: "DO token" });
    expect(out).toContain("DO_TOKEN (DigitalOcean deploy token) is ready");
    expect(keyCards()).toHaveLength(0);
    expect(core.autofill.store.view().uses[0]).toMatchObject({ handle: "key:DO_TOKEN", what: "given", taskId: "t8" });
    // Asked again, saying it didn't work: the person gets a card that replaces it.
    const again = ask("t8", { env: "DO_TOKEN", name: "DO token", again: true });
    await until(() => keyCards().length === 1);
    expect(keyCards()[0]!.key!.saved).toBe(true);
    const send = await socket();
    send({ t: "decide", decisionId: keyCards()[0]!.decisionId, option: "go", key: OTHER });
    await again;
    expect(core.autofill.store.view().keys).toHaveLength(1);
    expect(readFileSync(core.autofill.keys!.fileOf("t8"), "utf8")).toContain(OTHER);
    nowhere([KEY, OTHER]);
  });

  test("the switch off: no card; the task is told to say what it needs in its report", async () => {
    start(5000);
    const send = await socket();
    send({ t: "saved_ask_keys", on: false });
    await until(() => frames.some((f) => f.t === "saved" && (f as { askKeys?: boolean }).askKeys === false));
    openTask("t9", "Deploy the blog");
    const out = await ask("t9", { env: "DO_TOKEN", name: "DO token" });
    expect(out).toContain("turned off tasks asking them for keys");
    expect(keyCards()).toHaveLength(0);
  });

  test("a task on another computer: said plainly, no card", async () => {
    start(5000);
    openTask("t10", "Deploy from the server", { kind: "none", device: "hel" });
    const out = await ask("t10", { env: "DO_TOKEN", name: "DO token" });
    expect(out).toContain("runs on another computer");
    expect(keyCards()).toHaveLength(0);
  });

  test("a bad variable name is refused", async () => {
    start(5000);
    openTask("t11", "x");
    await expect(ask("t11", { env: "PATH", name: "path" })).rejects.toThrow();
    await expect(ask("t11", { env: "do token", name: "x" })).rejects.toThrow();
  });
});
