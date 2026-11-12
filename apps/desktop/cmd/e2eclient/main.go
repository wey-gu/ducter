// E2eclient is a headless Ducter client for the near-real E2E rig
// (scripts/e2e/linux.ts): the Mac app's own client and frame decoder
// (internal/client, protocol.DecodeServerFrame) without a window, so what it
// sees is what the app would. It never touches the app's saved connection:
// the address and token come from its flags.
//
//	e2eclient -url ws://127.0.0.1:47777/ws -token T devices
//	e2eclient -url … send '{"t":"device_update","device":"local"}' -wait update_result
//	e2eclient -url … try -frames 3 -timeout 90s
//
// Each prints one JSON line on stdout and exits 0, or says why on stderr and
// exits 1.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	"os"
	"strings"
	"time"

	"encoding/base64"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func main() {
	url := flag.String("url", "", "the home's WebSocket (ws://…/ws)")
	token := flag.String("token", "", "a device token from /pair")
	wait := flag.String("wait", "", "send: the frame type to wait for")
	frames := flag.Int("frames", 3, "try: frames to see")
	timeout := flag.Duration("timeout", 60*time.Second, "how long to wait")
	flag.Parse()
	// Flags may also follow the command and its frame (send JSON -wait TYPE).
	cmd, payload := flag.Arg(0), flag.Arg(1)
	if rest := flag.Args(); len(rest) > 1 {
		skip := 1
		if cmd == "send" {
			skip = 2
		}
		if len(rest) > skip {
			_ = flag.CommandLine.Parse(rest[skip:])
		}
	}
	if *url == "" || cmd == "" {
		fmt.Fprintln(os.Stderr, "usage: e2eclient -url ws://…/ws [-token T] devices | send JSON [-wait TYPE] | try [-frames N]")
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	in := make(chan protocol.ServerFrame, 256)
	up := make(chan struct{}, 1)
	c := client.New(client.Options{URL: *url, Token: *token, Persona: "default", Locale: "zh", Version: "e2e",
		OnFrame: func(f protocol.ServerFrame) {
			if os.Getenv("E2E_VERBOSE") != "" {
				fmt.Fprintf(os.Stderr, "frame %s %s %s seq=%d\n", f.T, f.State, f.Reason, f.Seq)
			}
			select {
			case in <- f:
			default: // a slow reader drops, as the app's store keeps only the newest
			}
		},
		OnStatus: func(s client.Status, err error) {
			if s == client.Connected {
				select {
				case up <- struct{}{}:
				default:
				}
			}
			if err != nil && err == client.ErrUnauthorized {
				fail("refused: %v", err)
			}
		}})
	go c.Run(ctx)
	select {
	case <-up:
	case <-ctx.Done():
		fail("couldn't connect to %s", *url)
	}
	next := func(match func(protocol.ServerFrame) bool) protocol.ServerFrame {
		for {
			select {
			case f := <-in:
				if match(f) {
					return f
				}
			case <-ctx.Done():
				fail("timed out")
			}
		}
	}
	switch cmd {
	case "devices":
		must(c.Send(map[string]any{"t": "devices"}))
		f := next(func(f protocol.ServerFrame) bool { return f.T == "devices" })
		out(map[string]any{"devices": f.Devices, "reach": f.Reach, "updateAll": f.UpdateAll})
	case "send":
		var raw map[string]any
		if err := json.Unmarshal([]byte(payload), &raw); err != nil {
			fail("bad frame: %v", err)
		}
		must(c.Send(raw))
		if *wait == "" {
			out(map[string]any{"sent": true})
			return
		}
		f := next(func(f protocol.ServerFrame) bool { return f.T == *wait || f.T == "error" })
		out(f)
	case "try":
		must(c.Send(protocol.LiveOpenReq{T: "live_open", DecisionID: protocol.TryLive, Width: 1024, Height: 700, Scale: 1, Try: true}))
		var opened *protocol.ServerFrame
		seen, bytes := 0, 0
		w, h := 0, 0
		start := time.Now()
		var first time.Duration
		for seen < *frames {
			f := next(func(f protocol.ServerFrame) bool {
				return (f.T == "live" && f.DecisionID == protocol.TryLive) || f.T == "live_frame" || f.T == "error"
			})
			switch {
			case f.T == "error":
				fail("error frame: %s", f.Message)
			case f.T == "live" && f.State == "open":
				fc := f
				opened = &fc
			case f.T == "live":
				fail("closed (%s): %s", f.Reason, f.Message)
			case f.T == "live_frame" && opened != nil && f.ID == opened.ID:
				b, err := base64.StdEncoding.DecodeString(f.Data)
				if err != nil {
					fail("frame %d: not base64: %v", f.Seq, err)
				}
				img, _, err := image.Decode(strings.NewReader(string(b)))
				if err != nil {
					fail("frame %d: not a JPEG: %v", f.Seq, err)
				}
				if seen == 0 {
					first = time.Since(start)
				}
				seen++
				bytes += len(b)
				w, h = img.Bounds().Dx(), img.Bounds().Dy()
				must(c.Send(protocol.LiveAckReq{T: "live_ack", ID: f.ID, Seq: f.Seq}))
				// A still page sends no more frames (the screencast paints only changes):
				// reload it, as a person tapping 刷新 would, so the next one comes.
				if seen < *frames {
					must(c.Send(protocol.LiveInputReq{T: "live_input", ID: f.ID, Input: protocol.LiveInput{Kind: "nav", Action: "reload"}}))
				}
			}
		}
		_ = c.Send(protocol.LiveCloseReq{T: "live_close", ID: opened.ID, Done: true})
		time.Sleep(300 * time.Millisecond)
		dev := ""
		if opened.Browser != nil {
			dev = opened.Browser.Device
		}
		out(map[string]any{"open": true, "frames": seen, "bytes": bytes, "width": w, "height": h, "firstFrameMs": first.Milliseconds(), "device": dev, "browser": opened.Browser, "url": opened.URL})
	default:
		fail("unknown command %q", cmd)
	}
}

func out(v any) {
	b, _ := json.Marshal(v)
	fmt.Println(string(b))
	os.Exit(0)
}

func must(err error) {
	if err != nil {
		fail("%v", err)
	}
}

func fail(f string, a ...any) {
	fmt.Fprintf(os.Stderr, "e2eclient: "+f+"\n", a...)
	os.Exit(1)
}
