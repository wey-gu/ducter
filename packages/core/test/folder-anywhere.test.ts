// D272: a project is any folder on the computer that does the work, git or not. 新建一个文件夹 /
// New folder on {computer} makes one there (the home's own, or a worker's) and adds it; 登录 GitHub /
// Sign in to GitHub on {computer} runs that computer's own gh (a fake here: no real sign-in), its
// code and link reach the client that asked, then its end; a pasted token goes to that computer only.
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GitLoginState, LogEvent, ServerFrame } from "@ducter/protocol";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { createGitLogin, type GhRun } from "@ducter/protocol/src/git-login.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(extra: Partial<Parameters<typeof startCore>[0]> = {}): { core: Core; dir: string } {
  const t = tempDir();
  const harnesses = async () => [{ harness: "codex", installed: true, loggedIn: true }];
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "server" }, ...extra });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: (_e: LogEvent) => {} });
  return { core, dir: t.dir };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 6000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  const ask = async <K extends ServerFrame["t"]>(f: object, t: K, pred: (x: Extract<ServerFrame, { t: K }>) => boolean = () => true): Promise<Extract<ServerFrame, { t: K }>> => {
    const before = frames.length;
    ws.send(JSON.stringify(f));
    return until<Extract<ServerFrame, { t: K }>>((x) => x.t === t && frames.indexOf(x) >= before && pred(x as Extract<ServerFrame, { t: K }>));
  };
  return { ask, until, frames };
}

/** hel's worker, the author's Mac: folders made there, its gh signed out until a sign-in. */
function fakeMac(state: { online: boolean; made: string[]; tokens: string[]; account?: string }) {
  const folders: Record<string, FolderInfo> = {};
  let waitDone: (s: GitLoginState) => void = () => {};
  return {
    nameOf: (dev: string) => (dev === "wmac" ? "Macbook Pro M3" : undefined),
    homeName: () => "Hetzner Server",
    workers: () => [{ id: "wmac", name: "Macbook Pro M3", online: state.online }],
    async folderInfo(dev: string, path: string) {
      if (dev !== "wmac" || !state.online) return "offline" as const;
      return folders[path] ?? { exists: false };
    },
    async newFolder(dev: string, name: string) {
      if (dev !== "wmac" || !state.online) return "offline" as const;
      state.made.push(name);
      const path = `/Users/weyl/ducter/projects/${name}`;
      folders[path] = { exists: true, kind: "folder", root: path, name };
      return { ok: true as const, path, name };
    },
    async gitLogin(dev: string, action: string, token: string | undefined): Promise<GitLoginState> {
      if (dev !== "wmac" || !state.online) return { state: "offline" };
      if (action === "status") return state.account ? { state: "signed_in", account: state.account } : { state: "signed_out" };
      if (action === "start") return { state: "code", code: "AB12-CD34", url: "https://github.com/login/device" };
      if (action === "wait") return new Promise((r) => (waitDone = r));
      if (action === "token") {
        state.tokens.push(token ?? "");
        state.account = "wey-gu";
        return { state: "signed_in", account: "wey-gu" };
      }
      return { state: "cancelled" };
    },
    approve() {
      state.account = "wey-gu";
      waitDone({ state: "signed_in", account: "wey-gu" });
    },
  };
}

test("D272: New folder on the home: made in its Ducter folder, a plain folder, added and offered", async () => {
  const { core, dir } = boot();
  const c = await client(core);
  const r = await c.ask({ t: "project_new", name: "发票", clientId: "n1" }, "project_new_result");
  const path = join(dir, "ducter", "projects", "发票");
  expect(r).toMatchObject({ ok: true, clientId: "n1", place: { name: "发票", added: true, place: { kind: "folder", device: "local", path } } });
  expect(r.device).toBeUndefined();
  // The same name again is that folder; a path is refused before anything is made.
  expect(await c.ask({ t: "project_new", name: "发票", clientId: "n2" }, "project_new_result")).toMatchObject({ ok: true, existed: true });
  expect(await c.ask({ t: "project_new", name: "../../etc", clientId: "n3" }, "project_new_result")).toMatchObject({ ok: false, reason: "invalid" });
  expect(existsSync(join(dir, "etc"))).toBe(false);
  // The card lists it (git isn't needed for a project).
  const o = await c.ask({ t: "task_new_options" }, "task_new_options");
  expect(o.places.some((p) => p.added && p.place.kind === "folder" && p.name === "发票")).toBe(true);
});

test("D272: New folder on a worker: made there, added there; away says so", async () => {
  const mac = { online: true, made: [] as string[], tokens: [] as string[] };
  const { core } = boot({ newTaskComputers: fakeMac(mac) as never });
  const c = await client(core);
  const r = await c.ask({ t: "project_new", name: "Trip plans", device: "wmac", clientId: "m1" }, "project_new_result");
  expect(r).toMatchObject({ ok: true, device: "wmac", place: { name: "Trip plans", place: { kind: "folder", device: "wmac", path: "/Users/weyl/ducter/projects/Trip plans" } } });
  expect(mac.made).toEqual(["Trip plans"]);
  mac.online = false;
  expect(await c.ask({ t: "project_new", name: "x", device: "wmac", clientId: "m2" }, "project_new_result")).toMatchObject({ ok: false, reason: "offline" });
});

test("D272: Sign in to GitHub on a worker: its code and link, then the account, to the client that asked", async () => {
  const mac = { online: true, made: [] as string[], tokens: [] as string[] };
  const fake = fakeMac(mac);
  const { core } = boot({ newTaskComputers: fake as never });
  const c = await client(core);
  expect(await c.ask({ t: "git_login", action: "status", device: "wmac", clientId: "g0" }, "git_login_state")).toMatchObject({ host: "github.com", device: "wmac", state: "signed_out" });
  const code = await c.ask({ t: "git_login", action: "start", device: "wmac", clientId: "g1" }, "git_login_state");
  expect(code).toMatchObject({ clientId: "g1", device: "wmac", state: "code", code: "AB12-CD34", url: "https://github.com/login/device" });
  fake.approve();
  expect(await c.until((f) => f.t === "git_login_state" && f.clientId === "g1" && f.state !== "code")).toMatchObject({ state: "signed_in", account: "wey-gu" });
  // The token fallback reaches that computer and never comes back.
  const tok = "ghp_" + "c".repeat(36);
  const t = await c.ask({ t: "git_login", action: "token", token: tok, device: "wmac", clientId: "g2" }, "git_login_state");
  expect(t).toMatchObject({ state: "signed_in", account: "wey-gu" });
  expect(mac.tokens).toEqual([tok]);
  expect(JSON.stringify(c.frames)).not.toContain(tok);
  mac.online = false;
  expect(await c.ask({ t: "git_login", action: "status", device: "wmac", clientId: "g3" }, "git_login_state")).toMatchObject({ state: "offline" });
});

test("D272: Sign in to GitHub on the home: its own gh (faked), set up for git", async () => {
  const calls: string[] = [];
  let signed = false;
  const run: GhRun = async (args, o) => {
    calls.push(args.join(" "));
    if (args[1] === "status") return signed ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, login: "wey-gu" }] } }), err: "" } : { code: 1, out: "", err: "" };
    if (args[1] === "login") {
      o.onErr?.("! First copy your one-time code: WXYZ-0001\nOpen this URL to continue in your web browser: https://github.com/login/device\n");
      await Bun.sleep(30);
      signed = true;
    }
    return { code: 0, out: "", err: "" };
  };
  const { core } = boot({ gitLoginHome: createGitLogin({ run }) });
  const c = await client(core);
  const first = await c.ask({ t: "git_login", action: "start", clientId: "h1" }, "git_login_state");
  expect(first).toMatchObject({ state: "code", code: "WXYZ-0001" });
  expect(first.device).toBeUndefined();
  expect(await c.until((f) => f.t === "git_login_state" && f.clientId === "h1" && f.state !== "code")).toMatchObject({ state: "signed_in", account: "wey-gu" });
  expect(calls).toContain("auth setup-git --hostname github.com");
});
