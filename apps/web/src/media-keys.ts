// D206: the parts of the picture code that need no page (media.tsx uses them; tests read them).

/** Files a person dropped, pasted or picked: the pictures among them (HEIC included). */
export function picturesIn(files: Iterable<File>): { pics: File[]; other: number } {
  const pics: File[] = [];
  let other = 0;
  for (const f of files) {
    if (f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name)) pics.push(f);
    else other++;
  }
  return { pics, other };
}

/** The keys of the viewer: Esc closes, ←/→ move and stop at the ends. */
export function viewerKey(key: string, v: { index: number; count: number }): { index: number } | "close" | undefined {
  if (key === "Escape") return "close";
  if (key === "ArrowRight" && v.index < v.count - 1) return { index: v.index + 1 };
  if (key === "ArrowLeft" && v.index > 0) return { index: v.index - 1 };
  return undefined;
}
