// The near-real E2E rig (pre-release gate, design/release/README.md): a Linux VM like hel, with
// Ducter as the systemd user service, driven from a headless client on this Mac that is the Mac
// app's own client and frame decoder (apps/desktop/cmd/e2eclient). Everything lives in one scratch
// folder and one colima profile, both removed at the end; nothing of this Mac's own Ducter
// (~/.ducter, :7777, /Applications/Ducter.app, LaunchAgents) is read or touched.
//
//   bun run e2e:linux                 # build three versions, run every step, clean up
//   bun run e2e:linux --keep          # leave the VM and the scratch folder for a look
//   DUCTER_E2E_DIR=… bun run e2e:linux --skip-build   # reuse the builds in that folder
//   … --keep --skip-build --reuse-vm                   # and the kept VM (a fresh ~/.ducter in it)
//
// Steps:
//   1. build   three Linux bundles of this checkout (versions V1 < V2 < V3, made up and high so
//              they can't be mistaken for real ones) the way the release workflow does, a local
//              release feed and mirror for them, and the headless client;
//   2. vm      a colima VM (Ubuntu, systemd) of its own profile, mounting only the scratch folder;
//   3. install V1 from its tarball with its own install.sh --service (the systemd user service);
//   4. update  twice in place, V1 → V2 → V3, each from the client's 更新 (device_update): the
//              card must never say 没更新成 once the home runs the target (D167);
//   5. browse  add 上网 (Ducter's own browser; its system libraries with the line Ducter says),
//              then 试一下 (live_open try): real JPEG frames must arrive and decode;
//   6. agent   pi (a fake package on a local npm registry) 1.5.0 → 1.5.1 from the card; then the
//              author's MacBook case: a worker whose pi was updated by hand is asked to update
//              again (a stale view): "nothing newer" must not show as a failure;
//   7. all     全部更新 / Update all (D224): V3 → V4 and pi 1.5.1 → 1.5.2 on the home in one tap, the
//              worker away (said, not part of it): the home first, pi only after the home is back,
//              the same plan finished by the restarted home.
//   8. anywhere 在哪儿都能用 / From anywhere (D228), with no Cloudflare account: the setup's first
//              step downloads and checks the real cloudflared in the VM and gets a real sign-in
//              link from it (headless: a link to open elsewhere); then a dashboard tunnel's
//              token with a fake cloudflared: run in its own systemd user unit, the token in a
//              0600 file and never on a command line, the outside check failing honestly, the
//              unit kept across a restart of ducter.service, and off stopping it.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const argv = new Set(process.argv.slice(2));
const KEEP = argv.has("--keep");
const SKIP_BUILD = argv.has("--skip-build");
const REUSE_VM = argv.has("--reuse-vm"); // iterate on a kept VM (with --keep before)
const PROFILE = process.env.DUCTER_E2E_PROFILE ?? "ducter-e2e";
const DIR = resolve(process.env.DUCTER_E2E_DIR ?? mkdtempSync(join(tmpdir(), "ducter-e2e-")));
const PORT = 47777; // never 7777: lima forwards the VM's ports to this Mac's loopback
const SRV = 47800;
// DUCTER_E2E_PROXY=1: the VM reaches the internet through a proxy on this Mac (scripts/e2e/proxy.ts),
// for networks where the VM's own IPv4 NAT is dead (IPv6-only + 464XLAT, macOS "CLAT46").
const PROXY_PORT = 47999;
const PROXY = process.env.DUCTER_E2E_PROXY === "1" ? `http://host.lima.internal:${PROXY_PORT}` : "";
const proxyEnv = PROXY
  ? `export http_proxy=${PROXY} https_proxy=${PROXY} HTTP_PROXY=${PROXY} HTTPS_PROXY=${PROXY} no_proxy=127.0.0.1,localhost NO_PROXY=127.0.0.1,localhost\n`
  : "";
// apt under sudo and the systemd user services (Ducter itself, its browser and agent downloads) get it too.
// apt's mirrors switch to https: each download then rides a long-lived CONNECT tunnel, where plain
// http through the proxy opened one connection per file and lima's host forward refused many of them.
const proxySetup = PROXY
  ? `sudo sed -i 's|http://ports.ubuntu.com|https://ports.ubuntu.com|g; s|http://archive.ubuntu.com|https://archive.ubuntu.com|g; s|http://security.ubuntu.com|https://security.ubuntu.com|g' /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null || true
echo 'Acquire::http::Proxy "${PROXY}"; Acquire::https::Proxy "${PROXY}"; Acquire::Retries "3";' | sudo tee /etc/apt/apt.conf.d/99ducter-e2e-proxy >/dev/null
systemctl --user set-environment http_proxy=${PROXY} https_proxy=${PROXY} HTTP_PROXY=${PROXY} HTTPS_PROXY=${PROXY} no_proxy=127.0.0.1,localhost NO_PROXY=127.0.0.1,localhost
`
  : "";
const VERSIONS = ["9.0.1", "9.0.2", "9.0.3", "9.0.4"] as const;
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const WS = `ws://127.0.0.1:${PORT}/ws`;
const HTTP = `http://127.0.0.1:${PORT}`;

mkdirSync(DIR, { recursive: true });
const logFile = join(DIR, "e2e.log");
const results: { step: string; ok: boolean; detail: string }[] = [];
const say = (s: string) => {
  console.log(s);
  writeFileSync(logFile, s + "\n", { flag: "a" });
};

async function run(cmd: string[], o: { cwd?: string; env?: Record<string, string>; quiet?: boolean; ok?: boolean; timeoutMs?: number } = {}): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(cmd, { cwd: o.cwd ?? ROOT, env: { ...process.env, ...o.env }, stdout: "pipe", stderr: "pipe" });
  const timer = o.timeoutMs ? setTimeout(() => p.kill(), o.timeoutMs) : undefined;
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  writeFileSync(logFile, `$ ${cmd.join(" ").replace(/-token \S+/, "-token …")}\n${out}${err}\n[exit ${code}]\n`, { flag: "a" });
  if (o.ok !== false && code !== 0) throw new Error(`${cmd.slice(0, 4).join(" ")}… exited ${code}: ${(err || out).trim().split("\n").slice(-5).join(" | ")}`);
  return { code, out: out + (err && !o.quiet ? err : "") };
}

/** A shell script run inside the VM (written into the shared folder: no quoting through ssh). */
let nScript = 0;
async function vm(script: string, o: { ok?: boolean; timeoutMs?: number } = {}) {
  const f = join(DIR, "vm", `step-${++nScript}.sh`);
  mkdirSync(join(DIR, "vm"), { recursive: true });
  writeFileSync(f, `set -eu\n${proxyEnv}export DUCTER_PORT=${PORT}\nexport PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"\nexport XDG_RUNTIME_DIR="/run/user/$(id -u)"\n${script}\n`);
  return run(["colima", "ssh", "-p", PROFILE, "--", "bash", f], { ...o });
}

const client = (...args: string[]) => run([join(DIR, "bin", "e2eclient"), "-url", WS, "-token", token, ...args], { timeoutMs: 200_000 });
const clientJson = async (...args: string[]) => JSON.parse((await client(...args)).out.trim().split("\n").at(-1)!);
let token = "";

function check(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  say(`${ok ? "  ✓" : "  ✗"} ${step}: ${detail}`);
  if (!ok) throw new Error(`${step}: ${detail}`);
}

async function until<T>(what: string, fn: () => Promise<T | undefined>, ms: number, every = 2000): Promise<T> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v !== undefined) return v;
    } catch (e) {
      last = e;
    }
    await Bun.sleep(every);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (last: ${(last as Error).message})` : ""}`);
}

const devices = async () => (await clientJson("devices")).devices as any[];
const home = async () => (await devices()).find((d) => d.home);

// ---------- 1. build ----------

const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

function feed(version: string, zh: string, en: string) {
  writeFileSync(
    join(DIR, "srv", "feed.json"),
    JSON.stringify({
      tag_name: `v${version}`,
      name: `Ducter ${version}`,
      html_url: `https://github.com/wey-gu/ducter/releases/tag/v${version}`,
      body: `**A made-up release for the E2E rig, written in English only**\n- With a long English line the zh card must never show, cut mid-sentence or not\n\n<!-- whats-new\nzh: ${zh}\nen: ${en}\n-->\n`,
      assets: [{ name: "SHA256SUMS.txt" }, { name: `ducter-${version}-linux-${ARCH}.tar.gz` }],
    }),
  );
}

async function build() {
  say(`build: ${VERSIONS.join(", ")} for linux-${ARCH} in ${DIR}`);
  const src = join(DIR, "src");
  rmSync(src, { recursive: true, force: true });
  // This checkout as it is (uncommitted changes included), without the heavy parts.
  await run(["rsync", "-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", ".shots", "--exclude", "apps/ios", "--exclude", "apps/desktop", "--exclude", "apps/promo", "--exclude", ".claude", "./", src + "/"]);
  await run(["bun", "install", "--frozen-lockfile"], { cwd: src, quiet: true });
  const pkgFile = join(src, "packages/cli/package.json");
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  for (const v of VERSIONS) {
    writeFileSync(pkgFile, JSON.stringify({ ...pkg, version: v }, null, 2) + "\n");
    const name = `ducter-${v}-linux-${ARCH}`;
    const out = join(DIR, "build", name);
    mkdirSync(out, { recursive: true });
    await run(["sh", "packages/cli/build.sh", join(out, "ducter")], { cwd: src, env: { DUCTER_TARGET: `bun-linux-${ARCH}` }, timeoutMs: 600_000 });
    cpSync(join(src, "scripts/install.sh"), join(out, "install.sh"));
    const rel = join(DIR, "srv", "releases", `v${v}`);
    mkdirSync(rel, { recursive: true });
    await run(["tar", "-C", join(DIR, "build"), "-czf", join(rel, `${name}.tar.gz`), name]);
    writeFileSync(join(rel, "SHA256SUMS.txt"), `${sha256(join(rel, `${name}.tar.gz`))}  ${name}.tar.gz\n`);
    say(`  built ${name}`);
  }
  mkdirSync(join(DIR, "bin"), { recursive: true });
  await run(["go", "build", "-o", join(DIR, "bin", "e2eclient"), "./cmd/e2eclient"], { cwd: join(ROOT, "apps/desktop") });
  // The fake pi: prints its version, like `pi --version`.
  mkdirSync(join(DIR, "srv", "npm"), { recursive: true });
  for (const v of ["1.5.0", "1.5.1", "1.5.2"]) {
    const p = join(DIR, "pkg", v, "package");
    mkdirSync(join(p, "bin"), { recursive: true });
    writeFileSync(join(p, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: v, bin: { pi: "bin/pi.js" } }));
    writeFileSync(join(p, "bin", "pi.js"), `#!/usr/bin/env node\nconsole.log("${v}");\n`, { mode: 0o755 });
    await run(["tar", "-C", join(DIR, "pkg", v), "-czf", join(DIR, "srv", "npm", `pi-${v}.tgz`), "package"]);
  }
  writeFileSync(join(DIR, "srv", "npm", "latest"), "1.5.0\n");
  cpSync(join(ROOT, "scripts/e2e/servers.mjs"), join(DIR, "srv.mjs"));
}

// ---------- 2. the VM ----------

async function startVm() {
  const list = await run(["colima", "list", "-j"], { ok: false, quiet: true });
  const there = list.out.includes(`"name":"${PROFILE}"`);
  if (REUSE_VM && there && list.out.includes(`"name":"${PROFILE}","status":"Running"`)) {
    say(`vm: reusing the running colima profile ${PROFILE}`);
    await vm(`systemctl --user stop ducter.service ducter-e2e-worker.service ducter-e2e-servers.service 2>/dev/null || true
systemctl --user reset-failed 2>/dev/null || true
rm -rf ~/.ducter ~/.ducter-worker ~/e2e ~/.npm-global ~/.config/systemd/user/ducter.service
systemctl --user daemon-reload
command -v node >/dev/null || { sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends nodejs npm >/dev/null; }
systemd-run --user --unit=ducter-e2e-servers --collect node ${DIR}/srv.mjs ${DIR}/srv ${SRV}
for i in $(seq 1 50); do curl -fsS http://127.0.0.1:${SRV}/feed >/dev/null 2>&1 && break; sleep 0.2; done`);
    return;
  }
  if (there) await run(["colima", "delete", "-p", PROFILE, "-f"], { ok: false });
  say(`vm: colima profile ${PROFILE} (mounts only ${DIR})`);
  // --activate=false: this Mac's Docker context stays as it is.
  await run(["colima", "start", "-p", PROFILE, "--cpus", "4", "--memory", "6", "--disk", "30", "--vm-type", "vz", "--mount-type", "virtiofs", "--mount", `${DIR}:w`, "--activate=false", "--save-config=false"], { timeoutMs: 900_000 });
  const os = await vm(`. /etc/os-release; echo "$PRETTY_NAME"; systemctl --version | head -1; uname -m`);
  say(`  ${os.out.trim().split("\n").join(" · ")}`);
  await vm(
    // Lingering, as on a server (\`loginctl enable-linger\` times out talking to logind in colima's
    // image, so the same thing by hand): the user's systemd runs without a login session.
    `sudo mkdir -p /var/lib/systemd/linger && sudo touch "/var/lib/systemd/linger/$USER"
sudo systemctl start "user@$(id -u).service"
systemctl --user is-system-running || true
${proxySetup}sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends nodejs npm >/dev/null
node --version
systemd-run --user --unit=ducter-e2e-servers --collect node ${DIR}/srv.mjs ${DIR}/srv ${SRV}
for i in $(seq 1 50); do curl -fsS http://127.0.0.1:${SRV}/feed >/dev/null 2>&1 && break; sleep 0.2; done`,
    { timeoutMs: 900_000 },
  );
}

// ---------- 3. install ----------

async function install() {
  const [v1] = VERSIONS;
  feed(v1, "第一版", "The first one");
  const env = [
    `DUCTER_UPDATE_FEED=http://127.0.0.1:${SRV}/feed`,
    `DUCTER_UPDATE_MIRROR=http://127.0.0.1:${SRV}/releases`,
    `DUCTER_NPM_REGISTRY=http://127.0.0.1:${SRV}`,
    `npm_config_registry=http://127.0.0.1:${SRV}/`,
    // The fake pi lives under ~/.npm-global (an npm prefix, as on many servers).
    `PATH=__HOME__/.npm-global/bin:__HOME__/.local/bin:/usr/local/bin:/usr/bin:/bin`,
  ].join("\n");
  mkdirSync(join(DIR, "vm"), { recursive: true });
  writeFileSync(join(DIR, "vm", "env"), env + "\n");
  await vm(
    `mkdir -p ~/.ducter ~/e2e
sed "s|__HOME__|$HOME|g" ${join(DIR, "vm", "env")} > ~/.ducter/env
npm config set registry http://127.0.0.1:${SRV}/
npm install -g --prefix ~/.npm-global @earendil-works/pi-coding-agent@1.5.0 >/dev/null
pi --version
# pi shows on a card once it is signed in (devices.ts): a made-up key, never used for a turn here.
mkdir -p ~/.pi/agent && printf '{"e2e":{"type":"api_key","key":"e2e-not-a-real-key"}}\n' > ~/.pi/agent/auth.json
tar -xzf ${DIR}/srv/releases/v${v1}/ducter-${v1}-linux-${ARCH}.tar.gz -C ~/e2e
sh ~/e2e/ducter-${v1}-linux-${ARCH}/install.sh --service
for i in $(seq 1 100); do curl -fsS http://127.0.0.1:${PORT}/health >/dev/null 2>&1 && break; sleep 0.3; done
systemctl --user is-active ducter.service`,
    { timeoutMs: 300_000 },
  );
  // Pair like a Mac: a code made on the home, redeemed over the port from this Mac.
  const code = JSON.parse((await vm(`ducter pair --json`)).out.trim().split("\n").at(-1)!).code;
  const r = await until(
    "the home's port on this Mac",
    async () => {
      const res = await fetch(`${HTTP}/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name: "e2e-mac", platform: "darwin", form: "app", computer: "e2e-mac" }) });
      return res.ok ? ((await res.json()) as { token: string }) : undefined;
    },
    30_000,
    1000,
  );
  token = r.token;
  const h = await home();
  check("install", h?.version === v1 && h?.update?.how === "self", `the home runs ${h?.version} as the systemd user service, updates itself (${h?.update?.how})`);
}

// ---------- 4. two updates in place ----------

async function selfUpdate(to: string, zh: string, en: string) {
  feed(to, zh, en);
  await clientJson("send", JSON.stringify({ t: "device_update", device: "local", check: true }), "-wait", "update_result");
  const before = await home();
  check(`see ${to}`, before?.update?.latest === to && before.update.available === true, `the card offers ${to} (notesBy.zh ${JSON.stringify(before?.update?.notesBy?.zh)}, no English notes: ${before?.update?.notes === undefined})`);
  check(`notes ${to}`, JSON.stringify(before.update.notesBy?.zh) === JSON.stringify([zh]) && before.update.notes === undefined, "what's new is the release's own zh line, never the English body");
  const res = await clientJson("send", JSON.stringify({ t: "device_update", device: "local" }), "-wait", "update_result");
  check(`start ${to}`, res.ok === true, `更新 answered ${JSON.stringify({ ok: res.ok, reason: res.reason })}`);
  const failedOnTarget: string[] = [];
  const after = await until(
    `the home on ${to}`,
    async () => {
      const h = await home();
      if (h?.update?.phase === "failed" && h.version === to) failedOnTarget.push(JSON.stringify(h.update));
      if (h?.update?.phase === "failed" && h.version !== to) throw new Error(`failed: ${JSON.stringify(h.update)}`);
      return h?.version === to ? h : undefined;
    },
    300_000,
    3000,
  );
  // The restarted home reads the helper's result.json when it lands (D167): give it a moment.
  await Bun.sleep(8000);
  const settled = await home();
  check(`update → ${to}`, failedOnTarget.length === 0 && settled.update?.phase !== "failed", `now ${after.version}, the card says ${settled.update?.phase ?? "nothing"} (never 没更新成 on the target${failedOnTarget.length ? `; saw ${failedOnTarget[0]}` : ""})`);
}

// ---------- 5. Ducter's own browser and Try it ----------

async function browse() {
  await clientJson("send", JSON.stringify({ t: "ability", device: "local", ability: "web", on: true }), "-wait", "ability_result").catch(() => undefined);
  const ran = new Set<string>();
  let lastSetup = "";
  const web = await until(
    "上网 on the home",
    async () => {
      const ab = (await home())?.abilities?.find((a: any) => a.id === "web");
      if (ab?.state === "on" && !ab.setup) return ab; // "installing": Chrome is still downloading
      if (ab?.setup && ab.setup !== lastSetup) say(`  上网: ${(lastSetup = ab.setup)}`);
      // The one line Ducter says to run (its libraries; on Ubuntu 23.10+ as a normal user, the
      // AppArmor profile that lets its Chrome start its sandbox): run it once, as a person would.
      const oneLine = ab?.reason === "browser_deps" || ab?.reason === "browser_sandbox";
      if (ab?.state === "unavailable" && oneLine && ab.detail && !ran.has(ab.reason)) {
        ran.add(ab.reason);
        say(`  Ducter says (${ab.reason}): ${ab.detail.length > 160 ? ab.detail.slice(0, 157) + "..." : ab.detail} (running it, as the card asks)`);
        await vm(`sudo DEBIAN_FRONTEND=noninteractive ${ab.detail.replace(/^sudo /, "")} >/dev/null`, { timeoutMs: 600_000 });
        await clientJson("send", JSON.stringify({ t: "ability", device: "local", ability: "web", on: true }), "-wait", "ability_result").catch(() => undefined);
        return undefined;
      }
      if (ab?.state === "unavailable") return { failed: `${ab.reason} ${ab.detail ?? ""}` };
      return undefined;
    },
    900_000,
    5000,
  );
  check("browse", !web.failed, web.failed ? `上网 unavailable: ${web.failed}` : `上网 is on (Chrome for Testing ${web.detail ?? ""}; the lines it asked for: ${[...ran].join(", ") || "none"})`);
  const t = await clientJson("try", "-frames", "3", "-timeout", "120s");
  check("try it", t.open && t.frames >= 3 && t.width > 0 && !!t.device, `${t.frames} JPEG frames ${t.width}×${t.height} (${Math.round(t.bytes / 1024)} KB), the first after ${t.firstFrameMs} ms, from ${t.browser?.name} ${t.browser?.version ?? ""} on "${t.device}", page ${t.url}`);
}

// ---------- 6. an AI agent's update, on the home and on a worker ----------

const piOn = (d: any) => d?.harnesses?.find((h: any) => h.harness === "pi");

async function agent() {
  writeFileSync(join(DIR, "srv", "npm", "latest"), "1.5.1\n");
  await clientJson("send", JSON.stringify({ t: "agent_update", device: "local", harness: "pi", check: true }), "-wait", "agent_update_result").catch(() => undefined);
  const seen = await until("pi 1.5.1 offered", async () => {
    const p = piOn(await home());
    return p?.available && p.latest === "1.5.1" ? p : undefined;
  }, 60_000);
  check("agent offered", seen.version === "1.5.0" && seen.how === "npm", `pi ${seen.version} (${seen.how}), 有新版本 ${seen.latest}`);
  const r = await clientJson("send", JSON.stringify({ t: "agent_update", device: "local", harness: "pi" }), "-wait", "agent_update_result");
  check("agent start", r.ok === true, JSON.stringify({ ok: r.ok, reason: r.reason }));
  const done = await until("pi on 1.5.1", async () => {
    const p = piOn(await home());
    if (p?.update?.phase === "failed") throw new Error(`failed: ${JSON.stringify(p.update)}`);
    return p?.version === "1.5.1" && p.update?.phase === "done" ? p : undefined;
  }, 180_000);
  check("agent update", true, `pi ${done.version}, the card says ${done.update.phase}`);

  // The author's MacBook: a worker whose pi the home still thinks is older. Back to 1.5.0 by hand,
  // the worker joins (its hello says 1.5.0), then pi goes to 1.5.1 by hand behind its back.
  const code = JSON.parse((await vm(`ducter pair --json`)).out.trim().split("\n").at(-1)!).code;
  await vm(
    `npm install -g --prefix ~/.npm-global @earendil-works/pi-coding-agent@1.5.0 >/dev/null
mkdir -p ~/.ducter-worker
systemd-run --user --unit=ducter-e2e-worker --collect --setenv=DUCTER_DATA_DIR=$HOME/.ducter-worker --setenv=PATH="$PATH" --setenv=npm_config_registry=http://127.0.0.1:${SRV}/ \\
  "$(command -v ducter)" worker --join http://127.0.0.1:${PORT} --code ${code} --name e2e-worker`,
    { timeoutMs: 120_000 },
  );
  const w = await until("the worker online with pi 1.5.0", async () => {
    const d = (await devices()).find((x) => !x.home && x.name === "e2e-worker" && x.state === "awake");
    return piOn(d)?.version === "1.5.0" ? d : undefined;
  }, 90_000);
  await vm(`npm install -g --prefix ~/.npm-global @earendil-works/pi-coding-agent@1.5.1 >/dev/null; pi --version`);
  const stale = piOn((await devices()).find((x) => x.id === w.id));
  check("stale view", stale?.version === "1.5.0" && stale.available, `the home still thinks the worker's pi is ${stale?.version} and offers ${stale?.latest} (as on the MacBook)`);
  const res = await clientJson("send", JSON.stringify({ t: "agent_update", device: w.id, harness: "pi" }), "-wait", "agent_update_result");
  const fresh = await until("the worker's fresh list", async () => {
    const p = piOn((await devices()).find((x) => x.id === w.id));
    return p?.version === "1.5.1" ? p : undefined;
  }, 60_000);
  check("no stale failure", fresh.update?.phase !== "failed" && !fresh.available, `更新 answered ${res.reason ?? (res.ok ? "ok" : "?")}; the card now says pi ${fresh.version}, ${fresh.update?.phase ?? "no update line"}, nothing offered (was: 没更新成 · 没有更新的版本)`);
}

// ---------- 7. 全部更新 / Update all (D224) ----------

async function updateAll() {
  const to = VERSIONS[3];
  // The worker goes away: it is said as away, never part of the plan.
  await vm(`systemctl --user stop ducter-e2e-worker.service 2>/dev/null || true`, { ok: false });
  feed(to, "第四版：全部更新", "Fourth: update all");
  writeFileSync(join(DIR, "srv", "npm", "latest"), "1.5.2\n");
  await clientJson("send", JSON.stringify({ t: "device_update", device: "local", check: true }), "-wait", "update_result");
  await clientJson("send", JSON.stringify({ t: "agent_update", device: "local", harness: "pi", check: true }), "-wait", "agent_update_result").catch(() => undefined);
  const offer = await until(
    "Update all's offer",
    async () => {
      const f = await clientJson("devices");
      const keys = (f.updateAll?.offer ?? []).map((i: any) => i.key);
      return keys.includes("ducter:local") && keys.includes("agent:local:pi") ? f.updateAll : undefined;
    },
    120_000,
  );
  check("all offered", offer.offer[0].key === "ducter:local" && !offer.offer.some((i: any) => i.device !== "local"), `in order: ${offer.offer.map((i: any) => `${i.key} ${i.from}→${i.to}`).join(", ")}; not now: ${offer.notNow.map((x: any) => `${x.deviceName} (${x.why})`).join(", ")}`);
  const res = await clientJson("send", JSON.stringify({ t: "update_all" }), "-wait", "update_all_result");
  check("all start", res.ok === true && !!res.id, `全部更新 answered ${JSON.stringify(res)}`);
  // Watch the list through the home's restart: pi never starts while the home's own step runs.
  const early: string[] = [];
  const over = await until(
    "the plan to finish",
    async () => {
      const p = (await clientJson("devices")).updateAll?.plan;
      if (!p || p.id !== res.id) return undefined;
      const home = p.items.find((i: any) => i.key === "ducter:local");
      const pi = p.items.find((i: any) => i.key === "agent:local:pi");
      if (home && !["done", "failed", "skipped"].includes(home.state) && pi && pi.state !== "queued") early.push(`${pi.state} while the home was ${home.state}`);
      return p.finishedAt ? p : undefined;
    },
    600_000,
    2000,
  );
  const h = await home();
  const home4 = over.items.find((i: any) => i.key === "ducter:local");
  const pi4 = over.items.find((i: any) => i.key === "agent:local:pi");
  check(
    "all → done in order",
    home4?.state === "done" && pi4?.state === "done" && h.version === to && piOn(h)?.version === "1.5.2" && early.length === 0 && Date.parse(pi4.at) >= Date.parse(home4.at),
    `the same plan ${over.id} finished by the restarted home: Ducter ${h.version} (${home4?.state}), pi ${piOn(h)?.version} (${pi4?.state}); pi waited for the home${early.length ? `; but saw ${early[0]}` : ""}`,
  );
}

// ---------- 8. From anywhere (D228) ----------

async function anywhere() {
  const reach = async () => (await clientJson("devices")).reach as any;
  // A step waits up to ~75 s for the person (here: nobody signs in), after the download.
  const step = async (name: string) =>
    JSON.parse((await run([join(DIR, "bin", "e2eclient"), "-url", WS, "-token", token, "-timeout", "300s", "send", JSON.stringify({ t: "anywhere_setup", op: "step", step: name }), "-wait", "anywhere_setup_result"], { timeoutMs: 320_000 })).out.trim().split("\n").at(-1)!);
  // The real cloudflared: downloaded, checked (SHA-256), and its sign-in link read. No account is
  // signed in: the link is only shown, then the sign-in is stopped.
  const login = await step("login");
  const r = login.step ?? login;
  const got = (await vm(`ls -l ~/.ducter/bin/ | grep cloudflared || true; ~/.ducter/bin/cloudflared-* --version 2>&1 | head -1 || true`, { ok: false })).out.trim();
  check("anywhere cloudflared", /cloudflared version 2026\.10\.5/.test(got), `downloaded and checked in the VM: ${got.split("\n").at(-1)}`);
  check("anywhere sign-in link", r.state === "waiting" && /^https:\/\/dash\.cloudflare\.com\/argotunnel\?/.test(r.url ?? ""), `the setup's login step answered ${r.state}, a sign-in link to open elsewhere (headless: no browser opened)`);
  await client("send", JSON.stringify({ t: "anywhere_setup", op: "cancel" }), "-wait", "anywhere_setup_result");
  const cert = (await vm(`test -e ~/.ducter/anywhere/.cloudflared/cert.pem && echo yes || echo no; test -e ~/.cloudflared/cert.pem && echo home-has-cert || echo home-clean`, { ok: false })).out.trim();
  check("anywhere sign-in kept apart", cert.includes("no") && cert.includes("home-clean"), "no certificate without a sign-in, and nothing written to ~/.cloudflared");

  // A dashboard tunnel's token, with a fake cloudflared: it serves /ready on the metrics port and
  // notes whether TUNNEL_TOKEN reached it (it can't make the address answer from outside).
  await vm(`mkdir -p ~/e2e && cat > ~/e2e/fake-cloudflared <<'FAKE'
#!/bin/bash
port=""; prev=""; for a in "$@"; do [ "$prev" = "--metrics" ] && port="\${a##*:}"; prev="$a"; done
[ -n "$TUNNEL_TOKEN" ] && echo seen > ~/e2e/token-seen
exec python3 -c "
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200); s.end_headers(); s.wfile.write(b'{}')
    def log_message(s,*a): pass
http.server.HTTPServer(('127.0.0.1', $port), H).serve_forever()"
FAKE
chmod +x ~/e2e/fake-cloudflared
systemctl --user set-environment DUCTER_CLOUDFLARED=$HOME/e2e/fake-cloudflared DUCTER_ANYWHERE_START_MS=15000
systemctl --user restart ducter.service`);
  await until("the home back", async () => ((await fetch(`${HTTP}/health`).catch(() => undefined))?.ok ? true : undefined), 120_000);
  const tok = "eyJhIjoiZTJlIiwidCI6InR1bm5lbCIsInMiOiJzZWNyZXQtZTJlIn0=";
  await clientJson("send", JSON.stringify({ t: "ability", device: "local", ability: "remote", on: true, named: { token: tok, hostname: "ducter.e2e.invalid" } }), "-wait", "ability_result");
  const failed = await until(
    "the outside check to give up",
    async () => {
      const a = (await reach())?.anywhere;
      return a?.state === "failed" ? a : undefined;
    },
    90_000,
    3000,
  );
  const unit = `ducter-anywhere-${PORT}`;
  const facts = (await vm(`systemctl --user is-active ${unit} || true
cat ~/e2e/token-seen 2>/dev/null || echo unseen
stat -c %a ~/.ducter/anywhere/token.env
systemctl --user show ${unit} -p ExecStart --value | grep -c "${tok}" || true
ps -eo args | grep -c "${tok}" | tr -d ' ' || true
test -e ~/.ducter/public-url && echo has-url || echo no-url`, { ok: false })).out.trim().split("\n");
  check(
    "anywhere token",
    failed.reason === "unreachable" && facts[0] === "active" && facts[1] === "seen" && facts[2] === "600" && facts[3] === "0" && facts[5] === "no-url",
    `connected to the fake, the outside check failed as ${failed.reason}; its own unit ${facts[0]}; the token reached it (${facts[1]}) from a ${facts[2]} file, never on its command line (${facts[3]} in ExecStart); no address used (${facts[5]})`,
  );
  const pid = (await vm(`systemctl --user show ${unit} -p MainPID --value`)).out.trim();
  await vm("systemctl --user restart ducter.service");
  await until("the home back after a restart", async () => ((await fetch(`${HTTP}/health`).catch(() => undefined))?.ok ? true : undefined), 120_000);
  await Bun.sleep(3000);
  const after = (await vm(`systemctl --user is-active ${unit} || true; systemctl --user show ${unit} -p MainPID --value`, { ok: false })).out.trim().split("\n");
  check("anywhere kept", after[0] === "active", `ducter.service restarted; the tunnel's own unit stayed ${after[0]} (pid ${pid} → ${after[1]}: ${pid === after[1] ? "adopted" : "started again"})`);
  await clientJson("send", JSON.stringify({ t: "ability", device: "local", ability: "remote", on: false }), "-wait", "ability_result");
  await Bun.sleep(2000);
  const off = (await vm(`systemctl --user is-active ${unit} || true`, { ok: false })).out.trim();
  const view = (await reach())?.anywhere;
  check("anywhere off", off !== "active" && view?.state === "off" && view?.hostname === "ducter.e2e.invalid", `off stopped the unit (${off}); the tunnel is kept to turn on again (${view?.state})`);
  await vm(`systemctl --user unset-environment DUCTER_CLOUDFLARED DUCTER_ANYWHERE_START_MS
systemctl --user restart ducter.service`);
  await until("the home back", async () => ((await fetch(`${HTTP}/health`).catch(() => undefined))?.ok ? true : undefined), 120_000);
}

// ---------- the run ----------

async function cleanup() {
  if (KEEP) return say(`kept: colima profile ${PROFILE}, ${DIR} (colima delete -p ${PROFILE} -f; rm -rf ${DIR})`);
  await run(["colima", "delete", "-p", PROFILE, "-f"], { ok: false });
  rmSync(join(DIR, "src"), { recursive: true, force: true });
  rmSync(join(DIR, "build"), { recursive: true, force: true });
  rmSync(join(DIR, "srv", "releases"), { recursive: true, force: true });
  say(`cleaned up: the VM is deleted; the log stays in ${logFile}`);
}

let code = 0;
const proxy = PROXY ? (await import("./proxy.ts")).startProxy(PROXY_PORT) : undefined;
if (proxy) say(`proxy: the VM goes out through this Mac (:${PROXY_PORT})`);
try {
  if (!SKIP_BUILD || !existsSync(join(DIR, "bin", "e2eclient"))) await build();
  await startVm();
  await install();
  await selfUpdate(VERSIONS[1], "第二版：更新后卡片不会再说没更新成", "Second: the card never says it didn't update");
  await selfUpdate(VERSIONS[2], "第三版：连着两次原地更新", "Third: two updates in place in a row");
  await browse();
  await agent();
  await updateAll();
  await anywhere();
} catch (e) {
  code = 1;
  say(`\nFAILED: ${(e as Error).message}\n(log: ${logFile})`);
  await vm(`journalctl --user -u ducter.service --no-pager -n 80 || true; ls -la ~/.ducter/updates || true; cat ~/.ducter/updates/result.json 2>/dev/null || true`, { ok: false })
    .then((r) => writeFileSync(join(DIR, "journal.txt"), r.out))
    .catch(() => {});
} finally {
  say(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  await cleanup();
  proxy?.stop();
}
process.exit(code);
