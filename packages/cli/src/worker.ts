// `ducter worker <address> --code <code>`: this machine joins a Ducter running elsewhere as a
// worker, with the same one-time code a phone or an app window uses (D83; `--join` is a hidden
// alias for the address). It dials OUT (no inbound port here), says which harnesses it has, and stays
// connected. The main places tasks here over that socket; @ducter/runner's worker host runs
// them on this disk with this machine's harnesses (design/system.md "Workers").
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import type { Args } from "./args.ts";
import { realHost, runDoctor, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import * as runnerMod from "@ducter/runner";
import { scriptedHarness } from "./scripted.ts";
import { localDeviceKind } from "@ducter/core/src/devices.ts";
import { probeHarnesses as probeLocalHarnesses } from "@ducter/core/src/harness-probe.ts";
import { migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";

/** Exit status when the main refuses this worker; the unit sets RestartPreventExitStatus to it. */
export const EXIT_REFUSED = 3;

export interface WorkerSaved {
  url: string; // http(s) base of the main
  token: string;
  deviceId: string;
  persona: string;
  name: string;
}

/** Address as typed or the whole pairing link (…/pair#c=CODE) → http(s) base and maybe a code. */
export function parseJoin(raw: string): { base: string; code?: string } {
  let s = raw.trim();
  const m = /[#?&]c=([A-Za-z0-9-]+)/.exec(s);
  const code = m?.[1];
  s = s.replace(/[#?].*$/, "");
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(127\.|localhost|\[::1\])/.test(s) ? "http://" : "https://") + s;
  const u = new URL(s);
  if (u.protocol === "ws:") u.protocol = "http:";
  if (u.protocol === "wss:") u.protocol = "https:";
  u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/(pair|ws|worker)$/, "");
  u.hash = u.search = "";
  return { base: u.toString().replace(/\/+$/, ""), ...(code ? { code } : {}) };
}

const wsBase = (base: string) => base.replace(/^http/, "ws");

function load(file: string): WorkerSaved | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function save(file: string, s: WorkerSaved) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** The four first-wave harnesses on this machine (D85), as the main's Your devices shows them. */
async function probeHarnesses(_t: T, dataDir: string) {
  const host = realHost();
  const found = await probeLocalHarnesses({
    exec: async (argv, ms) => {
      const r = await host.run(argv, ms);
      return { code: r.code, out: r.stdout };
    },
    which: (c) => host.which(c),
    dataDir,
  });
  return found.map((h) => ({ id: h.harness, installed: h.installed, loggedIn: h.loggedIn }));
}

export async function cmdWorker(o: { t: T; style: Style; args: Args; dataDir: string }): Promise<number> {
  const { t, style, args } = o;
  const file = join(o.dataDir, "worker.json");
  let saved = existsSync(file) ? load(file) : undefined;

  if (args.join) {
    const { base, code: linkCode } = parseJoin(args.join);
    const code = args.code ?? linkCode;
    if (!code) return console.log(t("worker.usage")), 2;
    const name = args.name || hostname().replace(/\.local$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // role: the code is open to any device (D83); this one joins to do tasks.
        body: JSON.stringify({ code, name, platform: `${platform()}-${arch()}`, role: "worker" }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return console.log(t("worker.err.unreachable", { url: base })), 1;
    }
    if (res.status === 429) return console.log(t("worker.err.locked")), 1;
    if (res.status !== 200) return console.log(t("worker.err.code")), 1;
    const j: any = await res.json();
    saved = { url: base, token: j.token, deviceId: j.deviceId, persona: j.personaName ?? "Ducter", name };
    save(file, saved);
    console.log(`  ${style.ok("✓")} ${t("worker.joined", { name, persona: saved.persona, url: base })}`);
  }
  if (!saved) return console.log(t("worker.usage")), 2;
  // D102: a worker's keys live in its own <dataDir>/keys.env, as on the main.
  try {
    migrateKeys(o.dataDir);
    scrubKeysFromEnv(readKeys(o.dataDir));
  } catch {
    /* an unreadable data folder fails louder below */
  }

  const hello = {
    t: "hello",
    name: saved.name,
    os: platform(),
    arch: arch(),
    kind: await localDeviceKind(),
    version: pkg.version,
    harnesses: await probeHarnesses(t, o.dataDir),
  };
  // DUCTER_SCRIPTED_MODEL=1: canned model words, real tools (scripted.ts), for demos and e2e.
  const harness = process.env.DUCTER_SCRIPTED_MODEL === "1" ? scriptedHarness(runnerMod) : runnerMod.createOarHarnessPort({ dataDir: o.dataDir });
  const s = saved;
  return stayConnected(s, hello, t, style, (send) => runnerMod.createWorkerHost({ dataDir: o.dataDir, harness, mainBase: s.url, deviceToken: s.token, send }));
}

/** One outbound socket, reconnecting with backoff; exits only when the main refuses this worker. */
async function stayConnected(
  s: WorkerSaved,
  hello: object,
  t: T,
  style: Style,
  makeHost: (send: (f: object) => void) => runnerMod.WorkerHost,
): Promise<number> {
  let backoff = 1000;
  let announced = false;
  for (;;) {
    const outcome = await new Promise<"closed" | "refused" | "app">((resolve) => {
      const ws = new WebSocket(`${wsBase(s.url)}/worker`, { headers: { authorization: `Bearer ${s.token}` } } as any);
      let ping: ReturnType<typeof setInterval> | undefined;
      const host = makeHost((f) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f));
      });
      ws.onopen = () => {
        ws.send(JSON.stringify(hello));
        ping = setInterval(() => ws.send(JSON.stringify({ t: "ping" })), 30_000);
      };
      ws.onmessage = (m) => {
        const f = JSON.parse(String(m.data));
        if (f.t === "req") return void host.handle(f);
        if (f.t === "welcome") {
          backoff = 1000;
          if (!announced) console.log(`  ${style.ok("●")} ${t("worker.connected", { url: s.url, name: s.name })}`);
          announced = true;
        }
      };
      ws.onclose = async () => {
        clearInterval(ping);
        // Nobody to report to: stop the sessions; the main resumes them by id when we're back.
        await host.closeAll();
        // Was it the gate? A GET with the token answers 401 when the token is gone.
        try {
          const r = await fetch(`${s.url}/worker`, { headers: { authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(5000) });
          if (r.status === 401) return resolve("refused");
          // Joined as an app (a Ducter older than D83 ignores role): it can't do tasks with this token.
          if (r.status === 403) return resolve("app");
        } catch {}
        resolve("closed");
      };
    });
    if (outcome === "app") {
      console.log(t("worker.asApp", { url: s.url }));
      return EXIT_REFUSED;
    }
    if (outcome === "refused") {
      console.log(t("worker.refused", { url: s.url }));
      return EXIT_REFUSED;
    }
    console.log(style.dim(t("worker.lost", { url: s.url, s: Math.round(backoff / 1000) })));
    await Bun.sleep(backoff);
    backoff = Math.min(backoff * 2, 30_000);
  }
}
