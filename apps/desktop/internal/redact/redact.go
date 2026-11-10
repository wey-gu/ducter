// Package redact hides keys in text before it renders (D152): a pasted
// connect token, an API key in a command, a bearer header a tool printed.
// The home already hides them in what it sends (packages/core/src/ws.ts);
// the app hides again for a home that predates that. The port of
// packages/protocol/src/redact.ts: both pass fixtures/redact.json.
package redact

import (
	"regexp"
	"strings"
)

// Hidden stands where a key was. Language-neutral: the views say "a key
// is hidden" in the reader's language under the text.
const Hidden = "••••••"

var (
	prefixed = regexp.MustCompile(`\b(nmem_[a-z]{2,4}_|sk-ant-[a-z0-9]{2,6}-|sk-proj-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[abprs]-|AKIA|ASIA|AIza|hf_|npm_|pk_live_|sk_live_|rk_live_|whsec_|shpat_|dop_v1_)[A-Za-z0-9_\-]{8,}`)
	jwt      = regexp.MustCompile(`\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}`)
	bearer   = regexp.MustCompile(`\b((?:[Bb]earer|[Bb]asic|[Tt]oken)\s+)[A-Za-z0-9._~+/\-]{12,}=*`)
	urlCred  = regexp.MustCompile(`(?i)(\b[a-z][a-z0-9+.\-]*://[^\s:/@]+:)[^\s@/]{3,}@`)
	field    = regexp.MustCompile(`(?i)((?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'` + "`" + `,;<>()\[\]{}\\•]{12,})`)
	pem      = regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`)
	card     = regexp.MustCompile(`\b(?:[2-6]\d{14,15}|\d{4}(?:[ -]\d{4}){3}|\d{4}[ -]\d{6}[ -]\d{5})\b`)
	cvc      = regexp.MustCompile(`(?i)((?:cvc2?|cvv2?|csc|cvn|security code|安全码|验证码|校验码)\s*[:：=]?\s*)(\d{3,8})\b`)
	digit    = regexp.MustCompile(`[0-9]`)
	letter   = regexp.MustCompile(`[A-Za-z]`)
	base64   = regexp.MustCompile(`^[A-Za-z0-9+/]{20,}={0,2}$`)
	version  = regexp.MustCompile(`^v?\d+(\.\d+)+$`)
)

// keyLike: long, with a digit and a letter, not a path, not a version.
func keyLike(v string) bool {
	if len(v) < 12 || !digit.MatchString(v) || !letter.MatchString(v) {
		return false
	}
	if strings.Contains(v, "/") && !base64.MatchString(v) {
		return false
	}
	return !version.MatchString(v)
}

// replace is ReplaceAllString with a function that sees the submatches and
// where the match ends.
func replace(re *regexp.Regexp, s string, f func(m []string, end int) string) string {
	idx := re.FindAllStringSubmatchIndex(s, -1)
	if idx == nil {
		return s
	}
	var b strings.Builder
	last := 0
	for _, ix := range idx {
		m := make([]string, len(ix)/2)
		for i := range m {
			if ix[2*i] >= 0 {
				m[i] = s[ix[2*i]:ix[2*i+1]]
			}
		}
		b.WriteString(s[last:ix[0]])
		b.WriteString(f(m, ix[1]))
		last = ix[1]
	}
	b.WriteString(s[last:])
	return b.String()
}

// Text is s with every key in it hidden.
func Text(s string) string {
	if len(s) < 8 {
		return s
	}
	out := pem.ReplaceAllString(s, "-----BEGIN PRIVATE KEY-----"+Hidden+"-----END PRIVATE KEY-----")
	// D191: a card number that passes Luhn keeps its last four; a named security code is hidden.
	out = replace(card, out, func(m []string, _ int) string {
		d := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, m[0])
		if !luhn(d) {
			return m[0]
		}
		return Hidden + d[len(d)-4:]
	})
	out = replace(cvc, out, func(m []string, _ int) string { return m[1] + Hidden })
	out = replace(prefixed, out, func(m []string, _ int) string {
		if digit.MatchString(m[0][len(m[1]):]) {
			return m[1] + Hidden
		}
		return m[0]
	})
	out = jwt.ReplaceAllString(out, Hidden)
	out = replace(bearer, out, func(m []string, _ int) string { return m[1] + Hidden })
	out = replace(urlCred, out, func(m []string, _ int) string { return m[1] + Hidden + "@" })
	src := out
	out = replace(field, src, func(m []string, end int) string {
		if keyLike(m[2]) && !strings.HasPrefix(src[end:], Hidden) {
			return m[1] + Hidden
		}
		return m[0]
	})
	return out
}

// luhn: a 15- or 16-digit card number's checksum.
func luhn(d string) bool {
	if len(d) < 15 || len(d) > 16 {
		return false
	}
	sum := 0
	for i := 0; i < len(d); i++ {
		n := int(d[len(d)-1-i] - '0')
		if i%2 == 1 {
			if n *= 2; n > 9 {
				n -= 9
			}
		}
		sum += n
	}
	return sum%10 == 0
}

// Has reports whether a key was hidden in s.
func Has(s string) bool { return strings.Contains(s, Hidden) }
