package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D285's Mac screens, zh and en, against the fixture's forty tasks:
//
//	DUCTER_PAST_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d285 go test ./internal/views -run PastShots
//
// browsing at 1280×820 and 900×700, the search "flaky" with its hits, the
// marks popover open, a hovered card, and On hand's end line.
func TestPastShots(t *testing.T) {
	if os.Getenv("DUCTER_PAST_SHOTS") == "" {
		t.Skip("DUCTER_PAST_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		items := pastItems(pastSeeds())
		if lang == i18n.EN {
			items = pastEnglish(items)
		}
		tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, w, h int) {
			t.Helper()
			tt.SetSize(w, h)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-past-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		app.OpenPast("")
		app.Receive(pastResult(items, ""))
		app.past.focusField = false
		shot("browse", 1280, 820)
		shot("browse-narrow", 900, 700)
		// A card with the keys on it: lifted, its actions shown.
		app.past.focus = "t_wal"
		shot("focus", 1280, 820)
		// The marks popover on the renamed, starred one.
		app.past.focus = ""
		if it := app.pastItem("t_kyoto"); it != nil {
			app.openMarks(it, false)
			app.past.focus = "t_kyoto"
		}
		shot("marks", 1280, 900)
		app.closeMarks()
		app.past.focus = ""
		// The search "flaky".
		app.past.q = "flaky"
		flaky := pastFlaky()
		if lang == i18n.EN {
			flaky = pastEnglish(flaky)
		}
		app.Receive(pastResult(flaky, ""))
		shot("search", 1280, 820)
		shot("search-narrow", 900, 700)
		// Time words: what they meant, said under the field.
		app.past.q = "上周二"
		if lang == i18n.EN {
			app.past.q = "last tuesday"
		}
		r := pastResult(items[13:16], "")
		r.Past.Range = &protocol.PastRange{Since: "2026-11-10T00:00:00+08:00", Before: "2026-11-11T00:00:00+08:00", Words: app.past.q}
		app.Receive(r)
		shot("range", 1280, 820)
		// Nothing found; and nothing finished yet.
		app.past.q = "kubernetes"
		app.Receive(pastResult(nil, ""))
		shot("none", 1280, 820)
		app.past.q = ""
		app.Receive(pastResult(nil, ""))
		shot("empty", 1280, 820)
		// On hand: its quiet last line.
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
			{TaskID: "t_on1", Title: pastWord(lang, "Compaction 调度的退避参数", "Back-off for the compaction scheduler"), Project: "hawdb", Harness: "claude-code", Attention: protocol.Working, OpenedAt: pastNow.Add(-20 * time.Minute).UTC().Format(time.RFC3339), UpdatedAt: pastNow.UTC().Format(time.RFC3339)},
			{TaskID: "t_on2", Title: pastWord(lang, "订京都的酒店", "Book a hotel in Kyoto"), Harness: "codex", Attention: protocol.Done, OpenedAt: pastNow.Add(-3 * time.Hour).UTC().Format(time.RFC3339), UpdatedAt: pastNow.Add(-time.Hour).UTC().Format(time.RFC3339),
				LastReport: &protocol.Report{Summary: pastWord(lang, "订好了 Hotel Kanra Kyoto，12 月 3 日到 6 日。", "Booked Hotel Kanra Kyoto, Dec 3 to 6.")}},
		}}})
		app.Route = RouteOnHand
		shot("onhand-end", 1280, 820)
		// New task from this: the chip in the sheet.
		app.Route = RoutePast
		app.Receive(pastResult(items, ""))
		if it := app.pastItem("t_flaky"); it != nil {
			app.pastSeed(it)
		}
		shot("seed", 1280, 820)
	}
}

func pastWord(lang i18n.Lang, zh, en string) string {
	if lang == i18n.EN {
		return en
	}
	return zh
}

// pastEnglish gives the fixture its English words, by task.
func pastEnglish(items []protocol.PastItem) []protocol.PastItem {
	en := map[string][2]string{
		"t_flaky":       {"Why the compaction test fails now and then", "Two goroutines in TestCompactionRace shared one fake clock; with one each it passed 500 runs in a row."},
		"t_kyoto":       {"Book a hotel in Kyoto", "Booked Hotel Kanra Kyoto, Dec 3 to 6, three nights with breakfast, free to cancel until Nov 30."},
		"t_wal":         {"Skip a torn tail record when replaying the WAL", "Replay now cuts a tail record with a bad checksum and logs one warning; three new cases."},
		"t_digest":      {"Add 20 real conversations to the memory digest eval", "Added 20; recall went from 0.81 to 0.84, two long ones still miss the date."},
		"t_dentist":     {"Call the dentist to move it to next Wednesday", "Moved to Wednesday Nov 25, 10:30; they will text to confirm."},
		"t_mac_icon":    {"The menu bar icon is too faint in dark mode", "Now a template image: as bright as the system's icons in light and dark."},
		"t_release":     {"Write the 0.0.60 release notes", "Written and posted to GitHub Releases; the website's updates page follows."},
		"t_bloom":       {"Bloom filter false positives higher than expected", "No root cause: another hash didn't change the rate; the test data's spread is the suspect."},
		"t_sync":        {"Mem sync uploads twice after going offline", "Compares the local etag before uploading; no repeats after reconnecting, with an integration test."},
		"t_review_pr":   {"Review Weizhen's compaction scheduling PR", "Six comments, mainly that the back-off is too eager when L0 piles up; the rest can go in."},
		"t_onboard":     {"Words for the first-open welcome", "Three lines in each language, saying what it does instead of “agent”."},
		"t_gift":        {"Pick a birthday present for Mom", "Three picks: a cashmere scarf, a tea set, a photo book; links and prices in the report."},
		"t_bench":       {"Run the write benchmark against the last release", "Write throughput up 7%, p99 flat; the table is in bench/2026-11-13.md."},
		"t_iphone_push": {"The iPhone gets no notifications", "The APNs certificate expired on Nov 10; renewed, a test push arrived."},
		"t_tax":         {"Sort this year's expense receipts", "Half done when you said to stop."},
		"t_recall":      {"Paginate the recall API", "Cursor pages, 20 by default; old clients without a cursor work as before."},
		"t_flaky_old":   {"TestSnapshotRestore times out on CI now and then", "CI disks are slow: the wait went from 5 s to 20 s, and a timeout prints progress."},
		"t_slides":      {"Slides for the HawDB storage engine talk", "18 slides on LSM write amplification and our tiered compaction, with three benchmark charts."},
		"t_cal":         {"Move next week's meetings to the afternoon", "Moved 5; Tuesday's group meeting got no answer and stays where it was."},
		"t_theme":       {"Dark tokens for the Pebble theme", "A first Midnight set; buttons and cards keep their depth in the dark."},
		"t_mem_cli":     {"--json output for the nmem command line", "search, add and list take --json, with the API's fields."},
		"t_flight":      {"Find flights to Tokyo in December", "Cheapest: China Eastern on Dec 2, ¥3,280 return; ANA direct ¥4,650."},
		"t_idea":        {"How On hand could work better on the phone", "Three ways: a row of counts at the bottom, swipe to act, fold by project; the first is simplest."},
		"t_gc":          {"Clean up expired SST files", "Hit a file a snapshot still holds and stopped; nothing was deleted."},
		"t_docs":        {"Write the Install page in docs", "macOS and Linux both written; the screenshots stay in .shots, out of the repo."},
		"t_embed":       {"Try the new embedding model", "3 points better recall at twice the cost per call; not switching yet."},
		"t_router":      {"The home router drops every evening", "A clash on the 2.4 GHz channel; on channel 11 it held three days."},
		"t_split":       {"Writes pause while a region splits", "Copy first, then switch: the pause went from 800 ms to 40 ms."},
		"t_bridge":      {"Bridge replies don't reach Codex", "Codex's session id changed and wasn't followed; now found by name each time."},
		"t_party":       {"Book a table for 8 on Saturday night", "Window table at Nanjing Impressions, Saturday 18:30, sent to the group."},
		"t_export":      {"Export Mem to Markdown", "One file per memory with tags and time, a folder per month."},
		"t_review_doc":  {"Review the D270 design note", "Two places clash with principle 4, one word isn't in the glossary; the rest is fine."},
		"t_ttl":         {"Expired keys still show in scan", "scan skips keys past their TTL that aren't cleaned yet; edge cases added."},
		"t_newsletter":  {"This month's Nowledge newsletter", "Written: sync and export, with two screenshots."},
		"t_visa":        {"What a Japan visa needs", "Seven documents; the employment letter needs a stamp; hand in before Nov 20."},
		"t_metrics":     {"Prometheus metrics for compaction", "Five: backlog bytes, files per level, time, write amplification, stalls."},
		"t_login":       {"The web app sometimes goes blank after sign-in", "Picked up by another task."},
		"t_plan":        {"Think through the v2 roadmap", "Three stages: the phone complete, then team sharing, then plugins."},
		"t_pay":         {"Pay this quarter's building fee", "Paid ¥1,860; the receipt is in the folder."},
		"t_raft":        {"Read Raft's membership changes again", "Notes on joint consensus and the two steps our implementation lacks."},
		"t_imp_wal":     {"Replaying the WAL with a torn tail", ""},
		"t_imp_kyoto":   {"Kyoto hotel and flights together", ""},
		"t_imp_old":     {"Try the old parser", ""},
	}
	tags := map[string]string{"测试": "tests", "旅行": "travel", "家里": "family", "分享": "talks"}
	hits := map[string]string{
		"t_flaky": "Why the compaction test fails now and then (flaky)",
		"t_bloom": "keep this flaky false-positive test for now, I want to see if it's the data",
		"t_bench": "left out 2 flaky benchmark items, the numbers are steadier",
	}
	out := make([]protocol.PastItem, len(items))
	for i, it := range items {
		if w, ok := en[it.TaskID]; ok {
			if it.Original != "" {
				it.Original = w[0]
				if it.TaskID == "t_flaky" {
					it.Title = "Flaky test: the fake clock"
				}
			} else {
				it.Title = w[0]
			}
			it.Outcome = w[1]
		}
		if it.Mark != nil {
			m := *it.Mark
			m.Tags = nil
			for _, tg := range it.Mark.Tags {
				if e, ok := tags[tg]; ok {
					tg = e
				}
				m.Tags = append(m.Tags, tg)
			}
			if m.Name != "" {
				m.Name = it.Title
			}
			it.Mark = &m
		}
		if it.Hit != nil {
			h := *it.Hit
			if e, ok := hits[it.TaskID]; ok {
				h.Text = e
			}
			it.Hit = &h
		}
		out[i] = it
	}
	return out
}
