package update

import (
	"bufio"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// DefaultFeed is the newest published (not draft, not pre-release) release of
// Ducter, from GitHub's public API, unauthenticated: 60 requests an hour per
// address, and the app asks once at launch and once a day.
const DefaultFeed = "https://api.github.com/repos/wey-gu/ducter/releases/latest"

// DefaultPage is the release page that redirects to the newest tag, and
// DefaultDownload where a tag's files are. Neither is GitHub's API, so
// neither shares its 60-an-hour limit with every other unauthenticated
// caller behind the same address (D187): when the API refuses, the
// version comes from the redirect and the files from their tag.
const (
	DefaultPage     = "https://github.com/wey-gu/ducter/releases/latest"
	DefaultDownload = "https://github.com/wey-gu/ducter/releases/download"
)

// Release is what the feed says about the newest version.
type Release struct {
	Version string // without the "v"
	Page    string // the release's web page
	DMG     Asset
	Sums    Asset // SHA256SUMS.txt
}

// Asset is one file attached to a release.
type Asset struct {
	Name string
	URL  string
	Size int64
}

// ErrNoFeed means there is nothing to read yet: the repository is private
// (GitHub answers 404 to an anonymous caller) or has no published release.
// Not a failure the person needs to see. A rate limit is not this (D187):
// it says nothing about whether a release is out.
var ErrNoFeed = errors.New("no public release feed")

// ErrRateLimited: GitHub's API refused an anonymous caller (403/429), most
// often because others behind the same address used up its hourly 60.
var ErrRateLimited = errors.New("GitHub's API is rate limited")

// maxFeed bounds what is read from the API and from SHA256SUMS.txt.
const maxFeed = 1 << 20

type ghRelease struct {
	TagName    string `json:"tag_name"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	HTMLURL    string `json:"html_url"`
	Assets     []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
		Size int64  `json:"size"`
	} `json:"assets"`
}

// FetchRelease reads the feed and picks the disk image for arch
// ("arm64", "x86_64") and the checksums file.
func FetchRelease(ctx context.Context, hc *http.Client, feed, arch string) (Release, error) {
	body, err := get(ctx, hc, feed, maxFeed)
	if err != nil {
		var se statusError
		if errors.As(err, &se) && se.code == http.StatusNotFound {
			return Release{}, fmt.Errorf("%w (%s)", ErrNoFeed, se.status)
		}
		if errors.As(err, &se) && (se.code == http.StatusForbidden || se.code == http.StatusTooManyRequests) {
			return Release{}, fmt.Errorf("%w (%s)", ErrRateLimited, se.status)
		}
		return Release{}, err
	}
	var gr ghRelease
	if err := json.Unmarshal(body, &gr); err != nil {
		return Release{}, fmt.Errorf("reading the release feed: %w", err)
	}
	if gr.Draft || gr.Prerelease {
		return Release{}, ErrNoFeed
	}
	r := Release{Version: strings.TrimPrefix(gr.TagName, "v"), Page: gr.HTMLURL}
	if _, ok := parse(r.Version); !ok {
		return Release{}, fmt.Errorf("the release tag %q is not a version", gr.TagName)
	}
	want := "Ducter-" + r.Version + "-" + arch + ".dmg"
	for _, a := range gr.Assets {
		switch a.Name {
		case want:
			r.DMG = Asset{a.Name, a.URL, a.Size}
		case "SHA256SUMS.txt":
			r.Sums = Asset{a.Name, a.URL, a.Size}
		}
	}
	if r.DMG.URL == "" {
		return r, fmt.Errorf("release %s has no %s", r.Version, want)
	}
	if r.Sums.URL == "" {
		return r, fmt.Errorf("release %s has no SHA256SUMS.txt", r.Version)
	}
	return r, nil
}

// Source is where the newest release is read: the API document, else the
// release page's redirect, and where a tag's files are.
type Source struct {
	Feed     string
	Page     string // "": no fallback (a test feed)
	Download string
}

// Latest is the newest release for arch (D187). The API answers first; when
// it can't (a rate limit, an error, no answer) the version comes from the
// release page's redirect, else from hint (a newer version the home knows
// of), and the files from that tag's download address. A hint newer than
// what the page says wins too (the page can lag by a minute). Whatever
// names the version, the disk image must match the tag's SHA256SUMS.txt
// and be signed by this app's own team before it is offered, so a wrong
// hint can at most fetch a genuine release that then doesn't check out.
func Latest(ctx context.Context, hc *http.Client, src Source, arch, hint string) (Release, error) {
	r, err := FetchRelease(ctx, hc, src.Feed, arch)
	if err == nil {
		if Compare(hint, r.Version) > 0 && src.Download != "" {
			return ByTag(src.Download, strings.TrimPrefix(hint, "v"), arch), nil
		}
		return r, nil
	}
	if r.Version != "" {
		return r, err // the API answered: that release has no image for this Mac
	}
	if errors.Is(err, ErrNoFeed) && hint == "" {
		return r, err
	}
	v := ""
	if src.Page != "" {
		if tag, perr := LatestTag(ctx, hc, src.Page); perr == nil {
			v = tag
		}
	}
	if _, ok := parse(hint); ok && Compare(hint, v) > 0 {
		v = strings.TrimPrefix(hint, "v")
	}
	if v == "" || src.Download == "" {
		return Release{}, err
	}
	return ByTag(src.Download, v, arch), nil
}

// ByTag is release v's files at their download address, without the API.
func ByTag(download, v, arch string) Release {
	d := strings.TrimRight(download, "/")
	base := d + "/v" + v + "/"
	dmg := "Ducter-" + v + "-" + arch + ".dmg"
	page := strings.Replace(d, "/releases/download", "/releases/tag", 1) + "/v" + v
	return Release{Version: v, Page: page, DMG: Asset{Name: dmg, URL: base + dmg}, Sums: Asset{Name: "SHA256SUMS.txt", URL: base + "SHA256SUMS.txt"}}
}

// LatestTag reads the version the release page redirects to
// (…/releases/tag/v0.0.13), without following it.
func LatestTag(ctx context.Context, hc *http.Client, page string) (string, error) {
	u, err := url.Parse(page)
	if err != nil {
		return "", err
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && loopback(u.Hostname())) {
		return "", fmt.Errorf("refusing %s: updates come over HTTPS", page)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, page, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Ducter-updater")
	c := *hc
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()
	loc := resp.Header.Get("Location")
	i := strings.LastIndex(loc, "/releases/tag/")
	if resp.StatusCode/100 != 3 || i < 0 {
		return "", fmt.Errorf("GET %s: %s, no release tag", page, resp.Status)
	}
	v := strings.TrimPrefix(loc[i+len("/releases/tag/"):], "v")
	if _, ok := parse(v); !ok {
		return "", fmt.Errorf("the release page points at %q, not a version", loc)
	}
	return v, nil
}

// ExpectedSum fetches SHA256SUMS.txt and returns the sum listed for name.
func ExpectedSum(ctx context.Context, hc *http.Client, sums Asset, name string) ([]byte, error) {
	body, err := get(ctx, hc, sums.URL, maxFeed)
	if err != nil {
		return nil, err
	}
	return SumFor(body, name)
}

// SumFor finds name in a `sha256sum` listing ("<hex>  <name>", or
// "<hex> *<name>" in binary mode).
func SumFor(listing []byte, name string) ([]byte, error) {
	sc := bufio.NewScanner(strings.NewReader(string(listing)))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) != 2 || strings.TrimPrefix(f[1], "*") != name {
			continue
		}
		sum, err := hex.DecodeString(f[0])
		if err != nil || len(sum) != 32 {
			return nil, fmt.Errorf("SHA256SUMS.txt has a bad sum for %s", name)
		}
		return sum, nil
	}
	return nil, fmt.Errorf("SHA256SUMS.txt doesn't list %s", name)
}

type statusError struct {
	code   int
	status string
}

func (e statusError) Error() string { return e.status }

// get fetches a small document.
func get(ctx context.Context, hc *http.Client, raw string, limit int64) ([]byte, error) {
	resp, err := open(ctx, hc, raw)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, fmt.Errorf("%s is too large", raw)
	}
	return b, nil
}

// open starts a GET over HTTPS (plain HTTP only from this Mac itself, for a
// local test feed).
func open(ctx context.Context, hc *http.Client, raw string) (*http.Response, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && loopback(u.Hostname())) {
		return nil, fmt.Errorf("refusing %s: updates come over HTTPS", raw)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	// ASCII only: GitHub's asset store answers 400 to other bytes here.
	req.Header.Set("User-Agent", "Ducter-updater")
	if u.Host == "api.github.com" {
		req.Header.Set("Accept", "application/vnd.github+json")
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, statusError{resp.StatusCode, fmt.Sprintf("GET %s: %s", raw, resp.Status)}
	}
	return resp, nil
}

func loopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
