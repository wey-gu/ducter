package protocol

import (
	"fmt"
	"strings"
)

// D286: the family a file card is drawn as (fileFamily, fileBadge and
// durationWords in packages/protocol/src/media.ts, the same rules): its
// badge's colour and mark, and the preview it shows.

// File families.
const (
	FamPDF     = "pdf"
	FamCode    = "code"
	FamText    = "text"
	FamDoc     = "doc"
	FamSheet   = "sheet"
	FamSlides  = "slides"
	FamArchive = "archive"
	FamAudio   = "audio"
	FamVideo   = "video"
	FamPicture = "picture"
	FamOther   = "other"
)

var familyExt = map[string]string{
	"pdf": FamPDF,
	"md":  FamText, "markdown": FamText, "mdx": FamText, "txt": FamText, "log": FamText, "rst": FamText, "tex": FamText,
	"doc": FamDoc, "docx": FamDoc, "pages": FamDoc, "rtf": FamDoc, "odt": FamDoc,
	"csv": FamSheet, "tsv": FamSheet, "xls": FamSheet, "xlsx": FamSheet, "numbers": FamSheet, "ods": FamSheet,
	"ppt": FamSlides, "pptx": FamSlides, "key": FamSlides, "odp": FamSlides,
	"zip": FamArchive, "tar": FamArchive, "gz": FamArchive, "tgz": FamArchive, "bz2": FamArchive, "xz": FamArchive, "7z": FamArchive, "rar": FamArchive, "dmg": FamArchive,
}

// codeExt is source and settings a task shows as text (TEXT_EXTS).
var codeExt = map[string]bool{}

func init() {
	for _, e := range strings.Fields("diff patch ts tsx mts cts js jsx mjs cjs go py rb rs swift kt kts java c h cc cpp hpp m cs css scss less vue svelte xml yml yaml toml ini sh bash zsh fish sql jsonc graphql proto") {
		codeExt[e] = true
	}
}

// Family is the family a file card is drawn as: by name first, then type.
func (m MediaRef) Family() string {
	ext := extOf(m.Name)
	if f, ok := familyExt[ext]; ok {
		return f
	}
	switch {
	case m.Type == "application/pdf":
		return FamPDF
	case strings.HasPrefix(m.Type, "audio/"):
		return FamAudio
	case strings.HasPrefix(m.Type, "video/"):
		return FamVideo
	case strings.HasPrefix(m.Type, "image/"):
		return FamPicture
	case m.Type == "text/markdown":
		return FamText
	case m.Type == "text/csv":
		return FamSheet
	case m.Type == "application/zip":
		return FamArchive
	case strings.HasPrefix(m.Type, "text/") || m.Type == "application/json" || codeExt[ext]:
		return FamCode
	}
	return FamOther
}

var extOfType = map[string]string{
	"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
	"text/plain": "txt", "text/markdown": "md", "text/csv": "csv", "application/json": "json", "text/html": "html",
	"application/zip": "zip", "video/mp4": "mp4", "video/quicktime": "mov", "audio/mp4": "m4a", "audio/mpeg": "mp3",
	"audio/wav": "wav", "audio/aac": "aac", "application/octet-stream": "bin",
}

// Badge is the few letters on a file's badge: its extension (PDF, TS,
// DOCX), at most 4.
func (m MediaRef) Badge() string {
	if ext := extOf(m.Name); ext != "" && len(ext) <= 4 {
		return strings.ToUpper(ext)
	}
	e := extOfType[m.Type]
	if e == "" {
		e = extOf(m.Name)
	}
	if len(e) > 4 {
		e = e[:4]
	}
	return strings.ToUpper(e)
}

// DurationWords is a sound's or a video's length: 0:07, 3:25, 1:02:09.
func DurationWords(sec float64) string {
	if sec < 0 {
		return ""
	}
	s := int(sec + 0.5)
	h, m, r := s/3600, (s%3600)/60, s%60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, r)
	}
	return fmt.Sprintf("%d:%02d", m, r)
}
