// D234 + D235 through the real core: the home is a Linux server (as on hel) and a MacBook is its
// worker. The worker is the real worker-side code (worker-browse.ts with its phone and app ops)
// over the real /worker socket, with a fake phone and a fake cua-driver underneath. Its card says
// 用手机 and 用电脑; a phone task and an app task go there; the tools on the home drive the Mac's
// phone and apps over the socket, with the gate, the blocked apps and Stop held on the home.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, DeviceView, PhoneDevice, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import type { PhoneHost } from "../src/android/host.ts";
import { parseDump } from "../src/android/screen.ts";
import { createWorkerBrowse } from "../src/worker-browse.ts";
import { COMPUTER_STOPPED } from "../src/computer/tools.ts";
import { tempDir } from "./helpers.ts";

const chatXml = `<?xml version='1.0' ?><hierarchy rotation="0"><node index="0" text="" class="android.widget.FrameLayout" package="com.chat" clickable="false" bounds="[0,0][720,1600]"><node index="0" text="周六见" class="android.widget.EditText" package="com.chat" clickable="true" password="false" bounds="[0,1400][600,1500]" /><node index="1" text="" content-desc="发送" class="android.widget.ImageButton" package="com.chat" clickable="true" bounds="[600,1400][720,1500]" /></node></hierarchy>`;

/** The MacBook's own phone: records what it is asked to do. */
function macPhone() {
  const did: string[] = [];
  const screen = parseDump(chatXml);
  let held = 0;
  const device = {
    state: () => "running",
    ensure: async () => void did.push("ensure"),
    touch() {},
    hold: () => (held++, () => void held--),
    stop: async () => void did.push("stop"),
    adb: async () => ({ code: 0, out: new Uint8Array(), err: "" }),
    shell: async () => "",
    jpeg: async () => new Uint8Array([0xff, 0xd8, 1]),
    screen: async () => screen,
    tap: async (x: number, y: number) => void did.push(`tap ${x},${y}`),
    swipe: async () => void did.push("swipe"),
    key: async (k: string) => void did.push(`key ${k}`),
    text: async (s: string) => void did.push(`text ${s}`),
    front: async () => screen.app,
    apps: async () => [{ pkg: "com.chat" }],
    launch: async (p: string) => void did.push(`launch ${p}`),
    size: async () => ({ width: 720, height: 1600 }),
  } satisfies PhoneDevice;
  const host: PhoneHost = {
    device,
    setup: () => ({ state: "ready" }),
    ability: () => ({ id: "phone", state: "on" }),
    terms: async () => ({ ok: true, download: 2_320_000_000, disk: 6_000_000_000, packages: [], licenses: [{ id: "android-sdk-license", title: { zh: "许可", en: "License" }, text: "…", sha256: "abc" }] }),
    install: async () => ({ ok: true }) as any,
    erase: async () => void did.push("erase"),
    onChange: () => () => {},
    stop: async () => {},
  };
  return { host, did, held: () => held };
}

/** The MacBook's cua-driver: Mail with a Send button, and 1Password, which no task may see. */
function macCua() {
  const calls: [string, any][] = [];
  const call = async (tool: string, args: any) => {
    calls.push([tool, args]);
    switch (tool) {
      case "list_apps":
        return { json: { apps: [{ name: "Mail", bundle_id: "com.apple.mail", pid: 501, running: true }, { name: "1Password", bundle_id: "com.1password.1password", pid: 502, running: true }, { name: "Keynote", bundle_id: "com.apple.iWork.Keynote", running: false }] } };
      case "list_windows":
        return { json: { windows: [{ window_id: 77, pid: 501, title: "New Message", on_screen: true, layer: 0 }] } };
      case "get_window_state":
        return {
          json: {
            snapshot_id: "s0000002a",
            elements: [
              { element_index: 0, role: "AXTextField", label: "To", value: "zhang@example.com" },
              { element_index: 1, role: "AXTextArea", label: "Message", value: "周六见" },
              { element_index: 2, role: "AXButton", label: "Send" },
              { element_index: 3, role: "AXSecureTextField", label: "Password", value: "hunter2" },
            ],
          },
          image: "iVBORw0KGgo=",
        };
      default:
        return { json: { ok: true } };
    }
  };
  return { call, calls };
}

const probes = { cua: async () => ({ version: "0.44.0" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" as const };

let core: Core;
let td: ReturnType<typeof tempDir>;
let worker: WebSocket;
let workerId = "";
const phone = macPhone();
const cua = macCua();
const told: [string, string][] = [];
const interrupted: string[] = [];
const decisions: Bodies["decision"][] = [];
let perms = { accessibility: false, screen: false };
let grants = 0;

async function client() {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 400; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  return { ws, frames, until, send: (f: object) => ws.send(JSON.stringify(f)) };
}
const until = async (ok: () => boolean | Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await ok()) && Date.now() < end) await Bun.sleep(10);
  return ok();
};
const macCard = async () => (await core.devicesView.frame()).devices.find((d) => d.id === workerId) as DeviceView;
const ab = (d: DeviceView, id: string) => d.abilities.find((a) => a.id === id)!;

beforeAll(async () => {
  td = tempDir();
  core = startCore({ dataDir: join(td.dir, "home"), port: 0, batchMs: 5, sweepMs: 50, push: false, platform: "linux", deviceProbes: probes });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async (taskId) => void interrupted.push(taskId);
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
  });

  // The MacBook joins as a worker and says what it can do (the real worker-side code).
  mkdirSync(join(td.dir, "mac"), { recursive: true });
  const paired = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook Pro", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
  workerId = paired.device.id;
  let sendUp: (f: object) => void = () => {};
  const browse = createWorkerBrowse({ dataDir: join(td.dir, "mac"), send: (f) => sendUp(f), env: {}, platform: "darwin", cua: probes.cua, native: async () => undefined, perms: async () => perms, phone: phone.host, cuaCall: cua.call, grant: async () => (grants++, { ok: true }) });
  worker = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${paired.token}` } } as any);
  sendUp = (f) => worker.readyState === WebSocket.OPEN && worker.send(JSON.stringify(f));
  const ops: Record<string, (a: any) => Promise<unknown>> = { ...browse.ops, ability: (a) => browse.set(a.id, a.on === true) };
  worker.onmessage = async (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req") return;
    try {
      const result = await ops[f.op]!(f.args ?? {});
      sendUp({ t: "res", id: f.id, ok: true, result: result ?? null });
    } catch (e) {
      sendUp({ t: "res", id: f.id, ok: false, error: (e as Error).message });
    }
  };
  await new Promise<void>((res) => (worker.onopen = () => res()));
  worker.send(JSON.stringify({ t: "hello", name: "MacBook Pro", os: "darwin", arch: "arm64", kind: "laptop", version: "0.0.40", abilities: await browse.abilities(), harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] }));
  await until(() => core.workers.online().some((w) => w.deviceId === workerId && !!w.hello));
});

afterAll(async () => {
  worker?.close();
  await core?.stop();
  td?.cleanup();
});

describe("the home is a Linux server, the MacBook its worker", () => {
  test("the home's card has neither (以后会有); the MacBook's has 用手机 on and 用电脑 to add", async () => {
    const home = (await core.devicesView.frame()).devices.find((d) => d.home)!;
    expect(ab(home, "phone").state).toBe("later");
    expect(ab(home, "computer").state).toBe("later");
    const mac = await macCard();
    expect(ab(mac, "phone")).toEqual({ id: "phone", state: "on" });
    expect(ab(mac, "computer")).toEqual({ id: "computer", state: "off", perms: { accessibility: false, screen: false } });
  });

  test("+ 用手机 on the MacBook's card: the install sheet's terms come from the MacBook", async () => {
    const c = await client();
    c.send({ t: "phone_terms", device: workerId });
    const f = await c.until<Extract<ServerFrame, { t: "phone_terms" }>>((x) => x.t === "phone_terms");
    expect(f).toMatchObject({ ok: true, download: 2_320_000_000, licenses: [{ id: "android-sdk-license" }] });
    c.send({ t: "phone_install", device: workerId, accepted: [{ id: "android-sdk-license", sha256: "abc" }] });
    expect(await c.until((x) => x.t === "phone_install_result")).toMatchObject({ ok: true });
    c.ws.close();
  });

  test("work in an app on a phone goes to the MacBook", async () => {
    const pick = await core.loadout.choose({ title: "看看小红书上的评价", needs: { phone: true } });
    expect(pick && "device" in pick ? pick.device : undefined).toBe("MacBook Pro");
  });

  test("the phone tools of a task on the MacBook drive the MacBook's phone; the gate stays on the home", async () => {
    core.log.append({ stream: "task:tp", origin: "partner", kind: "task_open", body: { taskId: "tp", title: "回消息", project: "", place: { kind: "none", device: workerId }, harness: "claude-code", brief: "回消息", needs: { phone: true } } as any });
    core.tasks.setState("tp", "working", "hot");
    const call = (name: string, args: object = {}) => core.mcp.call({ role: "task", taskId: "tp" }, name, args) as Promise<any>;
    const look = await call("phone_look");
    expect(String(look)).toContain("发送");
    await expect(call("phone_tap", { ref: 2 })).rejects.toThrow(/needs the user's Go/);
    expect(phone.did.some((d) => d.startsWith("tap"))).toBe(false);
    await call("phone_tap", { ref: 1 });
    expect(phone.did.some((d) => d.startsWith("tap"))).toBe(true);
    expect(phone.held()).toBe(1); // held for the task on the MacBook while it works
    // On hand says the task is using the MacBook's phone (so 看看 opens that one).
    expect(core.tasks.onHand().tasks.find((c) => c.taskId === "tp")?.phoning).toEqual({ device: workerId });
    core.tasks.setState("tp", "done", "warm");
    expect(await until(() => phone.held() === 0)).toBe(true);
  });

  test("the live view of the MacBook's phone opens there and streams its frames", async () => {
    const c = await client();
    c.send({ t: "phone_open", device: workerId, mode: "takeover" });
    const open = await c.until<Extract<ServerFrame, { t: "phone_view" }>>((x) => x.t === "phone_view" && (x as any).state === "open");
    expect(open.device).toBe("MacBook Pro");
    const frame = await c.until<Extract<ServerFrame, { t: "phone_frame" }>>((x) => x.t === "phone_frame");
    expect(Buffer.from(frame.data, "base64").subarray(0, 2).toString("hex")).toBe("ffd8");
    c.send({ t: "phone_input", id: open.id, input: { kind: "key", key: "back" } });
    expect(await until(() => phone.did.includes("key KEYCODE_BACK"))).toBe(true);
    c.send({ t: "phone_close", id: open.id });
    await c.until((x) => x.t === "phone_view" && (x as any).state === "closed");
    c.ws.close();
  });
});

describe("用电脑 / Use the computer on the MacBook", () => {
  test("+ 用电脑: saved on the MacBook; without macOS's two switches it says which, and the guide opens there", async () => {
    const c = await client();
    c.send({ t: "ability", device: workerId, ability: "computer", on: true });
    expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: true, on: true });
    expect(await until(async () => ab(await macCard(), "computer").reason === "computer_permissions")).toBe(true);
    expect(ab(await macCard(), "computer")).toMatchObject({ state: "unavailable", reason: "computer_permissions", perms: { accessibility: false, screen: false } });
    c.send({ t: "computer_grant", device: workerId });
    expect(await c.until((x) => x.t === "computer_grant_result")).toMatchObject({ ok: true, device: workerId });
    expect(grants).toBe(1);
    // The person flips both switches; the MacBook says so in its next abilities frame.
    perms = { accessibility: true, screen: true };
    c.send({ t: "ability", device: workerId, ability: "computer", on: true });
    expect(await until(async () => ab(await macCard(), "computer").state === "on")).toBe(true);
    c.ws.close();
  });

  test("work in a Mac app goes to the Mac with 用电脑", async () => {
    const pick = await core.loadout.choose({ title: "在邮件里回张三", needs: { app: "Mail" } });
    expect(pick && "device" in pick ? pick.device : undefined).toBe("MacBook Pro");
  });

  test("the app tools read and act on the MacBook; a send waits for Go; passwords and 1Password stay out", async () => {
    core.log.append({ stream: "task:ta", origin: "partner", kind: "task_open", body: { taskId: "ta", title: "回张三的邮件", project: "", place: { kind: "none", device: workerId }, harness: "claude-code", brief: "回邮件", needs: { app: "Mail" } } as any });
    core.tasks.setState("ta", "working", "hot");
    const call = (name: string, args: object = {}) => core.mcp.call({ role: "task", taskId: "ta" }, name, args) as Promise<any>;
    // A task that doesn't work in an app can't use them.
    await expect(core.mcp.call({ role: "task", taskId: "tp" }, "computer_apps", {})).rejects.toThrow(/can't use the user's apps/);

    const apps = String(await call("computer_apps"));
    expect(apps).toContain("Mail (com.apple.mail)");
    expect(apps).not.toContain("1Password");
    await expect(call("computer_look", { app: "1Password" })).rejects.toThrow(/theirs alone/);

    const text = String(await call("computer_look", { app: "Mail" }));
    expect(text).toContain('[2] Button "Send"');
    expect(text).toContain("[3] password field");
    expect(text).not.toContain("hunter2");
    await expect(call("computer_type", { ref: 3, text: "secret" })).rejects.toThrow(/password field/);

    await call("computer_type", { ref: 1, text: "周六见，不见不散" });
    expect(cua.calls.at(-1)).toEqual(["type_text", { pid: 501, window_id: 77, element_token: "s0000002a:1", text: "周六见，不见不散" }]);
    // On hand: the task is in Mail on the MacBook (with 停下 in the clients).
    expect(core.tasks.onHand().tasks.find((c) => c.taskId === "ta")?.computing).toEqual({ device: workerId, app: "Mail" });

    await expect(call("computer_click", { ref: 2 })).rejects.toThrow(/needs the user's Go/);
    expect(cua.calls.some(([t]) => t === "click")).toBe(false);
    await call("computer_ask_go", { what: "把回复发给张三" });
    const d = decisions.find((x) => x.taskId === "ta")!;
    expect(d).toMatchObject({ question: "把回复发给张三", goLabel: "Go", defaultOption: "hold", computer: { kind: "go", app: "Mail", label: "Send", effect: "send" } });
    core.decisions.decide(d.decisionId, "go");
    await call("computer_click", { ref: 2 });
    expect(cua.calls.at(-1)).toEqual(["click", { pid: 501, window_id: 77, element_token: "s0000002a:2" }]);
    // One Go, one action.
    await expect(call("computer_click", { ref: 2 })).rejects.toThrow(/needs the user's Go/);
    // Return in a mail app sends too.
    await expect(call("computer_key", { key: "return", modifiers: ["cmd"] })).rejects.toThrow(/needs the user's Go/);
  });

  test("停下 / Stop: every app tool refuses from then on, the turn is interrupted and the task is told", async () => {
    const c = await client();
    c.send({ t: "computer_stop", taskId: "ta" });
    expect(await c.until((x) => x.t === "computer_stop_result")).toMatchObject({ ok: true });
    expect(interrupted).toContain("ta");
    expect(told.some(([t, s]) => t === "ta" && s === COMPUTER_STOPPED)).toBe(true);
    await expect(core.mcp.call({ role: "task", taskId: "ta" }, "computer_look", { app: "Mail" })).rejects.toThrow(/停下/);
    expect(core.tasks.onHand().tasks.find((x) => x.taskId === "ta")?.computing).toBeUndefined();
    c.ws.close();
  });

  test("the MacBook re-checks: with 用电脑 removed there, no app tool runs even if the home asks", async () => {
    const c = await client();
    c.send({ t: "ability", device: workerId, ability: "computer", on: false });
    expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: true, on: false });
    const link = core.workers.link(workerId)!;
    await expect(link.call("computer_call", { tool: "list_apps", args: {} })).rejects.toThrow(/off on this Mac/);
    c.ws.close();
  });
});
