package main

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
)

// homeFollower (D228): when the app talks to a home elsewhere whose address
// moves (在哪儿都能用's free tunnel gets a new one when that computer
// restarts), it keeps how to find it again (asked once per connection),
// and after a few failed reconnects asks the address relay where the home
// is now. A note that opens, is newer, and leads to a Ducter that answers
// moves the saved connection there; the token stays the same.
type homeFollower struct {
	mu      sync.Mutex
	fails   int
	looking bool
	asked   string // the address follow was last asked at
}

func (h *homeFollower) status(c *client.Client, st client.Status, moved func(remote.Saved)) {
	if os.Getenv("DUCTER_URL") != "" {
		return
	}
	url, token := c.Target()
	if token == "" {
		return // this Mac's own Ducter
	}
	p, err := remote.Path()
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	switch st {
	case client.Connected:
		h.fails = 0
		if h.asked == url {
			return
		}
		h.asked = url
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			s, _ := remote.Load(p)
			if s == nil || s.URL != url {
				return
			}
			f, err := remote.FetchFollow(ctx, *s)
			if err != nil || (f == nil && s.Follow == nil) {
				return
			}
			s.Follow = f
			if err := remote.Save(p, *s); err != nil {
				log.Printf("ducter: could not keep how to follow the home: %v", err)
			}
		}()
	case client.Disconnected:
		h.fails++
		if h.fails < 3 || h.looking {
			return
		}
		h.looking = true
		go func() {
			defer func() {
				h.mu.Lock()
				h.looking = false
				h.mu.Unlock()
			}()
			s, _ := remote.Load(p)
			if s == nil || s.Follow == nil || s.URL != url {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			next, ok := remote.MoveTo(ctx, *s)
			if !ok {
				return
			}
			if err := remote.Save(p, next); err != nil {
				log.Printf("ducter: could not save the home's new address: %v", err)
				return
			}
			log.Printf("ducter: the home moved to %s; following it", remote.BaseOf(next.URL))
			c.Retarget(next.URL, next.Token)
			moved(next)
		}()
	}
}
