// Package client is the WebSocket client to Ducter's main process
// (ws://127.0.0.1:${DUCTER_PORT:-7777}/ws). It says hello with the cursor
// of the last event seen, streams server frames to a callback, and
// reconnects with backoff, resuming from the cursor.
package client

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	URL     string
	Persona string
	Locale  string // zh | en
	// Cursor returns the seq of the last event the app holds, sent with
	// each hello so a reconnect resumes there; 0 asks for the start.
	Cursor func() int64
	// OnFrame gets every server frame, on the client's goroutine.
	OnFrame func(protocol.ServerFrame)
	// OnStatus gets the connection's state as it changes.
	OnStatus func(Status, error)
}

// Client is a connection that keeps itself up.
type Client struct {
	opt Options

	mu   sync.Mutex
	conn *websocket.Conn
	// kick cuts a reconnect's wait short.
	kick chan struct{}
	// next is when the next attempt starts, while waiting.
	next time.Time
}

// New makes a client; Run connects it.
func New(opt Options) *Client {
	if opt.URL == "" {
		opt.URL = DefaultURL()
	}
	return &Client{opt: opt, kick: make(chan struct{}, 1)}
}

// URL is the server the client dials.
func (c *Client) URL() string { return c.opt.URL }

// RetryNow cuts the wait before the next reconnect short.
func (c *Client) RetryNow() {
	select {
	case c.kick <- struct{}{}:
	default:
	}
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
	backoff := 250 * time.Millisecond
	for ctx.Err() == nil {
		c.status(Connecting, nil)
		start := time.Now()
		err := c.session(ctx)
		if ctx.Err() != nil {
			return
		}
		if time.Since(start) > 10*time.Second {
			backoff = 250 * time.Millisecond // it was up a while: retry soon
		}
		c.mu.Lock()
		c.next = time.Now().Add(backoff)
		c.mu.Unlock()
		c.status(Disconnected, err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		case <-c.kick:
			backoff = 250 * time.Millisecond
		}
		c.mu.Lock()
		c.next = time.Time{}
		c.mu.Unlock()
		backoff = min(backoff*2, 5*time.Second)
	}
}

func (c *Client) status(s Status, err error) {
	if c.opt.OnStatus != nil {
		c.opt.OnStatus(s, err)
	}
}

func (c *Client) session(ctx context.Context) error {
	u, err := url.Parse(c.opt.URL)
	if err != nil {
		return err
	}
	origin := "http://" + u.Host + "/"
	cfg, err := websocket.NewConfig(c.opt.URL, origin)
	if err != nil {
		return err
	}
	cfg.Dialer = nil
	conn, err := cfg.DialContext(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()

	hello := protocol.Hello{T: "hello", Persona: c.opt.Persona, Locale: c.opt.Locale}
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
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
	}()
	c.status(Connected, nil)

	for {
		var msg string
		if err := websocket.Message.Receive(conn, &msg); err != nil {
			return err
		}
		f, err := protocol.DecodeServerFrame([]byte(msg))
		if err != nil {
			log.Printf("ducter: bad frame: %v", err)
			continue
		}
		if c.opt.OnFrame != nil {
			c.opt.OnFrame(f)
		}
	}
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
