// D599: an ask's words as every client draws them: its links are links (opened in the browser), and a
// code to type somewhere (in `backticks`, or a one-time code as sign-in commands print one, 8694-B656)
// is its own piece the person copies with one tap. The rest is plain words, selectable. Shared so the
// Mac (views/asktext.go, the same rules) and the web (controls.tsx AskText) cut a question alike.

export type AskToken = { kind: "text" | "link" | "code"; text: string };

// A link ends at a space, a quote, a bracket or a Chinese mark; a trailing full stop or comma is the sentence's.
const PIECE = /(https?:\/\/[^\s"'<>()\[\]{}「」『』（），。、；：！？]+)|`([^`\n]{1,200})`|(?<![A-Za-z0-9-])([A-Z0-9]{4,5}-[A-Z0-9]{4,6})(?![A-Za-z0-9-])/g;

/** The pieces of an ask's words, in order (adjacent words merged). */
export function askTokens(s: string): AskToken[] {
  const out: AskToken[] = [];
  const push = (kind: AskToken["kind"], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (kind === "text" && last?.kind === "text") last.text += text;
    else out.push({ kind, text });
  };
  let at = 0;
  for (const m of s.matchAll(PIECE)) {
    const i = m.index!;
    push("text", s.slice(at, i));
    if (m[1]) {
      const url = m[1].replace(/[.,;:!?]+$/, "");
      push("link", url);
      push("text", m[1].slice(url.length));
    } else if (m[2] !== undefined) push(m[2].trim() ? "code" : "text", m[2].trim() || m[0]);
    else if (m[3]) push(/\d/.test(m[3]) ? "code" : "text", m[3]);
    at = i + m[0].length;
  }
  push("text", s.slice(at));
  return out;
}

/** Whether an ask's words hold anything but plain words. */
export const askHasPieces = (s: string) => askTokens(s).some((t) => t.kind !== "text");
