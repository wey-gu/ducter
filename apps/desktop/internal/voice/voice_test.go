package voice

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The web (packages/protocol/test/voice.test.ts) passes the same cases.
func TestVoiceFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/voice.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Locale []struct {
			Tag       string   `json:"tag"`
			Preferred []string `json:"preferred"`
			Want      string   `json:"want"`
		} `json:"locale"`
		Speakable []struct{ Text, Want string } `json:"speakable"`
		Hold      []struct {
			DX, DY float64
			Want   string
		} `json:"hold"`
		Join  []struct{ Draft, Heard, Want string } `json:"join"`
		Meter []struct {
			Level float64
			Want  []float64
		} `json:"meter"`
		Smooth []struct{ Prev, Next, Want float64 } `json:"smooth"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Locale) == 0 || len(f.Speakable) == 0 || len(f.Hold) == 0 || len(f.Join) == 0 || len(f.Meter) == 0 || len(f.Smooth) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range f.Locale {
		if got := SpeechLocale(c.Tag, c.Preferred); got != c.Want {
			t.Errorf("SpeechLocale(%q, %v) = %q, want %q", c.Tag, c.Preferred, got, c.Want)
		}
	}
	for _, c := range f.Speakable {
		if got := Speakable(c.Text); got != c.Want {
			t.Errorf("Speakable(%q) = %q, want %q", c.Text, got, c.Want)
		}
	}
	for _, c := range f.Hold {
		if got := IntentOf(c.DX, c.DY); string(got) != c.Want {
			t.Errorf("IntentOf(%v, %v) = %q, want %q", c.DX, c.DY, got, c.Want)
		}
	}
	for _, c := range f.Join {
		if got := JoinHeard(c.Draft, c.Heard); got != c.Want {
			t.Errorf("JoinHeard(%q, %q) = %q, want %q", c.Draft, c.Heard, got, c.Want)
		}
	}
	for _, c := range f.Meter {
		if got := MeterBars(c.Level, 5); !reflect.DeepEqual(got, c.Want) {
			t.Errorf("MeterBars(%v) = %v, want %v", c.Level, got, c.Want)
		}
	}
	for _, c := range f.Smooth {
		if got := SmoothLevel(c.Prev, c.Next); got != c.Want {
			t.Errorf("SmoothLevel(%v, %v) = %v, want %v", c.Prev, c.Next, got, c.Want)
		}
	}
}

func TestReadLang(t *testing.T) {
	if ReadLang("Hello there friend", "zh", "zh") != "en" || ReadLang("ok", "ja", "zh") != "ja" || ReadLang("", "", "zh") != "zh" {
		t.Error("ReadLang")
	}
}
