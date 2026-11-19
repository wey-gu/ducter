// D342: inside the Android app, Settings › 这台手机 and this phone's card in 你的设备 show the app's
// own version with 检查更新 / Check for updates, which asks the app; nowhere else. Words in both
// languages, two facts as two elements (D291), the shared button (44 px on a touch screen).
import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sent: Record<string, unknown>[] = [];
const g = globalThis as Record<string, unknown>;

// Other files share this process: the app's bridge goes when these tests are done.
afterAll(() => {
  delete g.ducterNative;
  delete g.ducterBridge;
});

const kids = (v: any): any[] => (Array.isArray(v?.props?.children) ? v.props.children : [v?.props?.children]).filter((k: unknown) => k != null && k !== false);

test("in a browser and in the iPhone app: no row", async () => {
  const { AppUpdateRow, androidAppVersion } = await import("../src/app-update.tsx");
  delete g.ducterNative;
  delete g.ducterBridge;
  expect(androidAppVersion()).toBeUndefined();
  expect(AppUpdateRow()).toBeNull();
  g.ducterNative = { platform: "ios", version: "0.0.71" };
  g.ducterBridge = { postMessage: async () => undefined };
  expect(AppUpdateRow()).toBeNull();
});

test("in the Android app: its version, and 检查更新 asks the app", async () => {
  const { A } = await import("../src/app.ts");
  const { strings } = await import("../src/i18n.ts");
  const { AppUpdateRow } = await import("../src/app-update.tsx");
  A.L = strings("zh");
  g.ducterNative = { platform: "android", version: "0.0.70", appId: "co.nowledge.ducter" };
  g.ducterBridge = { postMessage: async (m: Record<string, unknown>) => void sent.push(m) };
  const row = AppUpdateRow() as any;
  expect(row.props.class).toBe("set-item app-row");
  const [words, btn] = kids(row);
  const [b, small] = kids(words);
  expect(b.props.children).toBe("这个 App");
  expect(small.props.children).toBe("版本 0.0.70");
  expect(btn.props.label).toBe("检查更新");
  btn.props.onClick();
  await Promise.resolve();
  expect(sent).toEqual([{ t: "update.check" }]);
});

test("both places carry it, and it stays 44 px on a touch screen", () => {
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  expect(src("views.tsx")).toContain("<AppUpdateRow />");
  expect(src("devcard.tsx")).toMatch(/mine && androidAppVersion\(\)/);
  const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
  expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.set-item\.app-row \.btn \{\s*height: 44px;/);
});
