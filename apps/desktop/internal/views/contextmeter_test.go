package views

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D288: the meter passes the web's cases (packages/protocol/fixtures/context-meter.json).
func TestContextMeterFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/context-meter.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Cases []struct {
			Name   string
			Events []struct {
				Seq  int64
				Body json.RawMessage
			}
			Want json.RawMessage
		}
		Tokens [][2]any
	}
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	for _, c := range fx.Cases {
		var evs []protocol.LogEvent
		for _, e := range c.Events {
			evs = append(evs, protocol.LogEvent{Seq: e.Seq, Kind: protocol.KindTaskEvent, Body: e.Body})
		}
		got, _ := json.Marshal(contextOf(evs))
		var g, w any
		_ = json.Unmarshal(got, &g)
		_ = json.Unmarshal(c.Want, &w)
		if !reflect.DeepEqual(g, w) {
			t.Errorf("%s:\n got %s\nwant %s", c.Name, got, c.Want)
		}
	}
	for _, tc := range fx.Tokens {
		if got := tokensShort(int64(tc[0].(float64))); got != tc[1].(string) {
			t.Errorf("tokensShort(%v) = %q, want %q", tc[0], got, tc[1])
		}
	}
}

// The ring by the composer opens its card: the window used, the last turn,
// the compactions, Compact now (the person's /compact), and the account's
// limits once the home answers.
func TestContextRingCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		ctxUI.askedU, ctxUI.memo = map[string]time.Time{}, map[*store.Task]meterMemo{}
		L := app.L
		app.OpenTask("t_newtask")
		tt.Frame()
		at := time.Now().UTC().Format(time.RFC3339Nano)
		ts := protocol.TaskStream("t_newtask")
		ev := func(seq int64, te protocol.TaskEvent) protocol.LogEvent {
			te.TaskID = "t_newtask"
			return protocol.NewEvent(seq, at, "default", ts, protocol.OriginTask, protocol.KindTaskEvent, te)
		}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev(800, protocol.TaskEvent{Role: "system", Raw: []byte(`{"kind":"context","contextTokens":150000,"contextWindow":200000,"compactAt":160000}`)}),
			ev(801, protocol.TaskEvent{Role: "system", Text: "compaction completed", Raw: []byte(`{"kind":"compaction_ended","outcome":"completed","before":152000,"compactions":1}`)}),
			ev(802, protocol.TaskEvent{Role: "system", Raw: []byte(`{"kind":"context","contextTokens":31000,"contextWindow":200000,"compactAt":160000,"after":true}`)}),
			ev(803, protocol.TaskEvent{Role: "system", Text: "turn completed", Usage: &protocol.Usage{InputTokens: 310000, OutputTokens: 4200, CacheRead: 280000, ContextTokens: 96500, ContextWindow: 200000, CompactAt: 160000, Turn: &protocol.TurnTokens{Input: 310000, Output: 4200, Cached: 280000}}, Raw: []byte(`{"turnEnd":true,"kind":"turn_ended"}`)}),
		}})
		tt.Frame()
		ring := L.T("ctx.ring", "48%")
		click(t, tt, ring)
		for _, s := range []string{L.T("ctx.title"), "97k / 200k", L.T("ctx.used", "48%"), L.T("ctx.auto", "160k"), L.T("ctx.compacted.one"), L.T("ctx.last", "152k", "31k"), L.T("ctx.compact")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the context card: %q", lang, s, tt.Texts())
			}
		}
		if q, ok := lastFrame[protocol.AccountUsageReq](sent); !ok || q.Harness == "" {
			t.Fatalf("%s: the card asks for the account's limits: %+v", lang, q)
		}
		h := app.S.Tasks["t_newtask"].Harness()
		reset := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
		app.Receive(protocol.ServerFrame{T: "account_usage", Harness: h, AccountUsage: &protocol.AccountUsage{Harness: h, Plan: "max", Windows: []protocol.UsageWindow{
			{ID: "five_hour", Label: "Current session", Used: 0.1, DurationMs: 5 * 3_600_000},
			{ID: "seven_day", Label: "Current week (all models)", Used: 0.4, ResetsAt: reset, DurationMs: 168 * 3_600_000},
		}}})
		tt.Frame()
		for _, s := range []string{L.T("ctx.limit.days", 7), L.T("ctx.left", "60%"), L.T("ctx.limit.hours", 5), "Max"} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the limits: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "context-card-"+string(lang))
		click(t, tt, L.T("ctx.compact"))
		if s, ok := lastFrame[protocol.TaskSend](sent); !ok || s.Text != "/compact" || s.TaskID != "t_newtask" {
			t.Fatalf("%s: Compact now sends the person's /compact: %+v", lang, s)
		}
		ctxUI.open = false
	}
}

// The compaction hairline says its sizes.
func TestCompactionHairlineSizes(t *testing.T) {
	app, _, _ := newTaskApp(t, i18n.ZH)
	b, _ := noteOf("compaction completed", json.RawMessage(`{"kind":"compaction_ended","outcome":"completed","before":152000,"after":31000}`))
	if got := app.noteLine(&b); got != "上下文从 152k 压缩到了 31k" {
		t.Errorf("sizes: %q", got)
	}
	b, _ = noteOf("compaction completed", json.RawMessage(`{"kind":"compaction_ended","outcome":"completed"}`))
	if got := app.noteLine(&b); got != "压缩了上下文" {
		t.Errorf("no sizes: %q", got)
	}
	f, _ := noteOf("could not compact: x", json.RawMessage(`{"slash":"compact","failed":"x"}`))
	if f.Say != "compact_failed" || !f.Bad || app.noteLine(&f) != "这次没压缩成" {
		t.Errorf("failed: %+v %q", f, app.noteLine(&f))
	}
	_ = fmt.Sprint
}
