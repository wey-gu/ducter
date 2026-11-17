package theme

import (
	"embed"
	"log"
	"strings"
	"sync"

	"github.com/egoist/mygo/ui"
)

// Brand marks (D314): a third-party product is shown by its own mark, drawn
// faithfully and small inside a clay tile. The SVGs are copies of the web's
// (apps/web/src/brand, the one source; brand_test.go keeps them equal); their
// ink parts are currentColor, so they turn light on the dark paper as the
// owners' own marks do. Nowledge Mem's is its app icon (a picture, not paths).
//
//go:embed art/brand/*.svg art/brand/*.png
var brandFS embed.FS

var (
	brandMu    sync.Mutex
	brandCache = map[string]ui.ImageSource{}
)

// Brand is a product's mark by name (telegram, slack, imessage, wechat,
// gmail, googlecalendar, github, discord, oomol, tuwa, nowledge_mem); nil if
// there is none.
func Brand(name string) ui.ImageSource {
	brandMu.Lock()
	defer brandMu.Unlock()
	if s, ok := brandCache[name]; ok {
		return s
	}
	var src ui.ImageSource
	if data, err := brandFS.ReadFile("art/brand/" + name + ".svg"); err == nil {
		if s, err := ui.ParseSVG(data); err == nil {
			src = s
		} else {
			log.Printf("ducter: brand %s: %v", name, err)
		}
	} else if data, err := brandFS.ReadFile("art/brand/" + name + ".png"); err == nil {
		if b, err := ui.DecodeBitmap(data); err == nil {
			src = b
		}
	}
	brandCache[name] = src
	return src
}

// BrandSVGs are the files of the marks drawn from paths, for the test that
// keeps them equal to the web's.
func BrandSVGs() []string {
	es, _ := brandFS.ReadDir("art/brand")
	var out []string
	for _, e := range es {
		if strings.HasSuffix(e.Name(), ".svg") {
			out = append(out, e.Name())
		}
	}
	return out
}

// BrandSVG is one mark's file, for that test.
func BrandSVG(file string) []byte {
	b, _ := brandFS.ReadFile("art/brand/" + file)
	return b
}
