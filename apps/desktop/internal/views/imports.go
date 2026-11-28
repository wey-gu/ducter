package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// 设置 › 导入 / Import (D655, research/246 §3.10, §3.11): what the person did in other apps,
// brought into 做过的事 / Past tasks, read only. One source per row: its picture and name, its state
// ({n} 段对话 / 带进来的 {day} / 有新的 {k} 段), 带进来 or 再带一次, and a ⋯ menu with 看看它读什么 and
// 删掉这个来源. The consent card says every fact literally, once. A source that can't be read says
// why in plain words (no lody, not signed in, an encrypted workspace this computer isn't
// authorized for). Removal hides what it brought in, after saying what will be hidden.

// TabImport is 导入 / Import.
const TabImport = "import"

// The rail's art: a page of lines, things carried in (the same as the web's).
const importsArt = "wait_file"

type importsState struct {
	// consent is the source whose consent card is open; read, its read list; remove, its ask.
	consent string
	read    string
	remove  string
	busy    map[string]bool
	err     map[string]string
	// offerSent is the line Past tasks drew once this visit (it fades from then on).
	offerSent bool
	// notice is the one thing the pane says after an action (a removal happened).
	notice string
}

func (a *App) importsInit() {
	s := &a.imports
	if s.busy == nil {
		s.busy = map[string]bool{}
	}
	if s.err == nil {
		s.err = map[string]string{}
	}
	for _, ans := range a.S.ImportAnswers {
		delete(s.busy, ans.ID)
		if ans.Op == "remove" && ans.OK {
			s.notice = a.L.T("imports.removed")
			delete(s.err, ans.ID)
		} else if !ans.OK {
			s.err[ans.ID] = a.importError(ans.Error)
		} else {
			delete(s.err, ans.ID)
		}
	}
	a.S.ImportAnswers = nil
	if v := a.S.Imports; v != nil {
		for _, src := range v.Sources {
			if !src.Running {
				delete(s.busy, src.ID)
			}
		}
	}
}

// importError is the answer's reason in the person's words, never the code.
func (a *App) importError(code string) string {
	switch code {
	case "not_consented", "no_lody", "signed_out", "needs_authorization", "already_running":
		return a.L.T("imports.error." + code)
	}
	return a.L.T("imports.error.failed")
}

// importsSay is the partner's line at the top of the pane: what is true there now.
func (a *App) importsSay() string {
	n := 0
	if v := a.S.Imports; v != nil {
		for _, s := range v.Sources {
			n += s.Imported
		}
	}
	switch n {
	case 0:
		return a.L.T("say.import")
	case 1:
		return a.L.T("say.import.one")
	}
	return a.L.T("say.import.n", fmt.Sprint(n))
}

func (a *App) importsPanel(c *ui.Context) {
	a.importsInit()
	a.panelHead(c, TabImport, a.L.T("imports.lede"))
	a.ledeNote(c, "imports-where", a.L.T("imports.where"))
	v := a.S.Imports
	if v == nil {
		a.paneWait(c, "import", a.L.T("imports.state.looking"))
		return
	}
	for _, s := range v.Sources {
		a.importGroup(c, s)
	}
	if a.imports.notice != "" {
		uiText(c.Key("import-notice"), a.imports.notice).FontSize(a.T.SM).LineHeight(a.leading(1.5)).TextColor(a.T.InkMuted).Padding(0, a.T.S5)
	}
}

// importStateWords is the row's state: how many, brought in when, what's new, or why not.
func (a *App) importStateWords(s protocol.ImportSourceRow) string {
	switch {
	case s.Running:
		return a.L.T("imports.bringing")
	case s.State == "looking":
		return a.L.T("imports.state.looking")
	case s.State != "ready":
		if s.Problem != "" {
			return a.L.T("imports.problem." + s.Problem)
		}
		return a.L.T("imports.problem.failed")
	case s.Fresh != nil && *s.Fresh > 0:
		if *s.Fresh == 1 {
			return a.L.T("imports.state.fresh.one")
		}
		return a.L.T("imports.state.fresh", fmt.Sprint(*s.Fresh))
	case s.Imported > 0 && s.ImportedDay != "":
		return a.L.T("imports.state.brought", a.importDay(s.ImportedDay))
	case s.Total != nil:
		if *s.Total == 1 {
			return a.L.T("imports.state.total.one")
		}
		return a.L.T("imports.state.total", fmt.Sprint(*s.Total))
	}
	return a.L.T("imports.state.looking")
}

// importDay writes the source's YYYY-MM-DD as people say it, the same words as the web.
func (a *App) importDay(day string) string {
	if day == "" {
		return ""
	}
	at, err := time.ParseInLocation("2006-01-02", day, time.Local)
	if err != nil {
		return day
	}
	return i18n.Day(a.L.Lang, at, a.Now())
}

// importRead is the literal read list, the consent card with its two buttons when yes is set.
func (a *App) importRead(c *ui.Context, key string, yes func(), no func()) {
	t := a.T
	ui.Column(c.Key("read:" + key)).Gap(t.S2).Children(func() {
		uiText(c.Key("title"), a.L.T("imports.consent.title")).FontSize(t.SM).FontWeight(700)
		ui.Row(c.Key("path")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			uiText(c, "•").FontSize(t.SM).TextColor(t.InkMuted)
			uiText(c, a.L.T("imports.consent.path")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		})
		uiText(c.Key("command"), a.L.T("imports.consent.command")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		uiText(c.Key("past"), a.L.T("imports.consent.past")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		uiText(c.Key("made"), a.L.T("imports.consent.made")).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		if yes != nil {
			ui.Row(c.Key("go")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("imports.consent.go"), a.L.T("imports.consent.path"), btnPrimary, t.ControlSM, t.Surface) {
					yes()
				}
				if a.quietButton(c, "read-no:"+key, a.L.T("imports.consent.no"), a.L.T("imports.consent.path"), false, 0) {
					no()
				}
			})
			uiText(c.Key("once"), a.L.T("imports.consent.once")).FontSize(t.XS).TextColor(t.InkMuted)
		}
	})
}

// importGroup is one source's raised group.
func (a *App) importGroup(c *ui.Context, s protocol.ImportSourceRow) {
	t := a.T
	st := &a.imports
	a.group(c, "import:"+s.ID, "", "", func() {
		tone := sideMuted
		if s.State != "ready" && s.State != "looking" {
			tone = sideFailed
		}
		a.headRow(c, "imp:"+s.ID, a.brandTile(c, s.ID, s.State != "ready"), s.App, a.importStateWords(s), tone, func() {
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				busy := st.busy[s.ID] || s.Running
				if s.State == "ready" && !busy && st.consent != s.ID && st.remove != s.ID {
					label := a.L.T("imports.bring")
					if s.Imported > 0 {
						label = a.L.T("imports.again")
					}
					kind := btnPrimary
					if s.Imported > 0 {
						kind = btnSecondary
					}
					if a.buttonFor(c, label, s.App, kind, t.ControlSM, t.Surface) && !busy {
						if !s.Consented {
							st.consent = s.ID
						} else {
							st.busy[s.ID] = true
							a.send(protocol.ImportRunReq{T: "import_run", ID: s.ID})
						}
					}
				} else if s.State == "failed" {
					if a.buttonFor(c, a.L.T("imports.retry"), s.App, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.ImportsReq{T: "imports"})
					}
				}
				a.menuDots(c, "imp-more:"+s.ID, a.L.T("imports.more"), func(mn *ui.Menu) {
					what := a.L.T("imports.what")
					if st.read == s.ID {
						what = a.L.T("imports.details.close")
					}
					if mn.Item(what).Chosen() {
						if st.read == s.ID {
							st.read = ""
						} else {
							st.read = s.ID
						}
					}
					mn.Separator()
					if mn.Item(a.L.T("imports.remove")).Danger().Chosen() {
						st.remove = s.ID
					}
				})
			})
		})
		if s.State == "ready" && len(s.Waiting) > 0 {
			a.textBlock(c, "imp-wait:"+s.ID, func() {
				uiText(c, a.L.T("imports.waiting", strings.Join(s.Waiting, a.L.T("acct.sep")))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			})
		}
		if st.read == s.ID {
			a.textBlock(c, "imp-read:"+s.ID, func() { a.importRead(c, s.ID, nil, nil) })
		}
		if st.consent == s.ID {
			a.textBlock(c, "imp-consent:"+s.ID, func() {
				a.importRead(c, s.ID, func() {
					st.consent = ""
					st.busy[s.ID] = true
					a.send(protocol.ImportConsentReq{T: "import_consent", ID: s.ID})
				}, func() { st.consent = "" })
			})
		}
		if st.err[s.ID] != "" {
			a.textBlock(c, "imp-err:"+s.ID, func() {
				uiText(c, st.err[s.ID]).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			})
		}
		if s.Last != nil && !s.Running {
			a.textBlock(c, "imp-last:"+s.ID, func() {
				line := a.L.T("imports.last.none")
				if s.Last.Threads == 1 {
					line = a.L.T("imports.last.one", a.importDay(s.Last.Oldest))
				} else if s.Last.Threads > 1 {
					line = a.L.T("imports.last", fmt.Sprint(s.Last.Threads), a.importDay(s.Last.Oldest))
				}
				uiText(c.Key("line"), line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				if s.Last.Skipped > 0 {
					uiText(c.Key("skip"), a.L.T("imports.last.skipped", fmt.Sprint(s.Last.Skipped))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
				if s.Last.Stopped {
					uiText(c.Key("stop"), a.L.T("imports.last.stopped")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
			})
		}
		if st.remove == s.ID {
			ask := a.L.T("imports.remove.ask.none")
			switch {
			case s.Imported == 1:
				ask = a.L.T("imports.remove.ask.one")
			case s.Imported > 1:
				ask = a.L.T("imports.remove.ask", fmt.Sprint(s.Imported))
			}
			keep, rm := a.confirmRow(c, "imp-remove:"+s.ID, ask, a.L.T("imports.remove.no"), a.L.T("imports.remove.yes"), s.App)
			if keep {
				st.remove = ""
			}
			if rm {
				st.remove = ""
				a.send(protocol.ImportRemoveReq{T: "import_remove", ID: s.ID})
			}
		}
	})
}

// pastImportOffer is Past tasks' one quiet line under 也在这台电脑上 / Also on this computer: a
// source is here, nothing was brought in yet. It fades (D453); 先不 waits for the person to
// mention the app, and 带进来 opens the same consent card in Settings.
func (a *App) pastImportOffer(c *ui.Context) {
	t := a.T
	v := a.S.Imports
	if v == nil || v.Offer == nil {
		return
	}
	o := v.Offer
	if !a.imports.offerSent {
		a.imports.offerSent = true
		a.send(protocol.ImportOfferReq{T: "import_offer", ID: o.ID, Action: "seen"})
	}
	words := a.L.T("imports.offer.none")
	if o.Total != nil {
		if *o.Total == 1 {
			words = a.L.T("imports.offer.one")
		} else {
			words = a.L.T("imports.offer", fmt.Sprint(*o.Total))
		}
	}
	ui.Row(c.Key("past-import-offer:"+o.ID)).Gap(t.S3).Padding(t.S3, t.S2, t.S3, t.S2).AlignItems(ui.Center).Children(func() {
		uiText(c, words).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink).Grow(1).Basis(0).MinWidth(0)
		ui.Row(c).Shrink(0).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			if a.quietButton(c, "imp-offer-go:"+o.ID, a.L.T("imports.offer.go"), o.App, false, 0) {
				a.imports.consent = o.ID
				a.openTab(TabImport)
			}
			if a.quietButton(c, "imp-offer-no:"+o.ID, a.L.T("imports.offer.no"), o.App, false, 0) {
				a.send(protocol.ImportOfferReq{T: "import_offer", ID: o.ID, Action: "decline"})
			}
		})
	})
}
