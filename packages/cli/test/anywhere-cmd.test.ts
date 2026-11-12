// D228: `ducter anywhere` against a running core, cloudflared faked. The guided setup is played the
// way its task's agent plays it: `ducter anywhere step …` (the real command), the person's Go on the
// card (a decide frame), and the forwarded answer reaching the task.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import type { TunnelSys } from "@ducter/core/src/anywhere.ts";
import { cmdAnywhere } from "../src/anywhere-cmd.ts";
import { connect } from "../src/client.ts";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const cert = `-----BEGIN ARGO TUNNEL TOKEN-----\n${Buffer.from(JSON.stringify({ zoneID: "z1", accountID: "a", apiToken: "tok" })).toString("base64")}\n-----END ARGO TUNNEL TOKEN-----\n`;

function start(o: { own?: boolean; agent?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-anywhere-"));
  if (o.own) writeFileSync(join(dir, "public-url"), "https://hel.example.com\n");
  const live = new Set<number>();
  let pid = 0;
  let finish: (ok: boolean) => void = () => {};
  const execs: string[][] = [];
  const sys: TunnelSys = {
    ensure: async () => ({ bin: "/fake/cloudflared" }),
    login: (_b, home) => {
      let end!: (n: number) => void;
      const done = new Promise<number>((r) => (end = r));
      finish = (ok) => {
        if (ok) mkdirSync(join(home, ".cloudflared"), { recursive: true }), writeFileSync(join(home, ".cloudflared", "cert.pem"), cert);
        end(ok ? 0 : 1);
      };
      return { url: Promise.resolve({ url: "https://dash.cloudflare.com/argotunnel?callback=x", opened: false }), done, stop: () => end(143) };
    },
    exec: async (_b, args) => {
      execs.push(args);
      if (args.includes("create")) {
        writeFileSync(args[args.indexOf("--credentials-file") + 1]!, "{}");
        return { code: 0, out: '{"id":"6ff42ae2-765d-4adf-8112-31c55c1551ef"}' };
      }
      return { code: 0, out: `INF Added CNAME ${args.at(-1)} which will route to this tunnel` };
    },
    start: async () => (live.add(++pid), { pid }),
    alive: async (h) => !!h.pid && live.has(h.pid),
    stop: async (h) => void (h.pid && live.delete(h.pid)),
    ready: async () => true,
    resolves: async () => true,
    wsFirst: async () => core!.anywhere.checkToken(),
    freePort: async () => 21000,
    fetch: (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("/zones/")) return Response.json({ success: true, result: { name: "example.com" } });
      if (url.endsWith("/.well-known/ducter-anywhere")) return new Response(core!.anywhere.checkToken());
      return new Response("{}");
    }) as unknown as typeof fetch,
  };
  core = startCore({
    dataDir: dir,
    port: 0,
    push: false,
    batchMs: 5,
    platform: "darwin",
    anywhereSys: sys,
    anywhereStepWaitMs: 300,
    deviceProbes: { cua: async () => ({ missing: "x" }), native: async () => undefined, harnesses: async () => (o.agent === false ? [] : [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true }]), kind: async () => "laptop" },
    update: { autoEveryMs: 0 },
    agents: { autoEveryMs: 0 },
  });
  core.setPartner({ onTrigger: () => {} });
  const opened: any[] = [];
  const sent: { taskId: string; text: string }[] = [];
  core.setRunner({ openTask: async (i: any) => (opened.push(i), { taskId: "tsk_any" }), send: async (taskId: string, text: string) => void sent.push({ taskId, text }) } as any);
  return { core, opened, sent, execs, signIn: () => finish(true), live };
}

const run = async (c: Core, rest: string[], o: { json?: boolean; lang?: "en" | "zh"; token?: string; hostname?: string; waitMs?: number } = {}) => {
  const lines: string[] = [];
  const code = await cmdAnywhere({ t: translator(o.lang ?? "en"), style: plainStyle, target: { kind: "local", port: c.port }, json: !!o.json, rest, print: (s) => lines.push(s), qr: async () => "[qr]", ...(o.token ? { token: o.token } : {}), ...(o.hostname ? { hostname: o.hostname } : {}), ...(o.waitMs ? { waitMs: o.waitMs } : {}) });
  return { code, out: lines.join("\n") };
};
const step = async (c: Core, s: string, hostname?: string) => JSON.parse((await run(c, ["step", s], { json: true, ...(hostname ? { hostname } : {}) })).out);

test("the setup task's flow: sign in, the Go on the card, create and point, run; then status says on and off keeps the tunnel", async () => {
  const { core: c, opened, sent, execs, signIn, live } = start();
  expect((await run(c, ["status"])).out).toContain("From outside is off");
  // `ducter anywhere on` with nothing made yet starts the guided setup (one task).
  const on = JSON.parse((await run(c, ["on"], { json: true })).out);
  expect(on).toEqual({ ok: true, setup: true, taskId: "tsk_any" });
  expect(opened).toHaveLength(1);
  expect(opened[0].brief).toContain("anywhere step create --json");

  // The agent: login waits for the person, then answers done with the suggested name.
  const l1 = await step(c, "login");
  expect(l1).toMatchObject({ step: "login", state: "waiting", waiting: "login", url: "https://dash.cloudflare.com/argotunnel?callback=x" });
  signIn();
  expect(await step(c, "login")).toMatchObject({ state: "done", zone: "example.com", hostname: "ducter.example.com" });

  // create waits for the Go, asked on the card as a decision of the task.
  expect(await step(c, "create")).toMatchObject({ state: "waiting", waiting: "go", hostname: "ducter.example.com" });
  const card = c.log.read({ stream: "channel", kinds: ["decision"] }).map((e) => e.body as any).find((d) => d.anywhere);
  expect(card).toMatchObject({ taskId: "tsk_any", goLabel: "Set it up", defaultOption: "go", reversible: false, anywhere: { hostname: "ducter.example.com" } });
  expect(card.defaultAt).toBeUndefined(); // never applied by itself
  expect(card.question).toContain("Create a tunnel in your Cloudflare account and point ducter.example.com at");
  const ws = await connect({ kind: "local", port: c.port });
  ws!.send({ t: "decide", decisionId: card.decisionId, option: "go" });
  for (let i = 0; i < 100 && !sent.length; i++) await Bun.sleep(10);
  ws!.close();
  expect(sent[0]).toMatchObject({ taskId: "tsk_any", text: expect.stringContaining("Run the create step again now with --hostname ducter.example.com") });
  expect(await step(c, "create")).toMatchObject({ state: "done", hostname: "ducter.example.com" });
  expect(execs.map((x) => x[3])).toEqual(["create", "route"]);

  const r = await step(c, "run");
  expect(r).toMatchObject({ state: "done", hostname: "ducter.example.com" });
  const st = JSON.parse((await run(c, ["status"], { json: true })).out);
  expect(st).toMatchObject({ on: true, address: "https://ducter.example.com", anywhere: { how: "cloudflare", state: "on", hostname: "ducter.example.com" } });
  expect((await run(c, ["status"])).out).toContain("From outside: on, at https://ducter.example.com, through your own Cloudflare tunnel");
  // Pairing codes carry it now.
  const pc = await connect({ kind: "local", port: c.port });
  pc!.send({ t: "pair_code" });
  const code = (await pc!.next((f: ServerFrame) => f.t === "pair_code", 5000)) as Extract<ServerFrame, { t: "pair_code" }>;
  pc!.close();
  expect(code.link).toBe(`https://ducter.example.com/pair#c=${code.code}`);

  const off = await run(c, ["off"], { lang: "zh" });
  expect(off.out).toContain("通道和地址还留在你的 Cloudflare 账号里");
  expect(live.size).toBe(0);
  expect(JSON.parse((await run(c, ["status"], { json: true })).out)).toEqual({ on: false, anywhere: { how: "cloudflare", state: "off", hostname: "ducter.example.com" } });
  expect((await run(c, ["status"])).out).toContain("The tunnel for ducter.example.com is still in your Cloudflare account");
  // On again: the same tunnel, no setup, no new task.
  const again = await run(c, ["on"], { waitMs: 10_000 });
  expect(again.code).toBe(0);
  expect(again.out).toContain("on, at https://ducter.example.com");
  expect(again.out).toContain("Cloudflare decrypts the traffic at its edge");
  expect(opened).toHaveLength(1);
}, 20_000);

test("the terminal follows the setup: the sign-in link with a QR, each step as it ticks", async () => {
  const { core: c, signIn } = start();
  const p = run(c, ["on"], { waitMs: 3500 });
  await Bun.sleep(150);
  await step(c, "login"); // the agent's first step
  await Bun.sleep(1800); // the terminal looks every 1.5 s
  signIn();
  await step(c, "login");
  const r = await p;
  expect(r.out).toContain("Setting it up: a task does the steps with Cloudflare's own program.");
  expect(r.out).toContain("You need a domain on Cloudflare (the account is free).");
  expect(r.out).toContain("Open this link on your phone or any computer");
  expect(r.out).toContain("https://dash.cloudflare.com/argotunnel?callback=x");
  expect(r.out).toContain("[qr]");
  expect(r.out).toContain("✓ Sign in to Cloudflare and pick your domain");
  expect(r.code).toBe(1); // it stopped waiting here; the task carries on
}, 15_000);

test("no agent signed in here: on says so and offers the dashboard way", async () => {
  const { core: c } = start({ agent: false });
  const r = await run(c, ["on"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain("No AI agent is signed in on this computer");
  expect(r.out).toContain("ducter anywhere on --token <token> --hostname <name>");
});

test("a tunnel from Cloudflare's dashboard: --token and --hostname together, else usage", async () => {
  const { core: c } = start();
  expect((await run(c, ["on"], { token: "abc" })).code).toBe(2);
  const r = await run(c, ["on"], { token: "eyJhIjoiYSIsInQiOiJ0IiwicyI6InMifQ==", hostname: "home.example.com", waitMs: 10_000 });
  expect(r.code).toBe(0);
  expect(r.out).toContain("on, at https://home.example.com");
  expect((await run(c, ["step", "nope"])).code).toBe(2);
});

test("an address of the person's own: on already, and off points to ducter domain --remove", async () => {
  const { core: c } = start({ own: true });
  expect((await run(c, ["status"])).out).toContain("on, at your own address https://hel.example.com");
  const off = await run(c, ["off"]);
  expect(off.code).toBe(1);
  expect(off.out).toContain("ducter domain --remove");
  expect((await run(c, ["nonsense"])).code).toBe(2);
});
