// D303: rich answers on the web: the words are the Mac's, and the view draws what the shared
// model says (the model itself is tested in packages/protocol/test/rich.test.ts, and the Go port
// against the same fixture).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("rich answers (D303)", () => {
  test("the view uses theme tokens only, and real table and list markup", () => {
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
    const block = css.slice(css.indexOf("/* ---------- D303: rich answers."));
    expect(block.length).toBeGreaterThan(1000);
    // No colour of its own: every colour is a token, so Pebble dark follows (D302).
    expect(block.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
    const tsx = readFileSync(new URL("../src/rich.tsx", import.meta.url), "utf8");
    for (const s of ["<table>", '<th scope="col"', '<th scope="row"', 'type="checkbox"', "aria-hidden=\"true\"", '<table class="sr">', "role=\"group\""]) expect(tsx).toContain(s);
  });
});
