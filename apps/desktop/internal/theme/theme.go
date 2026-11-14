// Package theme holds Ducter's design tokens (design/ui.md). Views
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
	// Ledge is the solid base under a card tinted in Surface (D76).
	Ledge ui.Color
	// Strong is a darker dot, for big numbers and the shadow under a
	// pebble.
	Strong ui.Color
}

// Press is the clay depth of a button (D76): a solid ledge under it in a
// darker shade of its fill (Color, Offset deep), a soft drop under that, a
// 1.5-point highlight along its inner top edge (Hi) and a 1-point inner
// rim (Rim, transparent for none). Pressed, it sinks into the ledge.
type Press struct {
	Offset  float32
	Color   ui.Color
	Hi, Rim ui.Color
	// Seam is a 1-point line right under the fill, above the ledge: a
	// lighter, warmer shade that keeps the ledge legible ("brown seam").
	Seam ui.Color
	// Top, when set, is the fill's color at its top edge, running down to
	// the fill: the ink button's gradient.
	Top ui.Color
	// Drop is the soft shadow's color at rest (Tokens.Drop when unset).
	Drop ui.Color
}

// Elevation is a soft shadow: how far down it falls, how blurred, and
// its color.
type Elevation struct {
	Y, Blur float32
	Color   ui.Color
}

// Tokens is one theme's full token set.
type Tokens struct {
	Name string

	// color
	Bg, Surface, SurfaceRaised, SurfaceSunken, Ink, InkMuted, InkSoft ui.Color
	// BgDeep is the devices stage; Sunken the lighter sunken tint (diff
	// hunks, inline code); Faint separators in words (a crumb's slash).
	BgDeep, Sunken, Faint ui.Color
	Accent, OnAccent      ui.Color
	// The two voices of the conversation (D129): the user's bubble in the
	// accent, the partner's in a soft surface on the paper.
	UserBubble, OnUserBubble                ui.Color
	PartnerBubble, OnPartnerBubble          ui.Color
	Line, LineSoft, Highlight, HighlightInk ui.Color
	// Line2 is the secondary button's ledge and the chosen choice's base.
	Line2 ui.Color
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
	// Notebook is the partner's own blue notebook (its clay art's), drawn as
	// Settings › 记忆 / Memory's mark (D257); the web's --notebook-*.
	Notebook NotebookTokens
	// Isles is the Devices stage's scene (D81): a calm clay sea, the
	// bridges from home and what crosses them.
	Isles IslesTokens

	// type: one scale (D76). XS captions and labels, SM secondary text
	// and small controls, MD body and controls, Bubble the user's bubble
	// and the composer, LG the partner's voice, XL card titles and asks,
	// XXL section titles, Title screen titles and a task's outcome, Hero
	// hero numbers. 800 for titles and asks, 700 controls, 400 reading.
	// Display is the heading face: Bricolage for Latin, Resource Han
	// Rounded for Chinese (D78); Body the reading face (PingFang SC for
	// Chinese).
	Display, Body, Mono     string
	XS, SM, MD, LG, XL, XXL float32 // 12, 13, 15, 18, 20, 28
	// XXS is the one step below captions, 11: only an imprint's who-line
	// (D236), never words to read.
	XXS         float32
	Bubble      float32 // the conversation's one body size, both bubbles and the composer, 16
	PartnerSize float32 // the partner's words, the same 16 (D129)
	Title       float32 // screen titles and a task's outcome, 34
	Hero        float32 // hero numbers, 56
	MonoSM      float32 // code in cards and transcripts, 13

	// space: one 4-point scale, S1 4 … S7 48. Gaps inside a group are
	// S2–S3, between groups S4–S5, between a screen's sections S6–S7.
	S1, S2, S3, S4, S5, S6, S7 float32

	// shape: XS small chips and glyph tiles, SM buttons, chips and fields,
	// MD sheets and inset cards, LG cards, XL hero cards and the composer.
	RadiusXS, RadiusSM, RadiusMD, RadiusLG, RadiusXL, Pill float32

	// controls: the heights of the one button family (SM in the chrome
	// and inline, MD in cards and the conversation, LG on setup screens)
	// and of chips (ChipSM for a state tag, Chip for evidence and
	// metadata, ChipLG for a task's chip in the conversation). Buttons
	// have RadiusSM corners, chips RadiusXS: a chip never looks pressable
	// the way a button does.
	ControlSM, ControlMD, ControlLG, ChipSM, Chip, ChipLG float32
	// ButtonRadius are the corners of the three button heights (12/14/18).
	ButtonRadius [3]float32
	// IconSM is a glyph inside a control; IconTile a glyph's tile in a
	// row (a check, a clock).
	IconSM, IconTile float32
	// BubbleRadius is the user bubble's corners: top-left, top-right,
	// bottom-right, bottom-left. The partner's bubble mirrors it; a bubble
	// that follows one of the same voice takes BubbleJoin on its tail side's
	// top corner, so a run of messages stacks (D129).
	BubbleRadius [4]float32
	BubbleJoin   float32
	// BubbleMeasure is a bubble's widest, about 38em of the body size.
	BubbleMeasure float32
	// PebbleRadius is a task pebble's slightly irregular corners.
	PebbleRadius [4]float32

	// depth: one clay (D76). A card rests on a solid base (Raised: 4
	// points of Line, no blur; a tinted card's base is its state's Ledge)
	// and never moves; a sheet over the page adds Floating. A button
	// stands on a ledge with a drop (Drop; DropPressed while pressed) and
	// sinks into it. Chips and text buttons are flat.
	PressPrimary, PressSecondary, PressAccent Press
	Raised, Floating                          Elevation
	// Scrim dims the page under a dialog (the New task card), in warm
	// dark; the phone's sheet scrim (--scrim) is lighter still.
	Scrim ui.Color
	// Lightbox dims the page under the picture viewer (D206): the paper
	// gives way to warm dark so the picture is what you see; LightboxInk is
	// the bar's words and marks on it, MediaGap the hairline between tiles.
	Lightbox, LightboxInk ui.Color
	// PDFPage is a PDF page's paper (D242): printed matter, white in every theme.
	PDFPage           ui.Color
	MediaGap          float32
	Drop, DropPressed Elevation

	// motion: Snappy for hover and lift, PressDur for a press, EnterDur
	// for a screen or a notice coming in, Bouncy for the living message
	// and the equip.
	Bouncy, Snappy     ui.Animation
	PressDur, EnterDur time.Duration
	// Equip is the sticker peel-and-stick of an ability (research/26, 28).
	Equip EquipMotion

	// Reply is 回复 / Reply to one message (D236): the imprint.
	Reply ReplyTokens
}

// ReplyTokens are the imprint's (D236, research/72): the message replied to,
// as a small copy of its own bubble (its voice's colour and tail), pressed
// into the reply like a pebble into clay. The names mirror the web's
// (--r-imprint, --imprint-*, --found-*, --t-press-in).
type ReplyTokens struct {
	// Radius is the partner's imprint (tail bottom-left), RadiusYou the
	// user's, mirrored: top-left, top-right, bottom-right, bottom-left.
	Radius, RadiusYou [4]float32
	// Deboss is how it sits pressed in: the reverse of a raised button.
	// The clay above its top and left rims casts a shadow into the hollow,
	// and its lower edge, where the hollow turns back up, catches the
	// light. No border line. Raised is the pebble before it is pressed in
	// (a sent imprint lands from it into Deboss).
	Deboss Deboss
	Raised Elevation
	// The hollow's floor, a little below what it is pressed into: the
	// user's orange bubble, the partner's bubble, the composer's card.
	OnUser, OnPartner, OnSurface ui.Color
	// The quote's ink, quieter than the words around it so the person's own
	// words lead: on the orange, and elsewhere. The who-line is InkSoft
	// (OnUserBubble on the orange) at XXS.
	InkOnUser, Ink ui.Color
	// Found is how far a bubble's own tint deepens when an imprint brings it
	// back, by voice; FoundDur the whole find.
	FoundUser, FoundPartner ui.Color
	FoundDur                time.Duration
	// PressIn is a sent imprint settling into its bubble.
	PressIn time.Duration
}

// Inset is an inner shadow: offset, blur, spread (negative pulls it in
// from the sides), colour, as CSS's box-shadow: inset.
type Inset struct {
	X, Y, Blur, Spread float32
	Color              ui.Color
}

// Deboss is a hollow's inner shadows: under the top rim, under the left
// rim, and the lit lower edge.
type Deboss struct {
	Top, Left, Light Inset
}

// IslesTokens are the colors of the Devices stage's scene (D81): the sky
// band and the sea from far to near, the light on the water, the foam
// round an island and the mist of one that can't be reached; a bridge's
// planks, their dark edge and its ropes; a parcel crossing it.
type IslesTokens struct {
	Sky, SeaFar, Sea, SeaNear, Glint, Foam, Mist ui.Color
	// SkyTop is the sky's top, Haze the horizon's, Cloud the soft clouds.
	SkyTop, Haze, Cloud               ui.Color
	Plank, PlankDark, PlankPale, Rope ui.Color
	Parcel, ParcelEdge                ui.Color
	// ParcelSpeed is how fast parcels cross, in scene points a second.
	ParcelSpeed float32
}

// NotebookTokens are the notebook's: its cover on a darker ledge, the
// pages' edge, the highlight along its top, the strap and its clasp.
type NotebookTokens struct {
	Cover, Ledge, Pages, Shine, Strap, Clasp ui.Color
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
	t := &Tokens{
		Name:          "pebble",
		Bg:            hex("#FFF6EA"),
		Surface:       hex("#FFFFFF"),
		SurfaceRaised: hex("#FFFBF0"),
		SurfaceSunken: hex("#F3E6D3"),
		BgDeep:        hex("#FCECD7"),
		Sunken:        hex("#F7EBDA"),
		Faint:         hex("#C7B49A"),
		Line2:         hex("#E0C9B0"),
		Ink:           hex("#2B2118"),
		InkMuted:      hex("#75654F"),
		InkSoft:       hex("#4A3D30"),
		Accent:        hex("#FF8A3D"),
		OnAccent:      hex("#2B2118"),
		// The user in the accent with ink (6.9:1), the partner in white on the
		// paper (D129; cocoa before).
		UserBubble:      hex("#FF8A3D"),
		OnUserBubble:    hex("#2B2118"),
		PartnerBubble:   hex("#FFFFFF"),
		OnPartnerBubble: hex("#2B2118"),
		Line:            hex("#E8D9C4"),
		LineSoft:        hex("#F3E6D3"),
		Chrome:          hex("#FFFAF3"),
		ChromeLine:      hex("#EEDFCA"),
		Highlight:       hex("#FFE9A8"),
		HighlightInk:    hex("#6B5000"),
		Added:           hex("#DDF3E2"),
		AddedInk:        hex("#1C5530"),
		Deleted:         hex("#FCE3DF"),
		DeletedInk:      hex("#7A1E14"),

		NeedsYou: StateColors{Dot: hex("#FF8A3D"), Surface: hex("#FFE3CF"), Ink: hex("#8A3A0C"), Strong: hex("#E06A1F"), Ledge: hex("#F0C29E")},
		Working:  StateColors{Dot: hex("#4BA8F0"), Surface: hex("#DCEFFF"), Ink: hex("#174A75"), Strong: hex("#2F86C8"), Ledge: hex("#B9DBF5")},
		Waiting:  StateColors{Dot: hex("#FFC94D"), Surface: hex("#FFF0BF"), Ink: hex("#6B5000"), Strong: hex("#B58600"), Ledge: hex("#F0DA8E")},
		Done:     StateColors{Dot: hex("#7FD99A"), Surface: hex("#D6F5DC"), Ink: hex("#1F5E2F"), Strong: hex("#2E9A55"), Ledge: hex("#B4E3BE")},
		Failed:   StateColors{Dot: hex("#E5577A"), Surface: hex("#FBDDE4"), Ink: hex("#8A1F3B"), Strong: hex("#C23A5E"), Ledge: hex("#F2BCC9")},
		Awake:    StateColors{Dot: hex("#2FA45C"), Surface: hex("#D4F5DD"), Ink: hex("#1F5E2F"), Strong: hex("#2E9A55")},
		Asleep:   StateColors{Dot: hex("#6C63A8"), Surface: hex("#ECE9F8"), Ink: hex("#4B3F70"), Strong: hex("#574F8F")},
		Away:     StateColors{Dot: hex("#A99C8B"), Surface: hex("#EFEAE3"), Ink: hex("#5E5448"), Strong: hex("#8C7F6E")},
		Clay:     hex("#FFF4E6"),
		Notebook: NotebookTokens{Cover: hex("#5FA6E4"), Ledge: hex("#3A78B0"), Pages: hex("#FFF6EA"), Shine: hex("#FFFFFF").Alpha(0.55), Strap: hex("#9A6236"), Clasp: hex("#F0C879")},
		Isles: IslesTokens{
			Sky: hex("#FCEBD6"), SeaFar: hex("#C4E6DF"), Sea: hex("#A6D8D0"), SeaNear: hex("#86C4BC"),
			SkyTop: hex("#E9EEEA"), Haze: hex("#FFF6EA"), Cloud: hex("#FFFDF8"),
			Glint: hex("#FFFFFA"), Foam: hex("#FFFFFF"), Mist: hex("#FFF9F0"),
			Plank: hex("#D9A76A"), PlankDark: hex("#A8743E"), PlankPale: hex("#EADCC6"), Rope: hex("#8A6236"),
			Parcel: hex("#FFF3E0"), ParcelEdge: hex("#C98F4E"),
			ParcelSpeed: 40,
		},

		Display: "Bricolage Grotesque, Resource Han Rounded CN, PingFang SC, Noto Sans SC",
		Body:    "Bricolage Grotesque, PingFang SC, Noto Sans SC",
		Mono:    "JetBrains Mono, SF Mono, Menlo, monospace",
		XXS:     11, XS: 12, SM: 13, MD: 15, LG: 18, XL: 20, XXL: 28,
		Bubble:      16,
		PartnerSize: 16,
		Title:       34,
		Hero:        56,
		MonoSM:      13,

		S1: 4, S2: 8, S3: 12, S4: 16, S5: 24, S6: 32, S7: 48,

		RadiusXS: 8, RadiusSM: 12, RadiusMD: 16, RadiusLG: 24, RadiusXL: 28, Pill: 999,
		ControlSM: 36, ControlMD: 44, ControlLG: 52, ChipSM: 24, Chip: 28, ChipLG: 32,
		ButtonRadius: [3]float32{12, 14, 18},
		IconSM:       16, IconTile: 28,
		BubbleRadius: [4]float32{20, 20, 6, 20},
		BubbleJoin:   6, BubbleMeasure: 38 * 16,
		PebbleRadius: [4]float32{6, 7, 5, 6},

		// Ink: "brown seam" (a #000 ledge under #2B2118 disappeared).
		PressPrimary: Press{Offset: 3, Color: hex("#140D07"), Seam: hex("#5A4434"), Top: hex("#3B2D22"),
			Hi: hex("#FFF6EA").Alpha(0.26), Rim: hex("#FFECD6").Alpha(0.08), Drop: hex("#2B2118").Alpha(0.38)},
		PressSecondary: Press{Offset: 3, Color: hex("#CDAE8C"), Seam: hex("#EAD6BC"), Hi: hex("#FFFFFF").Alpha(0.95), Rim: hex("#2B2118").Alpha(0.09)},
		PressAccent:    Press{Offset: 3, Color: hex("#C9642A"), Seam: hex("#FFA466"), Hi: hex("#FFFFFF").Alpha(0.38), Rim: ui.Transparent},
		Raised:         Elevation{Y: 4, Blur: 0, Color: hex("#E8D9C4")},
		Floating:       Elevation{Y: 10, Blur: 32, Color: hex("#2B2118").Alpha(0.14)},
		Scrim:          hex("#3C2814").Alpha(0.14),
		Lightbox:       hex("#1A130D").Alpha(0.92),
		PDFPage:        hex("#FFFFFF"),
		LightboxInk:    hex("#FFF6EA"),
		MediaGap:       3,
		Drop:           Elevation{Y: 7, Blur: 12, Color: hex("#2B2118").Alpha(0.28)},
		DropPressed:    Elevation{Y: 1, Blur: 3, Color: hex("#2B2118").Alpha(0.22)},

		Bouncy:   ui.Animation{Spring: ui.SpringOptions{Duration: 420e6, Bounce: 0.35}},
		Snappy:   ui.Snappy,
		PressDur: 70 * time.Millisecond, EnterDur: 220 * time.Millisecond,
		Equip: EquipMotion{Flight: 820 * time.Millisecond, Snap: 0.62, Squash: 420 * time.Millisecond, DoneFace: 1800 * time.Millisecond, Fade: 200 * time.Millisecond},
	}
	t.Reply = replyTokens(t)
	return t
}

// replyTokens derives the imprint's colours from the theme's own, as the
// web's color-mix() does (D236).
func replyTokens(t *Tokens) ReplyTokens {
	return ReplyTokens{
		Radius:    [4]float32{14, 14, 14, 4},
		RadiusYou: [4]float32{14, 14, 4, 14},
		Deboss: Deboss{
			Top:   Inset{Y: 3, Blur: 3, Spread: -1, Color: t.Ink.Alpha(0.30)},
			Left:  Inset{X: 2, Blur: 3, Spread: -2, Color: t.Ink.Alpha(0.20)},
			Light: Inset{Y: -1.5, Color: hex("#FFFFFF").Alpha(0.45)},
		},
		Raised:       Elevation{Y: 3, Color: t.Ink.Alpha(0.16)},
		OnUser:       t.UserBubble.Mix(t.Ink, 0.10),
		OnPartner:    t.Sunken.Mix(t.Ink, 0.04), // a warm hollow: the paper's sunken tone, a little deeper
		OnSurface:    t.Sunken.Mix(t.Ink, 0.04),
		InkOnUser:    t.Ink.Mix(t.UserBubble, 0.26),
		Ink:          t.InkMuted,
		FoundUser:    t.UserBubble.Mix(t.Ink, 0.16),
		FoundPartner: t.PartnerBubble.Mix(t.Accent, 0.20),
		FoundDur:     1400 * time.Millisecond,
		PressIn:      300 * time.Millisecond,
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

// JetBrains Mono (OFL), Latin subset, variable weight.
//
//go:embed fonts/JetBrainsMono.ttf
var jetbrainsMono []byte

// Resource Han Rounded CN Bold (OFL), the zh heading face (D78), cut to the
// common hanzi (fits the 2 MB binary rule, D75); a missing glyph falls
// back to PingFang SC.
//
//go:embed fonts/ResourceHanRoundedCN-Bold.ttf
var hanRounded []byte

var fontsOnce sync.Once

// LoadFonts registers the embedded fonts (OFL): Bricolage Grotesque,
// JetBrains Mono and Resource Han Rounded CN Bold, and any fonts in
// $DUCTER_FONTS or ~/.ducter/fonts (as Noto Sans SC).
// Fonts that do not load fall back to the system's (PingFang SC for CJK).
func LoadFonts() {
	fontsOnce.Do(func() {
		for _, f := range []struct {
			data []byte
			name string
		}{{bricolage, "Bricolage Grotesque"}, {jetbrainsMono, "JetBrains Mono"}, {hanRounded, "Resource Han Rounded CN"}} {
			if err := ui.RegisterFont(f.data, f.name); err != nil {
				log.Printf("ducter: %s: %v (system font instead)", f.name, err)
			}
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
