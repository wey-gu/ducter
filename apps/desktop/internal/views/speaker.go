package views

// D568: one answer to "whose figure is this?". Every figure, clay and name
// a view shows stands for one of three identities, and speakerFor is the
// only place that resolves them (the web's A.speakerFor is its twin):
//
//   - the product (speakBrand): the app's own pebble in the brand clay and
//     the name "Ducter" (the About card); never a partner's figure;
//   - the partner you are talking with (speakShown, ""): a pane that says
//     "我…" speaks as the shown partner, with its own name, figure and clay,
//     with one partner too;
//   - a specific partner (its id): a partner's own row, a task's owner.
//
// A figure never wears one partner's clay beside another partner's name.
// figs records each figure a frame drew with the name it stood for, so the
// views tests can check exactly that (speaker_test.go).

import (
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const (
	speakShown = ""
	speakBrand = "\x00brand"
)

// brandName is the product's own name: the About card, never a partner's.
const brandName = "Ducter"

// speaker is who a figure stands for: its name, its wear (figure and clay,
// theme.Wear) and, for a partner, its id.
type speaker struct {
	ID    string
	Name  string
	Wear  string
	Brand bool
}

// speakerFor resolves who: speakBrand, speakShown or a partner's id. A
// partner the home no longer lists (or a home without the partners frame)
// is the shown one's name as the welcome said it, in the art as drawn.
func (a *App) speakerFor(who string) speaker {
	if who == speakBrand {
		return speaker{Name: brandName, Wear: theme.BrandWear, Brand: true}
	}
	id := who
	if id == speakShown {
		id = a.shownPartnerID()
	}
	if p := a.partnerByID(id); p != nil {
		return speaker{ID: p.ID, Name: p.Name, Wear: a.wearOf(p)}
	}
	if who == speakShown || id == protocol.DefaultPartner {
		return speaker{ID: protocol.DefaultPartner, Name: a.welcomeName()}
	}
	return a.speakerFor(protocol.DefaultPartner)
}

// speakerThinks is what a partner thinks with, said as the Overview and the
// Partner pane's head say it: its own agent and model when it was given
// its own (D536), else the default's (homeThinks).
func (a *App) speakerThinks(sp speaker) string {
	if p := a.partnerByID(sp.ID); p != nil && p.ID != protocol.DefaultPartner && p.Brain != nil && p.Brain.Harness != "" {
		agent := harnessName(p.Brain.Harness)
		if p.Brain.Model == "" {
			return agent
		}
		return a.L.T("home.thinks", agent, a.brainModelLabel(p.Brain.Harness, p.Brain.Model))
	}
	return a.homeThinks()
}

// ownBrain: the speaker thinks with an agent of its own, so the default's
// held lines (D435) are not its to say.
func (a *App) ownBrain(sp speaker) bool {
	p := a.partnerByID(sp.ID)
	return p != nil && p.ID != protocol.DefaultPartner && p.Brain != nil && p.Brain.Harness != ""
}

// drawnFig is one figure a frame drew: its wear and the name it stood for.
type drawnFig struct {
	Key, Wear, Who string
	Brand          bool
}

// noteFig records a drawn figure for the identity test (cleared each frame).
func (a *App) noteFig(key, wear, who string, brand bool) {
	if a.figs == nil {
		return
	}
	*a.figs = append(*a.figs, drawnFig{Key: key, Wear: wear, Who: who, Brand: brand})
}

// sameWear: two wears draw the same figure in the same clay ("" and the
// brand's sand both draw the pebble as drawn).
func sameWear(x, y string) bool {
	norm := func(w string) string {
		f, l := theme.FigureOf(w), w
		if i := strings.IndexByte(w, '/'); i >= 0 {
			l = w[i+1:]
		}
		if l == "" {
			l = "sand"
		}
		return f + "/" + l
	}
	return norm(x) == norm(y)
}
