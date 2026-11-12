// A demo core for 在哪儿都能用 / From anywhere's pictures (D228): hel is the home (a server, Claude
// Code signed in), set up step by step with the person's own Cloudflare account. Real core and real
// web client; cloudflared, Cloudflare and the setup task's agent are fakes (no network, nothing
// installed, no account touched).
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-anywhere.ts
// Then, on DEMO_CTL_PORT (7799), POST in order: /begin (the tap), /login (the agent's first step:
// the link and the QR), /signed (the person authorized), /create (the Go card), /go (their Go),
// /run (on); or /fail?step=dns (a name already taken) and /off.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "@ducter/core";
import type { TunnelSys } from "@ducter/core/src/anywhere.ts";
import { noOo } from "./demo-oo.ts";

const cert = `-----BEGIN ARGO TUNNEL TOKEN-----\n${Buffer.from(JSON.stringify({ zoneID: "z", accountID: "a", apiToken: "demo" })).toString("base64")}\n-----END ARGO TUNNEL TOKEN-----\n`;
let signIn: () => void = () => {};
let taken = false;
const live = new Set<number>();
let pid = 0;
const sys: TunnelSys = {
  ensure: async () => ({ bin: "/demo/cloudflared" }),
  login: (_b, home) => {
    let end!: (n: number) => void;
    const done = new Promise<number>((r) => (end = r));
    signIn = () => {
      mkdirSync(join(home, ".cloudflared"), { recursive: true });
      writeFileSync(join(home, ".cloudflared", "cert.pem"), cert);
      end(0);
    };
    return { url: Promise.resolve({ url: "https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fdemo", opened: process.env.DEMO_OPENED === "1" }), done, stop: () => end(143) };
  },
  exec: async (_b, args) => {
    if (args.includes("create")) {
      writeFileSync(args[args.indexOf("--credentials-file") + 1]!, "{}");
      return { code: 0, out: '{"id":"6ff42ae2-765d-4adf-8112-31c55c1551ef"}' };
    }
    if (taken) return { code: 1, out: "Failed to add route: code: 1003, reason: An A, AAAA, or CNAME record with that host already exists." };
    return { code: 0, out: `INF Added CNAME ${args.at(-1)} which will route to this tunnel` };
  },
  start: async () => (live.add(++pid), { pid }),
  alive: async (h) => !!h.pid && live.has(h.pid),
  stop: async (h) => void (h.pid && live.delete(h.pid)),
  ready: async () => true,
  resolves: async () => true,
  wsFirst: async () => core.anywhere.checkToken(),
  freePort: async () => 21000,
  fetch: (async (u: string | URL | Request) => {
    const url = String(u);
    if (url.includes("/zones/")) return Response.json({ success: true, result: { name: "weygu.com" } });
    if (url.endsWith("/.well-known/ducter-anywhere")) return new Response(core.anywhere.checkToken());
    return new Response("{}");
  }) as unknown as typeof fetch,
};

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  anywhereSys: sys,
  anywhereStepWaitMs: 400,
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, version: "2.1.319", how: "installer" }] as any,
    kind: async () => "server",
  },
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.34", body: "" })), how: "self", version: "0.0.34", homeName: "hel", autoEveryMs: 0 },
  agents: { autoEveryMs: 0 },
  memPlugins: { inspectLocal: async () => undefined, everyMs: 0, connected: () => false },
});
// The setup task: opened for real in the Log (its agent is this script's control port).
core.setRunner({
  ...stubRunner(core),
  openTask: async (i: { title: string; brief: string; harness?: string }) => {
    const taskId = "t_anywhere";
    core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: i.title, project: "", place: { kind: "none" }, harness: i.harness ?? "claude-code", brief: i.brief } } as any);
    core.tasks.setState(taskId, "working", "hot");
    return { taskId } as any;
  },
} as any);
core.setPartner({ onTrigger() {} });
core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios-safari" });

const card = () => core.log.read({ stream: "channel", kinds: ["decision"] }).map((e) => e.body as { decisionId: string; anywhere?: unknown }).filter((d) => d.anywhere).at(-1);
Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7799),
  async fetch(req) {
    const p = new URL(req.url);
    switch (p.pathname) {
      case "/begin":
        return Response.json(await core.anywhere.begin());
      case "/login":
        return Response.json(await core.anywhere.step("login"));
      case "/signed":
        signIn();
        return Response.json(await core.anywhere.step("login"));
      case "/create":
        return Response.json(await core.anywhere.step("create"));
      case "/go": {
        const d = card();
        if (d) core.decisions.decide(d.decisionId, "go");
        await Bun.sleep(50);
        return Response.json(await core.anywhere.step("create"));
      }
      case "/fail":
        taken = true;
        return Response.json(await core.anywhere.step("create"));
      case "/run":
        return Response.json(await core.anywhere.step("run"));
      case "/off":
        await core.anywhere.turnOff();
        return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`demo-anywhere: http://127.0.0.1:${core.port}/app · control on ${process.env.DEMO_CTL_PORT || 7799}`);
