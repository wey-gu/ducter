// D206: the parts of the picture code that need no page (media.tsx uses them; tests read them).

/** A picture this device makes ready (scaled, re-encoded); anything else goes as the file it is (D259). */
export function isPictureFile(f: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|gif|webp|heic|heif|avif)$/.test(f.type)) return true;
  return !f.type && /\.(heic|heif|jpe?g|png|gif|webp|avif)$/i.test(f.name);
}

/** Files a person dropped, pasted or picked: the pictures among them (HEIC included), and every other file (D259). */
export function picturesIn(files: Iterable<File>): { pics: File[]; other: number; files: File[] } {
  const pics: File[] = [];
  const rest: File[] = [];
  for (const f of files) (isPictureFile(f) ? pics : rest).push(f);
  return { pics, other: rest.length, files: rest };
}

/** The keys of the viewer: Esc closes, ←/→ move and stop at the ends. */
export function viewerKey(key: string, v: { index: number; count: number }): { index: number } | "close" | undefined {
  if (key === "Escape") return "close";
  if (key === "ArrowRight" && v.index < v.count - 1) return { index: v.index + 1 };
  if (key === "ArrowLeft" && v.index > 0) return { index: v.index - 1 };
  return undefined;
}
