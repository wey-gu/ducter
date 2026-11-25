package views

// D465: Settings › 记忆's asks from Nowledge Mem: two memories Mem found may
// disagree, a rule it learned from how the person works; the rest stays in
// Mem, said once, never counted. D569: Mem's own bookkeeping, never a needs-you:
// one quiet row, 「Nowledge Mem 有 n 处拿不定」 with 看看; open, each ask with the
// partner's suggestion (the model's judgement over Mem's facts, core
// mem-check.ts) as its default and its reason, every answer still one tap, and
// 按建议都处理 / Take the suggestions for all of them. And 「你的 AI 都照着做的」 / "What all your
// AI tools follow": the rules on in Mem, each one tap (asked first) to turn off.
// The web's: apps/web/src/memory.tsx MemCheckSec, MemRules.

import (
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// memSettle settles one of Mem's asks (or turns an on rule off): it leaves the
// page at once (a rule turned on joins the rules on), the partner says so once
// under the section; mem_answered brings a line back if Mem refused.
func (a *App) memSettle(id, answer string) {
	if m := a.S.Mem; m != nil && m.Check != nil {
		ck := m.Check
		var asks []protocol.MemCheckItem
		var ask *protocol.MemCheckItem
		for i := range ck.Asks {
			if ck.Asks[i].ID == id {
				x := ck.Asks[i]
				ask = &x
				continue
			}
			asks = append(asks, ck.Asks[i])
		}
		ck.Asks = asks
		switch {
		case answer == "not":
			var rules []protocol.MemRule
			for _, r := range ck.Rules {
				if r.ID != id {
					rules = append(rules, r)
				}
			}
			ck.Rules = rules
		case answer == "use" && ask != nil && ask.Title != "":
			ck.Rules = append([]protocol.MemRule{{ID: id, Title: ask.Title, Body: ask.Body}}, ck.Rules...)
		}
	}
	if a.S.MemSettleFailed == id {
		a.S.MemSettleFailed = ""
	}
	a.send(protocol.MemAnswer{T: "mem_answer", ID: id, Answer: answer})
}

// memCheckAnswers is an ask's suggestion, said, then its answers: the suggested
// one first as the secondary clay, the others quiet (the group's one primary is
// 按建议都处理). The partner's reason when it judged; else Mem's own, named so.
func (a *App) memCheckAnswers(c *ui.Context, it protocol.MemCheckItem) {
	t := a.T
	about := it.Title
	if about == "" {
		var ts []string
		for _, p := range it.Pair {
			ts = append(ts, p.Title)
		}
		about = strings.Join(ts, " / ")
	}
	if it.Suggest != "" {
		ui.Column(c.Key("mck-adv:" + it.ID)).Gap(2).Children(func() {
			key := "mem.check.mems"
			if it.Why != "" {
				key = "mem.check.mine"
			}
			uiText(c, a.L.T(key, a.L.T("mem.check."+it.Suggest))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).LineHeight(a.leading(1.45))
			if it.Why != "" {
				uiText(c, autospace(it.Why)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			}
		})
	}
	ui.Row(c.Key("mck-acts:" + it.ID)).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		// The suggestion first on the left (D543).
		answers := make([]string, 0, len(it.Answers))
		for _, ans := range it.Answers {
			if ans == it.Suggest {
				answers = append(answers, ans)
			}
		}
		for _, ans := range it.Answers {
			if ans != it.Suggest {
				answers = append(answers, ans)
			}
		}
		for _, ans := range answers {
			kind := btnText
			if ans == it.Suggest {
				kind = btnSecondary
			}
			if a.buttonFor(c, a.L.T("mem.check."+ans), about, kind, t.ControlSM, t.Surface) {
				a.memSettle(it.ID, ans)
				a.say("mem-check", a.L.T("said.mem.check."+ans))
			}
		}
	})
}

// memTakeSuggestions answers every ask that has a suggestion as suggested,
// one Mem answer each, and says so once (D569).
func (a *App) memTakeSuggestions(asks []protocol.MemCheckItem) {
	var todo []protocol.MemCheckItem
	for _, it := range asks {
		if it.Suggest != "" && slicesContains(it.Answers, it.Suggest) {
			todo = append(todo, it)
		}
	}
	for _, it := range todo {
		a.memSettle(it.ID, it.Suggest)
	}
	switch {
	case len(todo) == 1:
		a.say("mem-check", a.L.T("said.mem.check.all.one"))
	case len(todo) > 1:
		a.say("mem-check", a.L.T("said.mem.check.all", len(todo)))
	}
}

func slicesContains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// memCheck is what Nowledge Mem couldn't settle by itself (D465, D569): one
// quiet row that opens in place; nothing waiting: no section.
func (a *App) memCheck(c *ui.Context) {
	t := a.T
	m := a.S.Mem
	if m == nil || m.Check == nil || (len(m.Check.Asks) == 0 && !m.Check.More) {
		return
	}
	ck := m.Check
	ps := &a.memPage
	n := len(ck.Asks)
	open := ps.checkOpen && n > 0
	suggested := 0
	for _, it := range ck.Asks {
		if it.Suggest != "" {
			suggested++
		}
	}
	defer a.saidLine(c, "mem-check")
	a.group(c, "mem-check", "", "", func() {
		if n > 0 {
			title := a.L.T("mem.check.unsure", n)
			if n == 1 {
				title = a.L.T("mem.check.unsure.one")
			}
			look := a.L.T("mem.check.look")
			chev := 1
			if open {
				look, chev = a.L.T("mem.check.fold"), 2
			}
			a.tileRow(c, "mem-check-row", a.pebbleTile(c), title, a.L.T("mem.check.line"), func() {
				if a.quietButton(c, "mem-check-look", look, a.L.T("mem.check.title"), false, chev) {
					ps.checkOpen = !open
				}
			})
		}
		if open && suggested > 0 {
			a.textBlock(c, "mck-all", func() {
				ui.Row(c.Key("mck-all-row")).Children(func() {
					if a.buttonFor(c, a.L.T("mem.check.take"), a.L.T("mem.check.title"), btnPrimary, t.ControlSM, t.Surface) {
						a.memTakeSuggestions(ck.Asks)
						ps.checkOpen = false
					}
				})
			})
		}
		for _, it := range ck.Asks {
			if !open {
				break
			}
			it := it
			a.textBlock(c, "mck:"+it.ID, func() {
				if it.Kind == "rule" {
					uiText(c, a.L.T("mem.check.rule")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
					uiText(c, autospace(it.Title)).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).LineHeight(a.leading(1.4))
					if it.Body != "" {
						uiText(c, autospace(it.Body)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
					}
				} else {
					uiText(c, a.L.T("mem.check.contra")).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).LineHeight(a.leading(1.4))
					for i, p := range it.Pair {
						when := "mem.check.earlier"
						if i > 0 {
							when = "mem.check.later"
						}
						ui.Column(c.Key("mck-p:"+it.ID+when)).Gap(2).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).Children(func() {
							uiText(c, a.L.T(when)).FontSize(t.SM).TextColor(t.InkMuted)
							uiText(c, autospace(p.Title)).FontSize(t.MD).TextColor(t.Ink).LineHeight(a.leading(1.45))
						})
					}
				}
				if a.S.MemSettleFailed == it.ID {
					uiText(c, a.L.T("mem.check.failed")).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.5))
				}
				a.memCheckAnswers(c, it)
			})
		}
		if len(ck.Asks) == 0 {
			a.tileRow(c, "mem-check-clear", a.pebbleTile(c), a.L.T("mem.check.clear"), "", nil)
		}
		if ck.More && (open || n == 0) {
			a.footRow(c, "mem-check", a.L.T("mem.check.more"), func() {
				if a.quietLink(c, "mem-check-open", a.L.T("mem.all.open"), a.L.T("mem.all.open")) {
					a.openLink(memSite)
				}
			})
		}
	})
}

// memRules is the rules on in Nowledge Mem (D465): every AI tool connected to it
// reads them at a new conversation, the partner too; each one tap to turn off, asked first.
func (a *App) memRules(c *ui.Context) {
	m := a.S.Mem
	if m == nil || m.Check == nil || len(m.Check.Rules) == 0 {
		return
	}
	ps := &a.memPage
	defer a.saidLine(c, "mem-rules")
	a.group(c, "mem-rules", a.L.T("mem.rules.title"), "", func() {
		for _, r := range m.Check.Rules {
			r := r
			if ps.ruleOff == r.ID {
				keep, goOn := a.confirmRow(c, "mrule:"+r.ID, a.L.T("mem.rules.off.ask", r.Title), a.L.T("mem.forget.keep"), a.L.T("mem.rules.off"), r.Title)
				if keep {
					ps.ruleOff = ""
				}
				if goOn {
					ps.ruleOff = ""
					a.memSettle(r.ID, "not")
					a.say("mem-rules", a.L.T("said.mem.rules.off", r.Title))
				}
				continue
			}
			a.tileRow(c, "mrule:"+r.ID, nil, autospace(r.Title), autospace(r.Body), func() {
				if a.quietButton(c, "mrule-off:"+r.ID, a.L.T("mem.rules.off"), r.Title, false, 0) {
					ps.ruleOff = r.ID
				}
			})
		}
		a.footRow(c, "mem-rules", a.L.T("mem.rules.note", a.personaName()), nil)
	})
}
