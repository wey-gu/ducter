package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

type fakeTitleSound struct{ stopped []time.Duration }

func (f *fakeTitleSound) Stop(d time.Duration) { f.stopped = append(f.stopped, d) }

// titleApp is an app on its first launch, its clock the Tester's.
func titleApp(t *testing.T, lang i18n.Lang, prefs ui.Preferences) (*App, *ui.Tester, *[]*fakeTitleSound) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	app.Local = hints.Open(t.TempDir())
	var played []*fakeTitleSound
	app.PlayTitle = func() TitleSound {
		s := &fakeTitleSound{}
		played = append(played, s)
		return s
	}
	tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: prefs})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.Now = tt.Now
	app.ShowTitle()
	return app, tt, &played
}

func TestTitlePlaysOnceWithItsSoundAndLeavesOnAnyKey(t *testing.T) {
	app, tt, played := titleApp(t, i18n.ZH, ui.Preferences{})
	tt.SetWindowActive(true)
	tt.Frame()
	if !app.TitleShowing() || len(*played) != 1 {
		t.Fatalf("showing %v, sounds started %d; want the title and one sound", app.TitleShowing(), len(*played))
	}
	tt.Advance(2 * time.Second)
	// A shortcut stays a shortcut: ⌘, doesn't skip it.
	tt.Key(ui.Cmd, ui.KeyComma)
	if !app.TitleShowing() || app.Local.TitleSeen() {
		t.Fatalf("a ⌘ shortcut skipped the title")
	}
	tt.Key(0, ui.KeySpace)
	snd := (*played)[0]
	if len(snd.stopped) != 1 || snd.stopped[0] != titleSkip {
		t.Fatalf("skipping at 2 s stopped the sound with %v, want one %v fade", snd.stopped, titleSkip)
	}
	if !app.Local.TitleSeen() {
		t.Fatalf("skipping didn't remember the title was seen")
	}
	tt.Advance(titleSkip + 50*time.Millisecond)
	if app.TitleShowing() {
		t.Fatalf("the title still shows %v after the skip", titleSkip+50*time.Millisecond)
	}
	if len(*played) != 1 {
		t.Fatalf("%d sounds started, want 1", len(*played))
	}
}

func TestTitleFromThePromptFillsWithLight(t *testing.T) {
	app, tt, played := titleApp(t, i18n.EN, ui.Preferences{})
	tt.SetWindowActive(true)
	tt.Frame()
	tt.Advance(7 * time.Second)
	tt.ClickAt(640, 430)
	if got := (*played)[0].stopped; len(got) != 1 || got[0] != 500*time.Millisecond {
		t.Fatalf("leaving from the prompt stopped the sound with %v, want a 500ms fade", got)
	}
	tt.Advance(titleSkip + 50*time.Millisecond)
	if !app.TitleShowing() {
		t.Fatalf("from the prompt it should take %v to leave, not %v", titleLeave, titleSkip)
	}
	tt.Advance(titleLeave)
	if app.TitleShowing() {
		t.Fatalf("the title still shows after leaving")
	}
}

func TestTitleWaitsForTheWindowAndIsSilentWhenItShouldBe(t *testing.T) {
	// The window isn't active (opened behind another app): nothing starts.
	app, tt, played := titleApp(t, i18n.ZH, ui.Preferences{})
	tt.SetWindowActive(false)
	tt.Frame()
	tt.Advance(3 * time.Second)
	if len(*played) != 0 || !app.title.start.IsZero() {
		t.Fatalf("the title started while the window was inactive")
	}
	tt.SetWindowActive(true)
	tt.Advance(100 * time.Millisecond)
	if len(*played) != 1 {
		t.Fatalf("the title didn't start once the window was active")
	}

	// Reduced motion: no sound, the still last frame.
	_, tt2, played2 := titleApp(t, i18n.ZH, ui.Preferences{ReduceMotion: true})
	tt2.SetWindowActive(true)
	tt2.Advance(time.Second)
	if len(*played2) != 0 {
		t.Fatalf("a sound played under reduced motion")
	}

	// Sounds turned off in Settings.
	app3, tt3, played3 := titleApp(t, i18n.EN, ui.Preferences{})
	app3.Local.SetSound(false)
	tt3.SetWindowActive(true)
	tt3.Advance(time.Second)
	if len(*played3) != 0 {
		t.Fatalf("a sound played with sounds off")
	}
}

func TestTitleTimeline(t *testing.T) {
	// Asleep before the eyes, awake after; the name and prompt in order.
	if titleLids(3.4) != 1 || titleLids(4.3) != 0 {
		t.Fatalf("lids at 3.4 = %v, at 4.3 = %v; want shut, then open", titleLids(3.4), titleLids(4.3))
	}
	if f := titleAt(titleBell - 0.1); f.word != 0 || f.prompt != 0 {
		t.Fatalf("the name or prompt shows before the tone")
	}
	if f := titleAt(titlePrompt + titlePromptIn); f.word != 1 || f.prompt != 1 || f.lit != 1 {
		t.Fatalf("at the prompt: word %v prompt %v lit %v, want all 1", f.word, f.prompt, f.lit)
	}
	if titlePrompt+titlePromptIn > 8 {
		t.Fatalf("the prompt is up at %v s, over the 8 s the moment may take", titlePrompt+titlePromptIn)
	}
}

// The title's frames, zh and en, headless: DUCTER_TITLE_SHOTS=1 writes
// title-<t>-<lang>.png to shotsDir.
func TestTitleShots(t *testing.T) {
	if os.Getenv("DUCTER_TITLE_SHOTS") == "" {
		t.Skip("DUCTER_TITLE_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, at := range []float64{0.2, 1.5, 3.0, 3.62, 3.75, 4.6, 7.0} {
			app, tt, _ := titleApp(t, lang, ui.Preferences{})
			app.title.at = at
			tt.Frame()
			tt.Advance(time.Second) // the page's own entrance
			write(t, filepath.Join(dir, fmt.Sprintf("title-%.2f-%s.png", at, lang)), tt)
		}
		app, tt, _ := titleApp(t, lang, ui.Preferences{ReduceMotion: true})
		tt.SetWindowActive(true)
		tt.Advance(time.Second)
		write(t, filepath.Join(dir, fmt.Sprintf("title-reduced-%s.png", lang)), tt)
		// The hand-off: the light fills the window, then the setup card.
		app.title.at = 0
		tt.Advance(7 * time.Second)
		tt.ClickAt(640, 430)
		tt.Advance(titleLeave / 2)
		write(t, filepath.Join(dir, fmt.Sprintf("title-leaving-%s.png", lang)), tt)
	}
}

func write(t *testing.T, path string, tt *ui.Tester) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}
