// D425: several things in one message, under it: the words equal the Mac's, the store keeps the
// latest lines on their message (also when they come before it, from a history page), and the
// count reads in each language's order. The fixture is the one the Mac's store test reads too.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asksCount } from "@ducter/protocol";
import fixture from "../../../packages/protocol/fixtures/many-asks.json";
import { asksWords } from "../src/i18n-asks.ts";
import { format } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/asks.go"), "utf8");
const goTable = (name: string) => {
  const body = mac.split(`var ${name} = Table{`)[1]!.split("\n}")[0]!;
  return Object.fromEntries([...body.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",$/gm)].map((m) => [m[1], JSON.parse(`"${m[2]}"`)]));
};

test("the web's words are the Mac's, key for key", () => {
  expect(goTable("zhAsks")).toEqual(asksWords.zh);
  expect(goTable("enAsks")).toEqual(asksWords.en);
});

test("the count reads naturally, with no counter word to learn", () => {
  expect(format(asksWords.zh["asks.count"]!, [3, 1])).toBe("好了 3 个，还有 1 个");
  expect(format(asksWords.en["asks.count"]!, [3, 1])).toBe("3 done, 1 to go");
  for (const v of [...Object.values(asksWords.zh), ...Object.values(asksWords.en)]) expect(v).not.toMatch(/件|part/i);
});

test("the store keeps the latest lines on their message, in place", () => {
  const s = new Store();
  for (const e of fixture.events) s.applyEvent(e as never);
  for (const [seq, want] of Object.entries(fixture.want)) {
    const e = s.channel.find((x) => x.firstSeq === Number(seq))!;
    expect(e.user).toBeTruthy();
    expect(e.asks!.lines.map((l) => l.state)).toEqual(want.states);
    if ("count" in want) {
      const c = asksCount(e.asks!.lines)!;
      expect([c.done, c.left]).toEqual(want.count);
    }
  }
  // The lines are no row of their own.
  expect(s.channel.filter((x) => !x.user && !x.ai && !x.job).length).toBe(0);
});
