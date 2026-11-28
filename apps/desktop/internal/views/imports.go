package views

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
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
	consent  string
	read     string
	remove   string
	busy     map[string]bool
	updating map[string]bool
	// D670: an install from an Available row, the second online tick, and the card that
	// opens once the installed row arrives.
	installing     map[string]bool
	online         map[string]bool
	pendingConsent map[string]bool
	// 加一个插件仓库: the form open, what is typed, and the repository asked to be removed.
	addRepo    bool
	repoURL    string
	removeRepo string
	err        map[string]string
	// The decoded app icons, keyed by their data URL.
	icons map[string]ui.ImageSource
	// offerSent is the line Past tasks drew once this visit (it fades from then on).
	offerSent bool
	// notice is the one thing the pane says after an action on a source (a removal or an update),
	// under the sources; repoNotice the same for a repository, under the repositories (D666).
	notice     string
	repoNotice string
}

func (a *App) importsInit() {
	s := &a.imports
	if s.busy == nil {
		s.busy = map[string]bool{}
	}
	if s.updating == nil {
		s.updating = map[string]bool{}
	}
	if s.installing == nil {
		s.installing = map[string]bool{}
	}
	if s.online == nil {
		s.online = map[string]bool{}
	}
	if s.pendingConsent == nil {
		s.pendingConsent = map[string]bool{}
	}
	if s.err == nil {
		s.err = map[string]string{}
	}
	for _, ans := range a.S.ImportAnswers {
		delete(s.busy, ans.ID)
		delete(s.updating, ans.ID)
		delete(s.installing, ans.ID)
		switch ans.Op {
		case "install":
			if ans.OK {
				s.pendingConsent[ans.ID] = true
				delete(s.online, ans.ID)
				delete(s.err, ans.ID)
			} else {
				s.err[ans.ID] = a.importError(ans.Error)
			}
			continue
		case "source_add":
			if ans.OK {
				s.addRepo = false
				s.repoURL = ""
				s.repoNotice = a.L.T("imports.repo.added")
				delete(s.err, "source")
			} else {
				s.repoNotice = ""
				s.err["source"] = a.importError(ans.Error)
			}
			continue
		case "source_remove":
			if ans.OK {
				s.removeRepo = ""
				s.repoNotice = a.L.T("imports.repo.removed")
				delete(s.err, "source")
			} else {
				s.repoNotice = ""
				s.err["source"] = a.importError(ans.Error)
			}
			continue
		}
		if ans.Op == "update" {
			if ans.OK {
				s.notice = a.L.T("imports.updated")
				if ans.UpToDate {
					s.notice = a.L.T("imports.update.upToDate")
				}
				if ans.NeedsConsent {
					delete(s.online, ans.ID)
					s.consent = ans.ID
				}
				delete(s.err, ans.ID)
			} else {
				s.err[ans.ID] = a.importError(ans.Error)
			}
			continue
		}
		if ans.Op == "remove" && ans.OK {
			s.notice = a.L.T("imports.removed")
			delete(s.err, ans.ID)
		} else if !ans.OK {
			s.err[ans.ID] = a.importError(ans.Error)
		} else {
			delete(s.err, ans.ID)
			// A run or a consent that went through is newer than the removal: its line no longer stands.
			if ans.Op != "remove" {
				s.notice = ""
			}
		}
	}
	a.S.ImportAnswers = nil
	if v := a.S.Imports; v != nil {
		for _, src := range v.Sources {
			if !src.Running {
				delete(s.busy, src.ID)
			}
			if s.pendingConsent[src.ID] {
				delete(s.pendingConsent, src.ID)
				s.consent = src.ID
			}
		}
	}
}

// importError is the answer's reason in the person's words, never the code.
func (a *App) importError(code string) string {
	switch code {
	case "not_consented", "no_lody", "signed_out", "needs_authorization", "already_running", "needs_newer", "sandbox_unavailable", "hash_mismatch", "broken", "plugin_failed", "not_found", "update_failed", "install_failed", "bad_url", "official_source", "already_added", "git_failed", "repo_failed":
		return a.L.T("imports.error." + code)
	}
	return a.L.T("imports.error.failed")
}

// importsSay is the partner's line at the top of the pane: what is true there now.
func (a *App) importsSay() string {
	v := a.S.Imports
	if v == nil {
		return ""
	}
	n := 0
	for _, s := range v.Sources {
		n += s.Imported
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
	// Said under the sources, where it happened; never a toast (D666).
	if a.imports.notice != "" {
		uiText(c.Key("import-notice"), a.imports.notice).FontSize(a.T.SM).LineHeight(a.leading(1.5)).TextColor(a.T.InkMuted).Padding(0, a.T.S5).Role(ui.RoleStatus)
	}
	if len(v.Available) > 0 {
		a.importAvailable(c, v.Available)
	}
	a.importRepositories(c)
}

// importStateWords is the row's state: how many, brought in when, what's new, or why not.
func (a *App) importStateWords(s protocol.ImportSourceRow) string {
	switch {
	case a.imports.updating[s.ID]:
		return a.L.T("imports.updating")
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
	case s.Kind == "plugin":
		return a.L.T("imports.state.plugin")
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

// importWhy is the manifest's own sentence in the person's language.
func (a *App) importWhy(w protocol.ImportWhy) string {
	byLang := map[string]string{"en": w.En}
	if w.Zh != "" {
		byLang["zh"] = w.Zh
	}
	return i18n.Pick(a.L, byLang)
}

// importIcon decodes a plugin's app icon (a data URL) once per frame. A bad one is no icon:
// the shared letter tile stays the fallback (D622).
func (a *App) importIcon(icon string) ui.ImageSource {
	if icon == "" {
		return nil
	}
	if a.imports.icons == nil {
		a.imports.icons = map[string]ui.ImageSource{}
	}
	if got, ok := a.imports.icons[icon]; ok {
		return got
	}
	var img ui.ImageSource
	if strings.HasPrefix(icon, "data:image/png;base64,") {
		if raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(icon, "data:image/png;base64,")); err == nil {
			if dec, _, err := image.Decode(bytes.NewReader(raw)); err == nil {
				img = ui.NewBitmap(dec)
			}
		}
	} else if strings.HasPrefix(icon, "data:image/svg+xml;base64,") {
		if raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(icon, "data:image/svg+xml;base64,")); err == nil {
			if svg, err := ui.ParseSVG(raw); err == nil {
				img = svg
			}
		}
	}
	a.imports.icons[icon] = img
	return img
}

// importTile is the app's own icon from its plugin in the shared clay tile, or the letter tile.
func (a *App) importTile(c *ui.Context, app, icon string, faded bool) func() {
	t := a.T
	return func() {
		if img := a.importIcon(icon); img != nil {
			ui.Image(c.Key("imptile:"+app), img).Size(40, 40).Radius(t.RadiusSM).AccessHidden(true)
			return
		}
		a.brandTile(c, app, faded)()
	}
}

// importRead is the literal read list and the consent card. It names every declared path, one
// line each; every command the reader starts and the manifest's own sentence; whether it goes
// online; and who made it. An unreviewed online reader makes the person tick the second line
// before 带进来 can be chosen.
func (a *App) importRead(c *ui.Context, key string, s protocol.ImportSourceRow, yes func(), no func()) {
	t := a.T
	ui.Column(c.Key("read:" + key)).Gap(t.S2).Children(func() {
		uiText(c.Key("title"), a.L.T("imports.consent.title")).FontSize(t.SM).FontWeight(700)
		for i, p := range s.Reads {
			uiText(c.Key(fmt.Sprintf("path:%d", i)), p).Font(t.Mono).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.Ink).Selectable()
		}
		if len(s.Uses) > 0 {
			for i, u := range s.Uses {
				ui.Column(c.Key(fmt.Sprintf("use:%d", i))).Gap(2).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
					uiText(c.Key("cmd"), u.Command).Font(t.Mono).FontSize(t.XS).TextColor(t.Ink).Selectable()
					uiText(c.Key("why"), a.importWhy(u.Why)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
					// An online use's own sentence says it goes online; only the offline boundary is added.
					if !u.Online {
						uiText(c.Key("net"), a.L.T("imports.consent.nonet")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
					}
				})
			}
		} else {
			uiText(c.Key("nonet"), a.L.T("imports.consent.nonet")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		}
		uiText(c.Key("past"), a.L.T("imports.consent.past")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		if s.NeedsOnlineConsent {
			ticked := a.imports.online[s.ID]
			ui.Checkbox(c.Key("online"), &ticked, a.L.T("imports.consent.online.unreviewed")).Changed()
			a.imports.online[s.ID] = ticked
		}
		made := a.L.T("imports.consent.made.official")
		if s.Added {
			made = a.L.T("imports.consent.made.plugin", s.Author)
		}
		uiText(c.Key("made"), made).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		if yes != nil && (!s.NeedsOnlineConsent || a.imports.online[s.ID]) {
			ui.Row(c.Key("go")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("imports.consent.go"), a.L.T("imports.consent.title"), btnPrimary, t.ControlSM, t.Surface) {
					yes()
				}
				if a.quietButton(c, "read-no:"+key, a.L.T("imports.consent.no"), a.L.T("imports.consent.title"), false, 0) {
					no()
				}
			})
			uiText(c.Key("once"), a.L.T("imports.consent.once")).FontSize(t.XS).TextColor(t.InkMuted)
		} else if yes != nil {
			if a.quietButton(c, "read-no:"+key, a.L.T("imports.consent.no"), a.L.T("imports.consent.title"), false, 0) {
				no()
			}
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
		a.headRow(c, "imp:"+s.ID, a.importTile(c, s.App, s.Icon, s.State != "ready"), s.App, a.importStateWords(s), tone, func() {
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				busy := st.busy[s.ID] || s.Running || st.updating[s.ID]
				if s.Update != nil && !busy && st.consent != s.ID && st.remove != s.ID {
					if a.buttonFor(c, a.L.T("imports.update"), s.App, btnSecondary, t.ControlSM, t.Surface) {
						st.updating[s.ID] = true
						a.send(protocol.ImportUpdateReq{T: "import_update", ID: s.ID})
					}
				}
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
				} else if s.State != "ready" && s.State != "looking" {
					// Any source that can't be read right now (signed out, not authorized, missing,
					// failed, a plugin that can't run) gets the one way to ask again, not only a failed
					// read; a ready row that is busy has nothing to retry.
					if a.buttonFor(c, a.L.T("imports.retry"), s.App, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.ImportsReq{T: "imports"})
					}
				}
				a.menuDots(c, "imp-more:"+s.ID, a.L.T("imports.more"), func(mn *ui.Menu) {
					// The full repository address, only in the ⋯ (the row shows its short name).
					if s.Repo != "" {
						mn.Item(s.Repo).Disabled(true)
						mn.Separator()
					}
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
		if s.Official || s.Repo != "" || s.Added || s.Unreviewed || s.Reviewed {
			a.textBlock(c, "imp-meta:"+s.ID, func() {
				ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
					if s.Repo != "" {
						src := s.SourceName
						if s.Official {
							src = a.L.T("imports.avail.official")
						}
						uiText(c.Key("src"), src).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Tooltip(s.Repo)
					}
					if s.Added {
						uiText(c.Key("added"), a.L.T("imports.added")).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
					}
					if s.Unreviewed {
						uiText(c.Key("unreviewed"), a.L.T("imports.unreviewed")).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.Ink)
					}
					if s.Reviewed {
						uiText(c.Key("reviewed"), a.L.T("imports.reviewed")).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
					}
				})
			})
		}
		if st.read == s.ID {
			a.textBlock(c, "imp-read:"+s.ID, func() { a.importRead(c, s.ID, s, nil, nil) })
		}
		if st.consent == s.ID {
			a.textBlock(c, "imp-consent:"+s.ID, func() {
				a.importRead(c, s.ID, s, func() {
					st.consent = ""
					st.busy[s.ID] = true
					a.send(protocol.ImportConsentReq{T: "import_consent", ID: s.ID, Online: s.Online})
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
					skip := a.L.T("imports.last.skipped", fmt.Sprint(s.Last.Skipped))
					if s.Last.Skipped == 1 {
						skip = a.L.T("imports.last.skipped.one")
					}
					uiText(c.Key("skip"), skip).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
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

// importAvailable is the quiet Available list under the installed rows: one line per plugin a
// repository lists, detected apps first, its app icon, its name, where it comes from, and 带进来.
func (a *App) importAvailable(c *ui.Context, list []protocol.ImportAvailable) {
	a.group(c, "import-available", a.L.T("imports.avail.title"), a.L.T("imports.avail.lede"), func() {
		for _, p := range list {
			a.importAvailableRow(c, p)
		}
	})
}

func (a *App) importAvailableRow(c *ui.Context, p protocol.ImportAvailable) {
	t := a.T
	st := &a.imports
	busy := st.installing[p.ID]
	a.sep(c)
	ui.Row(c.Key("avail:"+p.ID)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.tileCol(c, a.importTile(c, p.App, p.Icon, false))
		a.wordsThenControl(c, func() {
			// Line one: the app, its version as its own muted element, and a detected tag.
			ui.Row(c.Key("name")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				uiText(c.Key("app"), keepClauses(p.App)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
				uiText(c.Key("ver"), a.L.T("imports.avail.version", p.Version)).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				if p.Detected {
					a.tag(c, "detected:"+p.ID, a.L.T("imports.avail.detected"), tagPlain)
				}
			})
			// Line two: where it comes from (short name, the full URL its tooltip) and its check.
			ui.Row(c.Key("meta")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				src := p.SourceName
				if p.Official {
					src = a.L.T("imports.avail.official")
				}
				uiText(c.Key("src"), src).Font(t.Body).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Tooltip(p.SourceURL)
				review := a.L.T("imports.unreviewed")
				reviewInk := t.Ink
				if p.Reviewed {
					review = a.L.T("imports.reviewed")
					reviewInk = t.InkMuted
				}
				uiText(c.Key("review"), review).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(reviewInk)
			})
		}, func() {
			label := a.L.T("imports.bring")
			if busy {
				label = a.L.T("imports.avail.installing")
			}
			ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, label, p.App, btnSecondary, t.ControlSM, t.Surface) && !busy {
					st.installing[p.ID] = true
					delete(st.err, p.ID)
					a.send(protocol.ImportInstallReq{T: "import_install", Source: p.Source, ID: p.ID})
				}
				// The full repository address, only in the ⋯ (the row shows its short name).
				a.menuDots(c, "avail-more:"+p.ID, a.L.T("imports.more"), func(mn *ui.Menu) {
					mn.Item(p.SourceURL).Disabled(true)
				})
			})
		})
	})
	if st.err[p.ID] != "" {
		a.textBlock(c, "avail-err:"+p.ID, func() {
			uiText(c, st.err[p.ID]).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
		})
	}
}

// importRepositories is 插件仓库: the official source as its own quiet row, the person's sources
// with a removal that says what stays, and the one field that adds another.
func (a *App) importRepositories(c *ui.Context) {
	t := a.T
	st := &a.imports
	v := a.S.Imports
	a.group(c, "import-repos", a.L.T("imports.repo.title"), a.L.T("imports.repo.lede"), func() {
		for _, r := range v.Repositories {
			a.importRepoRow(c, r)
		}
		a.textBlock(c, "import-repo-add", func() {
			if st.addRepo {
				url := st.repoURL
				ui.Column(c.Key("add")).Gap(t.S2).Children(func() {
					uiText(c.Key("label"), a.L.T("imports.repo.field")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
					ui.TextInput(c.Key("repo-url"), &url).Placeholder("https://github.com/you/your-plugins").Label(a.L.T("imports.repo.field")).
						Font(t.Mono).FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).
						Background(t.SurfaceSunken).Border(1, t.LineSoft)
					st.repoURL = url
					ui.Row(c.Key("btns")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						if a.buttonFor(c, a.L.T("imports.repo.submit"), a.L.T("imports.repo.title"), btnPrimary, t.ControlSM, t.Surface) && strings.TrimSpace(st.repoURL) != "" {
							a.send(protocol.ImportSourceAddReq{T: "import_source_add", URL: strings.TrimSpace(st.repoURL)})
						}
						if a.quietButton(c, "repo-close", a.L.T("imports.repo.close"), a.L.T("imports.repo.title"), false, 0) {
							st.addRepo = false
						}
					})
				})
			} else if a.quietButton(c, "repo-add", a.L.T("imports.repo.add"), a.L.T("imports.repo.title"), false, 0) {
				st.addRepo = true
			}
			if st.repoNotice != "" {
				uiText(c.Key("repo-notice"), st.repoNotice).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Role(ui.RoleStatus)
			}
			if st.err["source"] != "" {
				uiText(c.Key("err"), st.err["source"]).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			}
		})
	})
}

func (a *App) importRepoRow(c *ui.Context, r protocol.ImportRepository) {
	t := a.T
	st := &a.imports
	count := a.L.T("imports.repo.looking")
	if r.Plugins != nil {
		count = a.L.T("imports.repo.count", fmt.Sprint(*r.Plugins))
		if *r.Plugins == 1 {
			count = a.L.T("imports.repo.count.one")
		}
	}
	a.textBlock(c, "repo:"+r.ID, func() {
		if r.Official {
			uiText(c.Key("name"), a.L.T("imports.repo.official")).FontSize(t.SM).FontWeight(700).LineHeight(a.leading(1.5))
			uiText(c.Key("url"), r.URL).Font(t.Mono).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Selectable()
			uiText(c.Key("count"), count).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			return
		}
		uiText(c.Key("url"), r.URL).Font(t.Mono).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.Ink).Selectable()
		ui.Row(c.Key("foot")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			uiText(c.Key("count"), count).FontSize(t.XS).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0)
			if st.removeRepo == r.ID {
				if a.quietButton(c, "repo-remove-no:"+r.ID, a.L.T("imports.remove.no"), r.URL, false, 0) {
					st.removeRepo = ""
				}
				if a.dangerText(c, "repo-remove-yes:"+r.ID, a.L.T("imports.remove.yes"), r.URL) {
					st.removeRepo = ""
					a.send(protocol.ImportSourceRemoveReq{T: "import_source_remove", ID: r.ID})
				}
			} else if a.quietButton(c, "repo-remove:"+r.ID, a.L.T("imports.repo.remove"), r.URL, false, 0) {
				st.removeRepo = r.ID
			}
		})
		if st.removeRepo == r.ID {
			uiText(c.Key("ask"), a.L.T("imports.repo.remove.ask")).FontSize(t.XS).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
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
