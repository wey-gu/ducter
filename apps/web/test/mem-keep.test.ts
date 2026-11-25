// D566: Save to Nowledge Mem, the asking side: shown only while Mem can take it; one frame per tap;
// the home's answer clears it or says why.
import { expect, test } from "bun:test";
import type { MemView, Settings } from "@ducter/protocol";
import { memAutoKeeps, memKeeps, secretFileName } from "@ducter/protocol";
import { keepInMem, keepNow, memKeepReady, memKeepWire, onMemFileFrame } from "../src/mem-keep-state.ts";

const s = (memory: boolean) => ({ name: "Ducter", memory }) as Settings;
const mem = (o: Partial<MemView> = {}) => ({ state: "connected", noted: [], ...o }) as MemView;

test("shown only while memory is on and Mem is connected and signed in", () => {
  expect(memKeepReady(s(true), mem())).toBe(true);
  expect(memKeepReady(s(false), mem())).toBe(false);
  expect(memKeepReady(s(true), mem({ state: "missing" }))).toBe(false);
  for (const issue of ["signed_out", "unreachable", "old"] as const) expect(memKeepReady(s(true), mem({ health: { issue } }))).toBe(false);
  expect(memKeepReady(s(true), mem({ health: { issue: "plugin", agents: ["codex"] } }))).toBe(true);
});

test("what Mem reads is offered; the default keeps reports and documents only", () => {
  const f = (name: string, type = "text/plain") => ({ name, type });
  expect(memKeeps(f("report.md", "text/markdown"))).toBe(true);
  expect(memKeeps(f("visa.pdf", "application/pdf"))).toBe(true);
  expect(memKeeps(f("fix.ts"))).toBe(true);
  expect(memKeeps(f("shot.png", "image/png"))).toBe(false);
  expect(memKeeps(f("all.zip", "application/zip"))).toBe(false);
  expect(memAutoKeeps(f("report.md", "text/markdown"))).toBe(true);
  expect(memAutoKeeps(f("numbers.csv", "text/csv"))).toBe(true);
  expect(memAutoKeeps(f("run.log"))).toBe(false);
  expect(memAutoKeeps(f("fix.ts"))).toBe(false);
  expect(secretFileName(".env")).toBe(true);
  expect(secretFileName("prod.env")).toBe(true);
  expect(secretFileName("id_ed25519")).toBe(true);
  expect(secretFileName("report.md")).toBe(false);
  expect(secretFileName("environment-notes.md")).toBe(false);
});

test("a tap sends one frame; the answer clears it or says why", () => {
  const sent: unknown[] = [];
  let redraws = 0;
  memKeepWire((f) => void sent.push(f), () => redraws++);
  keepInMem("a".repeat(64));
  keepInMem("a".repeat(64));
  expect(sent).toHaveLength(1);
  expect(keepNow("a".repeat(64))).toEqual({ state: "saving" });
  onMemFileFrame({ media: "a".repeat(64), ok: false, why: "signed_out" });
  expect(keepNow("a".repeat(64))).toEqual({ state: "failed", why: "signed_out" });
  keepInMem("a".repeat(64));
  onMemFileFrame({ media: "a".repeat(64), ok: true });
  expect(keepNow("a".repeat(64))).toBeUndefined();
  expect(redraws).toBeGreaterThan(2);
});

// D575: Mem's only write target is a Space others read: the answer carries where; the person's
// choice goes back with the next tap.
test("shared_space is kept with where Mem would put it; the answer rides the next frame", () => {
  const sent: { space?: string }[] = [];
  memKeepWire((f) => void sent.push(f as { space?: string }), () => {});
  const id = "b".repeat(64);
  keepInMem(id);
  expect(sent[0]!.space).toBeUndefined();
  onMemFileFrame({ media: id, ok: false, why: "shared_space", shared: { label: "Everyone", readers: 10, personal: true } });
  expect(keepNow(id)).toEqual({ state: "failed", why: "shared_space", shared: { label: "Everyone", readers: 10, personal: true } });
  keepInMem(id, "personal");
  expect(sent[1]).toMatchObject({ t: "mem_file_save", media: id, space: "personal" });
  onMemFileFrame({ media: id, ok: true });
  expect(keepNow(id)).toBeUndefined();
});
