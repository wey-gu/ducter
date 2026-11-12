// D235: 用电脑 / Use the computer on the home Mac, and its pure parts: the gate, the ability, the words a
// task reads. cua-driver is a fake; the real one is never called from a test.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { writeAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { computerAbilityOf } from "../src/computer/ability.ts";
import { blockedMacApp, keyEffect } from "../src/computer/gate.ts";
import { appsOf, elementsOf } from "../src/computer/tools.ts";
import { workerPhoneOps } from "../src/android/remote.ts";
import { tempDir } from "./helpers.ts";

describe("the gate in the person's apps", () => {
  test("password managers, Keychain, banks, wallets, System Settings and the drivers are out of reach", () => {
    for (const a of [{ bundle: "com.1password.1password" }, { bundle: "com.bitwarden.desktop" }, { bundle: "com.apple.Passwords" }, { bundle: "com.apple.keychainaccess" }, { bundle: "com.apple.systempreferences" }, { name: "招商银行" }, { name: "PayPal" }, { bundle: "com.trycua.driver" }, { bundle: "co.nowledge.ducter" }]) expect(blockedMacApp(a)).toBe(true);
    for (const a of [{ bundle: "com.apple.mail", name: "Mail" }, { bundle: "com.apple.iWork.Keynote", name: "Keynote" }, { name: "Finder" }]) expect(blockedMacApp(a)).toBe(false);
  });
  test("Return sends in mail and chat apps; ⌘Return sends anywhere; ⌘Delete deletes; Tab is just Tab", () => {
    expect(keyEffect({ bundle: "com.tencent.xinWeChat" }, "return")).toBe("send");
    expect(keyEffect({ name: "Keynote" }, "return")).toBeUndefined();
    expect(keyEffect({ name: "Keynote" }, "Return", ["command"])).toBe("send");
    expect(keyEffect({ name: "Finder" }, "delete", ["cmd"])).toBe("delete");
    expect(keyEffect({ name: "Mail" }, "tab")).toBeUndefined();
  });
  test("a window's words: a password field's value is never kept", () => {
    const e = elementsOf({ snapshot_id: "s1", elements: [{ element_index: 4, role: "AXSecureTextField", label: "Password", value: "hunter2" }, { element_index: 5, role: "AXButton", label: "Sign In" }] });
    expect(e.snapshotId).toBe("s1");
    expect(e.elements[0]).toEqual({ index: 4, role: "SecureTextField", label: "Password", secure: true });
    expect(appsOf({ apps: [{ name: "1Password", bundle_id: "com.1password.1password", pid: 3, running: true }, { name: "Mail", bundle_id: "com.apple.mail", pid: 4, running: true }] }).map((a) => a.name)).toEqual(["Mail"]);
  });
});

describe("用电脑 on a card", () => {
  test("Macs only; off until added; added without the two switches it says which; on with both", () => {
    const td = tempDir();
    const p = (perms?: { accessibility: boolean; screen: boolean }, platform = "darwin") => computerAbilityOf({ platform, dataDir: td.dir, cua: { version: "0.44.0" }, perms });
    expect(p(undefined, "linux")).toEqual({ id: "computer", state: "later" });
    expect(computerAbilityOf({ platform: "darwin", dataDir: td.dir, cua: { missing: "cua-driver is not installed" }, perms: undefined })).toMatchObject({ state: "unavailable", reason: "cua_missing" });
    expect(p({ accessibility: true, screen: true })).toMatchObject({ state: "off" });
    writeAbilitySettings(td.dir, { computer: true });
    expect(p({ accessibility: true, screen: false })).toEqual({ id: "computer", state: "unavailable", reason: "computer_permissions", perms: { accessibility: true, screen: false } });
    expect(p({ accessibility: true, screen: true })).toEqual({ id: "computer", state: "on", perms: { accessibility: true, screen: true } });
    td.cleanup();
  });
});

describe("the worker's phone ops take a small fixed set, never a shell", () => {
  test("unknown methods, key codes and app ids are refused", async () => {
    const host: any = { setup: () => ({ state: "ready" }), device: { key: async () => {}, launch: async () => {}, hold: () => () => {} } };
    const w = workerPhoneOps(host);
    await expect(w.ops.phone_dev!({ m: "shell", a: { cmd: ["rm", "-rf", "/"] } })).rejects.toThrow(/no such phone method/);
    await expect(w.ops.phone_dev!({ m: "key", a: { code: "KEYCODE_BACK; reboot" } })).rejects.toThrow(/not a key code/);
    await expect(w.ops.phone_dev!({ m: "launch", a: { pkg: "../../x" } })).rejects.toThrow(/not an app id/);
    expect(await w.ops.phone_dev!({ m: "key", a: { code: "KEYCODE_BACK" } })).toEqual({});
  });
});

describe("用电脑 on the home Mac", () => {
  let core: Core;
  let td: ReturnType<typeof tempDir>;
  let perms = { accessibility: false, screen: false };
  let guides = 0;
  const calls: [string, any][] = [];
  const decisions: Bodies["decision"][] = [];
  beforeAll(() => {
    td = tempDir();
    core = startCore({
      dataDir: join(td.dir, "home"),
      port: 0,
      batchMs: 5,
      sweepMs: 50,
      push: false,
      platform: "darwin",
      ownPhone: false,
      deviceProbes: { cua: async () => ({ version: "0.44.0" }), native: async () => undefined, harnesses: async () => [], kind: async () => "laptop" },
      computer: {
        perms: async () => perms,
        grantGuide: async () => (guides++, { ok: true }),
        call: async (tool, args) => {
          calls.push([tool, args]);
          if (tool === "list_apps") return { json: { apps: [{ name: "Keynote", bundle_id: "com.apple.iWork.Keynote", pid: 900, running: true }] } };
          if (tool === "list_windows") return { json: { windows: [{ window_id: 5, title: "Q3", on_screen: true, layer: 0 }] } };
          if (tool === "get_window_state") return { json: { snapshot_id: "s9", elements: [{ element_index: 0, role: "AXMenuItem", label: "Export To" }, { element_index: 1, role: "AXButton", label: "Delete Slide" }] } };
          return { json: {} };
        },
      },
    });
    core.setRunner(stubRunner(core));
    core.setPartner({ onTrigger: () => {} });
    core.log.subscribe((e) => void (e.kind === "decision" && decisions.push(e.body as Bodies["decision"])));
  });
  afterAll(async () => {
    await core.stop();
    td.cleanup();
  });

  async function client() {
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res) => (ws.onopen = () => res()));
    ws.send(JSON.stringify({ t: "hello" }));
    const until = async (pred: (f: ServerFrame) => boolean) => {
      for (let i = 0; i < 400; i++) {
        const hit = frames.find(pred);
        if (hit) return hit;
        await Bun.sleep(10);
      }
      throw new Error("timeout");
    };
    return { ws, until, send: (f: object) => ws.send(JSON.stringify(f)) };
  }
  const home = async () => (await core.devicesView.frame()).devices[0]!.abilities.find((a) => a.id === "computer")!;

  test("+ 用电脑 on this Mac: the two switches, the guide, then on", async () => {
    expect(await home()).toMatchObject({ state: "off" });
    const c = await client();
    c.send({ t: "ability", device: "local", ability: "computer", on: true });
    expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: true });
    expect(await home()).toMatchObject({ state: "unavailable", reason: "computer_permissions" });
    c.send({ t: "computer_grant", device: "local" });
    expect(await c.until((x) => x.t === "computer_grant_result")).toMatchObject({ ok: true });
    expect(guides).toBe(1);
    perms = { accessibility: true, screen: true };
    core.devicesView.refresh();
    expect(await home()).toMatchObject({ state: "on" });
    c.ws.close();
  });

  test("a Keynote task on this Mac: reads, a menu item that deletes waits for Go", async () => {
    core.log.append({ stream: "task:tk", origin: "partner", kind: "task_open", body: { taskId: "tk", title: "导出 Q3", project: "", place: { kind: "none" }, harness: "claude-code", brief: "把 Q3 导出成 PDF", needs: { app: "Keynote" } } as any });
    core.tasks.setState("tk", "working", "hot");
    const call = (name: string, args: object = {}) => core.mcp.call({ role: "task", taskId: "tk" }, name, args) as Promise<any>;
    expect(String(await call("computer_look", { app: "Keynote" }))).toContain('[1] Button "Delete Slide"');
    await call("computer_menu", { path: ["File", "Export To", "PDF…"] });
    expect(calls.at(-1)).toEqual(["invoke_menu", { pid: 900, window_id: 5, path: ["File", "Export To", "PDF…"] }]);
    await expect(call("computer_menu", { path: ["Edit", "Delete Slide"] })).rejects.toThrow(/needs the user's Go/);
    await call("computer_ask_user", { what: "在 Keynote 里登录你的 iCloud" });
    expect(decisions.at(-1)).toMatchObject({ goLabel: "Done", defaultOption: "hold", computer: { kind: "user", app: "Keynote" } });
    expect(core.tasks.onHand().tasks.find((x) => x.taskId === "tk")?.computing).toEqual({ device: "local", app: "Keynote" });
  });
});
