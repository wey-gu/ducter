package i18n

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// The phone (apps/web/test/when.test.ts) passes the same cases.
func TestWhenMatchesTheSharedCases(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/when.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Now   string                            `json:"now"`
		Cases []struct{ Fn, At, Zh, En string } `json:"cases"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	parse := func(s string) time.Time {
		v, err := time.ParseInLocation("2006-01-02T15:04:05", s, time.Local)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	now := parse(f.Now)
	for _, c := range f.Cases {
		at := parse(c.At)
		for _, l := range []struct {
			lang Lang
			want string
		}{{ZH, c.Zh}, {EN, c.En}} {
			var got string
			switch c.Fn {
			case "clock":
				got = Clock(at)
			case "day":
				got = Day(l.lang, at, now)
			case "md":
				got = MD(at)
			default:
				got = When(l.lang, at, now)
			}
			if got != l.want {
				t.Errorf("%s %s %s: got %q, want %q", l.lang, c.Fn, c.At, got, l.want)
			}
		}
	}
}
