package imessage

import (
	"bytes"
	"strings"
	"unicode"
	"unicode/utf8"
)

// DecodeAttributedBody returns the plain text of a message's
// attributedBody: an NSAttributedString archived as a typedstream
// (NSArchiver). Recent macOS leaves message.text NULL and keeps the words
// only here. The first NSString in the archive is the message body; its
// bytes follow the 0x01 0x2B ('+') marker, framed by a length: one byte, or
// 0x81 and two bytes, or 0x82 and four, in the archive's byte order.
// Anything it can't read decodes to "" (the message is then skipped, never
// guessed at).
func DecodeAttributedBody(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	if bytes.HasPrefix(b, []byte{0xff, 0xfe}) { // UTF-16LE, as some exports store it
		return utf16le(b[2:])
	}
	if !bytes.HasPrefix(b, []byte{0x04, 0x0b}) {
		return strings.TrimLeftFunc(validUTF8(b), unicode.IsControl)
	}
	if len(b) < 13 {
		return ""
	}
	sig := string(b[2:13])
	little := sig == "streamtyped"
	if !little && sig != "typedstream" {
		return ""
	}
	for i := 13; i+1 < len(b); i++ {
		if b[i] == 0x01 && b[i+1] == 0x2b {
			return framed(b, i+2, little)
		}
	}
	return ""
}

func framed(b []byte, at int, little bool) string {
	if at >= len(b) {
		return ""
	}
	head := b[at]
	start, n := at+1, 0
	switch {
	case head == 0x81 || head == 0x82:
		w := 2
		if head == 0x82 {
			w = 4
		}
		if start+w > len(b) {
			return ""
		}
		for k := 0; k < w; k++ {
			shift := k
			if !little {
				shift = w - 1 - k
			}
			n |= int(b[start+k]) << (8 * shift)
		}
		start += w
	case head >= 0x80 && head <= 0x91:
		return "" // another typedstream tag where a length should be
	default:
		n = int(head)
	}
	if n < 0 || start+n > len(b) {
		return ""
	}
	s := b[start : start+n]
	if !utf8.Valid(s) {
		return ""
	}
	return string(s)
}

func utf16le(b []byte) string {
	var sb strings.Builder
	for i := 0; i+1 < len(b); i += 2 {
		r := rune(b[i]) | rune(b[i+1])<<8
		if r >= 0xd800 && r < 0xdc00 && i+3 < len(b) {
			lo := rune(b[i+2]) | rune(b[i+3])<<8
			if lo >= 0xdc00 && lo < 0xe000 {
				r = 0x10000 + (r-0xd800)<<10 + (lo - 0xdc00)
				i += 2
			}
		}
		sb.WriteRune(r)
	}
	return sb.String()
}

func validUTF8(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	return strings.ToValidUTF8(string(b), "")
}
