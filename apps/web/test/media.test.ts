// D206: the picture viewer's keys, what counts as a picture to send, and the words in both languages.
import { expect, test } from "bun:test";
import { isPictureFile, picturesIn, viewerKey } from "../src/media-keys.ts";
import { strings } from "../src/i18n.ts";

test("the viewer: Esc closes, ←/→ move and stop at the ends", () => {
  expect(viewerKey("Escape", { index: 2, count: 5 })).toBe("close");
  expect(viewerKey("ArrowRight", { index: 2, count: 5 })).toEqual({ index: 3 });
  expect(viewerKey("ArrowLeft", { index: 2, count: 5 })).toEqual({ index: 1 });
  expect(viewerKey("ArrowRight", { index: 4, count: 5 })).toBeUndefined();
  expect(viewerKey("ArrowLeft", { index: 0, count: 5 })).toBeUndefined();
  expect(viewerKey("a", { index: 0, count: 5 })).toBeUndefined();
});

test("pictures among what was dropped or pasted, HEIC included; D259: every other file goes as itself", () => {
  const f = (name: string, type: string) => new File([new Uint8Array(4)], name, { type });
  const { pics, other, files } = picturesIn([f("IMG_0042.HEIC", ""), f("shot.png", "image/png"), f("notes.pdf", "application/pdf"), f("a.webp", "image/webp"), f("logo.svg", "image/svg+xml"), f("Makefile", ""), f("deck.key", "")]);
  expect(pics.map((p) => p.name)).toEqual(["IMG_0042.HEIC", "shot.png", "a.webp"]);
  // An SVG stays the drawing it is (never drawn flat to a JPEG); a file with no type goes as it is.
  expect(files.map((p) => p.name)).toEqual(["notes.pdf", "logo.svg", "Makefile", "deck.key"]);
  expect(other).toBe(4);
  expect(isPictureFile({ name: "scan.tiff", type: "image/tiff" })).toBe(false);
});

test("every picture word exists in zh and en", () => {
  const zh = strings("zh");
  const en = strings("en");
  for (const k of ["media.add", "media.retry", "media.failed", "media.tooMany", "media.tooBig", "media.save", "media.share", "media.copy", "media.from", "media.noImages", "media.drop", "switch.cant.draw", "media.play", "media.pause", "media.prev", "media.next"]) {
    expect(zh.t(k)).not.toBe(k);
    expect(en.t(k)).not.toBe(k);
  }
  expect(zh.t("media.tooMany", 10)).toBe("一次最多 10 个");
  // D259: the cap is said in the words, in both languages.
  expect(zh.t("media.tooBig", 50)).toBe("这个文件太大了：每个最多 50 MB");
  expect(en.t("media.tooBig", 50)).toBe("That file is too big: up to 50 MB each");
  expect(zh.t("media.add")).toBe("添加文件或图片");
  expect(en.t("media.add")).toBe("Add files or pictures");
  expect(en.t("media.from", "Draw a clay laptop")).toBe("From Draw a clay laptop");
});
