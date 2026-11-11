// D206: the picture viewer's keys, what counts as a picture to send, and the words in both languages.
import { expect, test } from "bun:test";
import { picturesIn, viewerKey } from "../src/media-keys.ts";
import { strings } from "../src/i18n.ts";

test("the viewer: Esc closes, ←/→ move and stop at the ends", () => {
  expect(viewerKey("Escape", { index: 2, count: 5 })).toBe("close");
  expect(viewerKey("ArrowRight", { index: 2, count: 5 })).toEqual({ index: 3 });
  expect(viewerKey("ArrowLeft", { index: 2, count: 5 })).toEqual({ index: 1 });
  expect(viewerKey("ArrowRight", { index: 4, count: 5 })).toBeUndefined();
  expect(viewerKey("ArrowLeft", { index: 0, count: 5 })).toBeUndefined();
  expect(viewerKey("a", { index: 0, count: 5 })).toBeUndefined();
});

test("pictures among what was dropped or pasted, HEIC included; anything else is counted apart", () => {
  const f = (name: string, type: string) => new File([new Uint8Array(4)], name, { type });
  const { pics, other } = picturesIn([f("IMG_0042.HEIC", ""), f("shot.png", "image/png"), f("notes.pdf", "application/pdf"), f("a.webp", "image/webp")]);
  expect(pics.map((p) => p.name)).toEqual(["IMG_0042.HEIC", "shot.png", "a.webp"]);
  expect(other).toBe(1);
});

test("every picture word exists in zh and en", () => {
  const zh = strings("zh");
  const en = strings("en");
  for (const k of ["media.add", "media.retry", "media.failed", "media.tooMany", "media.notImage", "media.save", "media.share", "media.copy", "media.from", "media.noImages", "media.drop", "switch.cant.draw"]) {
    expect(zh.t(k)).not.toBe(k);
    expect(en.t(k)).not.toBe(k);
  }
  expect(zh.t("media.tooMany", 10)).toBe("一次最多 10 张");
  expect(en.t("media.from", "Draw a clay laptop")).toBe("From Draw a clay laptop");
});
