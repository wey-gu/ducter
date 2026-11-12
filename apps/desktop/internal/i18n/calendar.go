package i18n

import (
	"fmt"
	"strings"
	"time"
)

// D221 (design/calendar.md): the day card, the change card, the calendars
// an account reads, and the greeting's today line. The phone
// (apps/web/src) uses the same keys for the same words.

var zhCalendar = Table{
	"cal.today":         "今天",
	"cal.tomorrow":      "明天",
	"cal.yesterday":     "昨天",
	"cal.allday":        "全天",
	"cal.online":        "线上",
	"cal.with":          "和 %s",
	"cal.with.more":     "和 %s 等 %[2]d 人",
	"cal.with.n":        "%d 人参加",
	"cal.names.sep":     "、",
	"cal.free":          "空闲",
	"cal.maybe":         "可能参加",
	"cal.unanswered":    "未回复",
	"cal.overlaps":      "时间重叠",
	"cal.now":           "现在",
	"cal.nothing":       "没有安排",
	"cal.local":         "当地 %s · %s",
	"cal.a11y.span":     "%s 到 %s",
	"cal.a11y.overlaps": "与「%s」时间重叠",
	"cal.a11y.sep":      "，",
	"cal.main":          "主日历",

	"cal.change.was":         "原来",
	"cal.change.their":       "%s 那边是 %s（%s）",
	"cal.change.their.anon":  "对方那边是 %s（%s）",
	"cal.change.in.create":   "放在",
	"cal.change.in":          "在",
	"cal.change.invite":      "会发邀请给 %s",
	"cal.change.invite.many": "会发邀请给 %s",
	"cal.change.told":        "会通知 %s",
	"cal.change.told.many":   "会通知 %s",
	"cal.change.organizer":   "会告诉组织者 %s",
	"cal.change.nobody":      "不会通知任何人",
	"cal.change.clash":       "那时已经有「%s」",
	"cal.change.video":       "线上 · 会加上视频会议链接",
	"cal.hold.create":        "暂不添加",
	"cal.hold.move":          "暂不更改",
	"cal.hold.cancel":        "保留日程",
	"cal.hold.respond":       "暂不回复",
	"cal.go.create":          "添加到日历",
	"cal.go.move":            "更改时间",
	"cal.go.cancel":          "取消日程",
	"cal.go.accepted":        "接受",
	"cal.go.declined":        "拒绝",
	"cal.go.tentative":       "可能参加",
	"cal.doing.create":       "正在添加…",
	"cal.doing.move":         "正在更改…",
	"cal.doing.cancel":       "正在取消…",
	"cal.doing.respond":      "正在回复…",
	"cal.done.create":        "已添加到日历",
	"cal.done.move":          "已更改时间",
	"cal.done.cancel":        "已取消日程",
	"cal.done.accepted":      "已接受",
	"cal.done.declined":      "已拒绝",
	"cal.done.tentative":     "已回复可能参加",
	"cal.failed.create":      "没能添加",
	"cal.failed.move":        "没能更改",
	"cal.failed.cancel":      "没能取消",
	"cal.failed.respond":     "没能回复",
	"cal.held":               "没有改动",
	"cal.open":               "在 Google 日历中打开",
	"cal.list.label":         "看哪些日历",
	"cal.list.loading":       "正在读取日历…",
	"cal.kind.holidays":      "节假日 · 只显示名字",
	"cal.kind.birthdays":     "生日 · 只显示名字",
	"cal.kind.shared":        "共享",
	"cal.first":              "日历已连接：可以问它“今天有什么安排”，也能帮你约时间；改日程前都会先问你。",
	"cal.first.try":          "试试",
	"cal.first.prefill":      "我今天都有什么安排？",
	"cal.nudge":              "加上 Google 日历，它就能看日程、帮你约时间。",
	"cal.nudge.add.oo":       "在 oo 中添加",
	"cal.nudge.add.oomol":    "在 OOMOL 中添加",
	"cal.nudge.later":        "以后再说",
	"cal.today.left":         "今天还有 %d 件事，下一件 %s「%s」",
	"cal.today.left.nonext":  "今天还有 %d 件事",
	"cal.today.clash":        "，有两件时间重叠",
	"cal.today.prefill":      "我今天还有什么安排？",
	"cal.today.a11y":         "今天的日程",
	"tile.reads.calendar":    "你选的日历里的日程：时间、标题、地点和参加的人",
	"tile.asks.calendar":     "添加、更改、取消日程，回复邀请",
	"cal.zone.la":            "洛杉矶",
	"cal.zone.ny":            "纽约",
	"cal.zone.london":        "伦敦",
	"cal.zone.paris":         "巴黎",
	"cal.zone.berlin":        "柏林",
	"cal.zone.tokyo":         "东京",
	"cal.zone.shanghai":      "上海",
	"cal.zone.hk":            "香港",
	"cal.zone.singapore":     "新加坡",
	"cal.zone.taipei":        "台北",
	"cal.zone.seoul":         "首尔",
	"cal.zone.sydney":        "悉尼",
	"cal.zone.chicago":       "芝加哥",
	"cal.zone.denver":        "丹佛",
	"cal.zone.sf":            "旧金山",
	"cal.zone.toronto":       "多伦多",
	"cal.zone.vancouver":     "温哥华",
	"cal.zone.dubai":         "迪拜",
	"cal.zone.kolkata":       "加尔各答",
	"cal.zone.amsterdam":     "阿姆斯特丹",
	"cal.zone.utc":           "UTC",
}

var enCalendar = Table{
	"cal.today":         "Today",
	"cal.tomorrow":      "Tomorrow",
	"cal.yesterday":     "Yesterday",
	"cal.allday":        "All day",
	"cal.online":        "Online",
	"cal.with":          "with %s",
	"cal.with.more":     "with %s +%[3]d",
	"cal.with.n":        "%d people",
	"cal.names.sep":     ", ",
	"cal.free":          "Free",
	"cal.maybe":         "Maybe",
	"cal.unanswered":    "Not answered",
	"cal.overlaps":      "Overlaps",
	"cal.now":           "Now",
	"cal.nothing":       "Nothing on",
	"cal.local":         "%s in %s",
	"cal.a11y.span":     "%s to %s",
	"cal.a11y.overlaps": "overlaps “%s”",
	"cal.a11y.sep":      ", ",
	"cal.main":          "Main calendar",

	"cal.change.was":         "Was",
	"cal.change.their":       "That's %[2]s for %[1]s (%[3]s)",
	"cal.change.their.anon":  "That's %s for them (%s)",
	"cal.change.in.create":   "In",
	"cal.change.in":          "In",
	"cal.change.invite":      "%s gets an invitation",
	"cal.change.invite.many": "%s get an invitation",
	"cal.change.told":        "%s is told",
	"cal.change.told.many":   "%s are told",
	"cal.change.organizer":   "%s (the organizer) is told",
	"cal.change.nobody":      "Nobody is notified",
	"cal.change.clash":       "“%s” is already on then",
	"cal.change.video":       "Online · with a video call link",
	"cal.hold.create":        "Not now",
	"cal.hold.move":          "Not now",
	"cal.hold.cancel":        "Keep it",
	"cal.hold.respond":       "Not now",
	"cal.go.create":          "Add to calendar",
	"cal.go.move":            "Move it",
	"cal.go.cancel":          "Cancel event",
	"cal.go.accepted":        "Accept",
	"cal.go.declined":        "Decline",
	"cal.go.tentative":       "Maybe",
	"cal.doing.create":       "Adding…",
	"cal.doing.move":         "Moving…",
	"cal.doing.cancel":       "Cancelling…",
	"cal.doing.respond":      "Replying…",
	"cal.done.create":        "Added",
	"cal.done.move":          "Moved",
	"cal.done.cancel":        "Cancelled",
	"cal.done.accepted":      "Accepted",
	"cal.done.declined":      "Declined",
	"cal.done.tentative":     "Replied maybe",
	"cal.failed.create":      "Couldn't add",
	"cal.failed.move":        "Couldn't move",
	"cal.failed.cancel":      "Couldn't cancel",
	"cal.failed.respond":     "Couldn't reply",
	"cal.held":               "Nothing changed",
	"cal.open":               "Open in Google Calendar",
	"cal.list.label":         "Calendars it reads",
	"cal.list.loading":       "Reading calendars…",
	"cal.kind.holidays":      "Holidays · names only",
	"cal.kind.birthdays":     "Birthdays · names only",
	"cal.kind.shared":        "Shared",
	"cal.first":              "Your calendar is connected: ask “what's on today?” or have it find a time. It asks before changing anything.",
	"cal.first.try":          "Try it",
	"cal.first.prefill":      "What's on today?",
	"cal.nudge":              "Add Google Calendar and it can read your schedule and find times.",
	"cal.nudge.add.oo":       "Add in oo",
	"cal.nudge.add.oomol":    "Add in OOMOL",
	"cal.nudge.later":        "Not now",
	"cal.today.left":         "%d more today · next at %s, %s",
	"cal.today.left.nonext":  "%d more today",
	"cal.today.clash":        " · two overlap",
	"cal.today.prefill":      "What's left today?",
	"cal.today.a11y":         "Today's events",
	"tile.reads.calendar":    "Events in the calendars you pick: time, title, place and who's coming",
	"tile.asks.calendar":     "Adding, moving or cancelling events, answering invitations",
	"cal.zone.la":            "Los Angeles",
	"cal.zone.ny":            "New York",
	"cal.zone.london":        "London",
	"cal.zone.paris":         "Paris",
	"cal.zone.berlin":        "Berlin",
	"cal.zone.tokyo":         "Tokyo",
	"cal.zone.shanghai":      "Shanghai",
	"cal.zone.hk":            "Hong Kong",
	"cal.zone.singapore":     "Singapore",
	"cal.zone.taipei":        "Taipei",
	"cal.zone.seoul":         "Seoul",
	"cal.zone.sydney":        "Sydney",
	"cal.zone.chicago":       "Chicago",
	"cal.zone.denver":        "Denver",
	"cal.zone.sf":            "San Francisco",
	"cal.zone.toronto":       "Toronto",
	"cal.zone.vancouver":     "Vancouver",
	"cal.zone.dubai":         "Dubai",
	"cal.zone.kolkata":       "Kolkata",
	"cal.zone.amsterdam":     "Amsterdam",
	"cal.zone.utc":           "UTC",
}

// calZones are the common cities named in the reader's words (§6.1);
// any other zone is said by its own city.
var calZones = map[string]string{
	"America/Los_Angeles": "la", "America/New_York": "ny", "Europe/London": "london", "Europe/Paris": "paris",
	"Europe/Berlin": "berlin", "Asia/Tokyo": "tokyo", "Asia/Shanghai": "shanghai", "Asia/Hong_Kong": "hk",
	"Asia/Singapore": "singapore", "Asia/Taipei": "taipei", "Asia/Seoul": "seoul", "Australia/Sydney": "sydney",
	"America/Chicago": "chicago", "America/Denver": "denver", "America/Toronto": "toronto", "America/Vancouver": "vancouver",
	"Asia/Dubai": "dubai", "Asia/Kolkata": "kolkata", "Europe/Amsterdam": "amsterdam", "UTC": "utc", "Etc/UTC": "utc",
}

// ZoneCity is a zone's city in the reader's words: Los Angeles / 洛杉矶;
// a zone not listed is its own last part (America/Sao_Paulo: Sao Paulo).
func (s *Strings) ZoneCity(zone string) string {
	if k, ok := calZones[zone]; ok {
		return s.T("cal.zone." + k)
	}
	if i := strings.LastIndex(zone, "/"); i >= 0 {
		zone = zone[i+1:]
	}
	return strings.ReplaceAll(zone, "_", " ")
}

// calNBSP keeps a zh date and its weekday apart: JoinHan drops a plain
// space between two Chinese characters ("11 月 18 日周三").
const calNBSP = " "

// CalDate is a date with its weekday: "11 月 18 日 周三" / "Wed, Nov 18";
// the year only when it isn't now's.
func CalDate(lang Lang, at, now time.Time) string {
	other := at.Year() != now.Year()
	if lang == ZH {
		d := fmt.Sprintf("%d 月 %d 日", int(at.Month()), at.Day())
		if other {
			d = fmt.Sprintf("%d 年 ", at.Year()) + d
		}
		return d + calNBSP + zhWeekday[at.Weekday()]
	}
	d := fmt.Sprintf("%s, %s %d", enWeekday[at.Weekday()], enMonth[at.Month()-1], at.Day())
	if other {
		d += fmt.Sprintf(", %d", at.Year())
	}
	return d
}

// CalMD is a date without its weekday: "11 月 17 日" / "Nov 17".
func CalMD(lang Lang, at time.Time) string {
	if lang == ZH {
		return fmt.Sprintf("%d 月 %d 日", int(at.Month()), at.Day())
	}
	return fmt.Sprintf("%s %d", enMonth[at.Month()-1], at.Day())
}

// CalRange is a run of days: "11 月 14 日–18 日" / "Nov 14–18"; across a
// month, both months.
func CalRange(lang Lang, from, to time.Time) string {
	if from.Month() == to.Month() {
		if lang == ZH {
			return fmt.Sprintf("%d 月 %d 日–%d 日", int(from.Month()), from.Day(), to.Day())
		}
		return fmt.Sprintf("%s %d–%d", enMonth[from.Month()-1], from.Day(), to.Day())
	}
	return CalMD(lang, from) + "–" + CalMD(lang, to)
}

// CalClock is a time of day on a calendar: "9:00", "15:30".
func CalClock(at time.Time) string {
	return fmt.Sprintf("%d:%02d", at.Hour(), at.Minute())
}

func init() {
	for k, v := range zhCalendar {
		zh[k] = v
	}
	for k, v := range enCalendar {
		en[k] = v
	}
}
