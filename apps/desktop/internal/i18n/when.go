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

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
)

// dayWords are one language's words for days; a tag reads the first table
// on its fallback chain (D292).
type dayWords struct {
	today, tomorrow, yesterday string
	weekday                    [7]string
	month                      [12]string
	date, dateYear             string // month, day (and year) as %[1]s %[2]d %[3]d
	farSep                     string // between a date beyond the week and its time
	// The calendar's (calendar.go): a date with its weekday as %[4]s, and
	// a run of days in one month (month, first day, last day).
	calDate, calDateYear, calRange string
	monthAlone                     string // a month on its own (Month)
}

var dayTables = map[string]dayWords{
	"zh": {
		today: "今天", tomorrow: "明天", yesterday: "昨天",
		weekday:     [7]string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"},
		month:       [12]string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"},
		date:        "%[1]s 月 %[2]d 日",
		dateYear:    "%[3]d 年 %[1]s 月 %[2]d 日",
		farSep:      " ",
		calDate:     "%[1]s 月 %[2]d 日" + calNBSP + "%[4]s",
		calDateYear: "%[3]d 年 %[1]s 月 %[2]d 日" + calNBSP + "%[4]s",
		calRange:    "%[1]s 月 %[2]d 日–%[3]d 日",
		monthAlone:  "%s 月",
	},
	"en": {
		today: "today", tomorrow: "tomorrow", yesterday: "yesterday",
		weekday:     [7]string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"},
		month:       [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
		date:        "%[1]s %[2]d",
		dateYear:    "%[1]s %[2]d %[3]d",
		farSep:      ", ",
		calDate:     "%[4]s, %[1]s %[2]d",
		calDateYear: "%[4]s, %[1]s %[2]d, %[3]d",
		calRange:    "%[1]s %[2]d–%[3]d",
		monthAlone:  "%s",
	},
}

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
func Day(l Lang, at, now time.Time) string {
	at, now = at.Local(), now.Local()
	w := lang.Words(dayTables, string(l))
	switch k := dayDiff(at, now); {
	case k == 0:
		return w.today
	case k == 1:
		return w.tomorrow
	case k == -1:
		return w.yesterday
	case k > 1 && k < 7:
		return w.weekday[at.Weekday()]
	}
	if at.Year() != now.Year() {
		return fmt.Sprintf(w.dateYear, w.month[at.Month()-1], at.Day(), at.Year())
	}
	return fmt.Sprintf(w.date, w.month[at.Month()-1], at.Day())
}

// When is a moment: "今天 18:00", "明天 9:00", "周五 9:00", "12 月 1 日 9:00" /
// "today 18:00", "Dec 1, 9:00".
func When(l Lang, at, now time.Time) string {
	sep := " "
	if k := dayDiff(at.Local(), now.Local()); k > 6 || k < -1 {
		sep = lang.Words(dayTables, string(l)).farSep
	}
	return Day(l, at, now) + sep + Clock(at)
}

// Weekday is a weekday's short name: "周五" / "Fri".
func Weekday(l Lang, d time.Weekday) string {
	return lang.Words(dayTables, string(l)).weekday[d]
}

// Month is a month's short name on its own: "12 月" / "Dec".
func Month(l Lang, m time.Month) string {
	w := lang.Words(dayTables, string(l))
	return fmt.Sprintf(w.monthAlone, w.month[m-1])
}

// MD is a date on a strip of beads: "11/16".
func MD(at time.Time) string {
	at = at.Local()
	return fmt.Sprintf("%d/%d", int(at.Month()), at.Day())
}
