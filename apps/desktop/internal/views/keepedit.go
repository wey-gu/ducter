package views

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D533: a Keep changed in place, as the web's keep.tsx. Each rule row of
// 怎么照看 opens its own control (a number, a clock, words, choices, the
// computer and agent pickers of D510, a name); 保存 sends keep_change, the
// one path the partner's keep_change tool takes too, and the home checks
// every value. What changed stands under the rules with 撤销 / Undo, and as a
// line among the rounds. 你说的 is words too: saved, the cheap model reads
// them once into the rules they change, shown as a small diff for one Go.

// keepEdit is a Keep page's editing state (inside keepState).
type keepEdit struct {
	// open is the rule whose editor is open ("" none); draft and draft2 its
	// words (a time is draft2); sel and sel2 its choices.
	open          string
	draft, draft2 string
	sel, sel2     int
	// saving is the rule (or "undo", "said") whose change is in flight; err
	// what the home said back for errAt.
	saving, err, errAt string
	// seen: the last keep_changed and keep_proposal read; status: the last
	// change's result, said under the rules.
	seen, seenProp *protocol.KeepEditFrame
	status         *protocol.KeepEditFrame
	// statusFull: the last change's long line shown whole (D592: two lines, then 展开).
	statusFull bool
	// words: 你说的 is being edited; reading: its words went to be read;
	// proposal: what came back.
	words    bool
	said     string
	reading  bool
	proposal *protocol.KeepEditFrame
}

var keepTime = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// keepEditSync reads the home's answers to this page's edits.
func (a *App) keepEditSync(id string) {
	e := &a.oh.keep.edit
	if f := a.S.KeepChanged[id]; f != nil && f != e.seen {
		e.seen = f
		if e.saving != "" {
			if f.OK {
				if e.saving == "bell" {
					// D620: turning it on or making a new one keeps the row open with the URL;
					// turning it off leaves it open, empty. The URL comes only in this frame.
					ks := &a.oh.keep
					switch ks.bellSending {
					case "off":
						ks.bellURL = ""
					default:
						if f.Bell != nil && f.Bell.URL != "" {
							ks.bellURL = a.bellURL(f.Bell.URL)
						}
					}
					ks.bellSending = ""
					e.err, e.errAt = "", ""
				} else {
					e.open = ""
					e.words, e.proposal, e.err, e.errAt = false, nil, "", ""
					if len(f.Edits) > 0 || f.Undone {
						e.status, e.statusFull = f, false
					}
				}
			} else {
				e.err, e.errAt = a.L.T("keep.edit.failed", f.Error), e.saving
			}
			e.saving = ""
		}
	}
	if p := a.S.KeepProposals[id]; p != nil && p != e.seenProp {
		e.seenProp = p
		if e.reading {
			e.reading, e.proposal = false, p
		}
	}
}

// keepSend sends one change made on the page (undo: it puts back the last).
func (a *App) keepSend(k *protocol.KeepPage, field string, ch protocol.KeepChange, undo bool) {
	e := &a.oh.keep.edit
	e.saving, e.err, e.errAt = field, "", ""
	a.send(protocol.KeepChangeReq{T: "keep_change", ID: k.ID, Change: ch, Undo: undo})
}

// bellURL is the home's own address for a page that was handed a relative doorbell path (the
// home has no public way set): the address this Mac already reaches it at.
func (a *App) bellURL(u string) string {
	if !strings.HasPrefix(u, "/") {
		return u
	}
	base := strings.TrimSuffix(a.conn.address, "/")
	if base == "" {
		return u
	}
	return base + u
}

// keepEsc closes an open editor first (Esc), before the page.
func (a *App) keepEsc() bool {
	e := &a.oh.keep.edit
	if a.oh.keep.open == "" || (e.open == "" && !e.words && e.proposal == nil) {
		return false
	}
	e.open, e.words, e.proposal, e.reading, e.err = "", false, nil, false, ""
	return true
}

// keepEditValue is a field's value as the page says it.
func (a *App) keepEditValue(field, v string) string {
	switch field {
	case "said":
		return a.L.T("keep.said.edit.words")
	case "every":
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return a.L.T("keep.every", a.rhythm(time.Duration(n)*time.Minute))
		}
	case "agent":
		if v == "auto" || v == "" {
			return a.L.T("newtasks.auto")
		}
		return harnessName(v)
	case "where":
		if v == "auto" || v == "" {
			return a.L.T("newtasks.auto")
		}
	case "cap":
		if n, err := strconv.Atoi(v); err == nil {
			return a.L.T("keep.cap", n)
		}
	case "speaks":
		if v == "" {
			return a.L.T("keep.speaks.default")
		}
	case "until":
		if v == "" {
			return a.L.T("keep.until.none")
		}
	case "limits":
		if v == "" {
			return a.L.T("keep.limits.none")
		}
	}
	return v
}

// keepEditInline is a field's value inside a sentence (D533): a rhythm as
// people say it (每 45 分钟一轮, every 45 minutes); a rule's words start
// lower case there, a name (a computer, an agent, an address) as it is. Not
// a language branch: Chinese has no case. The web's inSentence.
func (a *App) keepEditInline(field, v string) string {
	if field == "every" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return a.L.T("keep.edit.every", a.rhythm(time.Duration(n)*time.Minute))
		}
		return ""
	}
	s := a.keepEditValue(field, v)
	switch field {
	case "where", "agent", "address", "title":
		return s
	}
	if len(s) > 1 && s[0] >= 'A' && s[0] <= 'Z' && !(s[1] >= 'A' && s[1] <= 'Z') {
		return strings.ToLower(s[:1]) + s[1:]
	}
	return s
}

// keepEditSentence is one change said in words, never an arrow (D533):
// 你把每 45 分钟一轮改成了每小时一轮 / You changed every 45 minutes to every hour.
func (a *App) keepEditSentence(by string, e protocol.KeepEdit) string {
	who := a.L.T("keep.edit.you")
	if by != "you" {
		who = a.S.PersonaName
	}
	shown := e.Field == "speaks" || e.Field == "until" || e.Field == "limits" || e.Field == "where" || e.Field == "agent"
	switch {
	case e.Field == "said" && e.To != "":
		// D593: words added from now on are said as what was added.
		return a.L.T("keep.edit.added", who, e.To)
	case e.Field == "said":
		return a.L.T("keep.edit.said", who)
	case (e.From != "" || shown) && (e.To != "" || shown):
		return a.L.T("keep.edit.line", who, a.keepEditInline(e.Field, e.From), a.keepEditInline(e.Field, e.To))
	case e.To != "":
		return a.L.T("keep.edit.set", who, a.keepEditInline(e.Field, e.To))
	}
	return a.L.T("keep.edit.cleared", who, a.keepEditInline(e.Field, e.From))
}

// keepEditLines is a change among the rounds, one sentence per field (core
// already took undone ones away and folded close ones together).
func (a *App) keepEditLines(ed *protocol.KeepEditLine) []string {
	var out []string
	for _, e := range ed.Edits {
		out = append(out, a.keepEditSentence(ed.By, e))
	}
	return out
}

// keepFieldLabel is the rule a field belongs to.
func (a *App) keepFieldLabel(field string) string {
	switch field {
	case "every", "at":
		return a.L.T("keep.rule.wakes")
	case "until":
		return a.L.T("keep.rule.until")
	case "speaks":
		return a.L.T("keep.rule.speaks")
	case "cap", "limits":
		return a.L.T("keep.rule.limits")
	case "where", "agent":
		return a.L.T("keep.rule.where")
	case "address":
		return a.L.T("keep.rule.address")
	}
	return a.L.T("keep.said.edit.words")
}

// keepSpeaks are 什么时候出声's choices: news, the default (only to ask),
// every round, and the person's own words when they said something else.
func (a *App) keepSpeaks(k *protocol.KeepPage) (labels []string, sel int) {
	labels = []string{a.L.T("keep.speaks.news"), a.L.T("keep.speaks.default"), a.L.T("keep.speaks.every")}
	sel = 1
	switch k.Speaks {
	case "", labels[1]:
	case labels[0]:
		sel = 0
	case labels[2]:
		sel = 2
	default:
		labels = append(labels, k.Speaks)
		sel = 3
	}
	return labels, sel
}

// keepPickers are 在哪儿做 and 谁来做's choices, as D510's New tasks start:
// 自动 / Automatic only where Ducter may pick (a task in rounds runs on one
// computer with one agent), each shown only where there is a choice.
func (a *App) keepPickers(k *protocol.KeepPage) (where []string, whereIDs []string, whereSel int, who []string, whoIDs []string, whoSel int) {
	auto := k.Run != "same"
	if k.CanEdit("where") {
		if auto {
			where, whereIDs = append(where, a.L.T("newtasks.auto")), append(whereIDs, "auto")
		}
		for _, d := range a.taskComputers() {
			id := d.ID
			if d.Home {
				id = "local"
			}
			if id == k.Device {
				whereSel = len(where)
			}
			where, whereIDs = append(where, d.Name), append(whereIDs, id)
		}
		if len(where) < 2 {
			where, whereIDs = nil, nil
		}
	}
	if k.CanEdit("agent") {
		if auto {
			who, whoIDs = append(who, a.L.T("newtasks.auto")), append(whoIDs, "auto")
		}
		for _, h := range a.taskAgents() {
			if h == k.Agent {
				whoSel = len(who)
			}
			who, whoIDs = append(who, harnessName(h)), append(whoIDs, h)
		}
		if len(who) < 2 {
			who, whoIDs = nil, nil
		}
	}
	return
}

// keepRules is 怎么照看 / How it runs: each rule a row that opens its own
// control in place (D533), then 暂停 ▾, 立即运行 and 结束看守 (D592).
func (a *App) keepRules(c *ui.Context, k *protocol.KeepPage) {
	t := a.T
	w := a.oh.keep.sideW
	if w <= 0 {
		w = 320
	}
	ks := &a.oh.keep
	e := &ks.edit
	a.keepCard(c, "rules", w, func() {
		ui.Column(c.Key("rules")).Width(w).Padding(4, 16, 16, 16).Children(func() {
			prevAvail := a.ctlAvail
			a.ctlAvail = w - 32
			defer func() { a.ctlAvail = prevAvail }()
			var wakes []string
			onlyArrives := true
			for _, x := range k.Wakes {
				switch x.Kind {
				case "arrives":
					wakes = append(wakes, a.L.T("keep.wake.arrives"))
				case "every":
					onlyArrives = false
					wakes = append(wakes, a.L.T("keep.every", a.rhythm(time.Duration(x.EveryMs)*time.Millisecond)))
				case "at":
					onlyArrives = false
					wakes = append(wakes, keepFactParts(x.Words)...)
				default:
					if x.Words != "" {
						onlyArrives = false
						wakes = append(wakes, a.L.T("keep.wake.changes", x.Words))
					} else {
						wakes = append(wakes, a.L.T("keep.wake.changes.prs"))
					}
				}
			}
			type rule struct {
				key, label string
				values     []string
				muted      string
				can        bool
				openIt     func()
				editor     func()
				save       func()
				foot       func()
			}
			cancel := func() { e.open, e.err, e.errAt = "", "", "" }
			var rules []rule

			// 什么时候醒: a rhythm in minutes, or a clock (every day or weekday at a time).
			wk := rule{key: "wakes", label: a.L.T("keep.rule.wakes"), values: wakes}
			switch {
			case k.CanEdit("every"):
				wk.can = true
				wk.openIt = func() { e.draft = strconv.FormatInt(k.EveryMs/60000, 10) }
				wk.save = func() {
					n, err := strconv.Atoi(e.draft)
					if err != nil || n < 5 || n > 10080 {
						e.err, e.errAt = a.L.T("keep.edit.every.range"), "wakes"
						return
					}
					a.keepSend(k, "wakes", protocol.KeepChange{EveryMinutes: n}, false)
				}
				wk.editor = func() {
					a.numberField(c, "every", a.L.T("keep.rule.wakes"), &e.draft, a.L.T("keep.edit.every.unit"), wk.save, cancel)
				}
			case k.CanEdit("at") && k.At != nil:
				labels := []string{a.L.T("keep.edit.at.day"), a.L.T("keep.edit.at.weekday")}
				every := []string{"day", "weekday"}
				if k.At.Every != "day" && k.At.Every != "weekday" && len(wakes) > 0 {
					labels, every = append(labels, wakes[0]), append(every, k.At.Every)
				}
				wk.can = true
				wk.openIt = func() {
					e.sel, e.draft2 = 0, k.At.Time
					for i, x := range every {
						if x == k.At.Every {
							e.sel = i
						}
					}
				}
				wk.save = func() {
					if !keepTime.MatchString(strings.TrimSpace(e.draft2)) {
						e.err, e.errAt = a.L.T("keep.edit.at.bad"), "wakes"
						return
					}
					a.keepSend(k, "wakes", protocol.KeepChange{At: &protocol.KeepAt{Every: every[e.sel], Time: strings.TrimSpace(e.draft2)}}, false)
				}
				wk.editor = func() {
					if i := a.choices(c, "at-every", a.L.T("keep.rule.wakes"), labels, e.sel); i >= 0 {
						e.sel = i
					}
					ui.Row(c.Key("at-time")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						uiText(c.Key("l"), a.L.T("keep.edit.at.time")).FontSize(t.SM).TextColor(t.InkSoft).Shrink(0)
						ui.Box(c.Key("f")).Width(96).Shrink(0).Children(func() {
							a.editLine(c, "at-time", a.L.T("keep.edit.at.time"), &e.draft2, "08:00", wk.save, cancel)
						})
					})
				}
			}
			rules = append(rules, wk)

			// 做到什么时候: words; empty is no end.
			if k.Until != "" || k.NoEnd || k.CanEdit("until") {
				r := rule{key: "until", label: a.L.T("keep.rule.until"), can: k.CanEdit("until")}
				switch {
				case k.End != nil && k.End.Sentence != "":
					r.values = []string{k.End.Sentence}
				case k.Until != "":
					r.values = []string{k.Until}
				case k.NoEnd:
					r.values = []string{a.L.T("keep.end.none")}
				default:
					r.muted = a.L.T("keep.edit.until.ph")
				}
				r.openIt = func() { e.draft = k.Until }
				r.save = func() {
					v := strings.TrimSpace(e.draft)
					a.keepSend(k, "until", protocol.KeepChange{Until: &v}, false)
				}
				r.editor = func() {
					a.editLine(c, "until", a.L.T("keep.rule.until"), &e.draft, a.L.T("keep.edit.until.ph"), r.save, cancel)
				}
				rules = append(rules, r)
			}

			// 什么时候出声: choices.
			speaks := k.Speaks
			if speaks == "" {
				speaks = a.L.T("keep.speaks.default")
			}
			sp := rule{key: "speaks", label: a.L.T("keep.rule.speaks"), values: []string{speaks}, muted: a.L.T("keep.speaks.quiet"), can: k.CanEdit("speaks")}
			spLabels, spSel := a.keepSpeaks(k)
			sp.openIt = func() { e.sel = spSel }
			sp.save = func() {
				v := spLabels[e.sel]
				switch e.sel {
				case 1:
					v = ""
				case 3:
					cancel()
					return
				}
				a.keepSend(k, "speaks", protocol.KeepChange{Speaks: &v}, false)
			}
			sp.editor = func() {
				if i := a.choices(c, "speaks", a.L.T("keep.rule.speaks"), spLabels, e.sel); i >= 0 {
					e.sel = i
				}
			}
			rules = append(rules, sp)

			// 上限: a Keep with an address takes so many pieces of work a day; else its limits in words.
			if k.Run == "perItem" {
				cp := k.Cap
				if cp == 0 {
					cp = 10
				}
				r := rule{key: "cap", label: a.L.T("keep.rule.limits"), values: []string{a.L.T("keep.cap", cp)}, can: k.CanEdit("cap")}
				r.openIt = func() { e.draft = strconv.Itoa(cp) }
				r.save = func() {
					n, err := strconv.Atoi(e.draft)
					if err != nil || n < 1 || n > 30 {
						e.err, e.errAt = a.L.T("keep.edit.cap.range"), "cap"
						return
					}
					a.keepSend(k, "cap", protocol.KeepChange{Cap: n}, false)
				}
				r.editor = func() {
					a.numberField(c, "cap", a.L.T("keep.rule.limits"), &e.draft, a.L.T("keep.edit.cap.unit"), r.save, cancel)
				}
				rules = append(rules, r)
			} else if k.Limits != "" || k.CanEdit("limits") {
				l := k.Limits
				if l == "" {
					l = a.L.T("keep.limits.none")
				}
				r := rule{key: "limits", label: a.L.T("keep.rule.limits"), values: []string{l}, can: k.CanEdit("limits")}
				r.openIt = func() { e.draft = k.Limits }
				r.save = func() {
					v := strings.TrimSpace(e.draft)
					a.keepSend(k, "limits", protocol.KeepChange{Limits: &v}, false)
				}
				r.editor = func() {
					a.editLine(c, "limits", a.L.T("keep.rule.limits"), &e.draft, a.L.T("keep.edit.limits.ph"), r.save, cancel)
				}
				rules = append(rules, r)
			}

			// 在哪儿做，谁来做: D510's two pickers.
			where, whereIDs, whereSel, who, whoIDs, whoSel := a.keepPickers(k)
			var parts []string
			if k.Where != nil && k.Where.DeviceName != "" {
				parts = append(parts, k.Where.DeviceName)
			}
			if k.Where != nil && k.Where.Harness != "" {
				parts = append(parts, harnessName(k.Where.Harness))
			}
			if len(parts) > 0 || len(where) > 0 || len(who) > 0 {
				if len(parts) == 0 {
					parts = []string{a.L.T("newtasks.auto")}
				}
				r := rule{key: "where", label: a.L.T("keep.rule.where"), values: []string{strings.Join(parts, a.L.T("keep.where.sep"))}, can: len(where) > 0 || len(who) > 0}
				r.openIt = func() { e.sel, e.sel2 = whereSel, whoSel }
				r.save = func() {
					var ch protocol.KeepChange
					if len(where) > 0 && e.sel != whereSel {
						ch.Where = whereIDs[e.sel]
					}
					if len(who) > 0 && e.sel2 != whoSel {
						ch.Agent = whoIDs[e.sel2]
					}
					if ch.Where == "" && ch.Agent == "" {
						cancel()
						return
					}
					a.keepSend(k, "where", ch, false)
				}
				r.editor = func() {
					if len(where) > 0 {
						uiText(c.Key("wl"), a.L.T("keep.where.label")).FontSize(t.SM).TextColor(t.InkSoft)
						if i := a.choices(c, "where", a.L.T("keep.where.label"), where, e.sel); i >= 0 {
							e.sel = i
						}
					}
					if len(who) > 0 {
						uiText(c.Key("al"), a.L.T("keep.who.label")).FontSize(t.SM).TextColor(t.InkSoft).Margin(4, 0, 0, 0)
						if i := a.choices(c, "who", a.L.T("keep.who.label"), who, e.sel2); i >= 0 {
							e.sel2 = i
						}
					}
				}
				rules = append(rules, r)
			}

			// D620: 门铃 / Doorbell: off by default; on, the URL is shown once with Copy and
			// curl; Regenerate and Turn off. A helper takes work at its address, so it has none.
			if k.Run != "perItem" {
				bell := rule{key: "bell", label: a.L.T("keep.rule.bell"), values: []string{a.L.T("keep.bell.off")}, can: true}
				if k.Bell != nil {
					bell.values = []string{a.L.T("keep.bell.on")}
				}
				bell.openIt = func() {}
				bell.editor = func() {
					note := func(key, text string) {
						uiText(c.Key(key), text).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.45))
					}
					if k.Bell == nil {
						note("bell-off", a.L.T("keep.bell.off.what"))
					} else if ks.bellURL != "" {
						a.lendCopy(c, "bell-url", ks.bellURL, "check")
						note("bell-curl-lb", a.L.T("keep.bell.curl"))
						a.lendCopy(c, "bell-curl", fmt.Sprintf("curl -X POST -H 'X-Ducter-About: CI #42' '%s'", ks.bellURL), "line")
						note("bell-note-once", a.L.T("keep.bell.note.once"))
						note("bell-note-where", a.L.T("keep.bell.note.where"))
					} else {
						note("bell-hidden", a.L.T("keep.bell.hidden"))
					}
				}
				// D620: one quiet foot, never a primary 关掉: Done folds; turning it off is quiet danger.
				bell.foot = func() {
					ui.Row(c.Key("bell-foot")).Width(a.ctlAvail).Justify(ui.SpaceBetween).AlignItems(ui.Center).Children(func() {
						ui.Row(c.Key("bell-left")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
							if k.Bell != nil {
								if a.buttonFor(c, a.L.T("keep.bell.new"), a.L.T("keep.bell.new"), btnText, t.ControlSM, t.Surface) {
									ks.bellSending = "new"
									a.keepSend(k, "bell", protocol.KeepChange{Bell: "new"}, false)
								}
								if a.quietDanger(c, "bell-off", a.L.T("keep.bell.on.act"), k.Title) {
									ks.bellSending = "off"
									a.keepSend(k, "bell", protocol.KeepChange{Bell: "off"}, false)
								}
							} else if a.buttonFor(c, a.L.T("keep.bell.off.act"), a.L.T("keep.bell.off.act"), btnSecondary, t.ControlSM, t.Surface) {
								ks.bellSending = "on"
								a.keepSend(k, "bell", protocol.KeepChange{Bell: "on"}, false)
							}
						})
						if a.buttonFor(c, a.L.T("keep.bell.done"), k.Title, btnPrimary, t.ControlSM, t.Surface) {
							e.open, e.err, e.errAt = "", "", ""
						}
					})
				}
				rules = append(rules, bell)
			}

			// 别的 agent 怎么找到它: its name in Bridge.
			if k.Address != nil {
				// D618 (D604): a name stays whole in its row; spaces inside it never break it.
				name := wholeName(k.Address.Name)
				vals := []string{a.L.T("keep.address.name", name)}
				// D604: where it receives, each Space by the person's name for it, whole.
				if len(k.Address.Spaces) > 0 {
					spaces := make([]string, len(k.Address.Spaces))
					for i, sp := range k.Address.Spaces {
						spaces[i] = wholeName(sp)
					}
					vals = append(vals, a.L.T("keep.address.spaces", strings.Join(spaces, a.L.T("keep.address.sep"))))
				}
				r := rule{key: "address", label: a.L.T("keep.rule.address"), values: vals, muted: a.L.T("keep.address." + k.Address.Mem), can: k.CanEdit("address")}
				r.openIt = func() { e.draft = k.Address.Name }
				r.save = func() {
					v := strings.TrimSpace(e.draft)
					if v == "" {
						e.err, e.errAt = a.L.T("keep.edit.empty"), "address"
						return
					}
					a.keepSend(k, "address", protocol.KeepChange{Address: v}, false)
				}
				r.editor = func() {
					a.editLine(c, "address", a.L.T("keep.rule.address"), &e.draft, a.L.T("keep.edit.address.ph"), r.save, cancel)
				}
				rules = append(rules, r)
			}

			for i, r := range rules {
				r := r
				err := ""
				if e.errAt == r.key {
					err = e.err
				}
				a.editRow(c, editRowOpts{
					key: r.key, label: r.label, values: r.values, muted: r.muted,
					can: r.can && k.Life != "done" && k.Life != "stopped", open: e.open == r.key, saving: e.saving == r.key,
					foot: r.foot,
					err:  err, about: r.label, last: i == len(rules)-1, editor: r.editor,
					onOpen: func() {
						e.open, e.err, e.errAt = r.key, "", ""
						if r.openIt != nil {
							r.openIt()
						}
					},
					onSave:   r.save,
					onCancel: cancel,
				})
			}
			if k.Life == "done" || k.Life == "stopped" {
				return
			}
			a.keepGestures(c, k, onlyArrives)
		})
	})
	a.keepEditStatus(c, k, w)
}

// keepEditStatus is the last change, under the rules: one sentence (two lines until 展开) with 撤销,
// or 撤销了 once it was put back.
func (a *App) keepEditStatus(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	e := &a.oh.keep.edit
	f := e.status
	if f == nil {
		if e.errAt == "undo" || e.errAt == "said" {
			uiText(c.Key("edit-err"), e.err).FontSize(t.SM).TextColor(t.Failed.Ink).Width(w).Padding(10, 16, 0, 16).Role(ui.RoleStatus)
		}
		return
	}
	// D592: the line, two lines at most until 展开, on the card's text edge; its actions under it
	// on that same edge (never a 撤销 floating at the far right of a long block).
	ui.Column(c.Key("edit-status")).Width(w).Gap(2).Padding(10, 16, 0, 16).Role(ui.RoleStatus).Children(func() {
		if f.Undone {
			uiText(c.Key("u"), a.L.T("keep.edit.undone")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
			return
		}
		long := false
		for i, ed := range f.Edits {
			s := keepWords(autospace(a.L.T("keep.edit.done", a.keepEditSentence("you", ed))))
			if a.keepStatusLong(s, w-32) {
				long = true
			}
			tx := uiText(c.Key(fmt.Sprint("e", i)), s).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
			if !e.statusFull {
				tx.MaxLines(2)
			}
		}
		ui.Row(c.Key("acts")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if long {
				label := "keep.edit.more"
				if e.statusFull {
					label = "keep.edit.less"
				}
				if a.quietButton(c, "status-more", a.L.T(label), k.Title, false, 0) {
					e.statusFull = !e.statusFull
				}
			}
			if f.Undo != nil {
				if e.saving == "undo" {
					uiText(c.Key("saving"), a.L.T("keep.edit.saving")).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0)
				} else if a.quietButton(c, "undo", a.L.T("keep.edit.undo"), k.Title, true, 0) {
					a.keepSend(k, "undo", *f.Undo, true)
				}
			}
		})
	})
}

// keepStatusLong says a line would take more than two lines at this width
// (the SM size, a CJK character one em, a Latin one about half).
func (a *App) keepStatusLong(s string, w float32) bool {
	em := float32(a.T.SM)
	var width float32
	for _, r := range s {
		if r < 0x2E80 {
			width += em * 0.55
		} else {
			width += em
		}
	}
	return width > 2*w
}

// keepGestures are 暂停 ▾ (or 恢复), 立即运行 and, last and apart, 结束看守 with its ask (D592).
func (a *App) keepGestures(c *ui.Context, k *protocol.KeepPage, onlyArrives bool) {
	t := a.T
	ks := &a.oh.keep
	ui.Row(c.Key("acts")).Gap(8).Wrap().Padding(14, 0, 0, 0).Children(func() {
		if k.Life == "paused" {
			if a.buttonFor(c, a.L.T("keep.resume"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "resume"})
			}
		} else {
			// D421: Pause's choices are the one clay menu.
			a.menuOpener(c, "pause", a.L.T("keep.pause"), k.Title, btnSecondary, t.ControlSM, t.Surface, func(m *ui.Menu) {
				now := a.Now()
				morning := time.Date(now.Year(), now.Month(), now.Day()+1, 8, 0, 0, 0, now.Location())
				for _, p := range []struct {
					key   string
					until time.Time
				}{{"keep.pause.hour", now.Add(time.Hour)}, {"keep.pause.morning", morning}, {"keep.pause.week", now.Add(7 * 24 * time.Hour)}, {"keep.pause.resume", time.Time{}}} {
					if m.Item(a.L.T(p.key)).ID(p.key).Chosen() {
						f := protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "pause"}
						if !p.until.IsZero() {
							f.Until = p.until.UTC().Format(time.RFC3339)
						}
						a.send(f)
					}
				}
			})
		}
		if k.Life == "on" && !onlyArrives && a.buttonFor(c, a.L.T("keep.look"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
			a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "look_now"})
		}
		// D592: 结束看守 ends it for good, so it is the destructive one, last, apart (D289, D583).
		ui.Box(c.Key("gap")).Grow(1)
		if !ks.stop && a.quietDanger(c, "keep-stop", a.L.T("keep.stop"), k.Title) {
			ks.stop = true
		}
	})
	if ks.stop {
		ui.Column(c.Key("stop-ask")).Gap(10).Padding(12).Margin(10, 0, 0, 0).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
			uiText(c.Key("q"), a.L.T("keep.stop.ask")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				if a.dangerText(c, "keep-stop-go", a.L.T("keep.stop.go"), k.Title) {
					a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "stop"})
					ks.stop = false
				}
				if a.quietButton(c, "keep-stop-keep", a.L.T("keep.stop.keep"), k.Title, false, 0) {
					ks.stop = false
				}
			})
		})
	}
}

// keepSaid is 你说的: the person's words, verbatim, and (D533) a 改 that
// makes them words to edit. Saved, they are read once into the rules they
// change, shown as a small diff for one Go: 照这样改, 只改说的话, 取消.
func (a *App) keepSaid(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	e := &a.oh.keep.edit
	// D592: at rest, when the words may change, the whole well is the button (its chevron on the
	// label line), as a rule row is; never a lone 改.
	opens := k.CanEdit("said") && !e.words && e.proposal == nil
	card := ui.Column(c.Key("said")).Width(w).Gap(2).Padding(10, 14, 12, 14).Radius(t.RadiusMD).Background(t.SurfaceSunken)
	ink := t.Faint
	if opens {
		var clicked bool
		if ink, clicked = a.openWell(c, card, spoken(a.L, a.L.T("keep.said.edit.about"), k.Said)); clicked {
			e.words, e.said, e.reading, e.proposal = true, k.Said, false, nil
			opens = false
		}
	}
	card.Children(func() {
		ui.Row(c.Key("hd")).AlignItems(ui.Center).Gap(t.S2).MinHeight(28).AccessHidden(opens).Children(func() {
			uiText(c.Key("k"), a.L.T("keep.said")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Grow(1).Shrink(1).MinWidth(0)
			if opens {
				a.glyph(c, 12, drawChevron(ink, false))
			}
		})
		cancel := func() { e.words, e.reading, e.proposal = false, false, nil }
		onlyWords := func(said string) {
			a.keepSend(k, "said", protocol.KeepChange{Said: said}, false)
		}
		switch {
		case e.proposal != nil && e.proposal.Proposal != nil:
			p := e.proposal.Proposal
			uiText(c.Key("v"), keepWords(autospace(p.Said))).FontSize(t.SM).LineHeight(a.leading(1.6)).TextColor(t.Ink)
			var rules []protocol.KeepEdit
			for _, x := range p.Edits {
				if x.Field != "said" {
					rules = append(rules, x)
				}
			}
			ui.Column(c.Key("prop")).Gap(t.S2).Margin(10, 0, 0, 0).Padding(12, 14).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).Width(w - 28).Role(ui.RoleStatus).Children(func() {
				head := "keep.said.edit.diff"
				switch {
				case !p.OK:
					head = "keep.said.edit.unread"
				case len(rules) == 0:
					head = "keep.said.edit.same"
				}
				uiText(c.Key("h"), a.L.T(head)).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
				for i, x := range rules {
					x := x
					ui.Column(c.Key(fmt.Sprint("d", i))).Gap(2).Padding(8, 0, 0, 0).Children(func() {
						uiText(c.Key("l"), a.keepFieldLabel(x.Field)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
						// Old struck, new bold beside it: no arrow (D533).
						ui.Row(c.Key("ft")).Gap(t.S3).Wrap().AlignItems(ui.Baseline).Children(func() {
							uiText(c.Key("f"), keepWords(autospace(a.keepEditValue(x.Field, x.From)))).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.45))
							uiText(c.Key("t"), keepWords(autospace(a.keepEditValue(x.Field, x.To)))).FontSize(t.SM).FontWeight(600).TextColor(t.Ink).LineHeight(a.leading(1.45))
						})
					})
				}
				ui.Row(c.Key("acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Margin(8, 0, 0, 0).Children(func() {
					if e.saving == "said" {
						uiText(c.Key("saving"), a.L.T("keep.edit.saving")).FontSize(t.SM).TextColor(t.InkMuted)
						return
					}
					switch {
					case p.OK && len(rules) > 0:
						if a.buttonFor(c, a.L.T("keep.said.edit.go"), k.Title, btnPrimary, t.ControlSM, t.Surface) {
							a.keepSend(k, "said", p.Change, false)
						}
						if a.buttonFor(c, a.L.T("keep.said.edit.only"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
							onlyWords(p.Said)
						}
					case p.OK:
						if a.buttonFor(c, a.L.T("keep.edit.save"), k.Title, btnPrimary, t.ControlSM, t.Surface) {
							onlyWords(p.Said)
						}
					default:
						if a.buttonFor(c, a.L.T("keep.said.edit.only"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
							onlyWords(p.Said)
						}
					}
					if a.buttonFor(c, a.L.T("keep.edit.cancel"), k.Title, btnText, t.ControlSM, t.Surface) {
						cancel()
					}
				})
			})
		case e.words:
			save := func() {
				v := strings.TrimSpace(e.said)
				if v == "" || e.reading {
					return
				}
				e.reading = true
				a.send(protocol.KeepWordsReq{T: "keep_words", ID: k.ID, Said: v})
			}
			ta := ui.TextArea(c.Key("words"), &e.said).Lines(2, 12).Label(a.L.T("keep.said.edit.about")).AutoFocus().
				Background(t.Surface).Border(1, t.LineSoft).Radius(t.RadiusSM).Padding(t.S2, t.S3).FontSize(t.SM).TextColor(t.Ink).
				OnTextKey(func(x ui.TextKey) bool {
					if x.Key == ui.KeyEscape {
						cancel()
						return true
					}
					return false
				})
			if e.reading {
				ta.TextColor(t.InkMuted)
			}
			ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Margin(8, 0, 0, 0).Children(func() {
				if e.reading {
					a.keepBreath(c)
					uiText(c.Key("read"), a.L.T("keep.said.edit.read")).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus)
					return
				}
				if a.buttonFor(c, a.L.T("keep.edit.save"), a.L.T("keep.said.edit.about"), btnPrimary, t.ControlSM, t.SurfaceSunken) {
					save()
				}
				ui.Box(c).Width(t.S1).Shrink(0)
				if a.buttonFor(c, a.L.T("keep.edit.cancel"), a.L.T("keep.said.edit.about"), btnText, t.ControlSM, t.SurfaceSunken) {
					cancel()
				}
			})
		default:
			uiText(c.Key("v"), keepWords(autospace(k.Said))).FontSize(t.SM).LineHeight(a.leading(1.6)).TextColor(t.InkSoft).AccessHidden(opens)
		}
	})
}

// keepBreath is a small dot that breathes while the words are read (1.6 s;
// still under reduced motion).
func (a *App) keepBreath(c *ui.Context) {
	t := a.T
	col := t.InkMuted
	if !c.Preferences().ReduceMotion {
		col = t.InkMuted.Mix(t.SurfaceSunken, waitBreath(c.Now()))
		c.After(50 * time.Millisecond)
	}
	ui.Box(c.Key("breath")).Size(8, 8).Radius(4).Background(col).Shrink(0).Margin(0, 4, 0, 2).AccessHidden(true)
}

// keepEditRound is a change among the rounds: its time and one sentence
// per field (the words say it was a change; no tag at the end).
func (a *App) keepEditRound(c *ui.Context, r protocol.KeepRound) {
	t := a.T
	a.timeCol(c, "t", store.ParseTime(r.At))
	ui.Column(c.Key("b")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
		for j, l := range a.keepEditLines(r.Edit) {
			uiText(c.Key(fmt.Sprint("l", j)), keepWords(autospace(l))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		}
	})
}

// editLine is D536's one-line field in an open rule row: it takes the keys
// at once, Enter saves and Escape cancels.
func (a *App) editLine(c *ui.Context, key, label string, v *string, placeholder string, save, cancel func()) {
	a.lineField(c, "edit:"+key, label, v, placeholder, false, nil).AutoFocus().OnTextKey(fieldKeys(save, cancel))
}
