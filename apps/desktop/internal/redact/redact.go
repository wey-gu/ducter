// Package redact hides keys in text before it renders (D152): a pasted
// connect token, an API key in a command, a bearer header a tool printed.
// The home already hides them in what it sends (packages/core/src/ws.ts);
// the app hides again for a home that predates that. The port of
// packages/protocol/src/redact.ts: both pass fixtures/redact.json.
package redact

import (
	"regexp"
	"strings"
	"sync"
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
	// fieldAt is field from a secret's name on, anchored: where a match can
	// start. The run of name words field allows before the name ("OPENAI_",
	// "x-") only widens a match leftwards over text that stays as it is, so
	// a match found from the name gives the same text (field_test.go).
	fieldAt = regexp.MustCompile(`(?i)^((?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'` + "`" + `,;<>()\[\]{}\\•]{12,})`)
	pem     = regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`)
	card    = regexp.MustCompile(`\b(?:[2-6]\d{14,15}|\d{4}(?:[ -]\d{4}){3}|\d{4}[ -]\d{6}[ -]\d{5})\b`)
	cvc     = regexp.MustCompile(`(?i)((?:cvc2?|cvv2?|csc|cvn|security code|安全码|验证码|校验码)\s*[:：=]?\s*)(\d{3,8})\b`)
	digit   = regexp.MustCompile(`[0-9]`)
	letter  = regexp.MustCompile(`[A-Za-z]`)
	base64  = regexp.MustCompile(`^[A-Za-z0-9+/]{20,}={0,2}$`)
	version = regexp.MustCompile(`^v?\d+(\.\d+)+$`)
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
	return replaceAt(re.FindAllStringSubmatchIndex(s, -1), s, f)
}

// fieldHeads are how every secret's name in field begins, in lower case.
var fieldHeads = []string{"api", "access", "secret", "token", "passw", "pwd", "credential", "auth", "private", "connect"}

// fieldMatches is field.FindAllStringSubmatchIndex(s, -1), found faster: a
// match starts only where a secret's name does, so fieldAt is tried at each
// such place, left to right, past the end of the last match (D284: an
// opened task runs every tool output through this; the unanchored pattern
// tried every byte). (?i) folds the Kelvin sign into k and the long s into
// s, which an ASCII search misses: text holding either takes the old way.
func fieldMatches(s string) [][]int {
	if strings.ContainsAny(s, "\u212a\u017f") {
		return field.FindAllStringSubmatchIndex(s, -1)
	}
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 'a' - 'A'
		}
	}
	lower := string(b)
	next := make([]int, len(fieldHeads))
	for i := range next {
		next[i] = -2 // not looked for yet
	}
	var out [][]int
	pos := 0
	for pos < len(s) {
		k := -1
		for i, h := range fieldHeads {
			if next[i] != -1 && next[i] < pos {
				if j := strings.Index(lower[pos:], h); j >= 0 {
					next[i] = pos + j
				} else {
					next[i] = -1
				}
			}
			if next[i] >= 0 && (k < 0 || next[i] < k) {
				k = next[i]
			}
		}
		if k < 0 {
			break
		}
		m := fieldAt.FindStringSubmatchIndex(s[k:])
		if m == nil {
			pos = k + 1
			continue
		}
		for i := range m {
			if m[i] >= 0 {
				m[i] += k
			}
		}
		out = append(out, m)
		pos = m[1]
	}
	return out
}

// replaceAt replaces the matches at idx (FindAllStringSubmatchIndex's).
func replaceAt(idx [][]int, s string, f func(m []string, end int) string) string {
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
	// D284: a task's transcript is made again as older pages land; the
	// same long outputs come through each time, so their answer is kept.
	if len(s) < 256 {
		return text(s)
	}
	memo.Lock()
	out, ok := memo.m[s]
	memo.Unlock()
	if ok {
		return out
	}
	out = text(s)
	memo.Lock()
	if len(memo.m) >= memoMax {
		memo.m = map[string]string{}
	}
	memo.m[s] = out
	memo.Unlock()
	return out
}

// memo holds Text's answers for long texts, at most memoMax of them.
var memo = struct {
	sync.Mutex
	m map[string]string
}{m: map[string]string{}}

const memoMax = 8192

func text(s string) string {
	// D284: each pattern runs only where the text holds what it needs (a
	// necessary substring), so a long output with no key in it costs a few
	// scans instead of nine regexps: the opened task builds 2,000 of them.
	lower := strings.ToLower(s)
	has := func(in string, subs ...string) bool {
		for _, x := range subs {
			if strings.Contains(in, x) {
				return true
			}
		}
		return false
	}
	out := s
	if strings.Contains(out, "PRIVATE KEY-----") {
		out = pem.ReplaceAllString(out, "-----BEGIN PRIVATE KEY-----"+Hidden+"-----END PRIVATE KEY-----")
	}
	// D191: a card number that passes Luhn keeps its last four; a named security code is hidden.
	if digitRun(out, 4) {
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
	}
	if has(lower, "cvc", "cvv", "csc", "cvn", "security code", "安全码", "验证码", "校验码") {
		out = replace(cvc, out, func(m []string, _ int) string { return m[1] + Hidden })
	}
	if has(out, "nmem_", "sk-", "gh", "glpat-", "xox", "AKIA", "ASIA", "AIza", "hf_", "npm_", "_live_", "whsec_", "shpat_", "dop_v1_") {
		out = replace(prefixed, out, func(m []string, _ int) string {
			if digit.MatchString(m[0][len(m[1]):]) {
				return m[1] + Hidden
			}
			return m[0]
		})
	}
	if strings.Contains(out, "eyJ") {
		out = jwt.ReplaceAllString(out, Hidden)
	}
	if has(out, "earer", "asic", "oken") {
		out = replace(bearer, out, func(m []string, _ int) string { return m[1] + Hidden })
	}
	if strings.Contains(out, "://") {
		out = replace(urlCred, out, func(m []string, _ int) string { return m[1] + Hidden + "@" })
	}
	if !has(lower, "key", "secret", "token", "passw", "pwd", "credential", "connect") {
		return out
	}
	src := out
	out = replaceAt(fieldMatches(src), src, func(m []string, end int) string {
		if keyLike(m[2]) && !strings.HasPrefix(src[end:], Hidden) {
			return m[1] + Hidden
		}
		return m[0]
	})
	return out
}

// digitRun reports whether s holds n ASCII digits in a row.
func digitRun(s string, n int) bool {
	run := 0
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			if run++; run >= n {
				return true
			}
		} else {
			run = 0
		}
	}
	return false
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
