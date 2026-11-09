package i18n

// Human times (packages/protocol/fixtures/when.json, the same rule as the
// phone's apps/web/src/format.ts): a time of day without a leading zero;
// today / tomorrow / yesterday by name; the next six days by weekday; else
// the date in words ("12 月 1 日" / "Dec 1"), with the year only when it
// isn't this one. Never "12-01 09:00".

import (
	"fmt"
	"math"
	"time"
)

var (
	zhWeekday = [...]string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	enWeekday = [...]string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	enMonth   = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
)

func dayDiff(at, now time.Time) int {
	a := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, time.Local)
	b := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	return int(math.Round(a.Sub(b).Hours() / 24))
}

// Clock is a time of day: "9:05", "18:00".
func Clock(at time.Time) string {
	at = at.Local()
	return fmt.Sprintf("%d:%02d", at.Hour(), at.Minute())
}

// Day is a date in words: 今天 / 明天 / 昨天, a weekday within six days
// ahead, else "12 月 1 日" / "Dec 1" (with the year when it isn't this one).
func Day(lang Lang, at, now time.Time) string {
	at, now = at.Local(), now.Local()
	zh := lang == ZH
	switch k := dayDiff(at, now); {
	case k == 0:
		return pick(zh, "今天", "today")
	case k == 1:
		return pick(zh, "明天", "tomorrow")
	case k == -1:
		return pick(zh, "昨天", "yesterday")
	case k > 1 && k < 7:
		if zh {
			return zhWeekday[at.Weekday()]
		}
		return enWeekday[at.Weekday()]
	}
	other := at.Year() != now.Year()
	if zh {
		if other {
			return fmt.Sprintf("%d 年 %d 月 %d 日", at.Year(), int(at.Month()), at.Day())
		}
		return fmt.Sprintf("%d 月 %d 日", int(at.Month()), at.Day())
	}
	if other {
		return fmt.Sprintf("%s %d %d", enMonth[at.Month()-1], at.Day(), at.Year())
	}
	return fmt.Sprintf("%s %d", enMonth[at.Month()-1], at.Day())
}

// When is a moment: "今天 18:00", "明天 9:00", "周五 9:00", "12 月 1 日 9:00" /
// "today 18:00", "Dec 1, 9:00".
func When(lang Lang, at, now time.Time) string {
	sep := " "
	if k := dayDiff(at.Local(), now.Local()); lang != ZH && (k > 6 || k < -1) {
		sep = ", "
	}
	return Day(lang, at, now) + sep + Clock(at)
}

// MD is a date on a strip of beads: "11/16".
func MD(at time.Time) string {
	at = at.Local()
	return fmt.Sprintf("%d/%d", int(at.Month()), at.Day())
}

func pick(zh bool, a, b string) string {
	if zh {
		return a
	}
	return b
}
