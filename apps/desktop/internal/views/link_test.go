package views

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D520: a fake home behind a proxy, as hel is behind Caddy. Its modes are
// what the Mac app may meet on /ws:
//
//	up       the home answers (the mock hub);
//	away     the proxy says 502 (the home is restarting, or down), on
//	         every path, the standing too;
//	refuses  the home's gate says 401 on the upgrade, and its standing
//	         says (signed) what standing holds;
//
// and a signer: the home's own key, or (forged) another key.
type proxiedHome struct {
	t        *testing.T
	srv      *httptest.Server
	hub      *mock.Hub
	key      ed25519.PrivateKey
	fp       string
	mu       sync.Mutex
	mode     string
	standing string
	forged   bool
	dials    int
	conns    []net.Conn
}

const fakeToken = "dvc.0123456789.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"

func newProxiedHome(t *testing.T) *proxiedHome {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	h := &proxiedHome{t: t, hub: mock.NewHub(40), key: priv, fp: remote.Fingerprint(pub), mode: "up", standing: "live"}
	ws := h.hub.Handler()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		h.mu.Lock()
		h.dials++
		mode := h.mode
		h.mu.Unlock()
		switch mode {
		case "away":
			http.Error(w, "502 Bad Gateway", http.StatusBadGateway)
		case "refuses":
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		default:
			if r.Header.Get("Authorization") != "Bearer "+fakeToken {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			ws.ServeHTTP(w, r)
		}
	})
	mux.HandleFunc(remote.StandingPath, func(w http.ResponseWriter, r *http.Request) {
		h.mu.Lock()
		mode, standing, forged := h.mode, h.standing, h.forged
		h.mu.Unlock()
		if mode == "away" {
			http.Error(w, "502 Bad Gateway", http.StatusBadGateway)
			return
		}
		n := r.URL.Query().Get("n")
		signer := h.key
		if forged {
			_, signer, _ = ed25519.GenerateKey(rand.Reader)
		}
		pubKey := signer.Public().(ed25519.PublicKey)
		sig := ed25519.Sign(signer, []byte("ducter-device\n"+standing+"\n0123456789\n"+n))
		_ = json.NewEncoder(w).Encode(map[string]any{"v": 1, "standing": standing, "device": "0123456789",
			"key": base64.RawURLEncoding.EncodeToString(pubKey), "fp": remote.Fingerprint(pubKey), "sig": base64.RawURLEncoding.EncodeToString(sig)})
	})
	h.srv = httptest.NewUnstartedServer(mux)
	h.srv.Config.ConnState = func(c net.Conn, s http.ConnState) {
		if s == http.StateNew {
			h.mu.Lock()
			h.conns = append(h.conns, c)
			h.mu.Unlock()
		}
	}
	h.srv.Start()
	t.Cleanup(h.srv.Close)
	return h
}

func (h *proxiedHome) set(mode, standing string) {
	h.mu.Lock()
	h.mode, h.standing = mode, standing
	h.mu.Unlock()
}

// drop cuts every live socket, as a home that restarts does.
func (h *proxiedHome) drop() {
	h.mu.Lock()
	conns := h.conns
	h.conns = nil
	h.mu.Unlock()
	for _, c := range conns {
		c.Close()
	}
}

func (h *proxiedHome) dialCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.dials
}

func (h *proxiedHome) wsURL() string { return "ws" + strings.TrimPrefix(h.srv.URL, "http") + "/ws" }

// linked is the app with its real client against a fake home: each status
// and its error go through App.Linked, as in main.
type linked struct {
	*harness
	c    *client.Client
	home *proxiedHome
	errs []error
}

func linkTo(t *testing.T, home *proxiedHome, lang i18n.Lang) *linked {
	t.Helper()
	theme.LoadFonts()
	client.RetryCap, client.GoneWait = 200*time.Millisecond, 300*time.Millisecond
	t.Cleanup(func() { client.RetryCap, client.GoneWait = 5*time.Second, time.Minute })
	s := store.New()
	app := New(s, theme.Pebble(), i18n.New(lang))
	h := &harness{t: t, app: app, frames: make(chan protocol.ServerFrame, 4096)}
	type st struct {
		s   client.Status
		err error
	}
	status := make(chan st, 256)
	l := &linked{harness: h, home: home}
	c := client.New(client.Options{
		URL: home.wsURL(), Token: fakeToken, Locale: string(lang), OffMachine: true,
		Jitter:  func(d time.Duration) time.Duration { return d },
		OnFrame: func(f protocol.ServerFrame) { h.frames <- f },
		OnStatus: func(s client.Status, err error) {
			status <- st{s, err}
		},
		Gone: func(ctx context.Context, url, token string) (string, bool) {
			s := remote.AskStanding(ctx, nil, url, token, home.fp)
			return string(s), s.Gone()
		},
	})
	l.c = c
	app.Send = c.Send
	app.URL = c.URL()
	app.RetryNow, app.NextAttempt = c.RetryNow, c.NextAttempt
	app.Pair = func(string, string) error { return nil }
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go c.Run(ctx)
	h.tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	h.pump = func() {
		for {
			select {
			case x := <-status:
				if x.err != nil {
					l.errs = append(l.errs, x.err)
				}
				was := app.Unauthorized
				app.Linked(x.s, x.err)
				// Never the connect card, but on the home's signed word.
				if !was && app.Unauthorized && !errors.Is(x.err, client.ErrUnauthorized) {
					t.Fatalf("the connect card came up on %v", x.err)
				}
			default:
				return
			}
		}
	}
	h.until("welcome", func() bool { return s.Welcomed && s.OnHand != nil && app.Status == client.Connected })
	return l
}

func (l *linked) onConnectCard() bool { return hasText(l.tt, l.app.L.T("connect.title")) }

// notGone fails when the app has left its pairing in any way.
func (l *linked) notGone(when string) {
	l.t.Helper()
	l.tt.Frame()
	if l.app.Unauthorized || l.app.link() == linkGone || l.onConnectCard() {
		l.t.Fatalf("%s: the connect card is up (errs %v)", when, l.errs)
	}
}

func (l *linked) backUp(when string) {
	l.t.Helper()
	l.until(when, func() bool { return l.app.Status == client.Connected && l.app.link() == linkUp })
	l.notGone(when)
}

// A home that restarts mid-session (its proxy says 502 meanwhile): the
// header says it is reconnecting, quietly; nothing else changes; it is
// back by itself.
func TestReconnectHomeRestart(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.ZH)
	home.set("away", "")
	home.drop()
	l.until("the loss", func() bool { return l.app.link() == linkBack && home.dialCount() >= 3 })
	l.notGone("while it restarts")
	if !hasText(l.tt, "正在重新连上 Ducter…") {
		t.Errorf("no quiet line: %q", l.tt.Texts())
	}
	if !errors.Is(l.errs[len(l.errs)-1], client.ErrRefused) {
		t.Errorf("a 502 should be refused, not gone: %v", l.errs)
	}
	home.set("up", "live")
	l.backUp("the home is back")
}

// The gate says 401 on the upgrade while the home is mid-upgrade: its
// standing can't be asked (502), or says live. Either way the pairing
// stays, and it is back once the home is.
func TestReconnect401DuringUpgrade(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.EN)
	home.set("refuses", "live")
	home.drop()
	l.until("refused a few times", func() bool { return home.dialCount() >= 4 })
	l.notGone("401 with a live standing")
	home.set("away", "")
	l.until("refused a few more", func() bool { return home.dialCount() >= 7 })
	l.notGone("401 then a proxy")
	home.set("up", "live")
	l.backUp("the upgrade is done")
}

// Sleep says so and dials nothing; wake dials at once.
func TestReconnectSleepAndWake(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.ZH)
	before := home.dialCount()
	l.c.Sleep()
	l.until("asleep", func() bool { return l.app.Status == client.Disconnected })
	time.Sleep(600 * time.Millisecond)
	l.pump()
	if n := home.dialCount(); n != before {
		t.Errorf("dialled %d times while asleep", n-before)
	}
	l.notGone("asleep")
	l.c.Wake()
	l.backUp("awake")
}

// The network came back: a socket from before is dropped and dialled again
// at once, without a word of pairing.
func TestReconnectNetworkChange(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.EN)
	before := home.dialCount()
	l.c.Redial()
	l.until("dialled again", func() bool { return home.dialCount() > before })
	l.backUp("on the new network")
	// While down, the window coming to the front tries at once.
	home.set("away", "")
	home.drop()
	l.until("down", func() bool { return l.app.Status == client.Disconnected })
	client.RetryCap = time.Hour // only a nudge can dial now
	n := home.dialCount()
	home.set("up", "live")
	l.c.Nudge()
	l.until("a nudge dials", func() bool { return home.dialCount() > n })
	l.backUp("nudged")
}

// A long outage: after LongOutage the window says plainly what is wrong,
// with Try now; still the conversation, never the connect card.
func TestReconnectLongOutage(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.ZH)
	home.set("away", "")
	home.drop()
	l.until("the loss", func() bool { return l.app.link() == linkBack })
	start := time.Now()
	l.app.Now = func() time.Time { return time.Now().Add(LongOutage + time.Since(start)) }
	l.until("said plainly", func() bool { return l.app.link() == linkLost })
	l.tt.Frame()
	for _, want := range []string{"连不上 Ducter，正在重试", "这台 Mac 上的 Ducter 没有回应", "立即连接"} {
		if !hasText(l.tt, want) {
			t.Errorf("lacks %q: %q", want, l.tt.Texts())
		}
	}
	l.notGone("a long outage")
	home.set("up", "live")
	l.click("立即连接")
	l.backUp("tried now")
	if hasText(l.tt, "这台 Mac 上的 Ducter 没有回应") {
		t.Error("the notice outlived the outage")
	}
}

// A standing of "revoked" that another key signed (a proxy, a different
// home) proves nothing: the pairing stays.
func TestReconnectForgedRevoke(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.EN)
	home.mu.Lock()
	home.forged = true
	home.mu.Unlock()
	home.set("refuses", "revoked")
	home.drop()
	l.until("refused a few times", func() bool { return home.dialCount() >= 4 })
	l.notGone("a forged revoke")
}

// Only the home's signed word: disconnected there, the connect card says so
// in those words, with the address already in, and no way back to a dead
// end. Pairing again brings the conversation back.
func TestReconnectExplicitRevoke(t *testing.T) {
	home := newProxiedHome(t)
	l := linkTo(t, home, i18n.EN)
	l.app.URL = home.wsURL()
	home.set("refuses", "revoked")
	home.drop()
	l.until("gone", func() bool { return l.app.link() == linkGone })
	l.tt.Frame()
	if !l.onConnectCard() || !hasText(l.tt, "Your Ducter on "+hostOf(home.wsURL())+" disconnected this Mac. Connect it again to come back.") {
		t.Fatalf("no revoke card: %q", l.tt.Texts())
	}
	if hasText(l.tt, "Back") {
		t.Error("a revoked Mac has nowhere to go back to")
	}
	if got, want := l.app.conn.address, remote.BaseOf(home.wsURL()); got != want {
		t.Errorf("address %q, want %q kept", got, want)
	}
	// Unknown there (its devices reset): the card, in its own words.
	home.set("refuses", "unknown")
	l.app.Unauthorized, l.app.goneWhy = false, ""
	l.until("gone again", func() bool { return l.app.link() == linkGone && l.app.goneWhy == "unknown" })
	l.tt.Frame()
	if !strings.Contains(strings.Join(l.tt.Texts(), "|"), "doesn't know this Mac anymore") {
		t.Errorf("no unknown line: %q", l.tt.Texts())
	}
	// Paired again: the welcome takes the card away.
	home.set("up", "live")
	l.c.RetryNow()
	l.until("back after pairing", func() bool { return l.app.Status == client.Connected && !l.app.Unauthorized })
	l.tt.Frame()
	if l.onConnectCard() {
		t.Error("the card stayed after the welcome")
	}
}

// The view's state from the statuses alone, with a fake clock: what each
// state shows, and that only a signed gone reaches the connect card.
func TestLinkViewStates(t *testing.T) {
	h := newHarness(t, i18n.ZH)
	a := h.app
	now := time.Now()
	a.Now = func() time.Time { return now }
	a.URL = "wss://hel.example.com/ws"
	a.RetryNow = func() {}
	a.Pair = func(string, string) error { return nil }
	tt := ui.NewTesterWith(a.View, 1000, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})

	steps := []struct {
		name  string
		st    client.Status
		err   error
		after time.Duration
		want  linkState
		text  string
	}{
		{"connected", client.Connected, nil, 0, linkUp, ""},
		{"a proxy's 502", client.Disconnected, client.ErrRefused, 0, linkBack, "正在重新连上 hel.example.com…"},
		{"trying again", client.Connecting, nil, 2 * time.Second, linkBack, "正在重新连上 hel.example.com…"},
		{"a timeout", client.Disconnected, errors.New("dial tcp: i/o timeout"), 5 * time.Second, linkBack, ""},
		{"a TLS failure", client.Disconnected, errors.New("tls: failed to verify certificate"), 10 * time.Second, linkBack, ""},
		{"a DNS failure", client.Disconnected, errors.New("lookup hel.example.com: no such host"), 20 * time.Second, linkLost, "连不上 hel.example.com 上的 Ducter"},
		{"back", client.Connected, nil, 0, linkUp, ""},
		{"revoked, signed", client.Disconnected, &client.GoneError{Reason: "revoked"}, 0, linkGone, "hel.example.com 上的 Ducter 已经断开了这台 Mac。要回来，就再连一次。"},
		{"paired again", client.Connected, nil, 0, linkUp, ""},
		{"unknown, signed", client.Disconnected, &client.GoneError{Reason: "unknown"}, 0, linkGone, "hel.example.com 上的 Ducter 认不出这台 Mac 了，可能是它的设备记录被重置过。要回来，就再连一次。"},
	}
	for _, s := range steps {
		now = now.Add(s.after)
		a.Linked(s.st, s.err)
		tt.Frame()
		if got := a.link(); got != s.want {
			t.Errorf("%s: state %d, want %d", s.name, got, s.want)
		}
		if card := hasText(tt, "连接到你的 Ducter"); card != (s.want == linkGone) {
			t.Errorf("%s: connect card %v", s.name, card)
		}
		if s.text != "" && !hasText(tt, s.text) {
			t.Errorf("%s: lacks %q: %q", s.name, s.text, tt.Texts())
		}
		if s.want == linkGone && a.conn.address != "https://hel.example.com" {
			t.Errorf("%s: address %q not kept", s.name, a.conn.address)
		}
	}
}
