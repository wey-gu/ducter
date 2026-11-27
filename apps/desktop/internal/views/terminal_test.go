package views

import "testing"

// D636: a redrawing progress bar and ANSI tints reach the task row as the terminal's last state.
func TestTerminalText(t *testing.T) {
	if got := terminalText("Updating files:  21% (6521/31050)\rUpdating files: 100% (31050/31050)\rDone"); got != "Done" {
		t.Fatalf("carriage returns: %q", got)
	}
	if got := terminalText("\x1b[32mM\x1b[0m src/a.ts\n\x1b[31m✗\x1b[0m one"); got != "M src/a.ts\n✗ one" {
		t.Fatalf("ANSI: %q", got)
	}
	if got := terminalText("first\rsecond\nthird"); got != "second\nthird" {
		t.Fatalf("two lines: %q", got)
	}
}
