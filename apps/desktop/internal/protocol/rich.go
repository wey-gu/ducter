package protocol

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// D303: rich answers, the mirror of packages/protocol/src/rich.ts. The home
// validates the partner's ```ducter-ui blocks and stores each on the
// ai_msg (UI) with the plain text that stands in for it in Text; a client
// splits the text at each block's plain text and draws the block there.
// The drawing model (the table's numeric columns, the chart's scale and
// labels) is computed the same as the web's; fixtures/rich.json holds the
// cases both pass.

// RichPoint is one of a chart's points.
type RichPoint struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

// RichUI is one block: a table, a chart, a checklist or choices, with the
// plain text it stands in for.
type RichUI struct {
	Type    string      `json:"type"`
	Title   string      `json:"title,omitempty"`
	Columns []string    `json:"columns,omitempty"`
	Rows    [][]string  `json:"rows,omitempty"`
	Kind    string      `json:"kind,omitempty"` // a chart's: bar | line
	Unit    string      `json:"unit,omitempty"`
	Summary string      `json:"summary,omitempty"`
	Points  []RichPoint `json:"points,omitempty"`
	Items   []string    `json:"items,omitempty"`
	Tell    bool        `json:"tell,omitempty"`
	Options []string    `json:"options,omitempty"`
	Plain   string      `json:"plain"`
}

// The limits a block is held to (RICH_LIMITS).
const (
	richTitle      = 60
	richColsMin    = 2
	richColsMax    = 6
	richRowsMax    = 12
	richCell       = 80
	richHead       = 40
	richPointsMin  = 2
	richPointsMax  = 14
	richLabel      = 16
	richUnit       = 8
	richSummary    = 200
	richItemsMax   = 12
	richItem       = 120
	richOptionsMin = 2
	richOptionsMax = 5
	richOption     = 40
)

func fits(s string, max int, need bool) bool {
	n := utf8.RuneCountInString(s)
	return n <= max && (!need || strings.TrimSpace(s) != "")
}

// Known says whether this client can draw the block; a newer home may send
// a kind it doesn't know, whose plain text then shows.
func (b *RichUI) Known() bool {
	if !fits(b.Title, richTitle, false) {
		return false
	}
	switch b.Type {
	case "table":
		if len(b.Columns) < richColsMin || len(b.Columns) > richColsMax || len(b.Rows) < 1 || len(b.Rows) > richRowsMax {
			return false
		}
		for i, c := range b.Columns {
			if !fits(c, richHead, i > 0) {
				return false
			}
		}
		for _, r := range b.Rows {
			if len(r) != len(b.Columns) {
				return false
			}
			for j, c := range r {
				if !fits(c, richCell, j == 0) {
					return false
				}
			}
		}
		return true
	case "chart":
		if (b.Kind != "bar" && b.Kind != "line") || len(b.Points) < richPointsMin || len(b.Points) > richPointsMax {
			return false
		}
		if !fits(b.Summary, richSummary, true) || !fits(b.Unit, richUnit, false) {
			return false
		}
		for _, p := range b.Points {
			if !fits(p.Label, richLabel, true) || math.IsNaN(p.Value) || math.IsInf(p.Value, 0) {
				return false
			}
		}
		return true
	case "checklist":
		if len(b.Items) < 1 || len(b.Items) > richItemsMax {
			return false
		}
		for _, x := range b.Items {
			if !fits(x, richItem, true) {
				return false
			}
		}
		return true
	case "choices":
		if len(b.Options) < richOptionsMin || len(b.Options) > richOptionsMax {
			return false
		}
		seen := map[string]bool{}
		for _, x := range b.Options {
			if !fits(x, richOption, true) || seen[x] {
				return false
			}
			seen[x] = true
		}
		return true
	}
	return false
}

// RichPart is a run of words or one block (Index into the message's UI).
type RichPart struct {
	Words string
	Block *RichUI
	Index int
}

// SplitRich is the words and the blocks of a message, in order. A block
// whose plain text is missing goes last; one this client can't draw is left
// to its plain text.
func SplitRich(text string, ui []RichUI) []RichPart {
	var parts, after []RichPart
	at := 0
	known := 0
	for i := range ui {
		b := &ui[i]
		if !b.Known() {
			continue
		}
		known++
		j := -1
		if b.Plain != "" {
			if k := strings.Index(text[at:], b.Plain); k >= 0 {
				j = at + k
			}
		}
		if j < 0 {
			after = append(after, RichPart{Block: b, Index: i})
			continue
		}
		if w := strings.TrimSpace(text[at:j]); w != "" {
			parts = append(parts, RichPart{Words: w})
		}
		parts = append(parts, RichPart{Block: b, Index: i})
		at = j + len(b.Plain)
	}
	if known == 0 {
		if strings.TrimSpace(text) == "" {
			return nil
		}
		return []RichPart{{Words: text}}
	}
	if w := strings.TrimSpace(text[at:]); w != "" {
		parts = append(parts, RichPart{Words: w})
	}
	return append(parts, after...)
}

// ---------- the drawing model, the same on every client ----------

// FmtNum is a number as the blocks show it: at most two decimals, trailing
// zeros dropped, thousands grouped.
func FmtNum(v float64) string {
	r := math.Round(v*100) / 100
	s := strconv.FormatFloat(math.Abs(r), 'f', 2, 64)
	intPart, dec, _ := strings.Cut(s, ".")
	var g strings.Builder
	for i, ch := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			g.WriteByte(',')
		}
		g.WriteRune(ch)
	}
	dec = strings.TrimRight(dec, "0")
	out := g.String()
	if dec != "" {
		out += "." + dec
	}
	if r < 0 {
		out = "-" + out
	}
	return out
}

// WithUnit is a value with its unit: "%" and "°" hug the number; any
// other unit gets a space.
func WithUnit(v, unit string) string {
	if unit == "" {
		return v
	}
	if strings.HasPrefix(unit, "%") || strings.HasPrefix(unit, "°") {
		return v + unit
	}
	return v + " " + unit
}

var richNumeric = regexp.MustCompile(`^[-+−]?[$¥€£]?\s?\d[\d,]*(\.\d+)?\s?(%|[A-Za-z]{1,4}|[\x{4e00}-\x{9fff}]{1,2})?$`)

// ChartSteps is the most steps between the chart's lines (CHART_STEPS).
const ChartSteps = 5

func round9(x float64) float64 { return math.Round(x*1e9) / 1e9 }

// ChartScale is the chart's scale: from zero (or below, for negatives) to a
// round top, the step the smallest 1, 2 or 5 times a power of ten that
// needs at most ChartSteps steps.
func ChartScale(values []float64) (lo, hi, step float64) {
	mn, mx := 0.0, 0.0
	for _, v := range values {
		mn, mx = math.Min(mn, v), math.Max(mx, v)
	}
	if mn == mx {
		mx = 1
	}
	p := math.Pow(10, math.Floor(math.Log10((mx-mn)/ChartSteps)))
	for {
		for _, m := range []float64{1, 2, 5} {
			step = round9(m * p)
			lo = round9(math.Floor(round9(mn/step)) * step)
			hi = round9(math.Ceil(round9(mx/step)) * step)
			if round9((hi-lo)/step) <= ChartSteps {
				return lo, hi, step
			}
		}
		p *= 10
	}
}

// ChartTick is one of a chart's lines.
type ChartTick struct {
	Value float64 `json:"value"`
	Label string  `json:"label"`
}

// ChartDot is one point as drawn: its words and where it sits (0 at the
// bottom line, 1 at the top).
type ChartDot struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Text  string  `json:"text"`
	Frac  float64 `json:"frac"`
}

// RichModel is what a client draws a block from.
type RichModel struct {
	Type    string      `json:"type"`
	Title   string      `json:"title,omitempty"`
	Columns []string    `json:"columns,omitempty"`
	Rows    [][]string  `json:"rows,omitempty"`
	Numeric []bool      `json:"numeric,omitempty"`
	Kind    string      `json:"kind,omitempty"`
	Unit    string      `json:"unit,omitempty"`
	Summary string      `json:"summary,omitempty"`
	Lo      float64     `json:"lo,omitempty"`
	Hi      float64     `json:"hi,omitempty"`
	Ticks   []ChartTick `json:"ticks,omitempty"`
	Points  []ChartDot  `json:"points,omitempty"`
	Values  bool        `json:"values,omitempty"`
	Items   []string    `json:"items,omitempty"`
	Tell    bool        `json:"tell,omitempty"`
	Options []string    `json:"options,omitempty"`
}

// ModelOf is the block's drawing model.
func ModelOf(b *RichUI) RichModel {
	m := RichModel{Type: b.Type, Title: b.Title}
	switch b.Type {
	case "table":
		m.Columns, m.Rows = b.Columns, b.Rows
		m.Numeric = make([]bool, len(b.Columns))
		for j := 1; j < len(b.Columns); j++ {
			any, all := false, true
			for _, r := range b.Rows {
				c := strings.TrimSpace(r[j])
				if r[j] != "" {
					any = true
					if !richNumeric.MatchString(c) {
						all = false
					}
				}
			}
			m.Numeric[j] = any && all
		}
	case "chart":
		m.Kind, m.Unit, m.Summary = b.Kind, b.Unit, b.Summary
		vals := make([]float64, len(b.Points))
		for i, p := range b.Points {
			vals[i] = p.Value
		}
		lo, hi, step := ChartScale(vals)
		m.Lo, m.Hi = lo, hi
		for i := 0; ; i++ {
			v := round9(lo + float64(i)*step)
			if v > hi+step/1e6 {
				break
			}
			m.Ticks = append(m.Ticks, ChartTick{Value: v, Label: FmtNum(v)})
		}
		for _, p := range b.Points {
			m.Points = append(m.Points, ChartDot{Label: p.Label, Value: p.Value, Text: WithUnit(FmtNum(p.Value), b.Unit), Frac: round9((p.Value - lo) / (hi - lo))})
		}
		m.Values = len(b.Points) <= 8
	case "checklist":
		m.Items, m.Tell = b.Items, b.Tell
	case "choices":
		m.Options = b.Options
	}
	return m
}
