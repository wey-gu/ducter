// Package client is the WebSocket client to Ducter's main process
// (ws://127.0.0.1:${DUCTER_PORT:-7777}/ws). It says hello with the cursor
// of the last event seen, streams server frames to a callback, and
// reconnects with backoff, resuming from the cursor.
package client

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net"
	"net/url"
	"os"
	"sync"
	"time"

	"golang.org/x/net/websocket"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Status is the connection's state, for the UI.
type Status int

const (
	Connecting Status = iota
	Connected
	Disconnected
)

// DefaultURL is the main process's WebSocket, from DUCTER_URL or
// DUCTER_PORT (7777).
func DefaultURL() string {
	if u := os.Getenv("DUCTER_URL"); u != "" {
		return u
	}
	port := os.Getenv("DUCTER_PORT")
	if port == "" {
		port = "7777"
	}
	return "ws://127.0.0.1:" + port + "/ws"
}

// Options configure a client.
type Options struct {
	URL string
	// Token is a device token from pairing (internal/remote); sent as
	// Authorization: Bearer. Loopback servers need none.
	Token   string
	Persona string
	// PersonaOf (D309), when set, is the partner to show, read at each
	// hello (a switch, then a reconnect, keeps it); it wins over Persona.
	PersonaOf func() string
	Locale    string // zh | en
	// Version is this app's version, said in the hello ("" a dev build).
	Version string
	// Cursor returns the seq of the last event the app holds, sent with
	// each hello so a reconnect resumes there; 0 asks for the start.
	Cursor func() int64
	// OnFrame gets every server frame, on the client's goroutine.
	OnFrame func(protocol.ServerFrame)
	// OnStatus gets the connection's state as it changes.
	OnStatus func(Status, error)
	// Gone (D520) asks the home, after it refused the socket off this
	// machine, whether this device's credential is gone there: gone only on
	// the home's own signed word (remote.AskStanding), with its reason
	// ("revoked", "unknown"). A refused upgrade alone is a proxy's 502 as
	// often as anything, so without it the pairing stays and the client
	// keeps trying. Nil: never gone.
	Gone func(ctx context.Context, url, token string) (reason string, gone bool)
	// Jitter spreads each wait between tries (nil: ±20% at random), so
	// every device of a home that restarts doesn't dial on the same beat.
	Jitter func(time.Duration) time.Duration
	// OffMachine applies the rules for a home on another computer whatever
	// the address (tests' fake homes listen on loopback).
	OffMachine bool
}

// Waits between tries (D520): 250 ms doubling to RetryCap; after an outage
// of LongAfter, to LongCap. A home that said this device is gone is asked
// again only every GoneWait (a pairing or a kick asks at once).
var (
	RetryCap  = 5 * time.Second
	LongAfter = time.Minute
	LongCap   = 15 * time.Second
	GoneWait  = time.Minute
)

// Client is a connection that keeps itself up.
type Client struct {
	opt Options

	mu   sync.Mutex
	conn *websocket.Conn
	// kick cuts a reconnect's wait short.
	kick chan struct{}
	// next is when the next attempt starts, while waiting.
	next time.Time
	// url and token are what the next attempt dials (Retarget changes them).
	url, token string
	// asleep: the Mac is going to sleep (D293); no dialling until Wake.
	asleep bool
	// down is when the connection was last lost (zero while connected, and
	// before the first connection).
	down time.Time
}

// Liveness (D293): with a home that answers pings, one every PingEvery, and
// a socket silent for DeadAfter is closed and dialled again (a Mac that
// changed Wi-Fi keeps a dead socket open otherwise).
var (
	PingEvery = 15 * time.Second
	DeadAfter = 45 * time.Second
)

// Sleep tells the home this Mac is going to sleep and closes the socket, so
// its tasks say 睡着了 / Asleep at once instead of 连不上 / Can't reach later;
// nothing is dialled until Wake (D293).
func (c *Client) Sleep() {
	_ = c.Send(map[string]string{"t": "sleep"})
	c.mu.Lock()
	c.asleep = true
	conn := c.conn
	c.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
}

// Wake dials again at once after the Mac woke (D293).
func (c *Client) Wake() {
	c.mu.Lock()
	c.asleep = false
	c.mu.Unlock()
	// A socket from before the sleep is dead whatever it says: start over.
	c.Redial()
}

// Redial drops the socket, live or not, and dials again at once: after a
// wake, or when the network came back (a socket from before is dead
// whatever it says; D520).
func (c *Client) Redial() {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
	c.RetryNow()
}

// Nudge dials at once while there is no connection (the window came to the
// front, D520); a live connection is left alone.
func (c *Client) Nudge() {
	c.mu.Lock()
	up := c.conn != nil
	c.mu.Unlock()
	if !up {
		c.RetryNow()
	}
}

// DownSince is when the connection was lost, while it is; zero otherwise.
func (c *Client) DownSince() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.down
}

// New makes a client; Run connects it.
func New(opt Options) *Client {
	if opt.URL == "" {
		opt.URL = DefaultURL()
	}
	return &Client{opt: opt, kick: make(chan struct{}, 1), url: opt.URL, token: opt.Token}
}

// URL is the server the client dials.
func (c *Client) URL() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.url
}

// Retarget points the client at another server (after pairing) and
// reconnects there at once.
func (c *Client) Retarget(url, token string) {
	c.mu.Lock()
	c.url, c.token = url, token
	conn := c.conn
	c.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
	c.RetryNow()
}

// ErrUnauthorized means the home itself said, signed with its key, that
// this device's credential is gone there (disconnected with `ducter
// devices`, or unknown to it), or that there never was one (a home off this
// machine dialled with no credential). Nothing else means it (D520).
var ErrUnauthorized = errors.New("ducter: this device isn't connected (pair it again)")

// GoneError is ErrUnauthorized with the home's reason: "revoked" (it
// disconnected this device), "unknown" (it has no such credential), or ""
// (there was no credential to offer).
type GoneError struct{ Reason string }

func (e *GoneError) Error() string        { return ErrUnauthorized.Error() }
func (e *GoneError) Is(target error) bool { return target == ErrUnauthorized }

// ErrRefused means the socket was refused off this machine without the
// home saying this device is gone: a proxy in front of a home that is
// restarting (502), or a home that can't be asked. The pairing stays.
var ErrRefused = errors.New("ducter: the home's address refused the connection for now")

// RetryNow cuts the wait before the next reconnect short.
func (c *Client) RetryNow() {
	select {
	case c.kick <- struct{}{}:
	default:
	}
}

// Target is the server the client dials now and its device token ("" on
// this Mac's own home): the app's HTTP calls (pictures, D206) use them too.
func (c *Client) Target() (url, token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.url, c.token
}

// NextAttempt is when the client will try again, while it waits; zero
// otherwise.
func (c *Client) NextAttempt() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.next
}

// Run connects and reconnects until ctx is done.
func (c *Client) Run(ctx context.Context) {
	const first = 250 * time.Millisecond
	backoff := first
	for ctx.Err() == nil {
		c.status(Connecting, nil)
		start := time.Now()
		err := c.session(ctx)
		if ctx.Err() != nil {
			return
		}
		if time.Since(start) > 10*time.Second {
			backoff = first // it was up a while: retry soon
		}
		now := time.Now()
		c.mu.Lock()
		if c.down.IsZero() {
			c.down = now
		}
		ceiling := RetryCap
		if now.Sub(c.down) > LongAfter {
			ceiling = LongCap // a long outage: still trying, a little less often
		}
		backoff = min(backoff, ceiling)
		wait := c.jitter(backoff)
		if errors.Is(err, ErrUnauthorized) {
			wait = GoneWait // the home said so: pairing again (a kick) brings it back
		}
		c.next = now.Add(wait)
		asleep := c.asleep
		c.mu.Unlock()
		c.status(Disconnected, err)
		timer := time.NewTimer(wait)
		tick := timer.C
		if asleep {
			tick = nil // asleep: only Wake (a kick) dials again
		}
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-tick:
		case <-c.kick:
			backoff = first
		}
		timer.Stop()
		c.mu.Lock()
		c.next = time.Time{}
		c.mu.Unlock()
		backoff *= 2
	}
}

func (c *Client) jitter(d time.Duration) time.Duration {
	if c.opt.Jitter != nil {
		return c.opt.Jitter(d)
	}
	return time.Duration(float64(d) * (0.8 + 0.4*rand.Float64()))
}

func (c *Client) status(s Status, err error) {
	if c.opt.OnStatus != nil {
		c.opt.OnStatus(s, err)
	}
}

func (c *Client) session(ctx context.Context) error {
	c.mu.Lock()
	target, token := c.url, c.token
	c.mu.Unlock()
	u, err := url.Parse(target)
	if err != nil {
		return err
	}
	// No trailing slash: core accepts only the bare loopback origin
	// (http://127.0.0.1:port), as browsers send it.
	origin := "http://" + u.Host
	if u.Scheme == "wss" {
		origin = "https://" + u.Host
	}
	cfg, err := websocket.NewConfig(target, origin)
	if err != nil {
		return err
	}
	cfg.Dialer = nil
	if token != "" {
		cfg.Header.Set("Authorization", "Bearer "+token)
	}
	conn, err := cfg.DialContext(ctx)
	if err != nil {
		// Off this machine, a refused upgrade may be Ducter's gate saying no,
		// or a proxy saying the home is away (502 while it restarts): only
		// the home's signed word sends this device back to pairing (D520).
		var de *websocket.DialError
		if errors.As(err, &de) && de.Err == websocket.ErrBadStatus && (c.opt.OffMachine || !isLoopback(u.Hostname())) {
			if token == "" {
				return &GoneError{} // no credential at all: nothing to keep
			}
			if c.opt.Gone != nil {
				if why, gone := c.opt.Gone(ctx, target, token); gone {
					return &GoneError{Reason: why}
				}
			}
			return ErrRefused
		}
		return err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()

	persona := c.opt.Persona
	if c.opt.PersonaOf != nil {
		persona = c.opt.PersonaOf()
	}
	hello := protocol.Hello{T: "hello", Persona: persona, Locale: c.opt.Locale, Client: "desktop", Version: c.opt.Version, Gzip: true}
	if c.opt.Cursor != nil {
		if cur := c.opt.Cursor(); cur > 0 {
			hello.Cursor = &cur
		}
	}
	if err := websocket.JSON.Send(conn, hello); err != nil {
		return err
	}
	c.mu.Lock()
	c.conn = conn
	c.down = time.Time{}
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
	}()
	c.status(Connected, nil)

	// D293: pings once the home said it answers them (welcome.ping).
	pinging := false
	stopPing := make(chan struct{})
	defer close(stopPing)
	for {
		if pinging {
			_ = conn.SetReadDeadline(time.Now().Add(DeadAfter))
		}
		var msg []byte
		if err := websocket.Message.Receive(conn, &msg); err != nil {
			return err
		}
		data, err := Unzip(msg)
		if err != nil {
			log.Printf("ducter: bad frame: %v", err)
			continue
		}
		f, err := protocol.DecodeServerFrame(data)
		if err != nil {
			log.Printf("ducter: bad frame: %v", err)
			continue
		}
		if f.T == "pong" {
			continue
		}
		if f.T == "welcome" && f.Ping && !pinging {
			pinging = true
			go func() {
				t := time.NewTicker(PingEvery)
				defer t.Stop()
				for {
					select {
					case <-stopPing:
						return
					case <-t.C:
						c.mu.Lock()
						same := c.conn == conn
						c.mu.Unlock()
						if !same {
							return
						}
						_ = c.Send(map[string]string{"t": "ping"})
					}
				}
			}()
		}
		if c.opt.OnFrame != nil {
			c.opt.OnFrame(f)
		}
	}
}

// Unzip is a frame's JSON: a large one comes gzipped (D284, hello.gzip),
// told by gzip's magic bytes (JSON never starts with them).
func Unzip(msg []byte) ([]byte, error) {
	if len(msg) < 2 || msg[0] != 0x1f || msg[1] != 0x8b {
		return msg, nil
	}
	zr, err := gzip.NewReader(bytes.NewReader(msg))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	return io.ReadAll(zr)
}

func isLoopback(h string) bool {
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// ErrOffline is returned by Send while there is no connection.
var ErrOffline = errors.New("ducter: not connected")

// Send sends one client frame (any of protocol's client frame structs).
func (c *Client) Send(frame any) error {
	data, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return ErrOffline
	}
	if err := websocket.Message.Send(c.conn, string(data)); err != nil {
		return fmt.Errorf("ducter: send: %w", err)
	}
	return nil
}
