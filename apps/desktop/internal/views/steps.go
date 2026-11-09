package views

// What a task's tool call was, as one quiet line of an opened task (D127):
// a verb label and a short target, the same on every harness. The Go port of
// packages/protocol/src/steps.ts; both pass packages/protocol/fixtures/steps.json.

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Step is one tool call as a step line.
type Step struct {
	Kind   string `json:"kind"` // ran read edited searched browsed computer waited delegated other
	Act    string `json:"act,omitempty"`
	Target string `json:"target,omitempty"`
	App    string `json:"app,omitempty"`
	More   int    `json:"more,omitempty"`
	Hidden bool   `json:"hidden,omitempty"`
}

func in(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

var (
	ducterTools  = []string{"report_to_main", "checkpoint", "log_search", "log_read"}
	bookkeeping  = []string{"TodoWrite", "TodoRead", "update_plan", "todo_write", "todowrite", "ExitPlanMode"}
	shellTools   = []string{"Bash", "bash", "PowerShell", "shell", "exec_command", "commandExecution", "run_shell_command", "run_terminal_command", "local_shell", "run_command"}
	readTools    = []string{"Read", "read", "read_file", "NotebookRead", "view", "view_image", "ls", "LS", "list_directory"}
	editTools    = []string{"Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch", "fileChange", "search_replace", "str_replace_editor", "write_file", "edit_file", "create_file", "delete"}
	searchTools  = []string{"Grep", "Glob", "grep", "glob", "find", "grep_search", "codebase_search", "semSearch", "file_search"}
	webSearch    = []string{"WebSearch", "webSearch", "web_search"}
	fetchTools   = []string{"WebFetch", "webFetch", "fetch", "web_fetch"}
	delegate     = []string{"Agent", "Task", "subagent", "collabAgentToolCall", "spawn_agent"}
	waitTools    = []string{"sleep", "wait"}
	computerList = []string{"launch_app", "click", "double_click", "right_click", "type_text", "press_key", "hotkey", "get_window_state", "get_desktop_state",
		"list_apps", "list_windows", "screenshot", "move_cursor", "set_value", "insert_text", "invoke_menu", "run_steps", "run_script",
		"scroll", "computer", "bring_to_front", "set_window_frame", "verify_state"}
)

// splitTool is mcp__server__tool as server and tool.
func splitTool(name string) (string, string) {
	if strings.HasPrefix(name, "mcp__") {
		if i := strings.LastIndex(name, "__"); i > 4 {
			return name[5:i], name[i+2:]
		}
	}
	return "", name
}

func isDucterTool(name string) bool {
	return plumbingRe.MatchString(name) || in(ducterTools, name)
}

func firstStr(o map[string]any, keys ...string) string {
	for _, k := range keys {
		switch v := o[k].(type) {
		case string:
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		case []any:
			if len(v) > 0 {
				if s, ok := v[len(v)-1].(string); ok && strings.TrimSpace(s) != "" {
					return strings.TrimSpace(s)
				}
			}
		}
	}
	return ""
}

func trimQuotes(s string) string {
	s = strings.TrimPrefix(s, `"`)
	s = strings.TrimPrefix(s, `'`)
	s = strings.TrimSuffix(s, `"`)
	return strings.TrimSuffix(s, `'`)
}

// unquote drops one pair of matching quotes around a token.
func unquote(s string) string {
	if len(s) >= 2 && (s[0] == '"' || s[0] == '\'') && s[len(s)-1] == s[0] {
		return s[1 : len(s)-1]
	}
	return s
}

func splitPath(p string) []string {
	var out []string
	for _, x := range strings.Split(p, "/") {
		if x != "" {
			out = append(out, x)
		}
	}
	return out
}

// pathTail is the last two parts of a path: "src/cart.ts".
func pathTail(p string) string {
	s := strings.TrimRight(trimQuotes(strings.TrimSpace(p)), "/")
	parts := splitPath(s)
	if len(parts) <= 2 {
		if strings.HasPrefix(s, "/") && len(parts) > 0 {
			return strings.Join(parts, "/")
		}
		return s
	}
	return strings.Join(parts[len(parts)-2:], "/")
}

var urlRe = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://([^/?#\s]+)([^?#\s]*)`)

// shortUrl is a URL as a person says it: host and its first two path parts.
func shortUrl(u string) string {
	m := urlRe.FindStringSubmatch(strings.TrimSpace(u))
	if m == nil {
		return strings.TrimSpace(u)
	}
	host := strings.TrimPrefix(m[1], "www.")
	parts := splitPath(m[2])
	if len(parts) > 2 {
		parts = parts[:2]
	}
	if len(parts) > 0 {
		return host + "/" + strings.Join(parts, "/")
	}
	return host
}

var bundles = map[string]string{
	"com.google.chrome":           "Chrome",
	"com.apple.safari":            "Safari",
	"com.apple.finder":            "Finder",
	"com.apple.dt.xcode":          "Xcode",
	"com.apple.systempreferences": "System Settings",
	"com.apple.terminal":          "Terminal",
	"com.apple.mail":              "Mail",
	"com.apple.notes":             "Notes",
}

var (
	bundleRe  = regexp.MustCompile(`(?i)^[a-z]{2,}\.[\w-]+\.[\w.-]+$`)
	appTextRe = regexp.MustCompile(`(Google Chrome|Chrome|Safari|Finder|Xcode|Transporter|System Settings|Terminal|Simulator)`)
)

// appName is an app's name as a person says it: "/Applications/Google Chrome.app" → "Chrome".
func appName(s string) string {
	a := trimQuotes(strings.TrimSpace(s))
	if a == "" {
		return ""
	}
	if bundleRe.MatchString(a) && !strings.Contains(a, " ") {
		if k, ok := bundles[strings.ToLower(a)]; ok {
			return k
		}
		parts := strings.Split(a, ".")
		last := parts[len(parts)-1]
		return strings.ToUpper(last[:1]) + last[1:]
	}
	parts := strings.Split(strings.TrimRight(a, "/"), "/")
	a = parts[len(parts)-1]
	if strings.HasSuffix(strings.ToLower(a), ".app") {
		a = a[:len(a)-4]
	}
	if strings.EqualFold(a, "google chrome") {
		return "Chrome"
	}
	return a
}

func appInText(s string) string {
	if m := appTextRe.FindStringSubmatch(s); m != nil {
		return appName(m[1])
	}
	return ""
}

var (
	mods = map[string]string{"super": "⌘", "cmd": "⌘", "command": "⌘", "meta": "⌘", "win": "⌘", "ctrl": "⌃", "control": "⌃", "alt": "⌥", "option": "⌥", "opt": "⌥", "shift": "⇧"}
	keys = map[string]string{"return": "Return", "enter": "Return", "tab": "Tab", "escape": "Esc", "esc": "Esc", "space": "Space", "backspace": "Delete", "delete": "Delete"}
)

// keyCombo is a key combo as macOS writes it: "super+t" → "⌘T".
func keyCombo(v any) string {
	var parts []string
	switch x := v.(type) {
	case []any:
		for _, p := range x {
			parts = append(parts, fmt.Sprint(p))
		}
	case []string:
		parts = x
	case string:
		parts = regexp.MustCompile(`[+\s]+`).Split(x, -1)
	case nil:
	default:
		parts = []string{fmt.Sprint(x)}
	}
	m, key := "", ""
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		l := strings.ToLower(p)
		if s, ok := mods[l]; ok {
			m += s
			continue
		}
		if k, ok := keys[l]; ok {
			key = k
		} else if r := []rune(p); len(r) == 1 {
			key = strings.ToUpper(p)
		} else {
			key = strings.ToUpper(string(r[0])) + string(r[1:])
		}
	}
	return m + key
}

// ---------- shell commands ----------

var shellWrapRe = regexp.MustCompile(`^(?:/usr/bin/env\s+)?(?:/(?:usr/)?bin/)?(?:ba|z)?sh\s+-l?c\s+`)
var unescapeRe = regexp.MustCompile(`\\(["\\$` + "`" + `])`)

// unwrapShell is the command inside `/bin/zsh -lc "…"`.
func unwrapShell(cmd string) string {
	s := strings.TrimSpace(cmd)
	for i := 0; i < 2; i++ {
		loc := shellWrapRe.FindStringIndex(s)
		if loc == nil {
			break
		}
		rest := strings.TrimSpace(s[loc[1]:])
		if len(rest) >= 2 && (rest[0] == '"' || rest[0] == '\'') && rest[len(rest)-1] == rest[0] {
			q := rest[0]
			rest = rest[1 : len(rest)-1]
			if q == '"' {
				rest = unescapeRe.ReplaceAllString(rest, "$1")
			}
		}
		s = strings.TrimSpace(rest)
	}
	return s
}

var (
	skipSegment = []string{"cd", "set", "source", ".", "export", "pushd", "popd", "unset", "true", ":", "local", "for", "while", "if", "done", "fi", "esac", "case"}
	prefixWords = []string{"sudo", "time", "env", "nohup", "exec", "command", "do", "then", "else", "builtin"}
	tokenRe     = regexp.MustCompile(`"[^"]*"|'[^']*'|\S+`)
	segRe       = regexp.MustCompile(`&&|\|\||[;|\n]`)
	assignRe    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*=`)
	subwordRe   = regexp.MustCompile(`^[a-z][a-z0-9:._-]*$`)
)

// mainCommand is the tokens of the command that does the work.
func mainCommand(cmd string) []string {
	var first []string
	for _, seg := range segRe.Split(unwrapShell(cmd), -1) {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		ts := tokenRe.FindAllString(seg, -1)
		for len(ts) > 0 {
			t0 := ts[0]
			switch {
			case assignRe.MatchString(t0) || in(prefixWords, t0):
				ts = ts[1:]
				continue
			case t0 == "timeout" && len(ts) > 1:
				if ts[1] != "" && ts[1][0] >= '0' && ts[1][0] <= '9' {
					ts = ts[2:]
				} else {
					ts = ts[1:]
				}
				continue
			}
			break
		}
		if len(ts) == 0 {
			continue
		}
		if first == nil {
			first = ts
		}
		if in(skipSegment, ts[0]) {
			continue
		}
		return ts
	}
	return first
}

func baseName(p string) string {
	parts := splitPath(unquote(p))
	if len(parts) == 0 {
		return p
	}
	return parts[len(parts)-1]
}

var osaRe = regexp.MustCompile(`tell application\s+\\?"([^"\\]+)`)

// commandStep is a shell command as one step.
func commandStep(cmd string) Step {
	ts := mainCommand(cmd)
	if len(ts) == 0 {
		f := strings.Fields(cmd)
		if len(f) == 0 {
			return Step{Kind: "ran"}
		}
		return Step{Kind: "ran", Target: f[0]}
	}
	prog := baseName(ts[0])
	args := ts[1:]
	var plain []string
	for _, a := range args {
		if !strings.HasPrefix(a, "-") {
			plain = append(plain, unquote(a))
		}
	}
	last := func() string { return plain[len(plain)-1] }
	switch prog {
	case "cat", "head", "tail", "nl", "less", "more", "bat":
		if len(plain) > 0 {
			return Step{Kind: "read", Target: pathTail(last())}
		}
	case "sed":
		inPlace := false
		for _, a := range args {
			if strings.HasPrefix(a, "-i") {
				inPlace = true
			}
		}
		if in(args, "-n") && !inPlace && len(plain) > 0 {
			return Step{Kind: "read", Target: pathTail(last())}
		}
	case "rg", "grep", "ag", "ack":
		if len(plain) > 0 {
			return Step{Kind: "searched", Target: plain[0]}
		}
	case "fd", "find":
		name := ""
		for i, a := range args {
			if a == "-name" && i+1 < len(args) {
				name = unquote(args[i+1])
				break
			}
		}
		if name == "" {
			p := "."
			if len(plain) > 0 {
				p = plain[0]
			}
			name = pathTail(p)
		}
		return Step{Kind: "searched", Target: name}
	case "ls", "tree":
		p := "."
		if len(plain) > 0 {
			p = plain[0]
		}
		return Step{Kind: "read", Act: "list", Target: pathTail(p)}
	case "open":
		u, app := "", ""
		for _, a := range plain {
			if strings.HasPrefix(a, "http://") || strings.HasPrefix(a, "https://") {
				u = a
				break
			}
		}
		for i, a := range args {
			if a == "-a" && i+1 < len(args) {
				app = appName(unquote(args[i+1]))
				break
			}
		}
		if u != "" {
			return Step{Kind: "browsed", Act: "open", Target: shortUrl(u), App: app}
		}
		if app != "" {
			return Step{Kind: "computer", Act: "launch", App: app}
		}
	case "osascript":
		s := Step{Kind: "computer", Act: "script"}
		if m := osaRe.FindStringSubmatch(cmd); m != nil {
			s.App = appName(m[1])
		}
		return s
	}
	words := []string{prog}
	for _, a := range args {
		if len(words) == 3 || !subwordRe.MatchString(a) {
			break
		}
		words = append(words, a)
	}
	if len(words) == 1 && len(args) > 0 && !strings.HasPrefix(args[0], "-") && strings.ContainsAny(args[0], "/.") {
		words = append(words, baseName(args[0]))
	}
	return Step{Kind: "ran", Target: strings.Join(words, " ")}
}

// ---------- a script driving the computer ----------

var (
	scriptURLRe    = regexp.MustCompile("https?://[^\\s'\"`)]+")
	scriptLaunchRe = regexp.MustCompile("\\b(?:launch|activate|openApp)\\w*\\(\\s*['\"`]([^'\"`]+)")
	scriptKeyRe    = regexp.MustCompile("\\bpressKeys?\\(\\s*['\"`]([^'\"`]+)")
	scriptTypeRe   = regexp.MustCompile(`\.(?:type|typeText|fill|insertText)\w*\(`)
	scriptClickRe  = regexp.MustCompile(`\.(?:click|doubleClick|tap)\w*\(`)
	scriptShotRe   = regexp.MustCompile(`(?i)screenshot`)
)

func scriptStep(code, output string) Step {
	app := appInText(code)
	if app == "" {
		app = appInText(output)
	}
	if u := scriptURLRe.FindString(code); u != "" {
		return Step{Kind: "browsed", Act: "open", Target: shortUrl(u), App: app}
	}
	if m := scriptLaunchRe.FindStringSubmatch(code); m != nil {
		return Step{Kind: "computer", Act: "launch", App: appName(m[1])}
	}
	if m := scriptKeyRe.FindStringSubmatch(code); m != nil {
		return Step{Kind: "computer", Act: "key", Target: keyCombo(m[1]), App: app}
	}
	switch {
	case scriptTypeRe.MatchString(code):
		return Step{Kind: "computer", Act: "type", App: app}
	case scriptClickRe.MatchString(code):
		return Step{Kind: "computer", Act: "click", App: app}
	case scriptShotRe.MatchString(code):
		return Step{Kind: "computer", Act: "shot", App: app}
	}
	return Step{Kind: "computer", Act: "script", App: app}
}

// ---------- browsers and the computer ----------

var browserActs = []struct {
	re  *regexp.Regexp
	act string
}{
	{regexp.MustCompile(`navigate|goto|open_url|new_tab|tabs_create`), "open"},
	{regexp.MustCompile(`prepare|launch`), "launch"},
	{regexp.MustCompile(`click|pointer|tap`), "click"},
	{regexp.MustCompile(`type|fill|form_input|press|key`), "type"},
	{regexp.MustCompile(`select`), "select"},
	{regexp.MustCompile(`dialog`), "dialog"},
	{regexp.MustCompile(`screenshot|capture`), "shot"},
	{regexp.MustCompile(`scroll`), "scroll"},
	{regexp.MustCompile(`state|snapshot|read|find|get_page|text|content|tabs`), "look"},
}

func browserStep(tool string, o map[string]any) Step {
	t := strings.ToLower(tool)
	act := "look"
	for _, b := range browserActs {
		if b.re.MatchString(t) {
			act = b.act
			break
		}
	}
	if u := firstStr(o, "url", "href"); act == "open" && u != "" {
		return Step{Kind: "browsed", Act: act, Target: shortUrl(u), App: "Chrome"}
	}
	return Step{Kind: "browsed", Act: act, App: "Chrome"}
}

func computerStep(tool string, o map[string]any) Step {
	s := Step{Kind: "computer", App: appName(firstStr(o, "app", "app_name", "application", "bundle_id", "bundleId", "name"))}
	switch tool {
	case "launch_app", "bring_to_front":
		s.Act = "launch"
	case "click", "double_click", "right_click":
		s.Act = "click"
	case "move_cursor":
		s.Act = "pointer"
	case "type_text", "set_value", "insert_text":
		s.Act = "type"
	case "press_key", "hotkey":
		s.Act = "key"
		k := o["key"]
		if k == nil {
			k = o["keys"]
		}
		if k == nil {
			k = o["combo"]
		}
		m := o["modifiers"]
		if m == nil {
			m = o["mods"]
		}
		if ms, ok := m.([]any); ok {
			all := append([]any{}, ms...)
			if ks, ok := k.([]any); ok {
				all = append(all, ks...)
			} else if k != nil {
				all = append(all, fmt.Sprint(k))
			} else {
				all = append(all, "")
			}
			s.Target = keyCombo(all)
		} else {
			s.Target = keyCombo(k)
		}
	case "screenshot":
		s.Act = "shot"
	case "invoke_menu":
		s.Act = "menu"
		p := o["path"]
		if p == nil {
			p = o["menu"]
		}
		if p == nil {
			p = o["menu_path"]
		}
		switch x := p.(type) {
		case []any:
			var ps []string
			for _, v := range x {
				ps = append(ps, fmt.Sprint(v))
			}
			s.Target = strings.Join(ps, " › ")
		case string:
			s.Target = x
		}
	case "run_steps", "run_script":
		s.Act = "script"
	case "scroll":
		s.Act = "scroll"
	default:
		s.Act = "look"
	}
	return s
}

// ---------- files ----------

var (
	patchFileRe = regexp.MustCompile(`(?m)^\*\*\* (?:Update|Add|Delete) File: (.+)$`)
	patchPlusRe = regexp.MustCompile(`(?m)^\+\+\+ (?:b/)?(.+)$`)
)

func patchPaths(patch string) []string {
	var out []string
	for _, m := range patchFileRe.FindAllStringSubmatch(patch, -1) {
		out = append(out, strings.TrimSpace(m[1]))
	}
	if len(out) == 0 {
		for _, m := range patchPlusRe.FindAllStringSubmatch(patch, -1) {
			if m[1] != "/dev/null" {
				out = append(out, strings.TrimSpace(m[1]))
			}
		}
	}
	return out
}

func editPaths(raw any) []string {
	if s, ok := raw.(string); ok {
		return patchPaths(s)
	}
	o, _ := raw.(map[string]any)
	if one := firstStr(o, "file_path", "path", "notebook_path", "filePath", "file", "target_file"); one != "" {
		return []string{one}
	}
	switch ch := o["changes"].(type) {
	case []any:
		var out []string
		for _, c := range ch {
			if m, ok := c.(map[string]any); ok {
				if p, _ := m["path"].(string); p != "" {
					out = append(out, p)
				}
			}
		}
		return out
	case map[string]any:
		var out []string
		for k := range ch {
			out = append(out, k)
		}
		return out
	}
	if p := firstStr(o, "patch", "input"); p != "" {
		return patchPaths(p)
	}
	return nil
}

// ---------- the step ----------

// stepOf is what one tool call was, as a step.
func stepOf(harness string, t *protocol.ToolCall) Step {
	_ = harness // the names don't collide across the four harnesses today
	if isDucterTool(t.Name) {
		return Step{Kind: "other", Hidden: true}
	}
	server, tool := splitTool(t.Name)
	var raw any
	if len(t.Input) > 0 {
		_ = json.Unmarshal(t.Input, &raw)
	}
	o, _ := raw.(map[string]any)
	if o == nil {
		o = map[string]any{}
	}
	s, isStr := raw.(string)
	if in(bookkeeping, tool) {
		return Step{Kind: "other", Hidden: true}
	}
	_, hasSummary := o["completion_summary"]
	_, hasCode := o["code"]
	if tool == "js" && hasSummary && !hasCode {
		return Step{Kind: "other", Hidden: true}
	}
	pick := func(keys ...string) string {
		if isStr {
			return s
		}
		return firstStr(o, keys...)
	}
	switch {
	case tool == "js" || tool == "javascript" || tool == "node_repl":
		return scriptStep(pick("code", "script", "source"), t.Output)
	case in(shellTools, tool):
		if cmd := pick("command", "cmd", "script", "CommandLine"); cmd != "" {
			return commandStep(cmd)
		}
		return Step{Kind: "ran"}
	case in(readTools, tool):
		st := Step{Kind: "read"}
		if tool == "ls" || tool == "LS" || tool == "list_directory" {
			st.Act = "list"
		}
		if p := pick("file_path", "path", "notebook_path", "filePath", "file", "target_file", "dir", "directory"); p != "" {
			st.Target = pathTail(p)
		}
		return st
	case in(editTools, tool):
		var ps []string
		seen := map[string]bool{}
		for _, p := range editPaths(raw) {
			if !seen[p] {
				seen[p] = true
				ps = append(ps, p)
			}
		}
		st := Step{Kind: "edited"}
		if len(ps) > 0 {
			st.Target = pathTail(ps[0])
			st.More = len(ps) - 1
		}
		return st
	case in(webSearch, tool):
		return Step{Kind: "searched", Act: "web", Target: pick("query", "q", "search")}
	case in(fetchTools, tool) && server == "":
		st := Step{Kind: "browsed", Act: "fetch"}
		if u := firstStr(o, "url", "href"); u != "" {
			st.Target = shortUrl(u)
		}
		return st
	case in(searchTools, tool):
		return Step{Kind: "searched", Target: pick("pattern", "query", "glob", "name", "regex")}
	case in(delegate, tool):
		d := firstStr(o, "description", "prompt", "task")
		if i := strings.IndexByte(d, '\n'); i >= 0 {
			d = d[:i]
		}
		return Step{Kind: "delegated", Target: d}
	case in(waitTools, tool):
		ms := num(o["durationMs"])
		if ms == 0 {
			ms = num(o["duration_ms"])
		}
		if ms == 0 {
			ms = num(o["seconds"]) * 1000
		}
		st := Step{Kind: "waited"}
		if ms > 0 {
			st.Target = fmt.Sprint(int(math.Round(ms / 1000)))
		}
		return st
	}
	srv := strings.ToLower(server)
	if srv == "browser" || strings.Contains(srv, "playwright") || strings.Contains(srv, "puppeteer") || strings.Contains(srv, "chrome") || strings.Contains(srv, "browser") ||
		strings.HasPrefix(tool, "browser_") || tool == "get_browser_state" {
		return browserStep(tool, o)
	}
	if strings.Contains(srv, "cua") || strings.Contains(srv, "computer") || in(computerList, tool) {
		return computerStep(tool, o)
	}
	return Step{Kind: "other", Target: strings.ReplaceAll(tool, "_", " ")}
}

func num(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case string:
		var f float64
		_, _ = fmt.Sscan(x, &f)
		return f
	}
	return 0
}
