// D314: Done for you's glyphs, one table for the Mac and the web (fixtures/did-glyphs.json).
import { describe, expect, test } from "bun:test";
import fx from "../fixtures/did-glyphs.json" with { type: "json" };
import { DID_KINDS } from "../src/did.ts";
import { DID_GLYPH_STROKE, DID_GLYPHS, DID_TINTS, didGlyph } from "../src/did-glyphs.ts";

describe("did glyphs", () => {
  test("the fixture is the table", () => {
    expect(fx.glyphs).toEqual(DID_GLYPHS);
    expect(fx.tints).toEqual(DID_TINTS);
    expect(fx.stroke).toBe(DID_GLYPH_STROKE);
  });
  test("every kind has a picture; a sub-kind falls back to it", () => {
    for (const k of DID_KINDS) expect(DID_GLYPHS[k]).toBeTruthy();
    expect(didGlyph("sent", "mail")).toBe(DID_GLYPHS["sent.mail"]!);
    expect(didGlyph("sent", "agent")).toBe(DID_GLYPHS.sent!);
    expect(didGlyph("read")).toBe(DID_GLYPHS.read!);
  });
  test("every sub-kind key names a kind", () => {
    for (const key of Object.keys(DID_GLYPHS)) expect(DID_KINDS as readonly string[]).toContain(key.split(".")[0]!);
  });
  test("paths stay on the 20-point grid", () => {
    for (const d of Object.values(DID_GLYPHS)) {
      expect(d.startsWith("M")).toBe(true);
      expect(/^[MmLlHhVvCcSsQqAaZz0-9.,\s-]+$/.test(d)).toBe(true);
    }
  });
});
