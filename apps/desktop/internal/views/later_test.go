package views

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"
)

// D382: the times are the phone's, on the same cases.
func TestLaterChoicesFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/later.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Now     string     `json:"now"`
			Morning string     `json:"morning"`
			Want    [][]string `json:"want"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	const layout = "2006-01-02 15:04"
	for _, c := range f.Cases {
		now, err := time.ParseInLocation(layout, c.Now, time.Local)
		if err != nil {
			t.Fatal(err)
		}
		var got [][]string
		for _, ch := range laterChoices(now, c.Morning) {
			row := []string{ch.Key, ch.At.Format(layout)}
			if ch.Today {
				row = append(row, "today")
			}
			got = append(got, row)
		}
		if !reflect.DeepEqual(got, c.Want) {
			t.Errorf("at %s (%s): got %v, want %v", c.Now, c.Morning, got, c.Want)
		}
	}
}

func TestPickedTimeAndRefusal(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	if at, ok := pickedTime(now, 1, "9:30"); !ok || !at.Equal(time.Date(2026, 11, 20, 9, 30, 0, 0, time.Local)) {
		t.Errorf("tomorrow 9:30: %v %v", at, ok)
	}
	if _, ok := pickedTime(now, 0, "25:00"); ok {
		t.Error("25:00 read as a time")
	}
	if laterRefusal(now.Add(time.Minute), now) != "past" || laterRefusal(now.Add(40*24*time.Hour), now) != "far" || laterRefusal(now.Add(time.Hour), now) != "" {
		t.Error("refusals")
	}
}
