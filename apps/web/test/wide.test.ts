// D176: the client on an iPad and at every width.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deviceName } from "../src/conn.ts";
import { strings } from "../src/i18n.ts";
import { WIDE } from "../src/wide.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

describe("iPad", () => {
  test("the app on an iPad pairs as an iPad", () => {
    const ua = "Mozilla/5.0 (iPad; CPU OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DucterApp/0.1.0";
    expect(deviceName(ua, 5)).toEqual({ name: "iPad · Ducter", platform: "ios" });
  });
  test("Safari on an iPad, which asks as a Mac, is an iPad; a Mac is still a Mac", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    expect(deviceName(ua, 5)).toEqual({ name: "iPad · Safari", platform: "ios" });
    expect(deviceName(ua, 0)).toEqual({ name: "Browser · Safari", platform: "macos" });
  });
  test("an iPad's copy says this iPad, a phone's this phone", () => {
    expect(strings("zh", "ipad").t("settings.phone")).toBe("这台 iPad");
    expect(strings("en", "ipad").t("settings.phone")).toBe("This iPad");
    expect(strings("en", "ipad").t("notify.enabled")).toBe("This iPad gets a notification when something needs you");
    expect(strings("en").t("settings.phone")).toBe("This phone");
  });
});

describe("wide layout", () => {
  test("the panes' breakpoint in CSS is the one the page switches on", () => {
    const px = /min-width:\s*(\d+)px/.exec(WIDE)![1];
    expect(css).toContain(`@media (min-width: ${px}px) {\n  #app {`);
  });
  test("side insets are kept: a phone on its side, a foldable's bar", () => {
    expect(css).toContain("--safe-left: env(safe-area-inset-left, 0px)");
    expect(css).toContain("--safe-right: env(safe-area-inset-right, 0px)");
  });
});
