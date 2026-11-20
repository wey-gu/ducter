package protocol

import "regexp"

// D443: does a to-do's one line already say its size (说得清楚，改动小 / a
// small change)? Then the size pill would only repeat it, and is left off.
// The web's sizeSaid (packages/protocol/src/task-sources.ts) passes the same
// cases (packages/protocol/fixtures/size-said.json).
var sizeWords = map[string]*regexp.Regexp{
	"small":  regexp.MustCompile(`(?i)改动(很|比较|都|也)?(小|不大)|小改动|小修|改得少|一行的事|\b(small|tiny|minor|trivial|one-line|quick)\s+(change|fix|edit|tweak)\b|\btiny\b|\btrivial\b|^\s*(small|tiny)\b`),
	"medium": regexp.MustCompile(`(?i)改动(中等|适中)|中等`),
	"large":  regexp.MustCompile(`(?i)改动(很|比较|挺)?大|大改|\b(big|large|sizable|major)\s+(change|rewrite|one)\b|^\s*(big|large)\b`),
}

// SizeSaid reports whether why already names size.
func SizeSaid(why, size string) bool {
	re := sizeWords[size]
	return why != "" && re != nil && re.MatchString(why)
}
