// Package theme holds Ducter's design tokens (docs/design/ui.md). Views
// never hard-code a color, font, radius or shadow: they read a *Tokens, so
// another theme is another value of it.
package theme

import (
	_ "embed"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/egoist/mygo/ui"
)

// StateColors are a semantic state's dot, surface and ink.
type StateColors struct {
	Dot, Surface, Ink ui.Color
	// Strong is a darker dot, for big numbers and the shadow under a
	// pebble.
	Strong ui.Color
}

// Press is the Pebble depth style: a solid offset under the element in a
// darker tint, which shrinks as it is pressed down.
type Press struct {
	Offset float32
	Color  ui.Color
}

// Tokens is one theme's full token set.
type Tokens struct {
	Name string

	// color
	Bg, Surface, SurfaceRaised, SurfaceSunken, Ink, InkMuted, InkSoft ui.Color
	Accent, OnAccent                                                  ui.Color
	UserBubble, OnUserBubble                                          ui.Color
	Line, LineSoft, Highlight, HighlightInk                           ui.Color
	// Chrome is the window's top bar (it holds the traffic lights and is
	// the title region); ChromeLine its hairline.
	Chrome, ChromeLine ui.Color
	// Diff colors.
	Added, AddedInk, Deleted, DeletedInk ui.Color

	// semantic states
	NeedsYou, Working, Waiting, Done, Failed StateColors
	// device states (醒着 / 睡着了 / 连不上): awake is mint, asleep dusk,
	// can't reach grey (never an error red: sleep is not broken).
	Awake, Asleep, Away StateColors

	// Clay is the surface clay art sits on (the renders' own cream).
	Clay ui.Color

	// type
	Display, Body, Mono string
	XS, SM, MD, LG, XL  float32 // 12, 13, 15, 18, 22
	PartnerSize         float32 // bubble-less partner voice, 18
	Title               float32 // page titles, 34

	// shape
	RadiusSM, RadiusMD, RadiusLG, RadiusXL, Pill float32
	// BubbleRadius is the user bubble's corners: top-left, top-right,
	// bottom-right, bottom-left.
	BubbleRadius [4]float32
	// PebbleRadius is a task pebble's slightly irregular corners.
	PebbleRadius [4]float32

	// depth
	PressCard    Press // cards, chips, the composer
	PressPrimary Press // dark buttons
	PressQuiet   Press // light buttons
	PressAccent  Press // accent buttons

	// motion
	Bouncy, Snappy ui.Animation
	// Equip is the sticker peel-and-stick of an ability (research/26, 28).
	Equip EquipMotion
}

// EquipMotion times the equip: the whole flight, the moment it snaps into
// the slot (a fraction of the flight), the device's squash, how long
// Ducter shows its done face, and the reduced-motion cross-fade.
type EquipMotion struct {
	Flight, Squash, DoneFace, Fade time.Duration
	Snap                           float32
}

func hex(s string) ui.Color { return ui.Hex(s) }

// Pebble is the default theme.
func Pebble() *Tokens {
	return &Tokens{
		Name:          "pebble",
		Bg:            hex("#FFF6EA"),
		Surface:       hex("#FFFFFF"),
		SurfaceRaised: hex("#FFFBF0"),
		SurfaceSunken: hex("#F3E6D3"),
		Ink:           hex("#2B2118"),
		InkMuted:      hex("#75654F"),
		InkSoft:       hex("#4A3D30"),
		Accent:        hex("#FF8A3D"),
		OnAccent:      hex("#2B2118"),
		UserBubble:    hex("#2B2118"), // cocoa (v2 refinement)
		OnUserBubble:  hex("#FFF6EA"),
		Line:          hex("#E8D9C4"),
		LineSoft:      hex("#F3E6D3"),
		Chrome:        hex("#FFFAF3"),
		ChromeLine:    hex("#EEDFCA"),
		Highlight:     hex("#FFE9A8"),
		HighlightInk:  hex("#6B5000"),
		Added:         hex("#DDF3E2"),
		AddedInk:      hex("#1C5530"),
		Deleted:       hex("#FCE3DF"),
		DeletedInk:    hex("#7A1E14"),

		NeedsYou: StateColors{Dot: hex("#FF8A3D"), Surface: hex("#FFE3CF"), Ink: hex("#8A3A0C"), Strong: hex("#E06A1F")},
		Working:  StateColors{Dot: hex("#4BA8F0"), Surface: hex("#DCEFFF"), Ink: hex("#174A75"), Strong: hex("#2F86C8")},
		Waiting:  StateColors{Dot: hex("#FFC94D"), Surface: hex("#FFF0BF"), Ink: hex("#6B5000"), Strong: hex("#B58600")},
		Done:     StateColors{Dot: hex("#7FD99A"), Surface: hex("#D6F5DC"), Ink: hex("#1F5E2F"), Strong: hex("#2E9A55")},
		Failed:   StateColors{Dot: hex("#E5577A"), Surface: hex("#FBDDE4"), Ink: hex("#8A1F3B"), Strong: hex("#C23A5E")},
		Awake:    StateColors{Dot: hex("#2FA45C"), Surface: hex("#D4F5DD"), Ink: hex("#1F5E2F"), Strong: hex("#2E9A55")},
		Asleep:   StateColors{Dot: hex("#6C63A8"), Surface: hex("#ECE9F8"), Ink: hex("#4B3F70"), Strong: hex("#574F8F")},
		Away:     StateColors{Dot: hex("#A99C8B"), Surface: hex("#EFEAE3"), Ink: hex("#5E5448"), Strong: hex("#8C7F6E")},
		Clay:     hex("#FFF4E6"),

		Display: "Bricolage Grotesque, PingFang SC, Noto Sans SC",
		Body:    "Bricolage Grotesque, PingFang SC, Noto Sans SC",
		Mono:    "JetBrains Mono, SF Mono, Menlo, monospace",
		XS:      12, SM: 13, MD: 15, LG: 18, XL: 22,
		PartnerSize: 18,
		Title:       34,

		RadiusSM: 14, RadiusMD: 20, RadiusLG: 26, RadiusXL: 28, Pill: 999,
		BubbleRadius: [4]float32{22, 22, 8, 22},
		PebbleRadius: [4]float32{6, 7, 5, 6},

		PressCard:    Press{Offset: 4, Color: hex("#E8D9C4")},
		PressPrimary: Press{Offset: 3, Color: hex("#000000")},
		PressQuiet:   Press{Offset: 3, Color: hex("#E0C9B0")},
		PressAccent:  Press{Offset: 3, Color: hex("#C9642A")},

		Bouncy: ui.Animation{Spring: ui.SpringOptions{Duration: 420e6, Bounce: 0.35}},
		Snappy: ui.Snappy,
		Equip:  EquipMotion{Flight: 820 * time.Millisecond, Snap: 0.62, Squash: 420 * time.Millisecond, DoneFace: 1800 * time.Millisecond, Fade: 200 * time.Millisecond},
	}
}

// State returns the colors of an attention state.
func (t *Tokens) State(attention string) StateColors {
	switch attention {
	case "needs_you", "decision":
		return t.NeedsYou
	case "working", "queued", "progress":
		return t.Working
	case "blocked":
		return t.Waiting
	case "done", "done_claimed":
		return t.Done
	case "failed", "dropped", "superseded":
		return t.Failed
	}
	return t.Working
}

// UITheme is the MyGo theme for the widgets, from the tokens.
func (t *Tokens) UITheme(base *ui.Theme) *ui.Theme {
	th := *base
	th.Dark = false
	th.Background = t.Bg
	th.Surface = t.Surface
	th.SurfaceHover = t.SurfaceSunken
	th.SurfacePressed = t.Line
	th.Border = t.Line
	th.Text = t.Ink
	th.TextMuted = t.InkMuted
	th.Accent = t.Accent
	th.AccentHover = t.NeedsYou.Strong
	th.AccentPressed = t.NeedsYou.Strong
	th.AccentText = t.OnAccent
	th.InactiveAccent = t.Accent
	th.Selection = t.Highlight
	th.Focus = t.Accent
	th.Radius = t.RadiusSM
	th.FontSize = t.MD
	th.Font = t.Body
	return &th
}

//go:embed fonts/BricolageGrotesque.ttf
var bricolage []byte

var fontsOnce sync.Once

// LoadFonts registers Bricolage Grotesque (embedded, OFL) and any fonts in
// $DUCTER_FONTS or ~/.ducter/fonts (as Noto Sans SC or JetBrains Mono).
// Fonts that do not load fall back to the system's (PingFang SC for CJK).
func LoadFonts() {
	fontsOnce.Do(func() {
		if err := ui.RegisterFont(bricolage, "Bricolage Grotesque"); err != nil {
			log.Printf("ducter: Bricolage Grotesque: %v (system font instead)", err)
		}
		dirs := []string{os.Getenv("DUCTER_FONTS")}
		if home, err := os.UserHomeDir(); err == nil {
			dirs = append(dirs, filepath.Join(home, ".ducter", "fonts"))
		}
		for _, d := range dirs {
			if d == "" {
				continue
			}
			files, _ := filepath.Glob(filepath.Join(d, "*.[ot]t[fc]"))
			for _, f := range files {
				if data, err := os.ReadFile(f); err == nil {
					_ = ui.RegisterFont(data, "")
				}
			}
		}
	})
}
