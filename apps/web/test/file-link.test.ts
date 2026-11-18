// D356: a link in a task's or the partner's words to a file on the home (a server) or a worker.
// Before, the web drew `[name](/root/…)` as its raw text and the Mac's click did nothing. Now the
// link is a link, a tap asks the home for the file (file_open), and the viewer opens on the copy
// the home keeps; when it can't, the sheet says why in one line. The Mac's words are the same
// (apps/desktop/internal/views/filelink_test.go).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileLinkName, fileLinkPath, type ClientFrame, type MediaRef } from "@ducter/protocol";
import { markdown } from "../src/markdown.ts";
import { fileWords } from "../src/i18n-fileview.ts";

const PATH = "/root/.ducter/scratch/swj3zc4w/review-10419-restart-round59.md";
const REF: MediaRef = { id: "a".repeat(64), type: "text/markdown", bytes: 42, name: "review-10419-restart-round59.md", k: "k1.sig", from: { taskId: "swj3zc4w" } };

describe("which links name a file", () => {
  test("a path, a file: URL and ~/ do; a web address, a heading or a bare name don't", () => {
    expect(fileLinkPath(PATH)).toBe(PATH);
    expect(fileLinkPath(`file://${PATH}`)).toBe(PATH);
    expect(fileLinkPath("file:///tmp/a%20b.md#L3")).toBe("/tmp/a b.md");
    expect(fileLinkPath("~/notes/x.md")).toBe("~/notes/x.md");
    for (const no of ["https://example.com/a.md", "mailto:a@b.c", "#install", "review.md", "//cdn.example.com/x.js", "/", ""]) expect(fileLinkPath(no)).toBeUndefined();
    expect(fileLinkName(PATH)).toBe("review-10419-restart-round59.md");
  });

  test("the partner's words draw it as a link the viewer takes, never an address for the browser", () => {
    const html = markdown(`已完成 [review-10419-restart-round59.md](${PATH})。`);
    expect(html).toContain(`<a href="#" class="file-link" data-path="${PATH}" title="${PATH}">review-10419-restart-round59.md</a>`);
    expect(html).not.toContain("](");
    expect(html).not.toContain('target="_blank" rel="noopener noreferrer">review');
    // A web link is as it was; a relative name stays words.
    expect(markdown("[docs](https://ducter.ai/docs)")).toContain('href="https://ducter.ai/docs" target="_blank"');
    expect(markdown("[x](notes.md)")).toBe("<p>[x](notes.md)</p>");
    // Nothing in a path becomes markup.
    expect(markdown('[x](/tmp/"><img src=x>.md)')).not.toContain("<img");
  });
});

describe("a tap opens the viewer through the home", () => {
  const sent: ClientFrame[] = [];
  let A: typeof import("../src/app.ts").A;
  afterEach(() => {
    A.fileLink = undefined;
    A.fileView = undefined;
    sent.length = 0;
  });
  const boot = async () => {
    A = (await import("../src/app.ts")).A;
    A.send = (f: ClientFrame) => void sent.push(f);
    A.changed = () => {};
    return { fv: await import("../src/fileview.tsx"), app: await import("../src/filelink-ask.ts") };
  };

  test("the click asks the home, Opening… shows, and the file the home keeps opens in the viewer", async () => {
    const { fv, app } = await boot();
    A.route = { name: "task", id: "swj3zc4w" };
    let prevented = false;
    const link = { dataset: { path: PATH } };
    fv.onFileLinkClick({ target: { closest: (s: string) => (s === "a[data-path]" ? link : null) } as unknown as EventTarget, defaultPrevented: false, preventDefault: () => void (prevented = true) });
    expect(prevented).toBe(true);
    const ask = sent.at(-1) as Extract<ClientFrame, { t: "file_open" }>;
    expect(ask).toMatchObject({ t: "file_open", path: PATH, taskId: "swj3zc4w" });
    expect(A.fileLink).toMatchObject({ path: PATH, taskId: "swj3zc4w" });
    expect(A.fileLink?.error).toBeUndefined();
    app.onFileOpenFrame({ id: ask.id, ok: true, file: REF });
    await Bun.sleep(0);
    expect(A.fileLink).toBeUndefined();
    expect(A.fileView?.ref).toEqual(REF);
  });

  test("when it can't, the sheet keeps its one line why; Retry asks again", async () => {
    const { fv, app } = await boot();
    A.route = { name: "conv" };
    fv.openFileLink(PATH);
    const ask = sent.at(-1) as Extract<ClientFrame, { t: "file_open" }>;
    expect(ask.taskId).toBeUndefined();
    app.onFileOpenFrame({ id: ask.id, ok: false, error: "missing" });
    await Bun.sleep(0);
    expect(A.fileView).toBeUndefined();
    expect(A.fileLink).toMatchObject({ path: PATH, error: "missing" });
    // A late answer to an ask that was replaced never opens the old file.
    fv.openFileLink(PATH);
    const again = sent.at(-1) as Extract<ClientFrame, { t: "file_open" }>;
    app.onFileOpenFrame({ id: ask.id, ok: true, file: REF });
    await Bun.sleep(0);
    expect(A.fileView).toBeUndefined();
    app.onFileOpenFrame({ id: again.id, ok: true, file: REF });
    await Bun.sleep(0);
    expect(A.fileView?.ref.id).toBe(REF.id);
  });

  test("every reason has its line in both languages, the same as the Mac's", () => {
    const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/fileview.go"), "utf8");
    for (const why of ["missing", "outside", "too_big", "offline", "unsupported"]) {
      for (const lang of ["zh", "en"] as const) {
        const said = fileWords[lang][`file.link.${why}`];
        expect(said).toBeTruthy();
        expect(mac).toContain(`"${said}"`);
      }
    }
  });
});
