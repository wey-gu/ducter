// 0.0.75's "0 个没做完": GitHub connected, 50+ issues assigned, and the pane said 0. gh's answer to
// the list is ~700 KB; the gh runner kept only its last 8000 characters, so the status line and the
// blank line were gone, the body read as "", and "" became an empty list, which looked like a good
// look. These run the real runner (realGhRun) against a gh that is a script on PATH printing a page
// shaped like GitHub's (gh-issues-sample.ts, invented words), so the whole path from the process to
// the pane's count is the one the home runs.
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { ghRunEnv, realGhRun } from "@ducter/protocol/src/git-login.ts";
import { startCore } from "../src/core.ts";
import { createGitHub } from "../src/task-sources/github.ts";
import { SOURCES_FILE } from "../src/task-sources/index.ts";
import { assignedResponse } from "./gh-issues-sample.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/**
 * A gh on PATH: `api user` says the login; the list prints the page in `page` (or fails as `fail`
 * says). It refuses to run without HOME, as gh does when it can't find its sign-in.
 */
function scriptGh(dir: string) {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const page = join(dir, "page.http");
  const fail = join(dir, "fail");
  writeFileSync(
    join(bin, "gh"),
    [
      "#!/bin/sh",
      '[ -z "$HOME" ] && { echo "failed to read configuration: $HOME is not defined" >&2; exit 1; }',
      'if [ "$1 $2" = "api user" ]; then echo lin-dev; exit 0; fi',
      `if [ -f "${fail}" ]; then cat "${fail}" >&2; exit 1; fi`,
      // The search total: what --jq '[.total_count, .incomplete_results] | @tsv' prints; q logged.
      `case "$*" in *search/issues*) for a in "$@"; do case "$a" in q=*) echo "$a" >> "${dir}/queries";; esac; done;;`,
      "esac",
      `case "$*" in *search/issues*review-requested*) cat "${dir}/review"; exit 0;; *search/issues*) cat "${dir}/total"; exit 0;; esac`,
      `cat "${page}"`,
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "gh"), 0o755);
  writeFileSync(page, assignedResponse(50));
  writeFileSync(join(dir, "total"), "50\tfalse\n");
  writeFileSync(join(dir, "review"), '{"total_count":0,"items":[]}\n');
  return {
    bin,
    page,
    fail,
    // The review search reads JSON (D357: its newest three come with it); given as "4\tfalse" here.
    totals: (open: string, review: string) => (writeFileSync(join(dir, "total"), `${open}\n`), writeFileSync(join(dir, "review"), /^\d+\t/.test(review) ? `{"total_count":${review.split("\t")[0]},"items":[]}\n` : `${review}\n`)),
    queries: () => { try { return readFileSync(join(dir, "queries"), "utf8").trim().split("\n"); } catch { return []; } },
    env: (o: { home?: boolean } = {}) => ({ PATH: `${bin}:/usr/bin:/bin`, ...(o.home === false ? {} : { HOME: dir }) }) };
}

function boot(dir: string, env: Record<string, string>) {
  const core = startCore({ dataDir: join(dir, "data"), port: 0, push: false, batchMs: 5, taskSources: { ghRun: realGhRun, ghEnv: env, home: join(dir, "no-home"), pollMs: 3_600_000, quietMs: 0 } });
  stops.push(() => core.stop());
  return core;
}

const until = async (pred: () => boolean, ms = 8000) => {
  for (let i = 0; i < ms / 20 && !pred(); i++) await Bun.sleep(20);
  expect(pred()).toBe(true);
};

test("a page as big as GitHub's reads whole through the real gh runner (the 8000-character tail read as 0)", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  expect(readFileSync(gh.page, "utf8").length).toBeGreaterThan(500_000);
  const items = await createGitHub({ source: "s1", run: realGhRun, env: gh.env() }).list();
  expect(items).toHaveLength(50);
  expect(items.filter((i) => i.pr)).toHaveLength(2);
});

test("the list refuses an answer it can't read (a cut-off page, no status line) instead of calling it empty", async () => {
  const whole = assignedResponse(50);
  for (const out of [whole.slice(-8000), "", "HTTP/2.0 200 OK\n\n{\"message\":\"x\"}", "HTTP/2.0 200 OK\n\n[{\"number\":1"]) {
    const a = createGitHub({ source: "s1", run: async () => ({ code: 0, out, err: "" }) });
    await expect(a.list()).rejects.toThrow(/couldn't be read/);
  }
});

test("Connect at runtime: a GitHub source added after boot is looked at and counts 50, learning them quietly", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  const core = boot(t.dir, gh.env());
  const ts = core.taskSources;
  expect(ts.view().sources).toHaveLength(0);
  expect((await ts.add("github")).ok).toBe(true);
  // Until a look has read it, no count (the clients say 正在看… / Looking…).
  expect(ts.view().sources[0]!.open).toBeUndefined();
  await until(() => ts.view().sources[0]?.open === 50);
  const v = ts.view().sources[0]!;
  expect(v).toMatchObject({ kind: "github", name: "lin-dev", state: "ok", open: 50 });
  expect(v.checkedAt).toBeTruthy();
  const saved = JSON.parse(readFileSync(join(t.dir, "data", SOURCES_FILE), "utf8"));
  expect(saved.seen[v.id]).toHaveLength(50);
  // The first look only learns: nothing is "new" the moment it is added.
  expect(core.log.read({ kinds: ["source_seen"] })).toHaveLength(0);
});

test("the home started without HOME (a root service): gh is still given one, so it finds its sign-in", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  expect(ghRunEnv({ PATH: "/usr/bin" }).HOME).toBe(homedir());
  expect(ghRunEnv({ PATH: "/usr/bin", HOME: "/root" }).HOME).toBe("/root");
  const core = boot(t.dir, gh.env({ home: false }));
  expect((await core.taskSources.add("github")).ok).toBe(true);
  await until(() => core.taskSources.view().sources[0]?.open === 50);
});

test("a look that fails says so on the source (its reason, no count); the next good look counts", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  writeFileSync(gh.fail, "gh: Server Error (HTTP 502)");
  const core = boot(t.dir, gh.env());
  const ts = core.taskSources;
  expect((await ts.add("github")).ok).toBe(true);
  await until(() => ts.view().sources[0]?.state === "error");
  const bad = ts.view().sources[0]!;
  expect(bad.error).toContain("HTTP 502");
  expect(bad.open).toBeUndefined();
  // 再试一次 asks for the sources again, which looks now.
  writeFileSync(gh.fail, "");
  Bun.spawnSync(["rm", gh.fail]);
  await ts.look();
  expect(ts.view().sources[0]).toMatchObject({ state: "ok", open: 50 });
  expect(ts.view().sources[0]!.error).toBeUndefined();
});

test("a source 0.0.75 saw as empty learns its 50 quietly (no flood of 'new'); one assigned after that is told", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  const data = join(t.dir, "data");
  mkdirSync(data, { recursive: true });
  // hel's file, as 0.0.75 left it: added by Connect, every look read as empty.
  writeFileSync(join(data, SOURCES_FILE), JSON.stringify({ sources: [{ id: "src_d1f73fc4", kind: "github", whenNew: "tell", whenDone: "ask", addedAt: "2026-11-17T19:08:00Z" }], seen: { src_d1f73fc4: [] }, offered: {}, told: {} }));
  const core = boot(t.dir, gh.env());
  const ts = core.taskSources;
  await until(() => ts.view().sources[0]?.open === 50);
  expect(core.log.read({ kinds: ["source_seen"] })).toHaveLength(0);
  // A new one assigned: told.
  writeFileSync(gh.page, assignedResponse(51));
  await ts.look();
  await until(() => core.log.read({ kinds: ["source_seen"] }).length === 1);
  const told = core.log.read({ kinds: ["source_seen"] })[0]!.body as Bodies["source_seen"];
  expect(told.change).toBe("new");
  expect(told.items).toHaveLength(1);
});

test("while a look runs the source says so (looking), and not after", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  const core = boot(t.dir, gh.env());
  const ts = core.taskSources;
  await ts.add("github");
  await ts.look();
  const seen: boolean[] = [];
  const off = ts.onChange(() => seen.push(!!ts.view().sources[0]?.looking));
  await ts.look();
  off();
  expect(seen).toContain(true);
  expect(ts.view().sources[0]!.looking).toBeUndefined();
});

test("the count is GitHub's true total, not the page of 50; PRs waiting for review counted apart; filters reach the search", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  gh.totals("557\tfalse", "4\tfalse");
  const core = boot(t.dir, gh.env());
  const ts = core.taskSources;
  await ts.add("github");
  await until(() => ts.view().sources[0]?.open === 557);
  const v = ts.view().sources[0]!;
  expect(v).toMatchObject({ open: 557, review: 4 });
  expect(v.openAtLeast).toBeUndefined();
  // Offering and "new" still read the recent page.
  expect(JSON.parse(readFileSync(join(t.dir, "data", SOURCES_FILE), "utf8")).seen[v.id]).toHaveLength(50);
  const qs = gh.queries();
  expect(qs).toContain("q=assignee:lin-dev is:open archived:false");
  expect(qs).toContain("q=review-requested:lin-dev is:open is:pr archived:false");
  expect(qs).toContain("q=assignee:lin-dev mentions:lin-dev is:open archived:false");
  // A filter: both searches carry it.
  ts.set(v.id, { repos: ["acme/web", "acme/infra"], label: "type/bug" });
  await ts.look();
  expect(gh.queries().slice(-3)).toEqual([
    'q=assignee:lin-dev is:open archived:false repo:acme/web repo:acme/infra label:"type/bug"',
    'q=review-requested:lin-dev is:open is:pr archived:false repo:acme/web repo:acme/infra label:"type/bug"',
    'q=assignee:lin-dev mentions:lin-dev is:open archived:false repo:acme/web repo:acme/infra label:"type/bug"',
  ]);
  // GitHub says its total is partial: only "at least".
  gh.totals("1000\ttrue", "0\tfalse");
  ts.set(v.id, { label: "" });
  await ts.look();
  expect(ts.view().sources[0]).toMatchObject({ open: 1000, openAtLeast: true });
  expect(ts.view().sources[0]!.review).toBeUndefined();
});

test("search refused (its own limit): a full page counts as at least 50, never a plain 50", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const gh = scriptGh(t.dir);
  gh.totals("not a number", "x");
  const core = boot(t.dir, gh.env());
  await core.taskSources.add("github");
  await until(() => core.taskSources.view().sources[0]?.open === 50);
  expect(core.taskSources.view().sources[0]).toMatchObject({ state: "ok", open: 50, openAtLeast: true });
});
