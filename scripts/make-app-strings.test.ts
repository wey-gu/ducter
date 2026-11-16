// research/109: on a Chinese Mac the microphone prompt came up in English, because the app had
// no zh-Hans InfoPlist.strings. Every usage description in make-app.sh's Info.plist has its line
// in both languages, and the en line says the same as Info.plist.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(join(import.meta.dir, "make-app.sh"), "utf8");
const plist = Object.fromEntries([...script.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => [m[1]!, m[2]!]));
const strings = (lang: string): Record<string, string> => {
  const m = script.match(new RegExp(`${lang}\\.lproj/InfoPlist\\.strings" <<'STRINGS'\\n([\\s\\S]*?)\\nSTRINGS`));
  expect(m).not.toBeNull();
  return Object.fromEntries([...m![1]!.matchAll(/^"(\w+)" = "([^"]*)";$/gm)].map((l) => [l[1]!, l[2]!]));
};

test("every permission prompt has its words in English and Chinese", () => {
  const keys = Object.keys(plist).sort();
  expect(keys).toContain("NSMicrophoneUsageDescription");
  const en = strings("en");
  const zh = strings("zh-Hans");
  for (const k of keys) {
    expect(en[k]).toBe(plist[k]!);
    expect(zh[k]).toMatch(/[一-鿿]/);
  }
  expect(Object.keys(en).sort()).toEqual(keys);
  expect(Object.keys(zh).sort()).toEqual(keys);
});
