package update

import (
	"context"
	"net/http"
	"testing"
	"time"
)

// D187: the author's Mac said 现在还查不到新版本 ("no new version to find
// yet") with 0.0.13 out, while the home on the same page said 有新版本
// 0.0.13. GitHub's API gives an anonymous address 60 requests an hour,
// shared with everything else behind it; the 61st answers 403, which the
// updater took for "no public releases" and then, having "checked", didn't
// ask again for a day. These are the cases that would have caught it.

// withFallback is setup's world with the release page and download address
// the default feed has.
func withFallback(t *testing.T, w *world) *Updater {
	t.Helper()
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Page: w.feed.page(), Download: w.feed.download(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestRateLimitIsNotNoFeed(t *testing.T) {
	for _, code := range []int{http.StatusForbidden, http.StatusTooManyRequests} {
		w := setup(t, "0.2.0", "TEAM", nil)
		w.feed.status = code
		st := w.u.CheckNow(context.Background()) // no fallback: a test feed
		if st.State == NoFeed {
			t.Fatalf("%d: a rate limit says nothing about releases, yet: %+v", code, st)
		}
		if st.State != Failed || st.Reason != ReasonFeed {
			t.Fatalf("%d: %+v", code, st)
		}
		if !st.CheckedAt.IsZero() {
			t.Fatalf("%d: a refused read isn't a check: %v", code, st.CheckedAt)
		}
	}
}

func TestRateLimitedAPIFallsBackToTheReleasePage(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.feed.status = http.StatusForbidden
	u := withFallback(t, w)
	st := u.CheckNow(context.Background())
	if st.State != Ready || st.Version != "0.2.0" {
		t.Fatalf("status %+v", st)
	}
	if w.feed.pageHits != 1 {
		t.Fatalf("page read %d times", w.feed.pageHits)
	}
	if st.CheckedAt.IsZero() {
		t.Fatal("an answer from the page is a check")
	}
}

func TestTwoDigitPatchFromThePage(t *testing.T) {
	// 0.0.13 after 0.0.12, with 0.0.11 never released: numbers, not strings.
	w := setup(t, "0.0.13", "TEAM", nil)
	w.feed.status = http.StatusForbidden
	writeApp(t, w.apps, "co.nowledge.ducter", "0.0.12", "TEAM")
	u := withFallback(t, w)
	if st := u.CheckNow(context.Background()); st.State != Ready || st.Version != "0.0.13" {
		t.Fatalf("status %+v", st)
	}
}

func TestHintFetchesWhenGitHubCantSay(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.feed.status = http.StatusForbidden
	w.feed.pageStatus = http.StatusServiceUnavailable
	u := withFallback(t, w)
	if st := u.CheckNow(context.Background()); st.State != Failed {
		t.Fatalf("nothing to read: %+v", st)
	}
	// The home's devices frame says 0.2.0 is out.
	if !u.Hint(context.Background(), "0.2.0") {
		t.Fatal("a newer hint starts a check")
	}
	eventually(t, func() bool { return u.Status().State == Ready })
	if st := u.Status(); st.Version != "0.2.0" {
		t.Fatalf("status %+v", st)
	}
	if u.Hint(context.Background(), "0.2.0") {
		t.Fatal("the same version, already ready: nothing to start")
	}
}

func TestHintIgnoresWhatIsntNewer(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	for _, v := range []string{"0.1.0", "0.0.9", "garbage", ""} {
		if w.u.Hint(context.Background(), v) {
			t.Fatalf("hint %q started a check", v)
		}
	}
}

func TestHintOncePerVersionWhileItFails(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.feed.status = http.StatusForbidden
	w.feed.pageStatus = http.StatusServiceUnavailable
	now := time.Date(2026, 11, 11, 0, 40, 0, 0, time.UTC)
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Page: w.feed.page(), Arch: "arm64", Dir: w.support, Check: w.check, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	// No download address: the hint can't be fetched, so it keeps failing.
	if !u.Hint(context.Background(), "0.2.0") {
		t.Fatal("first hint")
	}
	eventually(t, func() bool { return u.Status().State == Failed })
	if u.Hint(context.Background(), "0.2.0") {
		t.Fatal("asked again within 15 min")
	}
	now = now.Add(16 * time.Minute)
	if !u.Hint(context.Background(), "0.2.0") {
		t.Fatal("asked again after 15 min")
	}
}

func TestLatestTag(t *testing.T) {
	w := setup(t, "0.0.13", "TEAM", nil)
	v, err := LatestTag(context.Background(), http.DefaultClient, w.feed.page())
	if err != nil || v != "0.0.13" {
		t.Fatalf("%q %v", v, err)
	}
	if _, err := LatestTag(context.Background(), http.DefaultClient, "http://example.com/x"); err == nil {
		t.Fatal("plain http off this Mac is refused")
	}
}

func TestByTag(t *testing.T) {
	r := ByTag(DefaultDownload, "0.0.13", "arm64")
	if r.DMG.URL != "https://github.com/wey-gu/ducter/releases/download/v0.0.13/Ducter-0.0.13-arm64.dmg" ||
		r.Sums.URL != "https://github.com/wey-gu/ducter/releases/download/v0.0.13/SHA256SUMS.txt" ||
		r.Page != "https://github.com/wey-gu/ducter/releases/tag/v0.0.13" {
		t.Fatalf("%+v", r)
	}
}

func eventually(t *testing.T, ok func() bool) {
	t.Helper()
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(10 * time.Millisecond) {
		if ok() {
			return
		}
	}
	t.Fatal("timed out")
}
