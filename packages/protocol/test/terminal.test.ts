// D636: a command's progress bar redraws its line with \r, and its CLI tints words with ANSI.
// The transcript must show the terminal's last state, never every frame concatenated or an escape.
import { expect, test } from "bun:test";
import { terminalText } from "../src/terminal.ts";

test("carriage returns keep the last state of a line", () => {
  expect(terminalText("Updating files:  21% (6521/31050)\rUpdating files:  42% (13041/31050)\rUpdating files: 100% (31050/31050)\rDone")).toBe("Done");
  expect(terminalText("first\rsecond\nthird")).toBe("second\nthird");
  // A shorter redraw leaves the terminal's own tail as a terminal would; CRLF is one newline.
  expect(terminalText("abcdef\rxy\r\nnext")).toBe("xy\nnext");
});

test("ANSI escapes are stripped and backspace erases one cell", () => {
  expect(terminalText("\x1b[32mM\x1b[0m src/a.ts\n\x1b[31m✗\x1b[0m one")).toBe("M src/a.ts\n✗ one");
  expect(terminalText("abc\bZ")).toBe("abZ"); // a backspace steps one cell back
  expect(terminalText("\x1b]0;title\x07plain")).toBe("plain");
});
