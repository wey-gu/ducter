// The download page (D319): which device it's open on, the release's files by their release.yml
// names, their checksums, and the docs sidebar's groups read from docs/README.md. No network.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { detect } from "../src/lib/platform.ts";
import { formatDate, formatSize, parseSums, pickAssets } from "../src/lib/github.ts";

describe("detect", () => {
  const cases: [string, string, number, string, boolean][] = [
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", "MacIntel", 0, "mac", false],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15", "MacIntel", 5, "ios", true], // iPad asking for desktop pages
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPhone", 5, "ios", false],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15", "iPad", 5, "ios", true],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36", "Linux armv81", 5, "android", false],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Linux x86_64", 0, "linux", false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Win32", 0, "other", false],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131", "Linux x86_64", 0, "other", false],
    ["", "", 0, "mac", false],
  ];
  for (const [ua, platform, touch, os, ipad] of cases) {
    test(`${os}${ipad ? " (iPad)" : ""}: ${ua.slice(0, 48) || "(nothing)"}`, () => {
      expect(detect(ua, platform, touch)).toEqual({ os: os as any, ipad });
    });
  }
});

describe("release files", () => {
  const sums = parseSums(
    "a3224117e161a12012d54fb6a7cf93b5182dc6005b3a54b3df60afedad263b43  Ducter-0.0.65-android.apk\n" +
      "8163416f4633300081d6e7654e73e05b747eb31713348d7779c850683e53deb7  Ducter-0.0.65-arm64.dmg\n" +
      "not a line\n",
  );
  test("SHA256SUMS.txt lines, nothing else", () => {
    expect(sums.size).toBe(2);
    expect(sums.get("Ducter-0.0.65-arm64.dmg")).toStartWith("8163416f");
  });
  test("each file by the name release.yml gives it", () => {
    const asset = (name: string, size = 1) => ({ name, size, browser_download_url: `https://example.invalid/${name}` });
    const a = pickAssets(
      [asset("Ducter-0.0.65-android.apk"), asset("Ducter-0.0.65-arm64.dmg", 71762695), asset("ducter-0.0.65-linux-arm64.tar.gz"), asset("ducter-0.0.65-linux-x64.tar.gz"), asset("SHA256SUMS.txt")],
      sums,
    );
    expect(a.dmg?.name).toBe("Ducter-0.0.65-arm64.dmg");
    expect(a.dmg?.sha256).toStartWith("8163416f");
    expect(a.linuxX64?.name).toBe("ducter-0.0.65-linux-x64.tar.gz");
    expect(a.linuxArm64?.name).toBe("ducter-0.0.65-linux-arm64.tar.gz");
    expect(a.apk?.name).toBe("Ducter-0.0.65-android.apk");
    expect(a.linuxX64?.sha256).toBeNull();
    expect(a.sums?.name).toBe("SHA256SUMS.txt");
  });
  test("a release without them offers nothing", () => {
    expect(pickAssets([], new Map())).toEqual({ dmg: null, linuxX64: null, linuxArm64: null, apk: null, sums: null });
  });
  test("the names match release.yml", () => {
    const yml = readFileSync(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
    expect(yml).toContain("Ducter-$VERSION-arm64.dmg");
    expect(yml).toContain("Ducter-$VERSION-android.apk");
    expect(yml).toContain("SHA256SUMS.txt");
    expect(yml).toMatch(/linux-(x64|arm64)|linux-\$/);
  });
  test("sizes and dates read plainly", () => {
    expect(formatSize(71762695)).toBe("68 MB");
    expect(formatSize(3447363)).toBe("3.3 MB");
    expect(formatSize(0)).toBe("");
    expect(formatDate("2026-11-17T00:25:34Z")).toBe("November 17, 2026");
    expect(formatDate(null)).toBe("");
  });
});
