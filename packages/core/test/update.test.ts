// Updating in place (D148): versions, the release feed, the staged update (checksum, self-check,
// swap) and the restart helper's rollback, all with fakes: no network, no systemctl, no model.
// A real Linux box with systemd is the one thing these can't stand in for.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions } from "@ducter/protocol/src/version.ts";
import { createReleaseWatch, fetchLatest, isSecurity, whatsNew } from "../src/release.ts";
import { assetName, finish, officialUrl, readResult, realSys, rollBack, stage, sumFor, swapIn, updateHow, type FinishPlan, type UpdateSys } from "../src/update.ts";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-upd-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("versions compare as semver, pre-releases before their release", () => {
  expect(compareVersions("0.0.4", "0.0.3")).toBe(1);
  expect(compareVersions("0.0.3", "0.0.10")).toBe(-1);
  expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
  expect(compareVersions("0.1.0-rc.1", "0.1.0")).toBe(-1);
  expect(compareVersions("0.1.0-rc.2", "0.1.0-rc.10")).toBe(-1);
  expect(compareVersions("garbage", "0.0.1")).toBe(-1);
});

test("what's new: the notes' first plain lines, without headings, marks or the install boilerplate", () => {
  const body = "## 0.0.4\n\n- **Update in place** from the app or `ducter update`\n- Device cards, [renamed](https://x) in place\n- third\n\n### Install\n";
  expect(whatsNew(body)).toEqual(["Update in place from the app or ducter update", "Device cards, renamed in place"]);
  expect(isSecurity("## Security\n- fix")).toBe(true);
  expect(isSecurity("- faster", "0.0.4")).toBe(false);
});

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

describe("the release feed", () => {
  test("the API answer, drafts and pre-releases never offered, 404 is no releases", async () => {
    const rel = await fetchLatest(async () => json({ tag_name: "v0.0.4", body: "- Update in place", html_url: "https://github.com/wey-gu/ducter/releases/tag/v0.0.4", assets: [{ name: "SHA256SUMS.txt" }] }));
    expect(rel).toMatchObject({ version: "0.0.4", notes: ["Update in place"], security: false, assets: ["SHA256SUMS.txt"] });
    expect(await fetchLatest(async () => json({ tag_name: "v0.0.5", prerelease: true }))).toBeUndefined();
    expect(await fetchLatest(async () => json({ message: "Not Found" }, 404))).toBeUndefined();
  });

  test("rate-limited: the releases/latest redirect names the version", async () => {
    const rel = await fetchLatest(async (url) =>
      url.includes("api.github.com") ? json({ message: "rate limit" }, 403) : new Response(null, { status: 302, headers: { location: "https://github.com/wey-gu/ducter/releases/tag/v0.0.4" } }),
    );
    expect(rel).toMatchObject({ version: "0.0.4", notes: [] });
  });

  test("offline: silent, the last answer stays; read again only after an hour", async () => {
    const dataDir = tmp();
    let now = Date.parse("2026-11-10T10:00:00Z");
    let calls = 0;
    let offline = false;
    const watch = createReleaseWatch({
      dataDir,
      timer: false,
      now: () => now,
      env: {},
      fetch: async () => {
        calls++;
        if (offline) throw new Error("ENOTFOUND");
        return json({ tag_name: "v0.0.4", body: "" });
      },
    });
    expect((await watch.check())?.version).toBe("0.0.4");
    expect(await watch.check()).toMatchObject({ version: "0.0.4" });
    expect(calls).toBe(1); // cached
    now += 30 * 60_000;
    await watch.check();
    expect(calls).toBe(1); // within the hour
    now += 31 * 60_000;
    offline = true;
    expect((await watch.check())?.version).toBe("0.0.4");
    expect(calls).toBe(3); // the API, then the redirect
    expect(watch.newer("0.0.3")).toBe(true);
    // A new process reads the cache without asking.
    const again = createReleaseWatch({ dataDir, timer: false, env: {}, fetch: async () => (calls++, json({})) });
    expect(again.latest()?.version).toBe("0.0.4");
    // DUCTER_UPDATE_CHECK=off never asks.
    const off = createReleaseWatch({ dataDir: tmp(), timer: false, env: { DUCTER_UPDATE_CHECK: "off" }, fetch: async () => (calls++, json({})) });
    expect(await off.check(true)).toBeUndefined();
    expect(calls).toBe(3);
  });
});

test("only GitHub's own hosts over HTTPS; SHA256SUMS lines; asset names; how each build updates", () => {
  expect(officialUrl("https://github.com/wey-gu/ducter/releases/download/v0.0.4/x.tar.gz")).toBe(true);
  expect(officialUrl("https://objects.githubusercontent.com/abc")).toBe(true);
  expect(officialUrl("http://github.com/x")).toBe(false);
  expect(officialUrl("https://github.com.evil.example/x")).toBe(false);
  expect(sumFor(`${"a".repeat(64)}  ducter-0.0.4-linux-x64.tar.gz\n${"b".repeat(64)}  other`, "ducter-0.0.4-linux-x64.tar.gz")).toBe("a".repeat(64));
  expect(assetName("0.0.4", "arm64")).toBe("ducter-0.0.4-linux-arm64.tar.gz");
  expect(assetName("0.0.4", "x64")).toBe("ducter-0.0.4-linux-x64.tar.gz");
  expect(updateHow({ compiled: true, platform: "linux", execPath: "/home/u/.local/bin/ducter" })).toBe("self");
  expect(updateHow({ compiled: true, platform: "darwin", execPath: "/Applications/Ducter.app/Contents/Helpers/ducter" })).toBe("app");
  expect(updateHow({ compiled: false, platform: "linux", execPath: "/usr/bin/bun" })).toBe("source");
});

// ---------- a release served by a fake fetch ----------

/** A tarball like release.yml's: one folder holding a `ducter` that answers --version and doctor --json. */
async function makeRelease(version: string, o: { versionSays?: string; doctor?: string } = {}) {
  const root = tmp();
  const folder = join(root, `ducter-${version}-linux-x64`);
  mkdirSync(folder, { recursive: true });
  const script = `#!/bin/sh\ncase "$1" in\n  --version) echo "ducter ${o.versionSays ?? version} (test, single binary)";;\n  doctor) echo '${o.doctor ?? '{"ok":true,"checks":[]}'}';;\nesac\n`;
  writeFileSync(join(folder, "ducter"), script);
  chmodSync(join(folder, "ducter"), 0o755);
  const name = assetName(version, "x64");
  const tar = Bun.spawnSync(["tar", "-C", root, "-czf", join(root, name), `ducter-${version}-linux-x64`]);
  expect(tar.exitCode).toBe(0);
  const bytes = readFileSync(join(root, name));
  const sum = createHash("sha256").update(bytes).digest("hex");
  return { name, bytes, sum };
}

function sysWith(files: Record<string, Uint8Array | string>, over: Partial<UpdateSys> = {}): UpdateSys & { asked: string[] } {
  const asked: string[] = [];
  return {
    ...realSys,
    asked,
    fetch: async (url) => {
      asked.push(url);
      const name = url.split("/").pop()!;
      const body = files[name];
      return body === undefined ? new Response("no", { status: 404 }) : new Response(body, { headers: { "content-length": String(typeof body === "string" ? body.length : body.byteLength) } });
    },
    freeBytes: () => 10e9,
    ...over,
  };
}

describe("the staged update", () => {
  test("downloads from the official release, checks the sum, unpacks, self-checks", async () => {
    const r = await makeRelease("0.0.4");
    const sys = sysWith({ "SHA256SUMS.txt": `${r.sum}  ${r.name}\n`, [r.name]: r.bytes });
    const phases: string[] = [];
    const out = await stage(sys, { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64", onPhase: (p) => phases.push(p) });
    expect(out.ok).toBe(true);
    expect(sys.asked[0]).toBe("https://github.com/wey-gu/ducter/releases/download/v0.0.4/SHA256SUMS.txt");
    expect(phases[0]).toBe("downloading");
    expect(phases.at(-1)).toBe("verifying");
  });

  test("a checksum mismatch is refused and nothing is left behind", async () => {
    const r = await makeRelease("0.0.4");
    const dataDir = tmp();
    const sys = sysWith({ "SHA256SUMS.txt": `${"0".repeat(64)}  ${r.name}\n`, [r.name]: r.bytes });
    const out = await stage(sys, { dataDir, current: "0.0.3", to: "0.0.4", arch: "x64" });
    expect(out).toMatchObject({ ok: false, reason: "checksum" });
    expect(existsSync(join(dataDir, "updates", "0.0.4"))).toBe(false);
  });

  test("refuses a downgrade without --to, low disk, a missing asset, a binary that isn't the version", async () => {
    const r = await makeRelease("0.0.4");
    const files = { "SHA256SUMS.txt": `${r.sum}  ${r.name}\n`, [r.name]: r.bytes };
    expect(await stage(sysWith(files), { dataDir: tmp(), current: "0.0.5", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false, reason: "downgrade" });
    expect((await stage(sysWith(files), { dataDir: tmp(), current: "0.0.5", to: "0.0.4", arch: "x64", explicit: true })).ok).toBe(true);
    expect(await stage(sysWith(files, { freeBytes: () => 50e6 }), { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false, reason: "disk" });
    expect(await stage(sysWith({ "SHA256SUMS.txt": `${r.sum}  other\n` }), { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false, reason: "no_asset" });
    const liar = await makeRelease("0.0.4", { versionSays: "0.0.2" });
    expect(await stage(sysWith({ "SHA256SUMS.txt": `${liar.sum}  ${liar.name}\n`, [liar.name]: liar.bytes }), { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false, reason: "selfcheck" });
    const broken = await makeRelease("0.0.4", { doctor: "segfault" });
    expect(await stage(sysWith({ "SHA256SUMS.txt": `${broken.sum}  ${broken.name}\n`, [broken.name]: broken.bytes }), { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false, reason: "selfcheck" });
  });

  test("a redirect off GitHub is refused", async () => {
    const sys: UpdateSys = { ...realSys, freeBytes: () => 10e9, fetch: async () => Object.defineProperty(new Response("x"), "url", { value: "https://evil.example/x" }) };
    expect(await stage(sys, { dataDir: tmp(), current: "0.0.3", to: "0.0.4", arch: "x64" })).toMatchObject({ ok: false });
  });
});

describe("swap, restart, rollback", () => {
  const binDir = () => {
    const d = tmp();
    writeFileSync(join(d, "ducter"), "old");
    writeFileSync(join(d, "new"), "new");
    return d;
  };

  test("the swap keeps the old binary as ducter.prev and renames the new one in", () => {
    const d = binDir();
    const r = swapIn(join(d, "new"), join(d, "ducter"));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(d, "ducter"), "utf8")).toBe("new");
    expect(readFileSync(join(d, "ducter.prev"), "utf8")).toBe("old");
    expect(rollBack(join(d, "ducter"))).toBe(true);
    expect(readFileSync(join(d, "ducter"), "utf8")).toBe("old");
    expect(readFileSync(join(d, "ducter.failed"), "utf8")).toBe("new");
  });

  /** A fake systemd box: systemctl restarts "the service", which then answers /health with what's on disk. */
  function box(o: { newComesUp: boolean }) {
    const d = binDir();
    const dataDir = tmp();
    swapIn(join(d, "new"), join(d, "ducter"));
    let running = "0.0.3";
    let clock = 0;
    const calls: string[][] = [];
    const sys: UpdateSys = {
      ...realSys,
      now: () => clock,
      sleep: async (ms) => void (clock += ms),
      run: async (argv) => {
        calls.push(argv);
        if (argv[0] === "systemctl") {
          const onDisk = readFileSync(join(d, "ducter"), "utf8");
          running = onDisk === "new" ? (o.newComesUp ? "0.0.4" : "down") : "0.0.3";
        }
        return { code: 0, out: "" };
      },
      fetch: async () => (running === "down" ? Promise.reject(new Error("ECONNREFUSED")) : json({ ok: true, version: running })),
    };
    const plan: FinishPlan = { dataDir, target: join(d, "ducter"), from: "0.0.3", to: "0.0.4", role: "home", port: 7777, unit: "ducter.service", restart: "systemd", startedAt: "" };
    return { d, dataDir, sys, plan, calls };
  }

  test("healthy after the restart: done, recorded for the restarted Ducter", async () => {
    const b = box({ newComesUp: true });
    const r = await finish(b.sys, b.plan, 5000);
    expect(r).toMatchObject({ ok: true, from: "0.0.3", to: "0.0.4" });
    expect(b.calls).toEqual([["systemctl", "--user", "restart", "ducter.service"]]);
    expect(readResult(b.dataDir)).toMatchObject({ ok: true, to: "0.0.4" });
  });

  test("never healthy: ducter.prev goes back, restarted again, the failure recorded with its reason", async () => {
    const b = box({ newComesUp: false });
    const r = await finish(b.sys, b.plan, 5000);
    expect(r).toMatchObject({ ok: false, rolledBack: true, reason: "health" });
    expect(readFileSync(join(b.d, "ducter"), "utf8")).toBe("old");
    expect(b.calls.filter((c) => c[0] === "systemctl").length).toBe(2);
    expect(readResult(b.dataDir)).toMatchObject({ ok: false, rolledBack: true });
  });
});
