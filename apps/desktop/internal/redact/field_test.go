package redact

import (
	"math/rand"
	"regexp"
	"strings"
	"testing"
)

// fieldBefore is the field pattern as Text ran it before 2026-11-19 (D284's
// note): unanchored over the whole text, from a run of name words before
// the secret's name. fieldMatches finds its matches from each name on; this
// test keeps the old way as the oracle and checks both over a generated
// corpus.
var fieldBefore = regexp.MustCompile(`(?i)((?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'` + "`" + `,;<>()\[\]{}\\•]{12,})`)

func before(s string) [][]int { return fieldBefore.FindAllStringSubmatchIndex(s, -1) }

// fieldPass is Text's last step with the matches idx gives.
func fieldPass(idx func(string) [][]int, src string) string {
	return replaceAt(idx(src), src, func(m []string, end int) string {
		if keyLike(m[2]) && !strings.HasPrefix(src[end:], Hidden) {
			return m[1] + Hidden
		}
		return m[0]
	})
}

// fieldCorpus is text made of the pieces the pattern turns on: names and
// parts of names, separators, quotes, values short and long, key-like and
// not, in any case (the Kelvin sign and the long s among them), across lines.
func fieldCorpus(n int) []string {
	parts := []string{
		"api_key", "API-KEY", "apikey", "ApiKey", "access_key", "x-api-token", "MY_SECRET_KEY", "secret", "Secret", "token", "TOKEN", "tokenizer",
		"password", "passwd", "pwd", "credential", "auth_key", "private-key", "connect_code", "my", "x", "OPENAI", "nmem", "db", "_", "-", "__", "--",
		"=", ":", " ", "  ", "\t", "\n", "\"", "'", "\\\"", "\\", ",", ";", "(", ")", "{", "}", "[", "]", "<", ">", "`", "•", Hidden,
		"a3f9c2e81b7d4f6a9c0e2b5d8f1a4c7e", "Tr0ub4dor&3-horse-battery", "short1", "getTokenFromEnv", "1.2.3.4", "/etc/ducter/keys/home-2026.pem",
		"QWxhZGRpbjpvcGVuIHNlc2FtZQ1234==", "abcdefghijklmnop", "0123456789012345", "v12.0.33", "max_tokens", "4096", "used", "on", "the",
		"\u212aey", "\u017fecret", "API_\u212aEY", "İ", "é", "ToKeN", "pAsSwOrD", "AUTH-key", "Connect_Code",
	}
	r := rand.New(rand.NewSource(386))
	out := make([]string, 0, n)
	for range n {
		var b strings.Builder
		pick := func(xs []string) string { return xs[r.Intn(len(xs))] }
		if r.Intn(2) == 0 {
			// Shaped like a field: words, a name, words, a separator, a value, then anything.
			for k := r.Intn(3); k > 0; k-- {
				b.WriteString(pick([]string{"my", "OPENAI", "x", "db", "nmem", "a1"}) + pick([]string{"_", "-", "", "__"}))
			}
			b.WriteString(pick(parts[:19]))
			for k := r.Intn(2); k > 0; k-- {
				b.WriteString(pick([]string{"_", "-"}) + pick([]string{"key", "ID", "v2", "token", "x"}))
			}
			b.WriteString(pick([]string{"=", ": ", " ", "\": \"", "='", "\\\"=\\\"", "\n", " = ", ":\t"}))
			b.WriteString(pick(parts[51:]))
		}
		for k := r.Intn(14) + 1; k > 0; k-- {
			b.WriteString(parts[r.Intn(len(parts))])
		}
		out = append(out, b.String())
	}
	return out
}

func TestFieldSameAsBefore(t *testing.T) {
	hid := 0
	for _, s := range fieldCorpus(300_000) {
		got, want := fieldPass(fieldMatches, s), fieldPass(before, s)
		if got != want {
			t.Fatalf("field differs on %q:\n got %q\nwant %q", s, got, want)
		}
		if got != s {
			hid++
		}
	}
	// The corpus reaches the pattern: many of its texts have a value hidden.
	if hid < 10_000 {
		t.Fatalf("only %d texts had a value hidden", hid)
	}
}

// longOutput is a tool's output as a long task holds them: code with
// "token" and "key" in it and nothing secret.
func longOutput() string {
	var b strings.Builder
	for i := range 30 {
		b.WriteString("const token = readConfig(path_to_config, ")
		b.WriteString(strings.Repeat("x", i%7))
		b.WriteString("); // the key of the map is the file's name, not a secret\n")
	}
	return b.String()
}

func BenchmarkFieldBefore(b *testing.B) {
	s := longOutput()
	for b.Loop() {
		fieldPass(before, s)
	}
}

func BenchmarkFieldNow(b *testing.B) {
	s := longOutput()
	for b.Loop() {
		fieldPass(fieldMatches, s)
	}
}
