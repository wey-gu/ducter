// D636: what a terminal shows of a stream a command printed. A progress bar redraws its line
// with carriage returns (git's "Updating files: 42% (13041/31050)…"), and a CLI tints words with
// ANSI escapes; drawing the raw bytes concatenates every frame and leaves "[32m" on screen. Keep the
// last state of each line, honour a backspace, strip the escapes, then split lines. The web's Output
// and the Mac's task rows both come through here or its Go twin.

/** OSC, CSI and the other two-byte escapes: colour, cursor and title control, never text. */
const ANSI = /\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;

export function terminalText(text: string): string {
  return String(text ?? "")
    .replace(ANSI, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      // Every carriage return replaces the line with what came after it: the terminal's last state.
      const last = line.split("\r").at(-1) ?? "";
      const cells: string[] = [];
      let at = 0;
      for (const ch of last) {
        if (ch === "\b") at = Math.max(0, at - 1);
        else if (ch === "\t" || ch >= " ") cells[at++] = ch;
      }
      return cells.join("");
    })
    .join("\n");
}
