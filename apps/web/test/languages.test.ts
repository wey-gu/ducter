// D292: languages beyond Chinese and English. The interface resolves any tag to a table through
// its fallback chain; a task's result is read in the report's language (the task's, else the
// conversation's), never the interface's alone; replies can be set to any language; and a bubble
// lays out right-to-left text on its own.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { detectLang, strings, tableLang, TABLES } from "../src/i18n.ts";

const now = new Date().toISOString();
const card = (id: string, summary: string) => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  project: "p",
  place: { kind: "repo", device: "local", repoPath: "/r/p", branch: `ducter/${id}`, baseBranch: "main" },
  harness: "claude-code",
  attention: "done",
  residency: "hot",
  openedAt: now,
  updatedAt: now,
  lastReport: { taskId: id, state: "done", summary, questions: [], evidence: [] },
});
const opened = (id: string, language?: string) => ({ taskId: id, title: `Task ${id}`, project: "p", place: { kind: "none" }, harness: "claude-code", brief: "", ...(language ? { language } : {}) });

async function home() {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  A.L = strings("en");
  A.S.channel.splice(0);
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({
    t: "on_hand",
    onHand: { tasks: [card("k1", "벤치마크 세 개를 추가했습니다."), card("k2", "Added three benchmarks."), card("k3", "벤치마크 세 개를 추가했습니다.")], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 3 }, waiters: [] },
  } as any);
  A.S.tasks.get("k1")!.open = opened("k1", "ko") as any;
  A.S.tasks.get("k2")!.open = opened("k2", "ko") as any;
  A.S.tasks.get("k3")!.open = opened("k3") as any;
  return { A, o };
}

describe("the interface: any tag, a table by its chain (D292)", () => {
  test("a tag resolves to the nearest table", () => {
    expect(tableLang("ko")).toBe("en");
    expect(tableLang("zh-Hant")).toBe("zh");
    expect(tableLang("zh-TW")).toBe("zh");
    expect(tableLang("en-GB")).toBe("en");
    const ko = strings("ko");
    expect(ko.lang).toBe("en");
    expect(ko.locale).toBe("ko");
    expect(ko.t("partner.talk.auto")).toBe("Same as yours");
    expect(strings("zh-Hant").t("partner.talk.auto")).toBe("跟着你");
  });
  test("the browser's languages pick the first with a table", () => {
    expect(detectLang(["ko-KR", "zh-CN"])).toBe("zh");
    expect(detectLang(["ko-KR"])).toBe("en");
    expect(detectLang(["zh-TW", "en"])).toBe("zh");
    expect(detectLang([])).toBe("en");
  });
  test("counts and dates through Intl, in the shown words' language", () => {
    TABLES.en["test.n.one"] = "%d task";
    TABLES.en["test.n.other"] = "%d tasks";
    const en = strings("en");
    expect(en.n("test.n", 1)).toBe("1 task");
    expect(en.n("test.n", 3)).toBe("3 tasks");
    expect(strings("ko").n("test.n", 1)).toBe("1 task"); // English words, English plural rules
    expect(en.n("partner.talk.auto", 2)).toBe("Same as yours"); // no plural forms: the key itself
    delete TABLES.en["test.n.one"];
    delete TABLES.en["test.n.other"];
    expect(en.num(12345)).toBe("12,345");
    expect(strings("de").num(12345)).toBe("12,345"); // German has no table: English words, English numbers
    expect(strings("en").style.cased).toBe(true);
    expect(strings("zh").style.cased).toBe(false);
  });
  test("the chosen interface stays among the complete tables", () => {
    const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/export type UiLang = "auto" \| TableLang;/);
  });
});

describe("a result is read in its report's language (D292)", () => {
  test("a Korean summary for a Korean task shows under an English interface", async () => {
    const { A, o } = await home();
    expect(A.readerLang(A.S.tasks.get("k1"))).toBe("ko");
    // D661: a report with no gist is the task's own words, 它说 / It said around the report's
    // own language; the language is still the report's, never the interface's.
    expect(o.storyOf(A.S.tasks.get("k1")!).words).toBe(A.L.t("onhand.said", "벤치마크 세 개를 추가했습니다."));
  });
  test("an English summary for a Korean task does not", async () => {
    const { A, o } = await home();
    expect(o.storyOf(A.S.tasks.get("k2")!).words).not.toBe("Added three benchmarks.");
  });
  test("without the task's own, the conversation's language decides, from the person's words", async () => {
    const { A, o } = await home();
    expect(A.readerLang(A.S.tasks.get("k3"))).toBe("en");
    expect(o.storyOf(A.S.tasks.get("k3")!).words).not.toBe("벤치마크 세 개를 추가했습니다.");
    A.S.channel.push({ ev: {} as any, firstSeq: 1, revision: 0, user: { text: "벤치마크 좀 추가해줘" } as any });
    A.S.channel.push({ ev: {} as any, firstSeq: 2, revision: 0, user: { text: "OK" } as any }); // no language of its own
    expect(A.convLang).toBe("ko");
    expect(o.storyOf(A.S.tasks.get("k3")!).words).toBe(A.L.t("onhand.said", "벤치마크 세 개를 추가했습니다."));
    A.S.channel.splice(0);
  });
});

describe("replies in any language (D292)", () => {
  test("Follow me, the common languages by their own names, then Other language", async () => {
    const { A } = await import("../src/app.ts");
    const v = await import("../src/views.tsx");
    A.L = strings("en");
    const opts = v.talkOptions("auto");
    expect(opts[0]).toEqual({ v: "auto", label: "Same as yours" });
    const labels = opts.map((o) => o.label);
    for (const n of ["简体中文", "繁體中文", "English", "日本語", "한국어", "Español"]) expect(labels).toContain(n);
    expect(opts.at(-1)!.label).toBe("Other language…");
    // A language chosen under Other shows, selected, by its own name.
    const sv = v.talkOptions("sv");
    expect(sv.find((o) => o.v === "sv")?.label).toBe("Svenska");
    A.L = strings("zh");
    expect(v.talkOptions("auto")[0]!.label).toBe("跟着你");
    expect(v.talkOptions("auto").at(-1)!.label).toBe("其他语言…");
    A.L = strings("en");
  });
});

describe("right-to-left words in a bubble (D292)", () => {
  test("a bubble with Arabic text sets its direction from its text", async () => {
    const v = await import("../src/views.tsx");
    const node = v.UserWords({ text: "مرحبا، كيف حالك؟", cls: "user" }) as any;
    expect(node.props.dir).toBe("auto");
    expect(node.props.class).toBe("user");
    const replied = v.UserWords({ text: "مرحبا", cls: "user", reply: { seq: 1, from: "partner", quote: "hi" } as any }) as any;
    const words = [replied.props.children].flat(3).find((c: any) => c?.props?.class === "words");
    expect(words.props.dir).toBe("auto");
  });
  test("every bubble of the person's or the partner's words carries dir=auto", () => {
    const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    const views = src("views.tsx");
    expect(views.match(/<div class="bubble">\{/g) ?? []).toEqual([]);
    expect(views).toContain(`<div class="md" dir="auto"`);
    const tr = src("transcript.tsx");
    expect(tr.match(/class=\{`tx you[^>]*>/g)!.every((m) => m.includes(`dir="auto"`))).toBe(true);
    expect(tr).toContain(`<div class="tx said" dir="auto">`);
  });
});
