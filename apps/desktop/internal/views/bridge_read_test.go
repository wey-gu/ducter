package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func intp(n int) *int { return &n }

// D-PENDING: 已送达 / 已读 / 「{n}/{m} 已读」 beside a sent message, and nothing when Mem has no
// receipt (unknown is never a made-up unread). The same words as the web's receiptWords.
func TestBridgeReceiptText(t *testing.T) {
	zh := &App{L: i18n.New(i18n.ZH)}
	en := &App{L: i18n.New(i18n.EN)}
	cases := []struct {
		r      *protocol.BridgeReceipt
		zh, en string
	}{
		{nil, "", ""},
		{&protocol.BridgeReceipt{State: "unread", Count: intp(0), Total: intp(1)}, "已送达", "Delivered"},
		{&protocol.BridgeReceipt{State: "read", Count: intp(1), Total: intp(1)}, "已读", "Read"},
		{&protocol.BridgeReceipt{State: "partly", Count: intp(2), Total: intp(5)}, "2/5 已读", "2/5 read"},
		// A count Mem didn't give is never drawn as zero.
		{&protocol.BridgeReceipt{State: "partly"}, "已读", "Read"},
		{&protocol.BridgeReceipt{State: "unread"}, "已送达", "Delivered"},
	}
	for _, c := range cases {
		if got := zh.receiptText(c.r); got != c.zh {
			t.Errorf("zh %+v = %q, want %q", c.r, got, c.zh)
		}
		if got := en.receiptText(c.r); got != c.en {
			t.Errorf("en %+v = %q, want %q", c.r, got, c.en)
		}
	}
}

// The window keeps the latest receipt by op and message id, and finds one by task for a helper's round.
func TestBridgeReceiptStore(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	msg := map[string]any{"direction": "out", "messageId": "m1", "opId": "o1", "taskId": "t1", "to": "Codex", "text": "look", "state": "sent"}
	app.S.ApplyEvent(protocol.NewEvent(1, ts, "default", "channel", protocol.OriginPartner, protocol.KindBridgeMsg, msg))
	app.S.ApplyEvent(protocol.NewEvent(2, ts, "default", "channel", protocol.OriginSystem, protocol.KindBridgeRead, map[string]any{"opId": "o1", "messageId": "m1", "receipt": map[string]any{"state": "unread", "count": 0, "total": 1}}))
	if got := app.receiptText(app.S.ReceiptOf("o1", "m1")); got != "已送达" {
		t.Fatalf("op receipt = %q", got)
	}
	if got := app.receiptText(app.S.TaskReceipt("t1")); got != "已送达" {
		t.Fatalf("task receipt = %q", got)
	}
	app.S.ApplyEvent(protocol.NewEvent(3, ts, "default", "channel", protocol.OriginSystem, protocol.KindBridgeRead, map[string]any{"opId": "o1", "messageId": "m1", "receipt": map[string]any{"state": "partly", "count": 2, "total": 5}}))
	if got := app.receiptText(app.S.ReceiptOf("o1", "")); got != "2/5 已读" {
		t.Fatalf("latest receipt = %q", got)
	}
	if app.S.ReceiptOf("nowhere", "") != nil || app.S.TaskReceipt("t2") != nil {
		t.Fatal("a message with no receipt got one")
	}
}
