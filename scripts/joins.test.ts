// The joined-text guard (D291) in every test run: scripts/check-joins.ts says why.
import { describe, expect, test } from "bun:test";
import { docJoins, joins, scan } from "./check-joins.ts";

describe("no joined text (D291)", () => {
  test("no client word or view builds a line by joining facts with a separator", () => {
    const bad = scan();
    if (bad.length) console.error(`Make each fact its own element, or say one sentence (design/ui.md "No joined text"):\n${bad.join("\n")}`);
    expect(bad).toEqual([]);
  });

  test("the check catches what it is for", () => {
    const hits = (s: string, ext = "ts") => joins(s, ext).map((j) => j.line);
    expect(hits(`"device.state.unreachable": "连不上 · 最后在线 %s",`)).toEqual([1]);
    expect(hits("const who = [a, b].join(\" · \");")).toEqual([1]);
    expect(hits("label := name + \" · \" + where", "go")).toEqual([1]);
    expect(hits(`<small>· {p.word}</small>`, "tsx")).toEqual([1]);
    expect(hits(`"a • b"`)).toEqual([1]);
    expect(hits(`// 上网 · 用电脑 in a comment is fine`)).toEqual([]);
    expect(hits(`/**\n * 用手机 · 在 MacBook 上\n */\nconst ok = "23:03–23:04";`)).toEqual([]);
    expect(hits(`{/* Reply… · Hold */}<b>ok</b>`, "tsx")).toEqual([]);
  });

  test("the docs check catches a joined line and leaves code, URLs and masks alone", () => {
    const hits = (s: string) => docJoins(s).map((j) => j.line);
    expect(hits("with **Didn't send · Retry**.")).toEqual([1]);
    expect(hits("*Asleep ·\n  carries on*")).toEqual([1]);
    expect(hits("```sh\necho a · b\n```\nplain")).toEqual([]);
    expect(hits("run `a · b` here")).toEqual([]);
    expect(hits("[x](https://e.co/a·b) and https://e.co/·")).toEqual([]);
    expect(hits("> - **Card:** Visa ••4242")).toEqual([]);
    expect(hits("<!-- a · b -->")).toEqual([]);
  });
});
