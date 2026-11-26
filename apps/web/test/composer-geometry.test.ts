// Issue #218: an opened task's composer, while a round runs, wrapped Send onto a second line under
// the attach mark at phone widths. The row breaks on the model chip's full name, although the chip
// has an ellipsis: a flex item's content is its hypothetical size when a wrapping row breaks. The
// fix gives the chip a zero basis (so only what is left of the row counts) and caps it at its
// content; Stop and Send stay one pair at the right edge on the shared 20 (S2 row gap + S3).
// The inner widths are the card's own, measured in Chrome at 320/360/390/430: 280/320/350/390.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const tieredAt = css.indexOf("A tiered card");
const tiered = css.slice(tieredAt, css.indexOf("@container composer (max-width: 420px)", tieredAt));
const token = (name: string) => Number(new RegExp(`--${name}:\\s*(\\d+)px`).exec(css)?.[1]);
const gap = token("s2"); // the tiered row's gap
const pair = gap + token("s3"); // Stop and Send: the row gap plus S3 (20, as the Mac's)
const cb = 44; // every button in the row (ComposerBox --cb)
// The fixed parts of the row on the left and right, and the smallest the chip gets (its bars,
// caret and padding; under 340 its name is hidden). The meter's number is hidden under 340 too.
const chipMin = 47;
const meter = (viewport: number) => (viewport <= 360 ? 30 : 61);

describe("issue #218: the opened task's row never wraps", () => {
  test("the chip contributes no width to the row's break and truncates first", () => {
    expect(tiered).toMatch(/\.composer\.tiered \.ctune \{[^}]*flex: 1 1 0;[^}]*max-width: max-content;/);
    // The chip's name has an ellipsis, so the room it gets is the room it shows.
    expect(css).toMatch(/\.ctune-chip \.m \{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  });

  test("Stop and Send are one pair at the right on the shared gap", () => {
    expect(tiered).toMatch(/\.composer\.tiered \.stop,\s*\.composer\.tiered \.send-anchor \{[^}]*margin-left: auto;/);
    expect(tiered).toMatch(/\.composer\.tiered \.stop \+ \.send-anchor \{[^}]*margin-left: var\(--s3\);/);
    expect(gap).toBe(8);
    expect(pair).toBe(20);
  });

  test("the meter drops its number before the ring at the narrowest widths", () => {
    expect(css).toMatch(/@container composer \(max-width: 340px\) \{[\s\S]*?\.composer \.ctx-btn \.pct \{\s*display: none;/);
  });

  test("on one line at 320, 360, 390 and 430, with room for the row", () => {
    for (const viewport of [320, 360, 390, 430]) {
      const inner = viewport - 40; // the pane's 12 each side and the card's S2 padding
      const fixed = cb * 3 + meter(viewport) + gap * 3 + pair + chipMin; // attach, Stop, Send, meter
      expect({ viewport, fixed, inner, fits: fixed <= inner }).toEqual({ viewport, fixed, inner, fits: true });
    }
  });
});
