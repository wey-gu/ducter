// A demo core for D341's 待办来源 / To-do sources: GitHub (a fake gh with issues assigned to "lin-dev",
// never the real GitHub) and an Obsidian vault in a scratch folder (never the person's own), a task
// bound to an issue that commented, one bound to a vault line that was ticked, one working, a
// write-back card, and a vault Obsidian lists that isn't added yet.
//   DUCTER_PORT=7999 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-todos.ts
// then open http://127.0.0.1:7999/app and Settings › 待办来源.
// D357: DEMO_TODOS=many: GitHub alone with a heavy developer's load (sixty-odd assigned across
// repositories, two PRs waiting for review, one that mentions them): On hand's group and its fold.
// D345: DEMO_GH=missing starts with no gh on the home and nothing added: 连上 GitHub puts a fake gh
// in the demo's own folder (a slow fake download, never the network), shows the code, and the fake
// GitHub approves it after DEMO_APPROVE_MS (default 6000; 0: never).
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import { createGhInstaller, toolsBin } from "../../packages/core/src/gh-install.ts";
import { createGitLogin, type GhRun } from "../../packages/protocol/src/git-login.ts";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Runner, TaskCard } from "../../packages/protocol/src/index.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-todos-"));
const home = join(scratch, "home");
const life = join(scratch, "Life");
const work = join(scratch, "Work notes");
mkdirSync(join(life, "Plans"), { recursive: true });
mkdirSync(work, { recursive: true });
writeFileSync(
  join(life, "Plans", zh ? "这周.md" : "This week.md"),
  (zh
    ? ["# 这周", "- [ ] 给房东回邮件，问暖气什么时候修 📅 2026-11-19 🔼", "- [ ] 整理 11 月的报销单 📅 2026-11-21", "- [ ] 订下周去上海的高铁票", "- [ ] 浇花 🔁 every week"]
    : ["# This week", "- [ ] Reply to the landlord about the heating 📅 2026-11-19 🔼", "- [ ] Sort November's expense receipts 📅 2026-11-21", "- [ ] Book the train to Shanghai next week", "- [ ] Water the plants 🔁 every week"]
  ).join("\n") + "\n",
);
const old = new Date(Date.now() - 3600_000);
utimesSync(join(life, "Plans", zh ? "这周.md" : "This week.md"), old, old);
const cfg = join(home, "Library", "Application Support", "obsidian");
mkdirSync(cfg, { recursive: true });
writeFileSync(join(cfg, "obsidian.json"), JSON.stringify({ vaults: { a: { path: life, ts: 2 }, b: { path: work, ts: 1 } } }));

const gh = fakeGh(
  [
    { repo: "acme/web", number: 12, title: "Login redirect drops the return path", body: "After sign-in it always lands on /.", labels: ["bug"], updated: "2026-11-17T09:10:00Z" },
    { repo: "acme/web", number: 14, title: "Footer links overflow on small phones", labels: ["ui"], updated: "2026-11-17T08:40:00Z" },
    { repo: "acme/api", number: 31, title: "Rate limiter counts retries twice", updated: "2026-11-16T18:00:00Z" },
    { repo: "acme/api", number: 33, title: "Review: move sessions to Redis", pr: true, updated: "2026-11-16T12:00:00Z" },
  ],
  { login: "lin-dev" },
);

const many = process.env.DEMO_TODOS === "many";
if (many) {
  const titles = [
    ["acme/web", "Settings page loses scroll position after saving"],
    ["acme/web", "Dark mode: the date picker stays white"],
    ["acme/api", "Webhook retries ignore Retry-After"],
    ["acme/api", "Pagination cursor breaks on deleted rows"],
    ["acme/infra", "Nightly backup job times out on the big shard"],
    ["acme/web", "Upload progress jumps back to 0% on slow networks"],
    ["acme/api", "Audit log misses role changes made by admins"],
    ["acme/infra", "Bump the base image: openssl advisory"],
    ["acme/web", "Search box keeps the old query after clearing"],
    ["acme/mobile", "Push permission asked twice on first launch"],
    ["acme/mobile", "Share sheet crashes with a long title"],
    ["acme/api", "Export to CSV drops the time zone"],
  ];
  const base = Date.now() - 50 * 60_000;
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  for (let i = 0; i < 60; i++) {
    const [repo, title] = titles[i % titles.length]!;
    gh.issues.push({ repo, number: 100 + i, title: i < titles.length ? title : `${title} (${Math.floor(i / titles.length) + 1})`, state: "open", assigned: true, labels: i % 4 === 0 ? ["bug"] : i % 5 === 0 ? ["p1"] : [], updated: new Date(base - (i + 3) * 47 * 60_000).toISOString() });
  }
  gh.issues.push(
    { repo: "acme/web", number: 377, title: "Make the sign-in page keyboard friendly", pr: true, state: "open", assigned: false, review: true, author: "mei-chen", updated: ago(25) },
    { repo: "acme/api", number: 381, title: "Cache the permission checks per request", pr: true, state: "open", assigned: false, review: true, author: "jonas", updated: ago(14 * 60) },
    { repo: "acme/api", number: 352, title: "Token refresh races when two tabs are open", state: "open", assigned: true, mentions: true, labels: ["bug"], updated: ago(70) },
  );
}
// D359: DEMO_TODOS=pile: GitHub alone with 557 open, sorted by the demo's fake cheapest model
// (DEMO_SORT_MS a batch), handed-over tasks that finish after DEMO_TASK_MS with a draft PR, a PR
// waiting for review pre-read, and DEMO_MORNING=1 to make the morning note now.
const pile = process.env.DEMO_TODOS === "pile";
if (pile) gh.issues.splice(0, gh.issues.length, ...pileIssues());
const missing = process.env.DEMO_GH === "missing";
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
// D359: a write takes a moment, as GitHub's does (DEMO_WRITE_MS), so the pile is seen ticking down one by one.
let ghRun: GhRun = pile ? async (args, x) => (args.includes("PATCH") || args.includes("POST") ? (await Bun.sleep(Number(process.env.DEMO_WRITE_MS ?? 180)), gh.run(args, x)) : gh.run(args, x)) : gh.run;
let extra = {};
if (missing) {
  gh.signedIn = false;
  gh.deviceFlow = "hold";
  ghRun = (args, x) => (existsSync(join(toolsBin(dataDir), "gh")) ? gh.run(args, x) : Promise.resolve({ code: 127, out: "", err: "", missing: true as const }));
  // A gh-shaped archive made here; its checksum is the demo's own pin.
  const name = "gh_9.9.9_linux_amd64";
  mkdirSync(join(scratch, "rel", name, "bin"), { recursive: true });
  writeFileSync(join(scratch, "rel", name, "bin", "gh"), "#!/bin/sh\n");
  await Bun.spawn(["tar", "-czf", join(scratch, `${name}.tar.gz`), "-C", join(scratch, "rel"), name]).exited;
  const bytes = new Uint8Array(readFileSync(join(scratch, `${name}.tar.gz`)));
  const release = { version: "9.9.9", base: "https://example.invalid", assets: { "linux-x64": { file: `${name}.tar.gz`, sha256: createHash("sha256").update(bytes).digest("hex") } } };
  const approveMs = Number(process.env.DEMO_APPROVE_MS ?? 6000);
  const login = createGitLogin({ run: ghRun, env: {} });
  const start = login.start.bind(login);
  login.start = async () => {
    const s = await start();
    if (s.state === "code" && approveMs > 0) setTimeout(() => gh.approve(), approveMs);
    return s;
  };
  extra = {
    gitLoginHome: login,
    ghInstaller: createGhInstaller({
      dataDir,
      env: {},
      release,
      sys: {
        platform: "linux",
        arch: "x64",
        which: () => undefined,
        async exec(argv) {
          const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
          return { code: await p.exited, out: await new Response(p.stderr).text() };
        },
        async download(_url, onProgress) {
          for (const pct of [8, 23, 41, 58, 76, 93]) await Bun.sleep(Number(process.env.DEMO_STEP_MS ?? 500)), onProgress(pct);
          return bytes;
        },
      },
    }),
  };
}

const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources: { ghRun, ghEnv: {}, home, quietMs: 0, pollMs: 3_600_000, ...(pile ? { ask: demoAsk(zh, Number(process.env.DEMO_SORT_MS ?? 250)) } : {}) }, ...extra });
core.setRunner(pile ? pileRunner() : stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

/** D359: tasks open for real on the board, work for DEMO_TASK_MS, and end with a draft PR (no agent runs). */
function pileRunner(): Runner {
  let n = 0;
  const taskMs = Number(process.env.DEMO_TASK_MS ?? 20_000);
  return {
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `tp${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: "claude-code", brief: input.brief, language: zh ? "zh" : "en" } });
      core.tasks.setState(taskId, "working", "hot");
      const pr = 1400 + n;
      setTimeout(() => {
        const repo = core.tasks.get(taskId)?.source?.where ?? "acme/web";
        core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: zh ? `改好了，草稿 PR #${pr}。` : `Fixed; draft PR #${pr}.`, questions: [], evidence: [{ kind: "url", ref: `https://github.com/${repo}/pull/${pr}` }] } });
        core.tasks.setState(taskId, "done", "cold");
      }, taskMs);
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner;
}

const ts = core.taskSources;
if (pile) {
  // DEMO_ADD=0: GitHub not added yet (Settings › 待办来源 › 连上 is the first step to walk).
  if (process.env.DEMO_ADD !== "0") await ts.add("github"), await ts.look();
  // The sort runs on the add's look; the morning note when asked for.
  if (process.env.DEMO_MORNING === "1") {
    while (!ts.view().pile?.sortedAt || ts.view().pile?.sorting) await Bun.sleep(200);
    await core.proactive.morning();
  }
  console.log(`[demo] up at http://127.0.0.1:${core.port}/app with 557 to sort (data: ${core.dataDir}; scratch: ${scratch})`);
} else if (missing) {
  await ts.add("obsidian", life);
  console.log(`[demo] up at http://127.0.0.1:${core.port}/app with no gh (data: ${core.dataDir}; scratch: ${scratch})`);
} else {
  await ts.add("github");
  if (!many) await ts.add("obsidian", life);
  await ts.look();
  const src = ts.view().sources;
  ts.set(src[0]!.id, { whenNew: "take" });
  const items = (await ts.items()).items;

  const open = (taskId: string, title: string, repo: string | undefined, brief: string) => {
    core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: repo ? repo.split("/").pop()! : "", place: repo ? { kind: "repo", device: "local", repoPath: `~/dev/${repo.split("/").pop()}`, branch: `ducter/${taskId}` } : { kind: "none" }, harness: "claude-code", brief, language: zh ? "zh" : "en" } });
  };
  const say = (origin: "user" | "partner", text: string) => core.log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);

  say("user", zh ? "GitHub 上有什么分给我的？" : "Anything assigned to me on GitHub?");
  say("partner", zh ? "有 4 个。最急的是 acme/web #12：登录后回不到原来的页面。要我接这个吗？" : "Four. The most pressing is acme/web #12: sign-in loses the page you came from. Want me to take it?");
  say("user", zh ? "接 #12，顺便把 #14 也做了" : "Take #12, and #14 too");

  const i12 = items.find((i) => i.ref === "acme/web#12")!;
  const i14 = items.find((i) => i.ref === "acme/web#14")!;
  open("t12", zh ? "修登录后的回跳" : "Fix the sign-in return path", "acme/web", "Fix acme/web#12");
  ts.bind("t12", i12, "partner");
  core.tasks.setState("t12", "working", "hot");
  open("t14", zh ? "页脚在小屏上溢出" : "Footer overflow on small phones", "acme/web", "Fix acme/web#14");
  ts.bind("t14", i14, "partner");
  core.log.append({ stream: "task:t14", origin: "task", kind: "report", body: { taskId: "t14", state: "done", summary: zh ? "页脚链接在 360 宽以下换行了；草稿 PR #15。" : "Footer links wrap below 360 wide; draft PR #15.", questions: [], evidence: [{ kind: "url", ref: "https://github.com/acme/web/pull/15" }] } });
  core.tasks.setState("t14", "done", "cold");
  const card = await ts.propose({ taskId: "t14", text: "Footer links now wrap below 360 px instead of overflowing. Draft PR: https://github.com/acme/web/pull/15", lang: zh ? "zh" : "en" });
  void card;

  // A vault line, done and ticked by itself.
  const line = items.find((i) => i.kind === "obsidian" && /房东|landlord/.test(i.title));
  if (line) {
    open("tv", zh ? "给房东回邮件问暖气" : "Email the landlord about the heating", undefined, "Reply to the landlord");
    ts.bind("tv", line, "you");
    core.tasks.setState("tv", "done", "cold");
  }

  console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
}
