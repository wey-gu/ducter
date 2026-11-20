// D426: the author's find on 0.1.1, replayed on a demo core: the eval pile (research/176: 557 open in
// the real pile's shape, across nowledge-co repos, 100gle's five UI review issues among 70 UI/UX design
// ones), the person signed in as wey-gu, and a fake cheapest model that answers both the 0.1.1 find
// (one call over every title, "ids") and D426's (the reading, then meaning over the filtered set) as
// haiku did on the eval. Fake gh, fake model: never the real GitHub, never a real model.
//   DUCTER_PORT=7995 DEMO_LANG=zh bun apps/web/demo-handover-find.ts
// Open /app#hand?words=100gle%20分配给我的%20UI%2FUX%20的问题走查的修改%20task for the author's sentence.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";
import { evalPile, ME } from "../../packages/core/eval/find/pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-handfind-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const DAY = 86_400_000;
const shift = Date.now() - Date.parse("2026-11-20T10:00:00Z");
const at = (iso?: string) => (iso ? new Date(Date.parse(iso) + shift).toISOString() : undefined);

const pile = evalPile();
const byTitle = new Map(pile.map((p) => [p.item.title, p]));
const issues: FakeIssue[] = pile.map(({ item: i }) => {
  const [repo, n] = i.ref.split("#") as [string, string];
  return { repo, number: Number(n), title: i.title, ...(i.body ? { body: i.body } : {}), labels: i.labels ?? [], author: i.author!, assignees: (i.assignees ?? []).filter((a) => a !== ME), assignedBy: i.assignedBy!, created: at(i.createdAt)!, updated: at(i.updatedAt)!, assigned: true, state: "open", ...(i.pr ? { pr: true } : {}) };
});

/** Why each of 100gle's five is about his UI review, as haiku put it on the eval. */
const WHY: Record<string, [string, string]> = {
  "Remove unnecessary words for user in advanced search": ["高级搜索里多余的说明", "Extra words in advanced search"],
  "Remove unnecessary information for user in memory page": ["记忆页里多余的信息", "Extra details on the memory page"],
  "Improve about setting page": ["关于页的排版", "The About page's layout"],
  "Improve general setting page": ["通用设置页的排版", "The general settings layout"],
  "Improve memory space setting page": ["空间设置页的排版", "The space settings layout"],
};
const WHY_GROUP: Record<string, [string, string]> = { do: ["说得清楚，改动小", "Clear, and a small change"], decide: ["有两种改法，要你挑", "Two ways to go"], later: ["要先出设计稿", "Needs a design first"], close: ["像是已经做完了", "Looks done already"] };

function ask(): (prompt: string) => Promise<{ text: string; tokens: number }> {
  const rowsOf = (prompt: string) => JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)?.[1] ?? "[]") as { id: number; title: string; labels?: string[] }[];
  return async (prompt) => {
    await Bun.sleep(Number(process.env.DEMO_FIND_MS ?? 600));
    // D426's reading of what code couldn't place: nothing here (the sentences say logins).
    if (prompt.includes("<logins>")) return { text: "{}", tokens: 800 };
    // D426's meaning over the filtered set.
    if (prompt.includes("<about>")) {
      const about = /<about>([\s\S]*?)<\/about>/.exec(prompt)![1]!;
      const ui = /ui|ux|走查|界面|review/i.test(about);
      const found = rowsOf(prompt).filter((r) => (ui ? byTitle.get(r.title)?.topic === "ui" : false)).map((r) => ({ id: r.id, sure: "high", why: (WHY[r.title] ?? ["界面上的问题", "A UI problem"])[zh ? 0 : 1] }));
      return { text: JSON.stringify({ found }), tokens: 4000 };
    }
    // 0.1.1's find: the model named the subject itself and added a couple it thought alike.
    if (prompt.includes("<query>")) {
      const q = /<query>([\s\S]*?)<\/query>/.exec(prompt)![1]!;
      const rows = rowsOf(prompt);
      const windows = rows.filter((r) => /^Windows/.test(r.title)).slice(0, 2).map((r) => r.id);
      return { text: JSON.stringify({ subject: /他/.test(q) ? "Windows 新界面" : "UI/UX 问题走查", ids: windows }), tokens: 20000 };
    }
    // The sort: the eval pile's own groups.
    const rows = rowsOf(prompt);
    return {
      text: JSON.stringify(
        rows.map((r) => {
          const p = byTitle.get(r.title);
          const g = p?.group ?? "later";
          return { id: r.id, group: g, why: WHY_GROUP[g]![zh ? 0 : 1], ...(g === "do" ? { size: "small" } : {}), ...(g === "decide" ? { ask: zh ? "按哪种改？" : "Which way?", pick: "hand" } : {}), ...(g === "close" ? { comment: "Closing: looks done." } : {}) };
        }),
      ),
      tokens: 9000,
    };
  };
}

const gh = fakeGh(issues, { login: ME });
const core = startCore({
  ooSource: noOo,
  dataDir,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  taskSources: { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000, ask: ask() },
  homeRepos: () => ({ folder: join(scratch, "ducter"), repos: [{ path: "/Users/wey/dev/mem", name: "mem", remote: "github.com/nowledge-co/mem", touchedAt: new Date(Date.now() - DAY).toISOString() }] }),
} as never);
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const ts = core.taskSources;
await ts.add("github");
await ts.look();
while (!ts.view().pile?.sortedAt || ts.view().pile?.sorting) await Bun.sleep(100);
console.log(`[demo] handover find up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
