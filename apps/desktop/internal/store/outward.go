package store

// D496: what a shell command sent out of the task's place, as facts to say
// in plain words. The Go port of packages/protocol/src/outward.ts; both pass
// packages/protocol/fixtures/outward.json.

import (
	"regexp"
	"strconv"
	"strings"
)

// OutwardAct is one thing a command sent out: a push, a PR or issue
// changed, a release, an API write, a publish, a deploy, a request to a
// host, a command run on another machine.
type OutwardAct struct {
	Kind   string   `json:"kind"`
	N      int      `json:"n,omitempty"`
	Fields []string `json:"fields,omitempty"`
	Review string   `json:"review,omitempty"`
	Target string   `json:"target,omitempty"`
}

var (
	reHeredoc   = regexp.MustCompile(`<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)['"]?`)
	reAssign    = regexp.MustCompile(`^[A-Za-z_]\w*=`)
	reAssignEnd = regexp.MustCompile(`^[A-Za-z_]\w*=$`)
	reNum       = regexp.MustCompile(`^#?(\d+)$`)
	reNumURL    = regexp.MustCompile(`/(?:pull|issues)/(\d+)`)
	rePRURL     = regexp.MustCompile(`https://github\.com/[^\s]+/(?:pull|issues)/\d+`)
	reMutation  = regexp.MustCompile(`^mutation\b[^{]*\{\s*(\w+)`)
	reMutStart  = regexp.MustCompile(`^mutation\b`)
	reXMethod   = regexp.MustCompile(`^-X[A-Za-z]+$`)
	reHost      = regexp.MustCompile(`(?i)^(?:[a-z]+://)?(?:[^@/]+@)?([^/:?#]+)`)
	reLocal     = regexp.MustCompile(`^(localhost|127\.|0\.0\.0\.0|\[::1\])`)
	reRemote    = regexp.MustCompile(`^(?:[\w.-]+@)?([\w.-]+):`)
	reUser      = regexp.MustCompile(`^[\w.-]+@`)
	reTagRef    = regexp.MustCompile(`^v\d`)
	reDataFlag  = regexp.MustCompile(`^--(data|json|form)`)
	reWS        = regexp.MustCompile(`[\s;&|]`)
)

// ShellWords splits a shell line into simple commands, quotes honoured; a
// heredoc's body is dropped (it is data).
func ShellWords(cmd string) [][]string {
	lines := strings.Split(strings.ReplaceAll(strings.ReplaceAll(cmd, "\r\n", "\n"), "\r", "\n"), "\n")
	var kept []string
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		kept = append(kept, line)
		m := reHeredoc.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		end := m[3]
		for i+1 < len(lines) {
			l := lines[i+1]
			if m[1] != "" {
				l = strings.TrimSpace(l)
			}
			if l == end {
				break
			}
			i++
		}
		i++
	}
	s := []rune(strings.Join(kept, "\n"))
	var out [][]string
	var cur []string
	word := ""
	has := false
	flush := func() {
		if has {
			cur = append(cur, word)
		}
		word, has = "", false
	}
	end := func() {
		flush()
		if len(cur) > 0 {
			out = append(out, cur)
		}
		cur = nil
	}
	at := func(i int) rune {
		if i < len(s) {
			return s[i]
		}
		return 0
	}
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case ch == '\'':
			j := i + 1
			for j < len(s) && s[j] != '\'' {
				j++
			}
			word += string(s[i+1 : min(j, len(s))])
			has = true
			i = j
		case ch == '"':
			j := i + 1
			for j < len(s) && s[j] != '"' {
				if s[j] == '\\' && j+1 < len(s) {
					j++
				}
				word += string(s[j])
				j++
			}
			has = true
			i = j
		case ch == '\\' && i+1 < len(s):
			if s[i+1] != '\n' {
				word += string(s[i+1])
				has = true
			}
			i++
		case ch == '$' && at(i+1) == '(' && at(i+2) != '(':
			if reAssignEnd.MatchString(word) {
				word, has = "", false
			}
			end()
			i++
		case ch == '`':
			if reAssignEnd.MatchString(word) {
				word, has = "", false
			}
			end()
		case ch == '#' && !has:
			for i+1 < len(s) && s[i+1] != '\n' {
				i++
			}
		case ch == ' ' || ch == '\t':
			flush()
		case ch == ';' || ch == '&' || ch == '|' || ch == '\n' || ch == '(' || ch == ')':
			if (ch == '&' && at(i+1) == '&') || (ch == '|' && at(i+1) == '|') {
				i++
			}
			end()
		case ch == '>' || ch == '<':
			if len(word) == 1 && word[0] >= '0' && word[0] <= '9' {
				word, has = "", false
			}
			flush()
			for at(i+1) == '>' || at(i+1) == '&' {
				i++
			}
			for at(i+1) == ' ' {
				i++
			}
			j := i + 1
			for j < len(s) && !reWS.MatchString(string(s[j])) {
				j++
			}
			i = j - 1
		default:
			word += string(ch)
			has = true
		}
	}
	end()
	return out
}

func bareWords(w []string) []string {
	i := 0
	for i < len(w) {
		x := w[i]
		if reAssign.MatchString(x) {
			i++
			continue
		}
		switch x {
		case "sudo", "env", "time", "nohup", "command", "exec", "xargs":
			i++
			continue
		}
		break
	}
	out := append([]string(nil), w[i:]...)
	if len(out) > 0 {
		if k := strings.LastIndexByte(out[0], '/'); k >= 0 {
			out[0] = out[0][k+1:]
		}
	}
	return out
}

func numOf(s string) int {
	if m := reNum.FindStringSubmatch(s); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	if m := reNumURL.FindStringSubmatch(s); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	return 0
}

func positionals(w []string, from int, takesValue func(string) bool) []string {
	var out []string
	for i := from; i < len(w); i++ {
		x := w[i]
		if x == "--" {
			out = append(out, w[i+1:]...)
			break
		}
		if strings.HasPrefix(x, "-") && len(x) > 1 {
			if !strings.Contains(x, "=") && takesValue(x) {
				i++
			}
			continue
		}
		out = append(out, x)
	}
	return out
}

func hasFlag(w []string, flags ...string) bool {
	for _, x := range w {
		for _, f := range flags {
			if x == f || strings.HasPrefix(x, f+"=") {
				return true
			}
		}
	}
	return false
}

func setOf(xs ...string) map[string]bool {
	m := map[string]bool{}
	for _, x := range xs {
		m[x] = true
	}
	return m
}

func arg(w []string, i int) string {
	if i < len(w) {
		return w[i]
	}
	return ""
}

var ghValue = setOf("-R", "--repo", "-t", "--title", "-b", "--body", "-F", "--body-file", "-B", "--base", "-H", "--head", "-l", "--label", "-a", "--assignee", "-r", "--reviewer", "-m", "--milestone", "-p", "--project", "--add-label", "--remove-label", "--add-reviewer", "--remove-reviewer", "--add-assignee", "--remove-assignee", "--add-project", "--remove-project", "--template", "--subject", "--match-head-commit", "-n", "--notes", "--notes-file", "--target", "--tag", "--discussion-category", "-e", "--editor")

var ghFields = []struct {
	flags []string
	field string
}{
	{[]string{"-t", "--title"}, "title"},
	{[]string{"-b", "--body", "-F", "--body-file"}, "body"},
	{[]string{"--add-label", "--remove-label", "-l", "--label"}, "labels"},
	{[]string{"--add-reviewer", "--remove-reviewer", "-r", "--reviewer"}, "reviewers"},
	{[]string{"--add-assignee", "--remove-assignee", "-a", "--assignee"}, "assignees"},
	{[]string{"-B", "--base"}, "base"},
	{[]string{"-m", "--milestone"}, "milestone"},
	{[]string{"--add-project", "--remove-project", "-p", "--project"}, "projects"},
}

func outwardGh(w []string, output string) []OutwardAct {
	group, verb := arg(w, 1), arg(w, 2)
	if group == "api" {
		return outwardGhAPI(w)
	}
	if group != "pr" && group != "issue" && group != "release" {
		return nil
	}
	pos := positionals(w, 3, func(f string) bool { return ghValue[f] })
	if group == "release" {
		kinds := map[string]string{"create": "release_create", "edit": "release_edit", "delete": "release_delete", "upload": "release_upload"}
		k, ok := kinds[verb]
		if !ok {
			return nil
		}
		return []OutwardAct{{Kind: k, Target: arg(pos, 0)}}
	}
	verbs := setOf("create", "edit", "comment", "close", "reopen", "delete")
	if group == "pr" {
		verbs = setOf("create", "edit", "comment", "review", "merge", "close", "reopen", "ready")
	}
	if !verbs[verb] || (verb == "ready" && hasFlag(w, "--undo")) {
		return nil
	}
	act := OutwardAct{Kind: group + "_" + verb, N: numOf(arg(pos, 0))}
	if act.N == 0 && verb == "create" {
		act.N = numOf(rePRURL.FindString(output))
	}
	if verb == "edit" {
		for _, f := range ghFields {
			if hasFlag(w, f.flags...) {
				act.Fields = append(act.Fields, f.field)
			}
		}
	}
	if verb == "review" {
		switch {
		case hasFlag(w, "-a", "--approve"):
			act.Review = "approve"
		case hasFlag(w, "-r", "--request-changes"):
			act.Review = "request_changes"
		default:
			act.Review = "comment"
		}
	}
	return []OutwardAct{act}
}

var ghAPIValue = setOf("-X", "--method", "-f", "--raw-field", "-F", "--field", "-H", "--header", "--input", "-q", "--jq", "-t", "--template", "--hostname", "--cache", "-p", "--preview")

func outwardGhAPI(w []string) []OutwardAct {
	pos := positionals(w, 2, func(f string) bool { return ghAPIValue[f] })
	path := arg(pos, 0)
	method := ""
	var fields []string
	for i := 2; i < len(w); i++ {
		x := w[i]
		switch {
		case x == "-X" || x == "--method":
			method = strings.ToUpper(arg(w, i+1))
		case strings.HasPrefix(x, "--method="):
			method = strings.ToUpper(x[9:])
		case reXMethod.MatchString(x):
			method = strings.ToUpper(x[2:])
		}
		if x == "-f" || x == "-F" || x == "--field" || x == "--raw-field" {
			fields = append(fields, arg(w, i+1))
		}
	}
	if path == "graphql" {
		q := ""
		for _, v := range fields {
			if strings.HasPrefix(v, "query=") {
				q = strings.TrimSpace(v[6:])
				break
			}
		}
		if !reMutStart.MatchString(q) {
			return nil
		}
		t := "graphql"
		if m := reMutation.FindStringSubmatch(q); m != nil {
			t = "graphql " + m[1]
		}
		return []OutwardAct{{Kind: "api_write", Target: t}}
	}
	if method == "" {
		method = "GET"
		if len(fields) > 0 || hasFlag(w, "--input") {
			method = "POST"
		}
	}
	if method == "GET" || method == "HEAD" {
		return nil
	}
	kind := "api_write"
	if method == "DELETE" {
		kind = "api_delete"
	}
	return []OutwardAct{{Kind: kind, Target: strings.SplitN(strings.TrimLeft(path, "/"), "?", 2)[0]}}
}

func outwardGit(w []string) []OutwardAct {
	i := 1
	for i < len(w) && strings.HasPrefix(w[i], "-") {
		switch w[i] {
		case "-C", "-c", "--git-dir", "--work-tree":
			i += 2
		default:
			i++
		}
	}
	if arg(w, i) != "push" {
		return nil
	}
	pos := positionals(w, i+1, func(f string) bool { return setOf("-o", "--push-option", "--repo", "--receive-pack", "--exec")[f] })
	if hasFlag(w, "-d", "--delete") {
		return []OutwardAct{{Kind: "branch_delete", Target: arg(pos, 1)}}
	}
	ref := arg(pos, 1)
	if strings.HasPrefix(ref, ":") {
		return []OutwardAct{{Kind: "branch_delete", Target: ref[1:]}}
	}
	if hasFlag(w, "--tags") || strings.HasPrefix(ref, "refs/tags/") || (ref != "" && reTagRef.MatchString(ref) && hasFlag(w, "--follow-tags")) {
		return []OutwardAct{{Kind: "push_tags"}}
	}
	parts := strings.Split(strings.TrimPrefix(ref, "+"), ":")
	branch := strings.TrimPrefix(parts[len(parts)-1], "refs/heads/")
	if branch == "HEAD" {
		branch = ""
	}
	return []OutwardAct{{Kind: "push", Target: branch}}
}

var curlValue = setOf("-X", "--request", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "-T", "--upload-file", "-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie", "-c", "--cookie-jar", "-m", "--max-time", "--connect-timeout", "-w", "--write-out", "-x", "--proxy", "--retry", "--url")
var curlData = setOf("-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "-T", "--upload-file")

func outwardCurl(w []string) []OutwardAct {
	method, url, data := "", "", false
	for i := 1; i < len(w); i++ {
		x := w[i]
		switch {
		case x == "-X" || x == "--request":
			method = strings.ToUpper(arg(w, i+1))
		case reXMethod.MatchString(x):
			method = strings.ToUpper(x[2:])
		case curlData[x] || reDataFlag.MatchString(x):
			data = true
		case x == "--url":
			url = arg(w, i+1)
		}
		if strings.HasPrefix(x, "-") && !strings.Contains(x, "=") && curlValue[x] {
			i++
			continue
		}
		if !strings.HasPrefix(x, "-") && url == "" {
			url = x
		}
	}
	if method == "" {
		method = "GET"
		if data {
			method = "POST"
		}
	}
	if method == "GET" || method == "HEAD" || method == "OPTIONS" {
		return nil
	}
	host := ""
	if m := reHost.FindStringSubmatch(url); m != nil {
		host = m[1]
	}
	if reLocal.MatchString(host) {
		return nil
	}
	return []OutwardAct{{Kind: "http", Target: host}}
}

var sshValue = setOf("-i", "-p", "-o", "-l", "-J", "-F", "-L", "-R", "-D", "-b", "-c", "-E", "-e", "-m", "-O", "-Q", "-S", "-W", "-w", "-P")

func outwardOne(w0 []string, output string) []OutwardAct {
	w := bareWords(w0)
	prog := arg(w, 0)
	switch prog {
	case "bash", "sh", "zsh":
		for i, x := range w {
			if (x == "-c" || x == "-lc") && i > 0 && i+1 < len(w) {
				return OutwardOf(w[i+1], output)
			}
		}
		return nil
	case "git":
		return outwardGit(w)
	case "gh":
		return outwardGh(w, output)
	case "npm", "pnpm", "yarn", "bun", "cargo":
		if arg(w, 1) == "publish" && !hasFlag(w, "--dry-run") {
			return []OutwardAct{{Kind: "publish", Target: prog}}
		}
		return nil
	case "docker":
		if arg(w, 1) == "push" {
			return []OutwardAct{{Kind: "image_push", Target: arg(w, 2)}}
		}
		return nil
	case "wrangler", "npx", "bunx":
		ws := w
		if prog != "wrangler" {
			if arg(w, 1) != "wrangler" {
				return nil
			}
			ws = w[1:]
		}
		if arg(ws, 1) == "deploy" || arg(ws, 1) == "publish" || (arg(ws, 1) == "pages" && arg(ws, 2) == "deploy") {
			return []OutwardAct{{Kind: "deploy", Target: "Cloudflare"}}
		}
		return nil
	case "curl":
		return outwardCurl(w)
	case "ssh":
		pos := positionals(w, 1, func(f string) bool { return sshValue[f] })
		if h := reUser.ReplaceAllString(arg(pos, 0), ""); h != "" {
			return []OutwardAct{{Kind: "remote", Target: h}}
		}
		return nil
	case "scp", "rsync":
		pos := positionals(w, 1, func(f string) bool {
			return sshValue[f] || setOf("-e", "--rsh", "--exclude", "--include", "--filter", "-f")[f]
		})
		if len(pos) >= 2 {
			if m := reRemote.FindStringSubmatch(pos[len(pos)-1]); m != nil {
				return []OutwardAct{{Kind: "copy", Target: m[1]}}
			}
		}
		return nil
	}
	return nil
}

// OutwardOf is what a shell command sent out of its place, in order; none
// when everything stayed on the machine.
func OutwardOf(cmd, output string) []OutwardAct {
	var out []OutwardAct
	for _, w := range ShellWords(cmd) {
		out = append(out, outwardOne(w, output)...)
	}
	return out
}
