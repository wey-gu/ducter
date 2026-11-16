package views

// D288: 上下文 / Context, as on the web (apps/web/src/context-meter.tsx).
// A quiet ring by the task's composer that fills with the agent's context
// window (the compaction point a tick on it; butter, never red, once it is
// close), and the card it opens: the window used, the last turn and this
// task in all, how many times it was compacted, 现在压缩 / Compact now, and
// the agent account's limits when the agent shares them. contextOf is the
// port of packages/protocol/src/context-meter.ts and passes the same cases
// (packages/protocol/fixtures/context-meter.json).

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// ContextMeter is a task's context as its Log says it.
type ContextMeter struct {
	Tokens      *int64               `json:"tokens,omitempty"`
	Window      *int64               `json:"window,omitempty"`
	CompactAt   *int64               `json:"compactAt,omitempty"`
	Percent     *int64               `json:"percent,omitempty"`
	Level       string               `json:"level"` // calm | near
	Turn        *protocol.TurnTokens `json:"turn,omitempty"`
	Total       *protocol.TurnTokens `json:"total,omitempty"`
	Compactions int                  `json:"compactions"`
	Last        *LastCompaction      `json:"last,omitempty"`
}

// LastCompaction is the latest compaction: its sizes before and after, when known.
type LastCompaction struct {
	Seq    int64 `json:"seq"`
	From   int64 `json:"from,omitempty"`
	To     int64 `json:"to,omitempty"`
	Manual bool  `json:"manual,omitempty"`
}

type meterRaw struct {
	Kind          string          `json:"kind"`
	ContextTokens *float64        `json:"contextTokens"`
	ContextWindow *float64        `json:"contextWindow"`
	CompactAt     *float64        `json:"compactAt"`
	After         json.RawMessage `json:"after"`
	Before        *float64        `json:"before"`
	Outcome       string          `json:"outcome"`
	Trigger       string          `json:"trigger"`
	Compactions   *float64        `json:"compactions"`
	Switched      json.RawMessage `json:"switched"`
}

func posNum(v *float64) (int64, bool) {
	if v == nil || *v < 0 || math.IsNaN(*v) || math.IsInf(*v, 0) {
		return 0, false
	}
	return int64(math.Round(*v)), true
}

func i64(n int64) *int64 { return &n }

// saveBeforeAt is where a task is asked to save before it compacts (D135, harness-facts.ts).
func saveBeforeAt(compactAt int64) int64 {
	return max(int64(math.Round(float64(compactAt)*0.85)), compactAt-20_000)
}

// contextOf is the meter from a task's events.
func contextOf(events []protocol.LogEvent) ContextMeter {
	m := ContextMeter{Level: "calm"}
	type totals struct{ in, out, cached int64 }
	var prev *totals
	frame := func(w, c *float64) {
		if n, ok := posNum(w); ok && n > 0 {
			m.Window = i64(n)
		}
		if n, ok := posNum(c); ok && n > 0 {
			m.CompactAt = i64(n)
		}
	}
	add := func(t protocol.TurnTokens) {
		if m.Total == nil {
			m.Total = &protocol.TurnTokens{}
		}
		m.Total.Input += t.Input
		m.Total.Output += t.Output
		m.Total.Cached += t.Cached
	}
	for _, ev := range events {
		if ev.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if ev.Decode(&b) != nil {
			continue
		}
		var r meterRaw
		if len(b.Raw) > 0 {
			_ = json.Unmarshal(b.Raw, &r)
		}
		switch {
		case r.Kind == "context":
			frame(r.ContextWindow, r.CompactAt)
			n, ok := posNum(r.ContextTokens)
			if ok {
				m.Tokens = i64(n)
			}
			if ok && truthyRaw(r.After) && m.Last != nil && m.Last.To == 0 {
				m.Last.To = n
			}
			continue
		case r.Kind == "compaction_ended":
			if r.Outcome == "failed" || r.Outcome == "aborted" {
				continue
			}
			c, _ := posNum(r.Compactions)
			m.Compactions = max(m.Compactions+1, int(c))
			from, ok := posNum(r.Before)
			if !ok {
				from, _ = posNum(r.ContextTokens)
			}
			var to int64
			if len(r.After) > 0 {
				var f float64
				if json.Unmarshal(r.After, &f) == nil && f > 0 {
					to = int64(math.Round(f))
				}
			}
			m.Last = &LastCompaction{Seq: ev.Seq, From: from, To: to, Manual: r.Trigger == "manual"}
			if to > 0 {
				m.Tokens = i64(to)
			} else {
				m.Tokens = nil
			}
			continue
		case truthyRaw(r.Switched):
			m.Tokens, prev = nil, nil
			continue
		}
		u := b.Usage
		if u == nil {
			continue
		}
		if u.ContextWindow > 0 {
			m.Window = i64(u.ContextWindow)
		}
		if u.CompactAt > 0 {
			m.CompactAt = i64(u.CompactAt)
		}
		if u.ContextTokens > 0 {
			m.Tokens = i64(u.ContextTokens)
		}
		now := totals{u.InputTokens, u.OutputTokens, u.CacheRead}
		turn := u.Turn
		reported := u.InputTokens > 0 || u.OutputTokens > 0
		if turn == nil && reported {
			base := totals{}
			if prev != nil && now.in >= prev.in && now.out >= prev.out {
				base = *prev
			}
			turn = &protocol.TurnTokens{Input: now.in - base.in, Output: now.out - base.out}
			if u.CacheRead > 0 {
				turn.Cached = max(0, now.cached-base.cached)
			}
		}
		if reported {
			p := now
			prev = &p
		}
		if turn != nil {
			tt := *turn
			m.Turn = &tt
			add(tt)
		}
	}
	if m.Tokens != nil && m.Window != nil && *m.Window > 0 {
		m.Percent = i64(int64(math.Round(float64(*m.Tokens) / float64(*m.Window) * 100)))
	}
	var point int64
	if m.CompactAt != nil {
		point = *m.CompactAt
	} else if m.Window != nil {
		point = int64(math.Round(float64(*m.Window) * 0.8))
	}
	if m.Tokens != nil && point > 0 && *m.Tokens >= saveBeforeAt(point) {
		m.Level = "near"
	}
	return m
}

func truthyRaw(r json.RawMessage) bool {
	s := strings.TrimSpace(string(r))
	return s != "" && s != "null" && s != "false" && s != "0" && s != `""`
}

// tokensShort is a token count as people read it: 812, 4.2k, 120k, 1.2M.
func tokensShort(n int64) string {
	f := float64(n)
	switch {
	case n < 1000:
		return fmt.Sprint(n)
	case n < 10_000:
		return trim1(f/1000) + "k"
	case n < 999_500:
		return fmt.Sprintf("%dk", int64(math.Round(f/1000)))
	}
	return trim1(f/1_000_000) + "M"
}

func trim1(x float64) string {
	s := fmt.Sprintf("%.1f", math.Round(x*10)/10)
	return strings.TrimSuffix(s, ".0")
}

var limitModelRe = regexp.MustCompile(`\(([^)]+)\)\s*$`)

// limitName is a usage window in words: "7 天额度 · Opus" (protocol limitSpan).
func (a *App) limitName(w protocol.UsageWindow) string {
	if w.ID == "extra_usage" {
		return a.L.T("ctx.limit.extra")
	}
	model := ""
	if m := limitModelRe.FindStringSubmatch(w.Label); m != nil {
		if s := strings.TrimSpace(m[1]); !strings.EqualFold(s, "all models") && !strings.EqualFold(s, "oauth apps") {
			model = s
		}
	}
	ms := w.DurationMs
	if ms == 0 {
		switch {
		case w.ID == "five_hour":
			ms = 5 * 3_600_000
		case strings.HasPrefix(w.ID, "seven_day"):
			ms = 168 * 3_600_000
		}
	}
	base := ""
	switch {
	case ms > 0 && ms%(24*3_600_000) == 0:
		base = a.L.T("ctx.limit.days", ms/(24*3_600_000))
	case ms > 0 && ms%3_600_000 == 0:
		base = a.L.T("ctx.limit.hours", ms/3_600_000)
	default:
		return w.Label
	}
	if model != "" {
		return a.L.T("ctx.limit.model", base, model)
	}
	return base
}

// ---------- the ring and its card ----------

type meterMemo struct {
	n int
	m ContextMeter
}

// ctxUI is the context card's state: which task's card is open, its
// Compact now asked, and the meters kept while a task's events don't change.
var ctxUI = struct {
	open   bool
	task   string
	asked  string
	memo   map[*store.Task]meterMemo
	askedU map[string]time.Time
}{memo: map[*store.Task]meterMemo{}, askedU: map[string]time.Time{}}

func meterOfTask(task *store.Task) ContextMeter {
	if mm, ok := ctxUI.memo[task]; ok && mm.n == len(task.Events) {
		return mm.m
	}
	m := contextOf(task.Events)
	ctxUI.memo[task] = meterMemo{len(task.Events), m}
	return m
}

func hasMeter(m ContextMeter) bool { return m.Tokens != nil || m.Window != nil || m.Compactions > 0 }

// drawContextRing is the meter: a track, the window used from twelve
// o'clock, and a tick at the compaction point.
func drawContextRing(track, fill, tick ui.Color, frac, at float32) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		rad := min(r.W, r.H)/2 - 2
		var m ui.Path
		m.Circle(cx, cy, rad)
		p.StrokePath(&m, 2.2, track)
		if f := min(1, max(0, frac)); f > 0 {
			var arc ui.Path
			n := max(2, int(math.Ceil(float64(64*f))))
			for i := 0; i <= n; i++ {
				ang := -math.Pi/2 + 2*math.Pi*float64(f)*float64(i)/float64(n)
				x, y := cx+rad*float32(math.Cos(ang)), cy+rad*float32(math.Sin(ang))
				if i == 0 {
					arc.MoveTo(x, y)
				} else {
					arc.LineTo(x, y)
				}
			}
			p.StrokePath(&arc, 2.2, fill)
		}
		if at > 0 && at < 1 {
			ang := -math.Pi/2 + 2*math.Pi*float64(at)
			c, s := float32(math.Cos(ang)), float32(math.Sin(ang))
			var tk ui.Path
			tk.MoveTo(cx+(rad-2.4)*c, cy+(rad-2.4)*s)
			tk.LineTo(cx+(rad+2.4)*c, cy+(rad+2.4)*s)
			p.StrokePath(&tk, 1.3, tick)
		}
	}
}

func (a *App) meterColors(m ContextMeter) ui.Color {
	if m.Level == "near" {
		return a.T.Waiting.Dot
	}
	return a.T.InkMuted
}

func meterFracs(m ContextMeter) (float32, float32) {
	var f, at float32
	if m.Tokens != nil && m.Window != nil && *m.Window > 0 {
		f = float32(*m.Tokens) / float32(*m.Window)
	}
	if m.CompactAt != nil && m.Window != nil && *m.Window > 0 {
		at = float32(*m.CompactAt) / float32(*m.Window)
	}
	return f, at
}

// contextRing is the ring by the task's composer, and its card. Nothing
// until the agent has said something of its context.
func (a *App) contextRing(c *ui.Context, task *store.Task) {
	t := a.T
	m := meterOfTask(task)
	if !hasMeter(m) {
		return
	}
	label := a.L.T("ctx.ring.unknown")
	if m.Percent != nil {
		label = a.L.T("ctx.ring", fmt.Sprintf("%d%%", *m.Percent))
	}
	f, at := meterFracs(m)
	b := ui.Box(c.Key("ctx-ring")).Size(32, 32).Radius(16).Shrink(0).Role(ui.RoleButton).Label(label).Tooltip(label).
		Cursor(ui.CursorPointer).Focusable()
	open := ctxUI.open && ctxUI.task == task.ID
	if open || b.Hovered() {
		b.Background(t.SurfaceSunken)
	}
	b.Children(func() {
		ui.Box(c).Size(20, 20).Margin(6, 6, 6, 6).Draw(drawContextRing(t.LineSoft, a.meterColors(m), t.Faint, f, at)).AccessHidden(true)
	})
	if b.Clicked() {
		ctxUI.open, ctxUI.task = !open, task.ID
		open = ctxUI.open
		if open {
			ctxUI.asked = ""
			a.askAccountUsage(task.Harness(), false)
		}
	}
	if !open {
		return
	}
	ui.PopoverBase(c, b, &ctxUI.open, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(340).Padding(t.S4).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("ctx.title"))
		a.contextCard(c, task, m)
	})
}

// askAccountUsage asks the home for the agent's limits, once a minute at most.
func (a *App) askAccountUsage(harness string, fresh bool) {
	if harness == "" {
		return
	}
	if at, ok := ctxUI.askedU[harness]; ok && !fresh && a.Now().Sub(at) < time.Minute {
		return
	}
	ctxUI.askedU[harness] = a.Now()
	a.send(protocol.AccountUsageReq{T: "account_usage", Harness: harness, Fresh: fresh})
}

func (a *App) contextCard(c *ui.Context, task *store.Task, m ContextMeter) {
	t := a.T
	f, at := meterFracs(m)
	ui.Column(c.Key("ctx-card")).Gap(t.S2).MinWidth(0).Children(func() {
		ui.Row(c).AlignItems(ui.Baseline).Gap(t.S3).Children(func() {
			ui.Text(c, a.L.T("ctx.title")).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink)
			ui.Spacer(c)
			if m.Tokens != nil && m.Window != nil {
				ui.Text(c, tokensShort(*m.Tokens)+" / "+tokensShort(*m.Window)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft)
			}
		})
		fill := a.meterColors(m)
		ui.Box(c.Key("ctx-bar")).Height(12).Grow(1).Draw(func(p *ui.Painter, r ui.Rect) {
			y := r.Y + r.H/2 - 3
			p.Fill(ui.Rect{X: r.X, Y: y, W: r.W, H: 6}, t.LineSoft, 3)
			if w := r.W * min(1, f); w > 0 {
				p.Fill(ui.Rect{X: r.X, Y: y, W: max(6, w), H: 6}, fill, 3)
			}
			if at > 0 && at < 1 {
				p.Fill(ui.Rect{X: r.X + r.W*at - 1, Y: r.Y, W: 2, H: r.H}, t.Faint, 1)
			}
		}).AccessHidden(true)
		line := a.L.T("ctx.none")
		switch {
		case m.Percent != nil:
			line = a.L.T("ctx.used", fmt.Sprintf("%d%%", *m.Percent))
		case m.Compactions > 0:
			line = a.L.T("ctx.unknown")
		}
		ui.Text(c, line).FontSize(t.SM).TextColor(t.Ink).Wrap()
		if m.CompactAt != nil {
			sub := a.L.T("ctx.auto", tokensShort(*m.CompactAt))
			if m.Level == "near" {
				sub = a.L.T("ctx.near")
			}
			ui.Text(c, sub).FontSize(t.XS).TextColor(t.InkMuted).Wrap()
		}
		ui.Column(c.Key("ctx-rows")).Dividers(1, t.LineSoft).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
			row := func(key, label string, body func()) {
				ui.Row(c.Key("ctx:"+key)).Gap(t.S3).Padding(t.S2, 0).AlignItems(ui.Start).Children(func() {
					ui.Text(c, label).Width(96).Shrink(0).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
					ui.Column(c).Grow(1).MinWidth(0).Children(body)
				})
			}
			tokens := func(x *protocol.TurnTokens) {
				parts := []string{a.L.T("ctx.in", tokensShort(x.Input))}
				if x.Cached > 0 {
					parts = append(parts, a.L.T("ctx.cached", tokensShort(x.Cached)))
				}
				parts = append(parts, a.L.T("ctx.out", tokensShort(x.Output)))
				for i, p := range parts {
					parts[i] = strings.ReplaceAll(p, " ", "\u00a0") // a label stays with its number
				}
				ui.Text(c, strings.Join(parts, " · ")).FontSize(t.SM).TextColor(t.Ink).Wrap()
			}
			if m.Turn != nil {
				row("turn", a.L.T("ctx.turn"), func() { tokens(m.Turn) })
			}
			if m.Total != nil {
				row("total", a.L.T("ctx.total"), func() { tokens(m.Total) })
			}
			if m.Compactions > 0 {
				label := a.L.T("ctx.compacted", m.Compactions)
				if m.Compactions == 1 {
					label = a.L.T("ctx.compacted.one")
				}
				row("compacted", label, func() {
					switch {
					case m.Last != nil && m.Last.From > 0 && m.Last.To > 0:
						ui.Text(c, a.L.T("ctx.last", tokensShort(m.Last.From), tokensShort(m.Last.To))).FontSize(t.SM).TextColor(t.InkSoft)
					case m.Last != nil && m.Last.From > 0:
						ui.Text(c, a.L.T("ctx.last.from", tokensShort(m.Last.From))).FontSize(t.SM).TextColor(t.InkSoft)
					}
				})
			}
		})
		att := task.Attention()
		working := att == protocol.Working
		if !finished(task) && att != protocol.Dropped && att != protocol.Superseded {
			asked := ctxUI.asked == task.ID
			ui.Row(c.Key("ctx-acts")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, 0, 0, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
				what := a.L.T("ctx.compact.what")
				if asked {
					what = a.L.T("ctx.compact.asked")
					if working {
						what = a.L.T("ctx.compact.later")
					}
				}
				ui.Text(c, what).FontSize(t.XS).TextColor(t.InkMuted).Wrap().Grow(1).MinWidth(0)
				if !asked && a.button(c, a.L.T("ctx.compact"), btnSecondary, t.ControlSM, t.Surface) {
					// The person's /compact, as if typed (Claude Code runs its own;
					// every other agent gets OAR's); mid-turn it waits for the turn.
					mode := ""
					if working {
						mode = "queue"
					}
					a.send(protocol.TaskSend{T: "task_send", TaskID: task.ID, Text: "/compact", ClientID: fmt.Sprintf("c%d", a.Now().UnixNano()), Mode: mode})
					ctxUI.asked = task.ID
				}
			})
		}
		if h := task.Harness(); h != "" {
			ui.Column(c.Key("ctx-acct")).Gap(t.S1+2).Padding(t.S2, 0, 0, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
				ui.Text(c, a.L.T("ctx.account", harnessName(h))).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				a.accountLimits(c, h)
			})
		}
	})
}

func (a *App) accountLimits(c *ui.Context, harness string) {
	t := a.T
	ans, ok := a.S.AccountUsage[harness]
	if !ok || ans.Usage == nil {
		words := a.L.T("ctx.loading")
		if ok && ans.Why != "" {
			words = a.L.T("ctx.why."+ans.Why, harnessName(harness))
		}
		ui.Text(c, words).FontSize(t.XS).TextColor(t.InkMuted).Wrap()
		return
	}
	u := ans.Usage
	tight := -1
	for i, w := range u.Windows {
		if w.ID != "extra_usage" && (tight < 0 || w.Used > u.Windows[tight].Used) {
			tight = i
		}
	}
	order := []int{}
	if tight >= 0 {
		order = append(order, tight)
	}
	for i, w := range u.Windows {
		if i != tight && w.ID != "extra_usage" {
			order = append(order, i)
		}
	}
	for _, i := range order {
		w := u.Windows[i]
		main := i == tight
		ui.Row(c.Key(fmt.Sprintf("lim:%d", i))).Gap(t.S2).AlignItems(ui.Baseline).Children(func() {
			nm := ui.Text(c, a.limitName(w)).FontSize(t.SM).TextColor(t.InkSoft)
			left := a.L.T("ctx.left", fmt.Sprintf("%d%%", max(0, int(math.Round((1-w.Used)*100)))))
			col := t.InkSoft
			switch {
			case w.Used >= 1:
				left, col = a.L.T("ctx.limited"), t.Failed.Ink
			case w.Used >= 0.8:
				col = t.Waiting.Ink
			}
			lt := ui.Text(c, left).FontSize(t.SM).TextColor(col)
			if main {
				nm.FontWeight(700).TextColor(t.Ink)
				lt.FontWeight(700)
			}
			if at, err := time.Parse(time.RFC3339, w.ResetsAt); err == nil && w.ResetsAt != "" {
				ui.Text(c, a.L.T("ctx.resets", a.when(at.Local()))).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
	}
	var who []string
	if u.Plan != "" {
		who = append(who, strings.ToUpper(u.Plan[:1])+u.Plan[1:])
	}
	if u.Account != "" {
		who = append(who, u.Account)
	}
	if len(who) > 0 {
		ui.Text(c, strings.Join(who, " · ")).FontSize(t.XS).TextColor(t.InkMuted).Wrap()
	}
}
