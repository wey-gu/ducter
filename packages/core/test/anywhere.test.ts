// D228: 在哪儿都能用 / From anywhere with the person's own Cloudflare account and domain. cloudflared
// (login, create, route, run), its metrics and the network are faked: the guided setup step by
// step, a failure at each step, a Ducter restart, off and on again, a dashboard tunnel's token,
// and a request through the tunnel counting as remote.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { anywhereDir, certZone, cleanHostname, cloudflaredArgs, createAnywhere, parseCreate, parseRoute, setupBrief, stopSavedTunnel, tunnelConfig, type LoginRun, type SetupDeps, type TunnelHandle, type TunnelStart, type TunnelSys } from "../src/anywhere.ts";
import { isLocalRequest } from "../src/auth.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-anywhere-"));
  dirs.push(d);
  return d;
};
const env = { DUCTER_ADDR_RELAY: undefined } as Record<string, string | undefined>;
const until = async (f: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
};

/** A cert.pem as `cloudflared tunnel login` leaves it: the token block (zone, account, API token). */
const certPem = (zone = "zone-1") => `-----BEGIN ARGO TUNNEL TOKEN-----\n${Buffer.from(JSON.stringify({ zoneID: zone, accountID: "acc", apiToken: "secret-api-token" })).toString("base64")}\n-----END ARGO TUNNEL TOKEN-----\n`;

type Fail = { download?: boolean; noUrl?: boolean; loginExpires?: boolean; create?: string; route?: string; unreachable?: boolean; zone?: "none" };

function fakeSys(f: Fail = {}) {
  let next = 100;
  const procs = new Map<number, { start: TunnelStart; ready: boolean }>();
  const starts: TunnelStart[] = [];
  const execs: string[][] = [];
  const logins: { dir: string; finish: (ok: boolean) => void }[] = [];
  let opened = false;
  let check = () => "";
  const sys: TunnelSys = {
    async ensure(onGetting) {
      onGetting();
      return f.download ? { error: "download", detail: "checksum" } : { bin: "/fake/cloudflared" };
    },
    login(_bin, dir): LoginRun {
      let finish!: (code: number) => void;
      const done = new Promise<number>((r) => (finish = r));
      logins.push({
        dir,
        finish: (ok) => {
          if (ok) {
            mkdirSync(join(dir, ".cloudflared"), { recursive: true });
            writeFileSync(join(dir, ".cloudflared", "cert.pem"), certPem(), { mode: 0o600 });
          }
          finish(ok ? 0 : 1);
        },
      });
      if (f.loginExpires) setTimeout(() => finish(1), 20);
      return { url: Promise.resolve(f.noUrl ? undefined : { url: "https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc", opened }), done, stop: () => finish(143) };
    },
    async exec(_bin, args) {
      execs.push(args);
      if (args.includes("create")) {
        if (f.create) return { code: 1, out: `2026-11-12T10:00:00Z ERR ${f.create}` };
        writeFileSync(args[args.indexOf("--credentials-file") + 1]!, '{"AccountTag":"acc","TunnelSecret":"s","TunnelID":"t"}');
        return { code: 0, out: JSON.stringify({ id: "6ff42ae2-765d-4adf-8112-31c55c1551ef", name: args.at(-1), created_at: "2026-11-12T10:00:00Z" }) };
      }
      if (args.includes("route")) {
        if (f.route) return { code: 1, out: `failed to add route: code: 1003, reason: ${f.route}` };
        return { code: 0, out: `2026-11-12T10:00:01Z INF Added CNAME ${args.at(-1)} which will route to this tunnel tunnelID=6ff42ae2-765d-4adf-8112-31c55c1551ef` };
      }
      return { code: 1, out: "unknown" };
    },
    async start(s) {
      starts.push(s);
      const pid = next++;
      procs.set(pid, { start: s, ready: true });
      return { pid };
    },
    async alive(h: TunnelHandle) {
      return !!h.pid && procs.has(h.pid);
    },
    async stop(h: TunnelHandle) {
      if (h.pid) procs.delete(h.pid);
    },
    async ready(mp) {
      return [...procs.values()].find((p) => p.start.metricsPort === mp)?.ready ?? false;
    },
    async resolves() {
      return true;
    },
    async wsFirst(u) {
      return f.unreachable || !u.startsWith("wss://") ? undefined : check();
    },
    async freePort() {
      return 20000 + starts.length;
    },
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://api.cloudflare.com/client/v4/zones/")) return f.zone === "none" ? Response.json({ success: false }, { status: 403 }) : Response.json({ success: true, result: { name: "example.com" } });
      if (url.endsWith("/.well-known/ducter-anywhere")) return f.unreachable ? new Response("bad gateway", { status: 530 }) : new Response(check());
      return new Response("not found", { status: 404 });
    }) as typeof fetch,
  };
  return {
    sys,
    procs,
    starts,
    execs,
    logins,
    setOpened: (v: boolean) => (opened = v),
    answer: (fn: () => string) => (check = fn),
  };
}

function setupDeps() {
  const asks: { taskId: string; hostname: string; id: string }[] = [];
  const tasks: { brief: string; title: string }[] = [];
  const openTasks = new Set<string>();
  const deps: SetupDeps = {
    async openTask(brief, title) {
      tasks.push({ brief, title });
      const id = `t${tasks.length}`;
      openTasks.add(id);
      return id;
    },
    open: (id) => openTasks.has(id),
    ask(taskId, hostname) {
      const id = `d${asks.length + 1}`;
      asks.push({ taskId, hostname, id });
      return id;
    },
    cli: () => "ducter --port 7777",
    homeName: () => "Wey's MacBook",
    zh: () => false,
    qr: (t) => [t.length > 0 ? "1010" : ""],
  };
  return { deps, asks, tasks, openTasks };
}

function make(o: { fail?: Fail; own?: string; startMs?: number; stepWaitMs?: number } = {}) {
  const dataDir = tmp();
  if (o.own) writeFileSync(join(dataDir, "public-url"), o.own + "\n");
  const f = fakeSys(o.fail);
  const s = setupDeps();
  const own = () => (existsSync(join(dataDir, "public-url")) ? readFileSync(join(dataDir, "public-url"), "utf8").trim() : undefined);
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, own, setup: s.deps, stepWaitMs: o.stepWaitMs ?? 200, startMs: o.startMs ?? 3000, log: () => {} });
  f.answer(() => a.checkToken());
  return { dataDir, f, s, a, own };
}

const states = (a: ReturnType<typeof createAnywhere>) => Object.fromEntries((a.view()?.setup?.steps ?? []).map((x) => [x.id, x.state]));

test("set it up for me: a task, then sign-in, the Go, the tunnel and its DNS, run, checked, and pairing uses it", async () => {
  const { dataDir, f, s, a, own } = make();
  const seen: string[] = [];
  a.onChange(() => {
    const st = a.view()?.setup?.steps.filter((x) => x.state !== "todo").map((x) => `${x.id}:${x.state}`).join(",");
    if (st && seen.at(-1) !== st) seen.push(st);
  });
  const b = await a.begin();
  expect(b).toEqual({ ok: true, taskId: "t1" });
  expect(s.tasks[0]!.title).toBe("Make Wey's MacBook reachable from anywhere");
  expect(s.tasks[0]!.brief).toContain("`ducter --port 7777 anywhere step login --json`");
  expect(a.view()).toMatchObject({ how: "cloudflare", state: "setup", setup: { taskId: "t1" } });
  expect(states(a)).toEqual({ get: "todo", login: "todo", name: "todo", create: "todo", dns: "todo", run: "todo", check: "todo", use: "todo" });

  // The person signs in: the link (and a QR) on the card while the step waits for them.
  const l1 = await a.step("login");
  expect(l1).toMatchObject({ step: "login", state: "waiting", waiting: "login", url: expect.stringContaining("https://dash.cloudflare.com/argotunnel?") });
  expect(l1.next).toContain("QR code");
  expect(a.view()?.setup?.login).toMatchObject({ url: l1.url, opened: false, qr: ["1010"] });
  expect(states(a)).toMatchObject({ get: "done", login: "waiting" });
  // cloudflared's HOME is Ducter's own folder, never the person's ~/.cloudflared.
  expect(f.logins[0]!.dir).toBe(anywhereDir(dataDir));
  f.logins[0]!.finish(true);
  const l2 = await a.step("login");
  expect(l2).toMatchObject({ state: "done", zone: "example.com", hostname: "ducter.example.com" });
  expect(a.view()?.setup?.login).toBeUndefined();

  // Creating in their account waits for their Go, asked once on the card for that name.
  const c1 = await a.step("create");
  expect(c1).toMatchObject({ state: "waiting", waiting: "go", hostname: "ducter.example.com" });
  expect(await a.step("create")).toMatchObject({ state: "waiting", waiting: "go" });
  expect(s.asks).toEqual([{ taskId: "t1", hostname: "ducter.example.com", id: "d1" }]);
  expect(states(a).name).toBe("waiting");
  expect(f.execs).toEqual([]);
  a.answered("d1", true);
  expect(states(a).name).toBe("done");
  const c2 = await a.step("create");
  expect(c2).toMatchObject({ state: "done", hostname: "ducter.example.com" });
  const cert = join(anywhereDir(dataDir), ".cloudflared", "cert.pem");
  const cred = join(anywhereDir(dataDir), "tunnel.json");
  expect(f.execs[0]!.slice(0, 7)).toEqual(["tunnel", "--origincert", cert, "create", "--output", "json", "--credentials-file"]);
  expect(f.execs[0]!.at(-1)).toMatch(/^ducter-wey-s-macbook-[0-9a-f]{4}$/);
  expect(f.execs[1]).toEqual(["tunnel", "--origincert", cert, "route", "dns", "6ff42ae2-765d-4adf-8112-31c55c1551ef", "ducter.example.com"]);
  expect(statSync(cred).mode & 0o777).toBe(0o400);
  expect(statSync(anywhereDir(dataDir)).mode & 0o777).toBe(0o700);

  // Run: started beside Ducter with its own config, checked over HTTPS and a socket, then used.
  const r = await a.step("run");
  expect(r).toMatchObject({ state: "done", hostname: "ducter.example.com" });
  expect(own()).toBe("https://ducter.example.com");
  expect(a.view()).toMatchObject({ how: "cloudflare", state: "on", hostname: "ducter.example.com" });
  expect(a.view()?.setup).toBeUndefined();
  const cfg = readFileSync(f.starts[0]!.configFile, "utf8");
  expect(cfg).toContain("tunnel: 6ff42ae2-765d-4adf-8112-31c55c1551ef");
  expect(cfg).toContain(`credentials-file: ${cred}`);
  expect(cfg).toContain("  - hostname: ducter.example.com\n    service: http://127.0.0.1:7777\n  - service: http_status:404");
  expect(f.starts[0]!.envFile).toBeUndefined();
  // The card's list ticked in order, by itself.
  expect(seen.at(-1)).toBe("get:done,login:done,name:done,create:done,dns:done,run:done,check:done,use:done");
  // Nothing secret in the state file.
  const state = readFileSync(join(anywhereDir(dataDir), "state.json"), "utf8");
  expect(state).not.toContain("secret-api-token");
  expect(statSync(join(anywhereDir(dataDir), "state.json")).mode & 0o777).toBe(0o600);
  a.close();
});

test("on a Mac home cloudflared opens the browser itself; the step says so", async () => {
  const { f, a } = make();
  f.setOpened(true);
  await a.begin();
  const l = await a.step("login");
  expect(l.next).toContain("A browser window opened on this computer");
  expect(a.view()?.setup?.login?.opened).toBe(true);
  a.close();
});

test("a sign-in that ends without a certificate fails the step, and asking again gives a fresh link", async () => {
  const { f, a } = make({ fail: { loginExpires: true } });
  await a.begin();
  const r = await a.step("login");
  expect(r).toMatchObject({ state: "failed", reason: "login" });
  expect(r.next).toContain("again for a fresh link");
  expect(a.view()?.setup?.steps.find((x) => x.id === "login")).toMatchObject({ state: "failed", reason: "login" });
  await a.step("login");
  expect(f.logins.length).toBe(2);
  a.close();
});

test("each step fails honestly: the download, the tunnel, the DNS name taken (never overwritten), the check", async () => {
  // Download (or its checksum).
  {
    const { a } = make({ fail: { download: true } });
    await a.begin();
    expect(await a.step("login")).toMatchObject({ state: "failed", reason: "download", detail: "checksum" });
    expect(a.view()?.setup?.steps[0]).toMatchObject({ id: "get", state: "failed" });
    a.close();
  }
  const signedIn = async (fail: Fail) => {
    const x = make({ fail, ...(fail.unreachable ? { startMs: 50, stepWaitMs: 3000 } : {}) });
    await x.a.begin();
    await x.a.step("login");
    x.f.logins[0]!.finish(true);
    await x.a.step("login");
    await x.a.step("create");
    x.a.answered("d1", true);
    return x;
  };
  {
    const { a } = await signedIn({ create: "Create Tunnel API call failed: tunnel quota reached" });
    const r = await a.step("create");
    expect(r).toMatchObject({ state: "failed", reason: "cloudflare", detail: expect.stringContaining("quota") });
    expect(a.view()?.setup?.steps.find((x) => x.id === "create")?.state).toBe("failed");
    a.close();
  }
  {
    const { a, f } = await signedIn({ route: "An A, AAAA, or CNAME record with that host already exists." });
    const r = await a.step("create");
    expect(r).toMatchObject({ state: "failed", reason: "taken" });
    expect(r.next).toContain("Never overwrite it");
    expect(f.execs.find((x) => x.includes("route"))).not.toContain("--overwrite-dns");
    a.close();
  }
  {
    const { a, own } = await signedIn({ unreachable: true });
    await a.step("create");
    const r = await a.step("run");
    expect(r).toMatchObject({ state: "failed", reason: "unreachable" });
    expect(r.next).toContain("DNS can take a few minutes");
    expect(a.view()).toMatchObject({ state: "failed", reason: "unreachable", hostname: "ducter.example.com" });
    expect(a.view()?.setup?.steps.find((x) => x.id === "run")?.state).toBe("done"); // connected
    expect(a.view()?.setup?.steps.find((x) => x.id === "check")).toMatchObject({ state: "failed", reason: "unreachable" });
    expect(own()).toBeUndefined(); // never used before it answers
    a.close();
  }
});

test("another name instead: a reply to the Go card asks again for that name; a name outside the domain is refused", async () => {
  const { s, f, a } = make();
  await a.begin();
  await a.step("login");
  f.logins[0]!.finish(true);
  await a.step("login");
  await a.step("create");
  expect(await a.step("create", { hostname: "home.example.com" })).toMatchObject({ state: "waiting", waiting: "go", hostname: "home.example.com" });
  expect(s.asks.map((x) => x.hostname)).toEqual(["ducter.example.com", "home.example.com"]);
  a.answered("d1", true); // the old card: not this name
  expect(await a.step("create", { hostname: "home.example.com" })).toMatchObject({ state: "waiting" });
  const bad = await a.step("create", { hostname: "ducter.other.org" });
  expect(bad).toMatchObject({ state: "failed", detail: "zone" });
  expect(bad.next).toContain("isn't under example.com");
  expect((await a.step("create", { hostname: "not a name" })).detail).toBe("hostname");
  expect(f.execs).toEqual([]);
  a.close();
});

test("when the domain can't be read from the sign-in, the agent asks the person which one", async () => {
  const { f, a } = make({ fail: { zone: "none" } });
  await a.begin();
  await a.step("login");
  f.logins[0]!.finish(true);
  const l = await a.step("login");
  expect(l).toMatchObject({ state: "done" });
  expect(l.hostname).toBeUndefined();
  expect(l.next).toContain("Ask the user which domain");
  expect((await a.step("create")).next).toContain("--hostname ducter.<that domain>");
  a.close();
});

async function setUp() {
  const x = make();
  await x.a.begin();
  await x.a.step("login");
  x.f.logins[0]!.finish(true);
  await x.a.step("login");
  await x.a.step("create");
  x.a.answered("d1", true);
  await x.a.step("create");
  await x.a.step("run");
  return x;
}

test("a Ducter restart (an update) keeps the tunnel: adopted, not started again; a lost one is started again", async () => {
  const { dataDir, f, s, a } = await setUp();
  a.close();
  const b = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, own: () => readFileSync(join(dataDir, "public-url"), "utf8").trim(), setup: s.deps, log: () => {} });
  await b.resume();
  expect(f.starts.length).toBe(1);
  expect(b.view()).toMatchObject({ state: "on", hostname: "ducter.example.com" });
  // The computer restarted: the tunnel is gone; the next look starts it again (same address).
  f.procs.clear();
  await b.tick();
  expect(f.starts.length).toBe(2);
  expect(b.view()).toMatchObject({ state: "on", hostname: "ducter.example.com" });
  b.close();
});

test("an address that stops leading here three looks in a row (while connected) restarts the tunnel", async () => {
  const { f, a } = await setUp();
  // The address answers again only once the tunnel was started afresh.
  f.answer(() => (f.starts.length >= 2 ? a.checkToken() : "nope"));
  for (let i = 0; i < 14; i++) await a.tick();
  expect(f.starts.length).toBe(1); // two misses: nothing yet
  await a.tick();
  expect(f.starts.length).toBe(2);
  expect(a.view()?.state).toBe("on");
  a.close();
});

test("off stops the tunnel and takes the address out; the tunnel stays in the account, and on again needs no setup", async () => {
  const { dataDir, f, a, own } = await setUp();
  await a.turnOff();
  expect(f.procs.size).toBe(0);
  expect(own()).toBeUndefined();
  expect(a.view()).toEqual({ how: "cloudflare", state: "off", hostname: "ducter.example.com" });
  expect(existsSync(join(anywhereDir(dataDir), "tunnel.json"))).toBe(true);
  expect(await a.turnOn()).toEqual({ ok: true });
  await until(() => a.view()?.state === "on");
  expect(own()).toBe("https://ducter.example.com");
  expect(f.execs.filter((x) => x.includes("create")).length).toBe(1);
  a.close();
});

test("on with nothing made yet answers no_address (the card offers the setup)", async () => {
  const { a } = make();
  expect(await a.turnOn()).toEqual({ ok: false, reason: "no_address" });
  a.close();
});

test("a tunnel from Cloudflare's dashboard: its token kept 0600 in a file, never on a command line, then checked and used", async () => {
  const { dataDir, f, a, own } = make();
  expect(await a.turnOn({ token: "eyJhIjoiYWNjIiwidCI6InR1biIsInMiOiJzZWNyZXQifQ==", hostname: "https://Home.Example.com/" })).toEqual({ ok: true });
  await until(() => a.view()?.state === "on");
  const envFile = f.starts[0]!.envFile!;
  expect(envFile).toBe(join(anywhereDir(dataDir), "token.env"));
  expect(readFileSync(envFile, "utf8")).toBe("TUNNEL_TOKEN=eyJhIjoiYWNjIiwidCI6InR1biIsInMiOiJzZWNyZXQifQ==\n");
  expect(statSync(envFile).mode & 0o777).toBe(0o600);
  expect(cloudflaredArgs(f.starts[0]!).join(" ")).not.toContain("eyJ");
  expect(own()).toBe("https://home.example.com");
  expect(await a.turnOn({ token: "short", hostname: "home.example.com" })).toMatchObject({ ok: false, detail: "token" });
  a.close();
});

test("an address set up another way (ducter domain) wins: shown as its own, no setup offered over it", async () => {
  const { a } = make({ own: "https://hel.example.com" });
  expect(a.view()).toEqual({ how: "own", state: "on" });
  expect(await a.begin()).toMatchObject({ ok: false, reason: "own_address" });
  expect(await a.turnOn()).toMatchObject({ ok: false, reason: "own_address" });
  a.close();
});

test("a setup task that stopped can start again; what was done stays done", async () => {
  const { s, f, a } = make();
  await a.begin();
  await a.step("login");
  f.logins[0]!.finish(true);
  await a.step("login");
  expect(await a.begin()).toMatchObject({ ok: false, reason: "running", taskId: "t1" });
  s.openTasks.delete("t1");
  expect(await a.begin()).toEqual({ ok: true, taskId: "t2" });
  expect(states(a)).toMatchObject({ get: "done", login: "done", name: "todo" });
  a.cancel();
  expect(a.view()).toBeUndefined();
  a.close();
});

test("cloudflared's command line and config: this Ducter only, its own config and metrics, run", () => {
  expect(cloudflaredArgs({ metricsPort: 20001, configFile: "/d/anywhere/cloudflared.yml" })).toEqual(["tunnel", "--no-autoupdate", "--config", "/d/anywhere/cloudflared.yml", "--metrics", "127.0.0.1:20001", "run"]);
  expect(tunnelConfig({ tunnelId: "id", credentials: "/c.json", hostname: "h.example.com", port: 7777 })).toContain("no-autoupdate: true");
});

test("what cloudflared prints, read: the route's name, a taken name, the tunnel id; hostnames; the cert's zone", async () => {
  expect(parseRoute("2026-11-12T10:00:01Z INF Added CNAME ducter.example.com which will route to this tunnel tunnelID=x")).toEqual({ hostname: "ducter.example.com" });
  expect(parseRoute("INF ducter.example.com is already configured to route to your tunnel tunnelID=x")).toEqual({ hostname: "ducter.example.com" });
  expect(parseRoute("Failed to add route: code: 1003, reason: An A, AAAA, or CNAME record with that host already exists.")).toMatchObject({ reason: "taken" });
  expect(parseRoute("ERR Unauthorized")).toMatchObject({ reason: "cloudflare" });
  expect(parseCreate('{"id":"6ff42ae2-765d-4adf-8112-31c55c1551ef","name":"n"}')).toEqual({ id: "6ff42ae2-765d-4adf-8112-31c55c1551ef" });
  expect(parseCreate("Created tunnel n with id 6ff42ae2-765d-4adf-8112-31c55c1551ef")).toEqual({ id: "6ff42ae2-765d-4adf-8112-31c55c1551ef" });
  expect(parseCreate("ERR tunnel with name already exists")).toMatchObject({ reason: "taken" });
  expect(cleanHostname("https://Ducter.Example.com/")).toBe("ducter.example.com");
  expect(cleanHostname("ducter")).toBeUndefined();
  expect(cleanHostname("a b.com")).toBeUndefined();
  let asked = "";
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    asked = `${String(u)} ${(init?.headers as Record<string, string>).authorization}`;
    return Response.json({ success: true, result: { name: "Example.com" } });
  }) as typeof fetch;
  expect(await certZone(certPem("z9"), f)).toBe("example.com");
  expect(asked).toBe("https://api.cloudflare.com/client/v4/zones/z9 Bearer secret-api-token");
  expect(await certZone("-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", f)).toBeUndefined();
});

test("the setup brief: only Ducter's steps, never cloudflared by hand, never overwrite, no credentials printed", () => {
  const b = setupBrief({ cli: "ducter --port 7777", device: "hel", zh: true });
  for (const s of ["login", "create", "run"]) expect(b).toContain(`\`ducter --port 7777 anywhere step ${s} --json\``);
  expect(b).toContain("Never run cloudflared yourself");
  expect(b).toContain("never delete or overwrite a DNS record");
  expect(b).toContain("never print or copy files from Ducter's data folder");
  expect(b).toContain("Chinese");
});

test("a request through the tunnel is never local: loopback peer, but the outside Host and Cloudflare's headers", () => {
  // As measured through a real Cloudflare tunnel (research/67 §4).
  const req = new Request("http://127.0.0.1:7777/ws", {
    headers: { host: "ducter.example.com", "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https", "cdn-loop": "cloudflare; loops=1" },
  });
  expect(isLocalRequest(req, "127.0.0.1")).toBe(false);
  const sneaky = new Request("http://127.0.0.1:7777/ws", { headers: { host: "127.0.0.1:7777", "cf-connecting-ip": "203.0.113.9" } });
  expect(isLocalRequest(sneaky, "127.0.0.1")).toBe(false);
});

test("uninstall stops the tunnel a data folder keeps (it outlives Ducter by design)", async () => {
  const { dataDir, f, a } = await setUp();
  a.close();
  await stopSavedTunnel(dataDir, f.sys);
  expect(f.procs.size).toBe(0);
  expect(dirname(join(anywhereDir(dataDir), "state.json"))).toBe(anywhereDir(dataDir));
});
