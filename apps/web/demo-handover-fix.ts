// D415: the author's hand-over on 0.0.99 (hel, 2026-11-20), replayed on a demo core: 557 open to-dos plus
// nowledge-co/mem's #10612 (Default-space aliases) and #10559 (the general settings page), both put under
// one subject 通用设置 by the sort, as hel's was; this Mac as the computer with a real nowledge-mem clone;
// the real runner (its worktree, its branch, its failures) with a scripted agent; a git on PATH that
// meets another git's index.lock the way hel's did. Fake gh, fake model: never the real GitHub, never a
// real model, never the person's repositories (the clone is a scratch repository made here).
//   DUCTER_PORT=7996 DEMO_LANG=zh bun apps/web/demo-handover-fix.ts
// DEMO_LOCK: once  another git holds the new worktree's index.lock for a moment (hel's race)
//            stale a lock a dead git left long ago
//            hold  a fresh lock that stays (the card's 仓库正忙 and 清掉旧的再试)
// DEMO_STAGE: (none) the pile; hand: the author's hand-over said as he said it (note and all); go: and
// its card answered 留言并开始 (the comments go, then it starts); mine: the person's own subjects made
// (#10612 taken out of 通用设置 and put in a subject of its own).
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";
import { createOarHarnessPort, createRunner } from "../../packages/runner/src/index.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "";
const lockMode = process.env.DEMO_LOCK ?? "";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-handfix-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const DAY = 86_400_000;
const now = Date.now();

// ---------- a scratch nowledge-mem clone, and the git that meets a lock ----------

const repo = join(scratch, "dev", "nowledge-mem");
mkdirSync(repo, { recursive: true });
const sh = (args: string[]) => Bun.spawnSync(args, { cwd: repo, stdout: "ignore", stderr: "ignore" });
sh(["git", "init", "-q", "-b", "main"]);
writeFileSync(join(repo, "README.md"), "# Nowledge Mem\n");
sh(["git", "add", "."]);
sh(["git", "-c", "user.email=demo@example.com", "-c", "user.name=demo", "commit", "-qm", "init"]);
sh(["git", "remote", "add", "origin", "https://github.com/nowledge-co/mem.git"]);
// Always on PATH: it refuses to change any repository outside the scratch folder (the guard), and with
// DEMO_LOCK it meets the lock.
{
  const real = Bun.spawnSync(["sh", "-c", "command -v git"]).stdout.toString().trim();
  const bin = join(scratch, "bin");
  mkdirSync(bin, { recursive: true });
  const marker = join(scratch, "locked-once");
  // The first worktree add finds the lock (made then: fresh, or dated a day ago for "stale"); while it is there, git says so.
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh
case "$*" in *"worktree add"*|*"branch"*|*"worktree remove"*)
  case "$2" in "${scratch}"*|"$(cd "${scratch}" 2>/dev/null && pwd -P)"*) ;; *) echo "demo: refusing to change a repository outside its scratch folder: $2" >&2; exit 1;; esac;;
esac
[ -n "${lockMode}" ] && case "$*" in *"worktree add"*)
  repo="$2"; name=$(basename "$5"); lock="$repo/.git/worktrees/$name/index.lock"
  if [ ! -e "${marker}" ]; then touch "${marker}"; mkdir -p "$(dirname "$lock")"; touch ${lockMode === "stale" ? "-t 202611190400" : ""} "$lock"; fi
  if [ -e "$lock" ]; then
    echo "Preparing worktree (new branch '$7')" >&2
    echo "fatal: Unable to create '$lock': File exists." >&2
    echo "" >&2
    echo "Another git process seems to be running in this repository, or the lock file may be stale" >&2
    ${lockMode === "once" ? 'rm -f "$lock"' : ":"}
    exit 128
  fi;;
esac
exec "${real}" "$@"
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH}`;
}

// ---------- the pile: 557 open, and hel's two ----------

const HEL: FakeIssue[] = [
  { repo: "nowledge-co/mem", number: 10612, title: "0.10.119：Default 空间合并遗留同名别名无法通过 --clear-aliases 或 API 清除，导致按名解析写错空间", state: "open", assigned: true, labels: ["bug", "severity/major"], updated: new Date(now - 0.1 * DAY).toISOString(), body: "## Bug Report\n\n来源：https://github.com/nowledge-co/mem-feedback/issues/606\n\n1. 先通过 `nmem spaces merge` 将某个项目 Space 合并进 `default`…" },
  { repo: "nowledge-co/mem", number: 10559, title: "Improve general setting page", state: "open", assigned: true, labels: ["enhancement"], updated: new Date(now - 0.2 * DAY).toISOString(), body: "对通用设置页面的UI/UX进行完整的重构，示意图如下：…" },
  { repo: "nowledge-co/mem", number: 10611, title: "空草稿导致会话同步校验失败", state: "open", assigned: true, labels: ["bug"], updated: new Date(now - 0.3 * DAY).toISOString() },
  { repo: "nowledge-co/mem", number: 10495, title: "Retryable fold checkpoints after a crash", state: "open", assigned: true, labels: [], updated: new Date(now - 0.5 * DAY).toISOString() },
];
const issues = (): FakeIssue[] => [...pileIssues(now).map((i) => ({ ...i, repo: i.repo.replace(/^acme\//, "nowledge-co/") })), ...HEL];

/** The sort as hel's went: #10612 under 通用设置 too (the model stretched a subject it had already given). */
function ask(): (prompt: string) => Promise<{ text: string; tokens: number }> {
  const sort = demoAsk(zh, 120);
  return async (prompt) => {
    if (prompt.includes("<logins>")) return { text: "{}", tokens: 500 };
    if (prompt.includes("<about>")) return { text: JSON.stringify({ found: [] }), tokens: 2000 };
    if (prompt.includes("<diff>")) return sort(prompt);
    const got = await sort(prompt);
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string }[];
    const out = (JSON.parse(got.text) as { id: number; group: string; why: string }[]).map((v) => {
      const t = rows.find((r) => r.id === v.id)!.title;
      if (/10\.119|general setting/i.test(t)) return { id: v.id, group: "do", why: zh ? (/general/i.test(t) ? "页面结构和参考实现明确，可按给定方案完成设置页重构。" : "清理别名的预期明确，CLI 与 API 都有具体复现步骤。") : "Clear and reproducible", size: /general/i.test(t) ? "large" : "medium", subject: zh ? "通用设置" : "General settings" };
      if (/草稿|checkpoint/i.test(t)) return { id: v.id, group: "do", why: zh ? "复现条件明确" : "Clear repro", size: "medium", subject: zh ? (/草稿/.test(t) ? "会话同步" : "蒸馏恢复") : /草稿/.test(t) ? "Thread sync" : "Distill recovery" };
      const s = /pricing|Footer|Dark mode|Button label|alt text/i.test(t) ? (zh ? "网页界面" : "Web UI") : /Docs|runbook/i.test(t) ? (zh ? "文档" : "Docs") : /CI|CDN|runners/i.test(t) ? (zh ? "基础设施" : "Infrastructure") : /importer|audit|Offline|tablet|GraphQL/i.test(t) ? (zh ? "大改动" : "Big changes") : undefined;
      return { ...v, ...(s ? { subject: s } : {}) };
    });
    return { text: JSON.stringify(out), tokens: got.tokens };
  };
}

const gh = fakeGh(issues(), { login: "wey-gu" });
const core = startCore({
  ooSource: noOo,
  dataDir,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  taskSources: { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000, ask: ask() },
  homeRepos: () => ({ folder: join(scratch, "ducter"), repos: [{ path: repo, name: "nowledge-mem", remote: "github.com/nowledge-co/mem", touchedAt: new Date(now - DAY).toISOString() }] }),
  // Only the scratch clone: the resolver never looks for the person's own copies on this Mac.
  homeClones: async () => ({ clones: [{ path: repo, name: "nowledge-mem", remote: "github.com/nowledge-co/mem", touchedAt: new Date(now - DAY).toISOString() }] }),
  newTaskComputers: { nameOf: () => undefined, homeName: () => "Macbook Pro M3", workers: () => [], folderInfo: async () => "offline", repos: async () => ({ folder: join(scratch, "ducter"), repos: [] }) } as never,
} as never);
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

// The real runner, its agent scripted: it reads for a moment and says what it found.
const rt = scriptedRuntime({ id: "claude", turn: async () => void (await Bun.sleep(800)) });
core.setRunner(createRunner(core as never, { harness: createOarHarnessPort({ loadRuntime: async () => rt }) }) as never);

const ts = core.taskSources;
const until = async (ok: () => unknown) => {
  while (!ok()) await Bun.sleep(100);
};
await ts.add("github");
await ts.look();
await until(() => ts.view().pile?.sortedAt && !ts.view().pile?.sorting);

if (stage === "mine") {
  // The person's own subjects: #10612 is about Default-space aliases, not the settings page.
  ts.pile.subject({ op: "take", name: zh ? "通用设置" : "General settings", refs: ["nowledge-co/mem#10612"] });
  ts.pile.subject({ op: "put", name: zh ? "Default 空间别名" : "Default-space aliases", refs: ["nowledge-co/mem#10612"] });
  ts.pile.subject({ op: "put", name: zh ? "通用设置" : "General settings", refs: ["nowledge-co/mem#10611"] });
}
if (stage === "hand" || stage === "go") {
  // As the author did: the 通用设置 chip, both ticked, 合成一件做, his note word for word.
  const ho = ts.handover!;
  const f = await ho.find({ subject: zh ? "通用设置" : "General settings" });
  const r = await ho.hand({ refs: f.items.map((p) => p.item.ref), shape: "one", subject: zh ? "通用设置" : "General settings", bySubject: true, note: zh ? "确保这些任务都没开始，然后再 issue 里留言说一下 我的 ducter agent 要开始做了" : "Make sure none of these were started, then comment on the issues that my Ducter agent is starting on them" });
  console.log(`[demo] hand-over: ${JSON.stringify(r)}`);
  if (stage === "go" && r.asked) {
    core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: r.asked, option: "go", by: "user" } } as never);
    await until(() => core.tasks.list().some((c) => c.attention !== "queued" && c.residency !== "provisioning"));
    for (const c of core.tasks.list()) console.log(`[demo] task ${c.taskId} ${c.attention} "${c.title}" ${JSON.stringify(c.place)}`);
  }
}
console.log(`[demo] handover-fix up at http://127.0.0.1:${core.port}/app (stage: ${stage || "pile"}; lock: ${lockMode || "none"}; repo: ${repo}; data: ${core.dataDir})`);
