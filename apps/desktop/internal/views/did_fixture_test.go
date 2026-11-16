package views

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D300's fixture: a realistic day of the author's on pastNow (Thursday
// 19 November 2026, 15:00), and the day before.

const didMac = "Wey's MacBook Pro"

func didAt(dayAgo int, hh, mm int) string {
	d := pastNow.AddDate(0, 0, -dayAgo)
	return time.Date(d.Year(), d.Month(), d.Day(), hh, mm, 0, 0, time.Local).UTC().Format(time.RFC3339)
}

func didGoYou(hh, mm int) *protocol.DidGo {
	return &protocol.DidGo{By: "you", At: didAt(0, hh, mm)}
}

func didTask(id, title string) protocol.DidWho {
	return protocol.DidWho{By: "task", TaskID: id, Title: title}
}

// didDayItems is the full day: today's nine, then yesterday's four.
func didDayItems(lang i18n.Lang) []protocol.DidItem {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	return []protocol.DidItem{
		{ID: "e901", Kind: "sent", Sub: "agent", At: didAt(0, 14, 20), To: w("你的 Claude Code", "your Claude Code"), Via: "Nowledge Bridge",
			Line: w("D300 的设计说明写好了，帮我从开发者的角度再看一遍。", "The D300 note is written; read it once more as a developer would."),
			Who:  didTask("t_d300", w("写 D300 的设计说明", "Write the D300 design note")), Where: &protocol.DidWhere{Kind: "home", Name: "Nowledge Bridge"}, TaskID: "t_d300"},
		{ID: "e880", Kind: "changed", Sub: "files", At: didAt(0, 13, 40), Count: 14, Files: &protocol.DidFiles{Added: 3, Changed: 10, Removed: 1},
			Who: didTask("t_docs", w("整理 docs 目录", "Tidy the docs folder")), Where: &protocol.DidWhere{Kind: "computer", Name: didMac}, TaskID: "t_docs",
			Undo: &protocol.DidUndo{Kind: "folder", TaskID: "t_docs", Until: pastNow.Add(6 * day).UTC().Format(time.RFC3339)}},
		{ID: "e851", Kind: "changed", Sub: "merge", At: didAt(0, 12, 5), To: "task/fix-flaky-ci",
			Who: didTask("t_ci", w("修好偶发失败的 CI", "Fix the flaky CI")), Go: didGoYou(12, 5), TaskID: "t_ci", Link: "https://github.com/wey-gu/ducter/pull/412"},
		{ID: "e822", Kind: "changed", Sub: "calendar", Cal: "create", At: didAt(0, 11, 30), To: "Google Calendar", Via: "Google Calendar",
			Line: w("看牙医，11 月 25 日周三 10:30", "Dentist, Wed Nov 25, 10:30"),
			Who:  protocol.DidWho{By: "you"}, Go: didGoYou(11, 29), Where: &protocol.DidWhere{Kind: "home", Name: "Google Calendar"}, Link: "https://calendar.google.com/"},
		{ID: "u41", Kind: "filled", Sub: "signin", At: didAt(0, 10, 58), To: "github.com",
			Who: didTask("t_runner", w("升级 CI 的 runner", "Bump the CI runner")), Go: &protocol.DidGo{By: "before"},
			Where: &protocol.DidWhere{Kind: "browser", Name: didMac}, TaskID: "t_runner"},
		{ID: "e790", Kind: "paid", Sub: "card", At: didAt(0, 10, 41), To: "hotel-okura.jp", Amount: "USD 128.00",
			Line: w("东京大仓酒店，12 月 3 日到 6 日，三晚", "Hotel Okura Tokyo, Dec 3 to 6, three nights"),
			Who:  didTask("t_tokyo", w("订东京的酒店", "Book Tokyo hotel")), Go: didGoYou(10, 40),
			Where: &protocol.DidWhere{Kind: "browser", Name: didMac}, TaskID: "t_tokyo"},
		{ID: "e760", Kind: "called", Sub: "call", At: didAt(0, 10, 15), To: "Sushi Saito", Via: "Tuwa",
			Line: w("订好了周五 19:00 两个人的位子", "Booked a table for two, Friday at 19:00"),
			Who:  protocol.DidWho{By: "you"}, Go: didGoYou(10, 12), Where: &protocol.DidWhere{Kind: "line", Name: "Tuwa"}},
		{ID: "e702", Kind: "sent", Sub: "mail", At: didAt(0, 9, 12), To: w("张伟", "Zhang Wei"), Via: "Gmail",
			Line: w("附上了 Q4 预算草稿", "Q4 budget draft attached"),
			Who:  didTask("t_q4", w("准备 Q4 预算", "Prepare Q4 budget")), Go: didGoYou(9, 12), Where: &protocol.DidWhere{Kind: "home", Name: "Gmail"}, TaskID: "t_q4"},
		{ID: "r0:gmail", Kind: "read", Sub: "account", At: didAt(0, 8, 0), Via: "Gmail", Count: 23,
			Who: protocol.DidWho{By: "routine", Routine: w("早上看邮件", "Morning inbox")}},
		{ID: "e640", Kind: "sent", Sub: "message", At: didAt(1, 18, 30), To: w("妈妈", "Mom"), Via: w("信息", "Messages"),
			Line: w("周六回家吃饭，大概六点到。", "Home for dinner on Saturday, around six."),
			Who:  protocol.DidWho{By: "you"}, Go: &protocol.DidGo{By: "you", At: didAt(1, 18, 29)}, Where: &protocol.DidWhere{Kind: "ducter_phone"}},
		{ID: "e611", Kind: "deleted", Sub: "item", At: didAt(1, 16, 10), Via: "Notion",
			Line: w("旧草稿：Q3 团建议程", "Old draft: Q3 offsite agenda"),
			Who:  didTask("t_notion", w("清理 Notion", "Tidy Notion")), Go: &protocol.DidGo{By: "default"}, Where: &protocol.DidWhere{Kind: "home", Name: "Notion"}, TaskID: "t_notion"},
		{ID: "e590", Kind: "called", Sub: "call", At: didAt(1, 11, 20), To: w("微笑牙科", "Bright Smile Dental"), Unsure: "no_answer",
			Who: didTask("t_dentist", w("把牙医改到下周三", "Move the dentist to next Wednesday")), Go: &protocol.DidGo{By: "you", At: didAt(1, 11, 18)},
			Where: &protocol.DidWhere{Kind: "own_number"}, TaskID: "t_dentist"},
		{ID: "r1:gmail", Kind: "read", Sub: "account", At: didAt(1, 8, 0), Via: "Gmail", Count: 12,
			Who: protocol.DidWho{By: "routine", Routine: w("早上看邮件", "Morning inbox")}},
	}
}

// didQuietItems is a quiet today (only looks and one merge), then yesterday.
func didQuietItems(lang i18n.Lang) []protocol.DidItem {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	all := didDayItems(lang)
	today := []protocol.DidItem{
		{ID: "e851", Kind: "changed", Sub: "merge", At: didAt(0, 12, 5), To: "task/fix-flaky-ci",
			Who: didTask("t_ci", w("修好偶发失败的 CI", "Fix the flaky CI")), Go: didGoYou(12, 5), TaskID: "t_ci", Link: "https://github.com/wey-gu/ducter/pull/412"},
		{ID: "r0:cal", Kind: "read", Sub: "account", At: didAt(0, 8, 5), Via: "Google Calendar", Count: 4,
			Who: protocol.DidWho{By: "routine", Routine: w("早上看邮件", "Morning inbox")}},
		{ID: "r0:gmail", Kind: "read", Sub: "account", At: didAt(0, 8, 0), Via: "Gmail", Count: 9,
			Who: protocol.DidWho{By: "routine", Routine: w("早上看邮件", "Morning inbox")}},
	}
	return append(today, all[9:]...)
}

// didResult is a did_result of the items, with the counts they make
// (counted before the filter, as the home does: from all).
func didResult(items, all []protocol.DidItem, id string) protocol.ServerFrame {
	counts := map[string]int{}
	for _, it := range all {
		counts[it.Kind]++
	}
	return protocol.ServerFrame{T: "did_result", DidFor: &protocol.DidFrame{T: "did_result", ID: id, Items: items, Counts: counts,
		Since: didAt(6, 0, 0), Before: pastNow.UTC().Format(time.RFC3339)}}
}

func didOfKind(items []protocol.DidItem, kind string) []protocol.DidItem {
	var out []protocol.DidItem
	for _, it := range items {
		if it.Kind == kind {
			out = append(out, it)
		}
	}
	return out
}
