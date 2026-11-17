// D344: an update card's 看看都改了什么 / See what changed opens that version's full notes on the
// website (ducter.ai/changelog#<version>) and tells the home they were read, so the partner's line
// about the update isn't said that day. The Android app's own card tells it through the page.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("the words, in zh and en", async () => {
  const { strings } = await import("../src/i18n.ts");
  expect(strings("zh").t("devup.notes")).toBe("看看都改了什么");
  expect(strings("en").t("devup.notes")).toBe("See what changed");
});

test("the link goes to that version's notes and says they were read", async () => {
  const { A } = await import("../src/app.ts");
  const { strings } = await import("../src/i18n.ts");
  const { NotesLink } = await import("../src/devcard.tsx");
  A.L = strings("zh");
  const sent: unknown[] = [];
  const send = A.send;
  (A as any).send = (f: unknown) => void sent.push(f);
  try {
    // The shared text link (controls.tsx LinkBtn): a real <a> to a new tab, ending in the chevron.
    const v = NotesLink({ version: "0.0.72" }) as any;
    expect(v.props).toMatchObject({ kind: "text", href: "https://ducter.ai/changelog#0.0.72", label: "看看都改了什么" });
    const a = v.type(v.props) as any;
    expect(a.type).toBe("a");
    expect(a.props.href).toBe("https://ducter.ai/changelog#0.0.72");
    expect(a.props.target).toBe("_blank");
    a.props.onClick();
    expect(sent).toEqual([expect.objectContaining({ t: "notes_seen", version: "0.0.72" })]);
  } finally {
    (A as any).send = send;
  }
});

test("the device card offers it whenever an update is offered; the Android app can say it was read", () => {
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  expect(src("devcard.tsx")).toContain("{behind(u) && u.latest && <NotesLink version={u.latest} />}");
  expect(src("main.tsx")).toContain("ducterNotesSeen = (v) => A.notesSeen(String(v))");
  // The page in an app says the app's own version, so the home hears when the app updated.
  expect(src("app.ts")).toMatch(/client: "web",[^\n]*nativeInfo\(\)/);
});
