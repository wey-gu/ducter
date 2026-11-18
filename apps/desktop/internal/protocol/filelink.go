package protocol

import (
	"net/url"
	"regexp"
	"strings"
)

// D356: a link in a task's or the partner's words to a file on the home or
// a worker. The same rules as fileLinkPath in packages/protocol/src/media.ts.

// FileOpenReq asks the home for the file a link names; the answer is a
// file_open frame with the same ID (File, or WbError and Message).
type FileOpenReq struct {
	T      string `json:"t"` // "file_open"
	ID     string `json:"id"`
	Path   string `json:"path"`
	TaskID string `json:"taskId,omitempty"`
}

var fileScheme = regexp.MustCompile(`(?i)^file:(//(localhost)?)?`)

// FileLinkPath is the path a link names when it points at a file rather
// than a page: /abs/path, file:///abs/path or ~/path (escapes decoded, a
// #fragment or ?query dropped); "" for a web address, mail, #a-heading or a
// relative name.
func FileLinkPath(href string) string {
	s := strings.TrimSpace(href)
	if s == "" || len(s) > 4096 {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(s), "file:") {
		s = fileScheme.ReplaceAllString(s, "")
		if !strings.HasPrefix(s, "/") {
			return ""
		}
	} else if !strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "~/") {
		return ""
	}
	if strings.HasPrefix(s, "//") {
		return ""
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	if d, err := url.PathUnescape(s); err == nil {
		s = d
	}
	if strings.ContainsRune(s, 0) || s == "/" || s == "~/" {
		return ""
	}
	return s
}

// FileLinkName is the name a linked file goes by before the home answers.
func FileLinkName(path string) string {
	p := strings.TrimRight(path, "/")
	if i := strings.LastIndexByte(p, '/'); i >= 0 && i < len(p)-1 {
		return p[i+1:]
	}
	if p == "" {
		return path
	}
	return p
}
