package protocol

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// D239: how a file a task showed opens inside Ducter (fileView, viewText
// and parseTable in packages/protocol/src/media.ts).

// File views.
const (
	FileMarkdown = "markdown"
	FileTable    = "table"
	FileText     = "text"
	FilePicture  = "picture"
	FileVideo    = "video"
	FileAudio    = "audio" // D286: a voice memo or a song
	FilePDF      = "pdf"   // D242: drawn page by page
	FileNone     = "none"
)

// FileViewBytes is the text the viewer reads of a file; FileViewRows the
// rows of a table it shows. Save a copy has all of it.
const (
	FileViewBytes = 1024 * 1024
	FileViewRows  = 2000
)

func extOf(name string) string {
	n := strings.ToLower(name)
	if i := strings.LastIndexByte(n, '.'); i >= 0 {
		return n[i+1:]
	}
	return ""
}

// FileView is the viewer a file opens in.
func (m MediaRef) FileView() string {
	ext := extOf(m.Name)
	switch {
	case m.Type == "text/markdown" || (m.Type == "text/plain" && (ext == "markdown" || ext == "mdx")):
		return FileMarkdown
	case m.Type == "text/csv" || (m.Type == "text/plain" && ext == "tsv"):
		return FileTable
	case m.Type == "text/plain" || m.Type == "application/json" || m.Type == "text/html":
		return FileText
	case m.Type == "image/svg+xml" || IsImageType(m.Type):
		return FilePicture
	case m.Type == "application/pdf":
		return FilePDF
	case strings.HasPrefix(m.Type, "video/"):
		return FileVideo
	case strings.HasPrefix(m.Type, "audio/"):
		return FileAudio
	}
	return FileNone
}

// TableSep is a table file's column separator: a tab for .tsv, else a comma.
func TableSep(name string) rune {
	if extOf(name) == "tsv" {
		return '\t'
	}
	return ','
}

// ViewText is the text of a file's first bytes, cut at the last whole line
// when the file is longer (total) than what was read.
func ViewText(b []byte, total int64) (string, bool) {
	cut := total > int64(len(b))
	if cut {
		if i := strings.LastIndexByte(string(b), '\n'); i > 0 {
			b = b[:i]
		} else {
			for len(b) > 0 && !utf8.Valid(b) {
				b = b[:len(b)-1]
			}
		}
	}
	s := strings.ToValidUTF8(string(b), "�")
	s = strings.TrimPrefix(s, "\xef\xbb\xbf")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return s, cut
}

// ParseTable reads CSV (or TSV): quotes, doubled quotes and line breaks in
// quotes; at most max rows, more saying there were others.
func ParseTable(text string, sep rune, max int) (rows [][]string, more bool) {
	var row []string
	var cell strings.Builder
	q := false
	rs := []rune(text)
	for i := 0; i < len(rs); i++ {
		ch := rs[i]
		if q {
			if ch == '"' {
				if i+1 < len(rs) && rs[i+1] == '"' {
					cell.WriteRune('"')
					i++
				} else {
					q = false
				}
			} else {
				cell.WriteRune(ch)
			}
			continue
		}
		switch {
		case ch == '"' && cell.Len() == 0:
			q = true
		case ch == sep:
			row = append(row, cell.String())
			cell.Reset()
		case ch == '\n':
			row = append(row, cell.String())
			cell.Reset()
			rows = append(rows, row)
			row = nil
			if len(rows) > max {
				return rows[:max], true
			}
		default:
			cell.WriteRune(ch)
		}
	}
	if cell.Len() > 0 || len(row) > 0 {
		row = append(row, cell.String())
		rows = append(rows, row)
	}
	if len(rows) > max {
		return rows[:max], true
	}
	return rows, false
}

// FindMax bounds the matches find marks (FIND_MAX in apps/web/src/fileview-find.ts).
const FindMax = 5000

// FindAll is where q occurs in text, case set aside, as byte ranges
// [start, end), at most max (D242: find in a long file). Lowering keeps
// offsets only when it keeps lengths; else the exact case is searched.
func FindAll(text, q string, max int) [][2]int {
	if q == "" {
		return nil
	}
	hay, needle := strings.ToLower(text), strings.ToLower(q)
	if len(hay) != len(text) || len(needle) != len(q) {
		hay, needle = text, q
	}
	var out [][2]int
	for at := 0; len(out) < max; {
		i := strings.Index(hay[at:], needle)
		if i < 0 {
			break
		}
		out = append(out, [2]int{at + i, at + i + len(needle)})
		at += i + len(needle)
	}
	return out
}

// D567: a Markdown file's card shows its rendered start (docPlain and
// docGlimpse in packages/protocol/src/media.ts; the cases in
// packages/protocol/test/doc-glimpse.json are both sides').
var (
	reDocPic    = regexp.MustCompile(`!\[([^\]\n]*)\]\([^)\n]*\)`)
	reDocLink   = regexp.MustCompile(`\[([^\]\n]+)\]\([^)\n]*\)`)
	reDocRef    = regexp.MustCompile(`\[([^\]\n]+)\]\[[^\]\n]*\]`)
	reDocAuto   = regexp.MustCompile(`<(https?:[^>\s]+)>`)
	reDocTag    = regexp.MustCompile(`</?[A-Za-z][^>\n]*>`)
	reDocCode   = regexp.MustCompile("`+([^`\n]+?)`+")
	reDocStrong = regexp.MustCompile(`\*\*|__|~~`)
	reDocEm     = regexp.MustCompile(`(^|[\s(（「“])[*_]([^*_\s](?:[^*_\n]*[^*_\s])?)[*_]([\s.,;:!?，。；：！？)）」”]|$)`)
	reDocEsc    = regexp.MustCompile("\\\\([\\\\`*_{}\\[\\]()#+\\-.!|>~])")
	reDocHead   = regexp.MustCompile(`^#{1,6}\s+(.*?)\s*#*$`)
	reDocSetext = regexp.MustCompile(`^(=+|-+)$`)
	reDocFence  = regexp.MustCompile("^(`{3,}|~{3,})")
	reDocDef    = regexp.MustCompile(`^\[[^\]]+\]:\s`)
	reDocQuote  = regexp.MustCompile(`^(>\s?)+`)
	reDocItem   = regexp.MustCompile(`^([-*+]|\d+[.)])\s+`)
	reDocTask   = regexp.MustCompile(`^\[[ xX]\]\s+`)
)

// DocPlain is Markdown's words with every mark removed: a link or a
// picture as its words, code, emphasis and tags as their text, escapes
// undone, runs of space as one.
func DocPlain(s string) string {
	s = reDocPic.ReplaceAllString(s, "$1")
	s = reDocLink.ReplaceAllString(s, "$1")
	s = reDocRef.ReplaceAllString(s, "$1")
	s = reDocAuto.ReplaceAllString(s, "$1")
	s = reDocTag.ReplaceAllString(s, "")
	s = reDocCode.ReplaceAllString(s, "$1")
	s = reDocStrong.ReplaceAllString(s, "")
	s = reDocEm.ReplaceAllString(s, "$1$2$3")
	s = reDocEsc.ReplaceAllString(s, "$1")
	return strings.Join(strings.Fields(s), " ")
}

// docGlimpseChars is how many characters a glimpse keeps of a line.
const docGlimpseChars = 200

// isDocRule: a thematic break (---, ***, ___, spaced or not).
func isDocRule(t string) bool {
	s := strings.ReplaceAll(strings.ReplaceAll(t, " ", ""), "\t", "")
	if len(s) < 3 || !strings.ContainsRune("-*_", rune(s[0])) {
		return false
	}
	return strings.Count(s, s[:1]) == len(s)
}

// DocGlimpse is a Markdown file's start for its card: its title (the first
// heading, when the document starts with one) and its first lines of text
// with every mark removed (never #, **, ---, a table or a fence), at most
// max of them.
func DocGlimpse(text string, max int) (title string, lines []string) {
	ls := strings.Split(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"), "\n")
	i := 0
	if strings.TrimSpace(ls[0]) == "---" {
		for k := 1; k < len(ls); k++ {
			if t := strings.TrimSpace(ls[k]); t == "---" || t == "..." {
				i = k + 1
				break
			}
		}
	}
	add := func(s string, heading bool) {
		p := DocPlain(s)
		if r := []rune(p); len(r) > docGlimpseChars {
			p = string(r[:docGlimpseChars])
		}
		if p == "" {
			return
		}
		if heading && title == "" && len(lines) == 0 {
			title = p
		} else {
			lines = append(lines, p)
		}
	}
	fence := ""
	for ; i < len(ls) && len(lines) < max; i++ {
		t := strings.TrimSpace(ls[i])
		if fence != "" {
			if strings.HasPrefix(t, fence) {
				fence = ""
			}
			continue
		}
		if reDocFence.MatchString(t) {
			fence = t[:3]
			continue
		}
		if t == "" || isDocRule(t) || strings.HasPrefix(t, "|") || strings.HasPrefix(t, "<!--") || reDocDef.MatchString(t) {
			continue
		}
		if h := reDocHead.FindStringSubmatch(t); h != nil {
			add(h[1], true)
			continue
		}
		if i+1 < len(ls) && reDocSetext.MatchString(strings.TrimSpace(ls[i+1])) {
			add(t, true)
			i++
			continue
		}
		t = reDocQuote.ReplaceAllString(t, "")
		t = reDocItem.ReplaceAllString(t, "")
		add(reDocTask.ReplaceAllString(t, ""), false)
	}
	return title, lines
}
