package protocol

import (
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
	case strings.HasPrefix(m.Type, "video/"):
		return FileVideo
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
