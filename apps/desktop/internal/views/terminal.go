package views

import (
	"regexp"
	"strings"
)

// D636: what a terminal shows of a stream a command printed. A progress bar redraws its line
// with carriage returns (git's "Updating files: 42% (13041/31050)…"), and a CLI tints words with
// ANSI escapes; drawing the raw bytes concatenates every frame and leaves "[32m" on screen. Keep the
// last state of each line, honour a backspace, strip the escapes, then split lines (the web's
// terminalText in packages/protocol/src/terminal.ts is its twin).
var ansiEscape = regexp.MustCompile("\x1b(?:\\][^\x07]*(?:\x07|\x1b\\\\)|\\[[0-?]*[ -/]*[@-~]|[@-Z\\\\-_])")

func terminalText(s string) string {
	s = ansiEscape.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if j := strings.LastIndex(line, "\r"); j >= 0 {
			line = line[j+1:]
		}
		var b strings.Builder
		at := 0
		for _, r := range line {
			switch {
			case r == '\b':
				if at > 0 {
					at--
				}
			case r == '\t' || r >= ' ':
				out := []rune(b.String())
				if at < len(out) {
					out[at] = r
					b.Reset()
					b.WriteString(string(out))
				} else {
					b.WriteRune(r)
				}
				at++
			}
		}
		lines[i] = b.String()
	}
	return strings.Join(lines, "\n")
}
