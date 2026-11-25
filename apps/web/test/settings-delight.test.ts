// D445: Settings shows what a setting does. Notifications' preview says the same words as the Mac's under
// the same keys; Replies in has a voice for every common language; Codex's six models are one pop-up;
// Notifications waits in its shape; This phone / This computer has Look's preview stage.
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { LANGUAGES, replySample } from "@ducter/protocol/src/lang.ts";
import { strings } from "../src/i18n.ts";

const dir = (p: string) => new URL(p, import.meta.url);
const read = (base: string, ok: (f: string) => boolean) =>
  readdirSync(dir(base)).filter(ok).map((f) => readFileSync(dir(base + f), "utf8")).join("\n");
const mac = read("../../desktop/internal/i18n/", (f) => f.endsWith(".go") && !f.endsWith("_test.go"));
const src = (f: string) => readFileSync(dir(`../src/${f}`), "utf8");
const values = (text: string, key: string) =>
  [...text.matchAll(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "g"))].map((m) => JSON.parse(m[1]!) as string);

const KEYS = [...["tell", "take", "quiet"].map((v) => `todos.what.new.${v}`), ...["ask", "comment", "close", "tick", "ask.obsidian", "leave"].map((v) => `todos.what.done.${v}`), "notify.pv", "notify.pv.now", "notify.pv.ask", "notify.pv.default", "notify.pv.quiet", "notify.pv.anytime", "notify.pv.off", "settings.preview.user", "settings.preview.reply", "settings.preview.noted"];

test("the preview says the same words as the Mac's, under the same keys", () => {
  for (const lang of ["zh", "en"] as const) {
    const L = strings(lang);
    for (const k of KEYS) {
      const mine = L.t(k);
      expect(mine, k).not.toBe(k);
      expect(values(mac, k), k).toContain(mine);
    }
  }
  // Real words for a real wait: the person's own 30 分钟 in the line, never a lone number.
  expect(strings("zh").t("notify.pv.default", strings("zh").t("partner.default.min", 30))).toBe("30 分钟内没回，我就先试它。");
  expect(strings("en").t("notify.pv.default", strings("en").t("partner.default.hour", 1))).toBe("No answer in 1 h, and I'll try it.");
});

test("every common reply language has its voice; the sample is the preview's reply", () => {
  for (const l of LANGUAGES.filter((x) => x.common)) expect(replySample(l.tag), l.tag).toBeTruthy();
  expect(replySample("zh")).toBe(strings("zh").t("settings.preview.reply"));
  expect(replySample("en")).toBe(strings("en").t("settings.preview.reply"));
  expect(replySample("sw")).toBeUndefined();
});

test("an agent's long model list is one pop-up, not chips wrapping under the row", () => {
  const p = src("partner-story.tsx");
  expect(p).toContain("models.length <= SEG_MAX ? (");
  expect(p).toMatch(/<Select label=\{t\("loadout\.brain\.model"\)\}/);
  expect(p).not.toContain("nt-chip-row");
});

test("Notifications waits in its shape and shows its preview; This phone shows Look's stage", () => {
  const v = src("views.tsx");
  const notify = v.slice(v.indexOf("function NotifySettings"), v.indexOf("function Mailbox"));
  expect(notify).toContain("<Waiting");
  expect(notify).not.toContain('class="small">{t("conn.connecting")}');
  expect(notify).toContain("<NotifyPreview />");
  const phone = v.slice(v.indexOf("function PhoneSettings"), v.indexOf("const SECTIONS"));
  expect(phone).toContain("<LookPreview />");
});

// D556: the preview's sentences keep a clause's last word whole (到期，), as the Mac's keepClauses.
test("the preview never breaks a clause's last word", async () => {
  const { keepClauses } = await import("../src/format.ts");
  const s = "早上好。值得说的三条，第一条：ducter.ai 的域名后天到期，还没续费。";
  const kept = keepClauses(s);
  expect(kept.replaceAll("⁠", "")).toBe(s);
  expect(kept).toContain("到⁠期，");
  expect(kept).toContain("还⁠没⁠续⁠费。");
  expect(kept).toContain("后\u2060天\u2060到\u2060期，");
  expect(kept).not.toContain("名\u2060后");
  expect(keepClauses("Two ways to fix CI.")).toBe("Two ways to fix\u00a0CI.");
  const v = src("settings-delight.tsx");
  for (const k of ['t("notify.pv.ask")', "t(`notify.pv.find.${find}`)", "under)"]) expect(v).toContain(`keepClauses(${k}`);
});
