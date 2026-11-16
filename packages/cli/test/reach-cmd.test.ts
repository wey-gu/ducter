// D293: `ducter reach` lists, adds, removes and leads with the home's addresses; `ducter domain`
// and `ducter tailscale` add theirs beside each other (never over one another).
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWays } from "@ducter/core/src/reach-book.ts";
import { cmdReach } from "../src/reach-cmd.ts";
import { pickWay } from "../src/worker.ts";
import { translator } from "../src/i18n.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const plain = { ok: (s: string) => s, bold: (s: string) => s, dim: (s: string) => s, warn: (s: string) => s, bad: (s: string) => s } as any;

async function run(dataDir: string, rest: string[], o: { kind?: string; probe?: (u: string) => Promise<boolean> } = {}) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (s: string) => lines.push(String(s));
  try {
    const code = await cmdReach({ t: translator("en"), style: plain, dataDir, json: true, rest, ...o });
    return { code, out: lines.map((l) => JSON.parse(l)) };
  } finally {
    console.log = log;
  }
}

test("reach add, list with checks, primary, remove", async () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-reach-"));
  dirs.push(d);
  expect((await run(d, ["add", "hel.example.com"])).out[0]).toEqual({ ok: true, url: "https://hel.example.com", kind: "domain", primary: true });
  expect((await run(d, ["add", "https://hel.tail1234.ts.net/"])).out[0]).toMatchObject({ kind: "tailnet", primary: false });
  expect((await run(d, ["add", "https://ducter.example.org"], { kind: "tunnel" })).out[0]).toMatchObject({ kind: "tunnel" });
  const list = (await run(d, ["list"], { probe: async (u) => u.includes("ts.net") })).out[0];
  expect(list.fp).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(list.ways.map((w: any) => [w.kind, w.answers, !!w.primary])).toEqual([
    ["domain", false, true],
    ["tailnet", true, false],
    ["tunnel", false, false],
  ]);
  expect((await run(d, ["primary", "https://hel.tail1234.ts.net"])).code).toBe(0);
  expect(readFileSync(join(d, "public-url"), "utf8").trim()).toBe("https://hel.tail1234.ts.net");
  expect((await run(d, ["remove", "https://hel.example.com"])).code).toBe(0);
  expect((await run(d, ["remove", "https://hel.example.com"])).code).toBe(1);
  expect(readWays(d, { env: {} }).map((w) => w.kind)).toEqual(["tailnet", "tunnel"]);
  expect((await run(d, ["add", "ftp://x"])).code).toBe(2);
});

test("a worker or the CLI picks the best way that proves it is the home, else stays where it was", async () => {
  const ways = [
    { kind: "domain" as const, url: "https://hel.example.com", primary: true },
    { kind: "tailnet" as const, url: "https://hel.tail1234.ts.net" },
  ];
  expect(await pickWay({ url: "https://hel.example.com", ways, fp: "fp" }, async (u) => u.includes("ts.net"))).toBe("https://hel.tail1234.ts.net");
  expect(await pickWay({ url: "https://hel.example.com", ways, fp: "fp" }, async () => false)).toBe("https://hel.example.com");
  // No pinned key (paired before D293): never moves.
  expect(await pickWay({ url: "https://hel.example.com", ways }, async () => true)).toBe("https://hel.example.com");
});
