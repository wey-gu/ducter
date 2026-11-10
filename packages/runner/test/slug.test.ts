// D201: a task's branch and folder are named in its title's own words and script.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, planPlace, provisionPlace, slugify, worktreeFor } from "../src/places.ts";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "ducter-slug-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const validRef = (name: string) => Bun.spawnSync(["git", "check-ref-format", `refs/heads/${name}`]).exitCode === 0;

const cases: [string, string][] = [
  // ASCII titles: exactly as before D201.
  ["Fix the flaky test!", "fix-the-flaky-test"],
  ["  --Add WAL bench (v2)..  ", "add-wal-bench-v2"],
  ["snake_case and dots.in.names", "snake-case-and-dots-in-names"],
  // Other scripts keep their words.
  ["修复登录页的闪退", "修复登录页的闪退"],
  ["修复 Login 页：闪退！", "修复-login-页-闪退"],
  ["ログイン画面を直す", "ログイン画面を直す"],
  ["カタカナ と ひらがな", "カタカナ-と-ひらがな"],
  ["Починить вход", "Починить-вход"], // only ASCII letters are lowercased
  ["Café crème à la carte", "café-crème-à-la-carte"],
  ["로그인 고치기", "로그인-고치기"],
  ["सूची ठीक करो", "सूची-ठीक-करो"], // vowel signs are marks and stay with their letters
  ["🚀 ship it 🎉", "ship-it"],
  ["🚀🎉✨", "task"],
  ["!!!", "task"],
  ["", "task"],
];

test("D201: a title's slug keeps letters and digits of any script; anything else is one -", () => {
  for (const [title, want] of cases) {
    expect(slugify(title)).toBe(want);
    expect(validRef(`ducter/${slugify(title)}`)).toBe(true);
  }
});

test("D201: NFC, so a title typed decomposed (NFD) gives the same slug", () => {
  const nfd = "Café résumé".normalize("NFD");
  expect(nfd).not.toBe("Café résumé");
  expect(slugify(nfd)).toBe("café-résumé");
  expect(slugify(nfd)).toBe(slugify("Café résumé"));
  expect(slugify("한국어".normalize("NFD"))).toBe("한국어"); // Hangul jamo compose back
});

test("D201: at most 40 characters, never a split surrogate pair or grapheme, never ending in -", () => {
  const cjk = "修复".repeat(30);
  expect([...slugify(cjk)]).toHaveLength(40);
  expect(slugify("a".repeat(39) + " b")).toBe("a".repeat(39)); // the cut lands on the -: it goes
  const astral = "𠀀".repeat(50); // CJK Extension B: each is a surrogate pair, and a letter
  const s = slugify(astral);
  expect([...s]).toHaveLength(40);
  expect(s).toBe("𠀀".repeat(40));
  expect(slugify("é".normalize("NFD").repeat(5).replace(/^/, "x"))).toBe("x" + "é".repeat(5)); // e + combining accent stays one
  for (const t of [cjk, astral, "ну очень длинное название задачи на русском языке"]) expect(validRef(`ducter/${slugify(t)}`)).toBe(true);
});

test("D201: the folder is the branch's slug in its own script; an NFD twin of a folder is taken", () => {
  const data = join(dir, "data");
  const repo = "/Users/me/code/我的仓库";
  expect(worktreeFor(data, repo, "ducter/修复登录")).toBe(join(data, "worktrees", "我的仓库", "修复登录"));
  // A folder already there under the decomposed spelling counts as the same name (ext4 keeps both).
  mkdirSync(join(data, "worktrees", "我的仓库", "café".normalize("NFD")), { recursive: true });
  expect(worktreeFor(data, repo, "ducter/café")).toBe(join(data, "worktrees", "我的仓库", "café-2"));
  expect(worktreeFor(data, repo, "ducter/café".normalize("NFD"))).toBe(join(data, "worktrees", "我的仓库", "café-3"));
  // A branch named another way keeps its own case and dots.
  expect(worktreeFor(data, repo, "feature/Ünïcode v1.2")).toBe(join(data, "worktrees", "我的仓库", "feature-Ünïcode-v1.2"));
});

test("D201: a Chinese task gets a Chinese branch and folder that git really makes", async () => {
  const repo = join(dir, "repo");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"]);
  const data = join(dir, "data");
  const r = await planPlace({ kind: "repo", device: "local", repoPath: repo }, "t1", "修复登录页的闪退", data);
  expect(r.place).toMatchObject({ branch: "ducter/修复登录页的闪退", worktree: join(data, "worktrees", "repo", "修复登录页的闪退") });
  await provisionPlace(r);
  expect(existsSync(r.cwd)).toBe(true);
  expect((await git(r.cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).out).toBe("ducter/修复登录页的闪退");
  // The same title again: the branch is taken, so the task id is added, as before.
  const again = await planPlace({ kind: "repo", device: "local", repoPath: repo }, "t2", "修复登录页的闪退", data);
  expect(again.place).toMatchObject({ branch: "ducter/修复登录页的闪退-t2" });
});
