// D254: keeping your place in the conversation, and copying from it (follow.ts, conv-copy.ts,
// markdown.ts's copy form). Pure rules; the wiring is looked at in the shots.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { copy, copyByField } from "../src/conv-copy.ts";
import { AT_END, countWords, dividerAt, gapOf, keepDraft, landing, newSince, readDraft, showWayBack, stillFollowing } from "../src/follow.ts";
import { strings } from "../src/i18n.ts";
import { markdown, readingWords } from "../src/markdown.ts";

const m = (scrollHeight: number, scrollTop: number, clientHeight: number) => ({ scrollHeight, scrollTop, clientHeight });
const rows = (...r: [number, boolean][]) => r.map(([seq, mine]) => ({ seq, mine }));

describe("following the end", () => {
  test("the gap to the end", () => {
    expect(gapOf(m(2000, 1200, 800))).toBe(0);
    expect(gapOf(m(2000, 1000, 800))).toBe(200);
    expect(gapOf(m(500, 0, 800))).toBe(0); // shorter than the screen: at the end
  });
  test("near the end is the end", () => {
    expect(stillFollowing(false, 0, m(2000, 2000 - 800 - AT_END, 800))).toBe(true);
  });
  test("only moving up lets go of the end", () => {
    // The reader scrolls up past the slack.
    expect(stillFollowing(true, 1200, m(2000, 900, 800))).toBe(false);
    // Content grew under a reader who didn't move (a picture loaded): still following.
    expect(stillFollowing(true, 1200, m(2600, 1200, 800))).toBe(true);
    // A glide down on its way (ours): never lets go, so the way back never flickers.
    expect(stillFollowing(true, 600, m(3000, 900, 800))).toBe(true);
    // Up and coming back down without reaching the end: still away.
    expect(stillFollowing(false, 600, m(3000, 900, 800))).toBe(false);
  });
});

describe("what is new", () => {
  test("counts the partner's rows after the mark, never the person's own", () => {
    const r = rows([1, true], [2, false], [3, false], [4, true], [5, false]);
    expect(newSince(r, 2)).toEqual({ count: 2, first: 3 });
    expect(newSince(r, 5)).toEqual({ count: 0, first: undefined });
    expect(newSince(r, 0)).toEqual({ count: 3, first: 2 });
  });
  test("the divider stands before the first unread from the partner", () => {
    expect(dividerAt(rows([1, true], [2, false], [3, false]), 1)).toBe(2);
    expect(dividerAt(rows([1, true], [2, false], [3, false]), 2)).toBe(3);
    expect(dividerAt(rows([1, true], [2, false]), 2)).toBeUndefined();
  });
  test("no divider when the person wrote after it (they were there)", () => {
    expect(dividerAt(rows([1, false], [2, true]), 0)).toBeUndefined();
    expect(dividerAt(rows([1, false], [2, true], [3, false]), 0)).toBe(3);
  });
  test("the count as said", () => {
    expect(countWords(3)).toBe("3");
    expect(countWords(99)).toBe("99");
    expect(countWords(120)).toBe("99+");
  });
  test("the way back shows for news, or more than a screen away", () => {
    expect(showWayBack(10, 800, 1)).toBe(true);
    expect(showWayBack(100, 800, 0)).toBe(false);
    expect(showWayBack(700, 800, 0)).toBe(true);
  });
});

describe("landing", () => {
  test("what came fits: the end", () => {
    expect(landing(m(3000, 1000, 800), 2500)).toBe(2200);
  });
  test("what came is taller than the screen: its start, a little air above", () => {
    expect(landing(m(3000, 1000, 800), 1500)).toBe(1488);
  });
  test("nothing to land on: the end; never above the top", () => {
    expect(landing(m(3000, 1000, 800), undefined)).toBe(2200);
    expect(landing(m(3000, 1000, 800), 4)).toBe(0);
    expect(landing(m(300, 0, 800), 100)).toBe(0);
  });
});

describe("copying", () => {
  test("D492: a whole message copies as the Markdown written, and formatted beside it", async () => {
    const src = "**Done.** The *build* is green.\n\n### Next\n* ship it\n```\nbun test **x**\n```";
    const put: Record<string, string> = {};
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem ??= class {
      constructor(readonly parts: Record<string, Blob>) {}
    };
    const nav = { clipboard: { writeText: async () => {}, write: async ([item]: ClipboardItem[]) => { for (const [k, b] of Object.entries((item as unknown as { parts: Record<string, Blob> }).parts)) put[k] = await b.text(); } } };
    expect(await copy(src, nav, undefined, markdown(src))).toBe(true);
    expect(put["text/plain"]).toBe(src);
    expect(put["text/html"]).toContain("<strong>Done.</strong>");
    expect(put["text/html"]).toContain("<pre><code>bun test **x**</code></pre>");
    expect(put["text/html"]).not.toContain("data-copy-code");
  });
  test("Select text shows the words to read: no styling marks, no fences, a link with its address", () => {
    expect(readingWords("**Done.** The *build* is green.\n\n### Next\n* ship it")).toBe("Done. The build is green.\n\nNext\n- ship it");
    expect(readingWords("See [the PR](https://github.com/x/y/pull/1) and https://a.b/c")).toBe("See the PR (https://github.com/x/y/pull/1) and https://a.b/c");
    expect(readingWords("改好了：\n\n```\nrecord: x\n```\n\n18 分钟降到 9 分钟。")).toBe("改好了：\n\nrecord: x\n\n18 分钟降到 9 分钟。");
  });
  test("a code block in the conversation carries its own Copy; the plain form doesn't", () => {
    expect(markdown("```\nx < y\n```")).toBe("<pre><code>x &lt; y</code></pre>");
    const html = markdown("```\nx < y\n```", "拷贝");
    expect(html).toContain('<div class="codeblock"><pre><code>x &lt; y</code></pre>');
    expect(html).toContain('data-copy-code aria-label="拷贝"');
    expect(html).not.toContain("<script");
  });
  test("without the Clipboard API (plain http on the home network) it copies the old way", async () => {
    const calls: string[] = [];
    const field = { value: "", style: { cssText: "" }, setAttribute() {}, select() {}, setSelectionRange() {}, remove: () => calls.push("removed") };
    const doc = {
      createElement: () => field,
      execCommand: (c: string) => (calls.push(`${c}:${field.value}`), true),
      activeElement: null,
      body: { appendChild: () => calls.push("added") },
    } as unknown as Parameters<typeof copyByField>[1];
    expect(await copy("hello", {}, doc)).toBe(true);
    expect(calls).toEqual(["added", "copy:hello", "removed"]);
  });
  test("the Clipboard API first; refused, the old way", async () => {
    let wrote = "";
    expect(await copy("a", { clipboard: { writeText: async (s) => void (wrote = s) } })).toBe(true);
    expect(wrote).toBe("a");
    const doc = { createElement: () => ({ style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() {} }), execCommand: () => false, activeElement: null, body: { appendChild() {} } } as unknown as Parameters<typeof copyByField>[1];
    expect(await copy("b", { clipboard: { writeText: async () => Promise.reject(new Error("no")) } }, doc)).toBe(false);
  });
});

describe("the draft", () => {
  test("kept until sent; an empty one is forgotten", () => {
    const box = new Map<string, string>();
    const s = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v), removeItem: (k: string) => void box.delete(k) };
    expect(readDraft(s)).toBe("");
    keepDraft("帮我看看 CI", s);
    expect(readDraft(s)).toBe("帮我看看 CI");
    keepDraft("  ", s);
    expect(readDraft(s)).toBe("");
    expect(readDraft(undefined)).toBe("");
  });
});

describe("the stylesheet", () => {
  // D254 found D248's merge had dropped one "}" (.screens-both .both-row), so every rule after it,
  // D248's own included, was nested inside it and never applied.
  test("every block is closed", () => {
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    let depth = 0;
    let line = 1;
    for (const ch of css) {
      if (ch === "\n") line++;
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth < 0) throw new Error(`an extra "}" near line ${line}`);
    }
    expect(depth).toBe(0);
  });
});

describe("words", () => {
  test("the chip reads naturally in both", () => {
    expect(strings("zh").t("conv.new.n", countWords(3))).toBe("3 条新消息");
    expect(strings("en").t("conv.new.n", countWords(120))).toBe("99+ new messages");
    expect(strings("zh").t("reply.copy")).toBe("拷贝");
  });
});
