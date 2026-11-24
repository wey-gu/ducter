package theme

import (
	"reflect"

	"github.com/egoist/mygo/ui"
)

// PebbleDark is Pebble on warm dark paper (D302): the same shapes, depth
// and motion, the colours of the web's prefers-color-scheme: dark tokens
// (apps/web/static/app.css), so the Mac and the phone are one Pebble at
// night. The paper stays a warm brown-black, never grey; the clay keeps its
// ledges (a darker base under every card and button); each state's ink is
// light on its own deep surface. Text tokens pass WCAG AA (contrast_test.go).
func PebbleDark() *Tokens {
	t := Pebble()
	t.Name = "pebble"
	t.Dark = true

	t.Bg = hex("#17120E")
	t.BgDeep = hex("#120E0B")
	t.Surface = hex("#231C16")
	t.SurfaceRaised = hex("#2A221B")
	t.SurfaceSunken = hex("#1D1712")
	t.Sunken = hex("#1D1712")
	t.Faint = hex("#5A4C3E")
	t.Faded = 0.85 // light grey clay reads as lit on the dark card: a little back
	t.Line2 = hex("#0D0A07")
	t.Ink = hex("#F6EBDD")
	t.InkMuted = hex("#A8957E")
	t.InkSoft = hex("#DCCBB6")
	t.Accent = hex("#FF8A3D")
	t.OnAccent = hex("#2B2118")
	t.UserBubble = hex("#FF8A3D")
	t.OnUserBubble = hex("#2B2118")
	t.PartnerBubble = hex("#2A221B")
	t.OnPartnerBubble = hex("#F6EBDD")
	t.Line = hex("#3A3027")
	t.LineSoft = hex("#2C241D")
	t.Chrome = hex("#1B1511")
	t.ChromeLine = hex("#2C241D")
	t.Highlight = hex("#5A4512")
	t.HighlightInk = hex("#FFE9A8")
	t.Added = hex("#1B3322")
	t.AddedInk = hex("#9FE3B1")
	t.Deleted = hex("#3A1C24")
	t.DeletedInk = hex("#FFB3C4")

	// A state's surface is deep and its ink light; the dot keeps its hue,
	// Strong (big numbers, a pebble's shadow) is the dot a little brighter
	// so a number on the dark paper still reads; the Ledge is darker than
	// the surface, the clay's base.
	t.NeedsYou = StateColors{Dot: hex("#FF8A3D"), Surface: hex("#3D2414"), Ink: hex("#FFC39B"), Strong: hex("#FF9F5E"), Ledge: hex("#24150B")}
	t.Working = StateColors{Dot: hex("#4BA8F0"), Surface: hex("#15283A"), Ink: hex("#A9D6FB"), Strong: hex("#6BB8F3"), Ledge: hex("#0B1724")}
	t.Waiting = StateColors{Dot: hex("#FFC94D"), Surface: hex("#362B0E"), Ink: hex("#FFE08A"), Strong: hex("#F2C04A"), Ledge: hex("#1F1806")}
	t.Done = StateColors{Dot: hex("#7FD99A"), Surface: hex("#163222"), Ink: hex("#A6ECBB"), Strong: hex("#5FCB82"), Ledge: hex("#0B1D12")}
	t.Failed = StateColors{Dot: hex("#E5577A"), Surface: hex("#3A1621"), Ink: hex("#F8A9BC"), Strong: hex("#EE7593"), Ledge: hex("#220B12")}
	t.Awake = StateColors{Dot: hex("#4CC277"), Surface: hex("#163222"), Ink: hex("#A6ECBB"), Strong: hex("#5FCB82")}
	t.Asleep = StateColors{Dot: hex("#9B93DA"), Surface: hex("#25223D"), Ink: hex("#C9C4F0"), Strong: hex("#ADA6E6")}
	t.Away = StateColors{Dot: hex("#8C7F6E"), Surface: hex("#2A241E"), Ink: hex("#CFC3B3"), Strong: hex("#A99C8B")}

	// The clay art is cut out (transparent round the figure); it sits on a
	// warm raised ground, a lamp-lit table rather than a hole in the page.
	t.Clay = hex("#2A221B")
	t.Looks = map[string]ui.Color{"sand": hex("#4A3A2A"), "sage": hex("#30452F"), "sky": hex("#263D53"), "plum": hex("#45304A"), "apricot": hex("#573622")}
	t.LookRim = hex("#F6EBDD").Alpha(0.08)
	t.ClayMark = hex("#C9A07C")
	t.Locator = LocatorTokens{You: hex("#FF8A3D"), Ask: hex("#FF9F5E"), Done: hex("#5FCB82"), Failed: hex("#EE7593"),
		Progress: hex("#A8957E"), Quiet: hex("#A8957E"), KnobRim: hex("#8A7864"), Chosen: hex("#DCCBB6")}
	t.Notebook.Pages = hex("#F6EBDD")
	t.Notebook.Shine = hex("#FFFFFF").Alpha(0.35)
	// The Devices sea at dusk: the same scene, the light gone warm and low.
	t.Isles = IslesTokens{
		Sky: hex("#2A2019"), SeaFar: hex("#22403E"), Sea: hex("#1D3836"), SeaNear: hex("#173130"),
		SkyTop: hex("#1A1612"), Haze: hex("#17120E"), Cloud: hex("#3A2F26"),
		Glint: hex("#E8F2EC").Alpha(0.55), Foam: hex("#D8E6E0").Alpha(0.7), Mist: hex("#2A221B"),
		Plank: hex("#B8874F"), PlankDark: hex("#7A5228"), PlankPale: hex("#6B5A44"), Rope: hex("#5E4026"),
		Parcel: hex("#E9D6B8"), ParcelEdge: hex("#A8743E"),
		ParcelSpeed: t.Isles.ParcelSpeed,
	}

	// Ink buttons turn to cream on the dark paper with dark words, on a warm
	// taupe ledge (web --press-primary); quiet buttons keep the paper with a
	// faint light rim and a near-black ledge (--press-quiet, --rim).
	t.PressPrimary = Press{Offset: 3, Color: hex("#8A7A66"), Seam: hex("#B3A28C"), Top: hex("#FFF8EE"),
		Hi: hex("#FFFFFF").Alpha(0.35), Rim: ui.Transparent, Drop: hex("#000000").Alpha(0.5)}
	t.PressSecondary = Press{Offset: 3, Color: hex("#0D0A07"), Seam: hex("#0D0A07"), Hi: hex("#FFFFFF").Alpha(0.06), Rim: hex("#FFFFFF").Alpha(0.06)}
	t.PressAccent = Press{Offset: 3, Color: hex("#C9642A"), Seam: hex("#C9642A"), Hi: hex("#FFFFFF").Alpha(0.30), Rim: ui.Transparent}
	t.Raised = Elevation{Y: 4, Blur: 0, Color: hex("#0D0A07")}
	t.Floating = Elevation{Y: 10, Blur: 32, Color: hex("#000000").Alpha(0.5)}
	t.Scrim = hex("#000000").Alpha(0.42)
	t.Lightbox = hex("#0A0806").Alpha(0.96)
	t.Drop = Elevation{Y: 7, Blur: 12, Color: hex("#000000").Alpha(0.5)}
	t.DropPressed = Elevation{Y: 1, Blur: 3, Color: hex("#000000").Alpha(0.4)}
	t.Family = map[string]ui.Color{
		"pdf": hex("#EE8A72"), "code": hex("#8EA4DC"), "text": hex("#C4AA8A"), "doc": hex("#7CA9EA"),
		"sheet": hex("#74C48E"), "slides": hex("#F2A35F"), "archive": hex("#C9A77A"), "audio": hex("#B893E8"),
		"video": hex("#66C0C7"), "picture": hex("#E69BB8"), "other": hex("#B9A690"),
	}
	t.FamilyOn = hex("#1A130D")

	t.Reply = replyTokens(t)
	// The hollow in dark: deeper shadows, a fainter lit edge (web
	// --imprint-deboss in dark), the floors pressed toward black.
	t.Reply.Deboss = Deboss{
		Top:   Inset{Y: 3, Blur: 3, Spread: -1, Color: hex("#000000").Alpha(0.55)},
		Left:  Inset{X: 2, Blur: 3, Spread: -2, Color: hex("#000000").Alpha(0.40)},
		Light: Inset{Y: -1.5, Color: hex("#FFFFFF").Alpha(0.08)},
	}
	t.Reply.Raised = Elevation{Y: 3, Color: hex("#000000").Alpha(0.45)}
	black := hex("#000000")
	t.Reply.OnUser = t.UserBubble.Mix(black, 0.06)
	t.Reply.OnPartner = t.PartnerBubble.Mix(black, 0.22)
	t.Reply.OnSurface = t.Surface.Mix(black, 0.22)
	t.Reply.InkOnUser = t.OnUserBubble.Mix(t.UserBubble, 0.06)
	t.Reply.FoundPartner = t.PartnerBubble.Mix(t.Accent, 0.22)
	t.Tints = MidnightTints()
	return t
}

// For is Pebble in the light or dark appearance.
func For(dark bool) *Tokens {
	if dark {
		return PebbleDark()
	}
	return Pebble()
}

var colorType = reflect.TypeOf(ui.Color{})

// Blend is the token set k of the way from a to b (0 a, 1 b): every colour
// mixed, everything else b's. It is the appearance's cross-fade (D302):
// the whole window moves from one paper to the other at once, the way a
// room's light changes, with no second copy of the page drawn over it.
func Blend(a, b *Tokens, k float32) *Tokens {
	out := *b
	blendValue(reflect.ValueOf(a).Elem(), reflect.ValueOf(b).Elem(), reflect.ValueOf(&out).Elem(), k)
	return &out
}

func blendValue(a, b, out reflect.Value, k float32) {
	switch {
	case out.Type() == colorType:
		out.Set(reflect.ValueOf(a.Interface().(ui.Color).Mix(b.Interface().(ui.Color), k)))
	case out.Kind() == reflect.Struct:
		for i := 0; i < out.NumField(); i++ {
			if f := out.Field(i); f.CanSet() {
				blendValue(a.Field(i), b.Field(i), f, k)
			}
		}
	case out.Kind() == reflect.Map && out.Type().Elem() == colorType || out.Kind() == reflect.Map && out.Type().Elem().Kind() == reflect.Struct:
		m := reflect.MakeMapWithSize(out.Type(), b.Len())
		for _, key := range b.MapKeys() {
			bv, av := b.MapIndex(key), a.MapIndex(key)
			v := reflect.New(out.Type().Elem()).Elem()
			v.Set(bv)
			if av.IsValid() {
				blendValue(av, bv, v, k)
			}
			m.SetMapIndex(key, v)
		}
		out.Set(m)
	}
}
