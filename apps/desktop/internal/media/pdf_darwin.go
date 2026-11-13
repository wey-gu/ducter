//go:build darwin

package media

// D241: a PDF's pages drawn by the Mac itself. MyGo has no PDF view, so the
// app calls Core Graphics (the engine Preview and PDFKit draw with) through
// purego, as the rest of the app reaches the system without cgo: the
// document is parsed from the bytes this app fetched, and one page at a
// time is drawn into a bitmap of the width it shows at. Nothing is written
// to disk and nothing opens outside Ducter.

import (
	"errors"
	"image"
	"runtime"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"
)

type cgRect struct{ X, Y, W, H float64 }

type cgAffine struct{ A, B, C, D, TX, TY float64 }

var (
	cgOnce sync.Once
	cgErr  error

	cfDataCreate                 func(alloc uintptr, bytes unsafe.Pointer, n int) uintptr
	cfRelease                    func(uintptr)
	cgDataProviderCreateWithData func(data uintptr) uintptr
	cgDataProviderRelease        func(uintptr)
	cgPDFDocumentCreate          func(provider uintptr) uintptr
	cgPDFDocumentRelease         func(uintptr)
	cgPDFDocumentPages           func(doc uintptr) uint
	cgPDFDocumentPage            func(doc uintptr, n uint) uintptr
	cgPDFPageBox                 func(page uintptr, box int32) cgRect
	cgPDFPageRotation            func(page uintptr) int32
	cgPDFPageDrawingTransform    func(page uintptr, box int32, rect cgRect, rotate int32, keep bool) cgAffine
	cgColorSpaceDeviceRGB        func() uintptr
	cgColorSpaceRelease          func(uintptr)
	cgBitmapContextCreate        func(data unsafe.Pointer, w, h, bits, row uint, space uintptr, info uint32) uintptr
	cgBitmapContextData          func(ctx uintptr) unsafe.Pointer
	cgContextRelease             func(uintptr)
	cgContextFillColor           func(ctx uintptr, r, g, b, a float64)
	cgContextFillRect            func(ctx uintptr, r cgRect)
	cgContextScale               func(ctx uintptr, sx, sy float64)
	cgContextConcat              func(ctx uintptr, t cgAffine)
	cgContextQuality             func(ctx uintptr, q int32)
	cgContextDrawPDFPage         func(ctx, page uintptr)
)

func loadCG() error {
	cgOnce.Do(func() {
		cf, err := purego.Dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			cgErr = err
			return
		}
		cg, err := purego.Dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			cgErr = err
			return
		}
		purego.RegisterLibFunc(&cfDataCreate, cf, "CFDataCreate")
		purego.RegisterLibFunc(&cfRelease, cf, "CFRelease")
		purego.RegisterLibFunc(&cgDataProviderCreateWithData, cg, "CGDataProviderCreateWithCFData")
		purego.RegisterLibFunc(&cgDataProviderRelease, cg, "CGDataProviderRelease")
		purego.RegisterLibFunc(&cgPDFDocumentCreate, cg, "CGPDFDocumentCreateWithProvider")
		purego.RegisterLibFunc(&cgPDFDocumentRelease, cg, "CGPDFDocumentRelease")
		purego.RegisterLibFunc(&cgPDFDocumentPages, cg, "CGPDFDocumentGetNumberOfPages")
		purego.RegisterLibFunc(&cgPDFDocumentPage, cg, "CGPDFDocumentGetPage")
		purego.RegisterLibFunc(&cgPDFPageBox, cg, "CGPDFPageGetBoxRect")
		purego.RegisterLibFunc(&cgPDFPageRotation, cg, "CGPDFPageGetRotationAngle")
		purego.RegisterLibFunc(&cgPDFPageDrawingTransform, cg, "CGPDFPageGetDrawingTransform")
		purego.RegisterLibFunc(&cgColorSpaceDeviceRGB, cg, "CGColorSpaceCreateDeviceRGB")
		purego.RegisterLibFunc(&cgColorSpaceRelease, cg, "CGColorSpaceRelease")
		purego.RegisterLibFunc(&cgBitmapContextCreate, cg, "CGBitmapContextCreate")
		purego.RegisterLibFunc(&cgBitmapContextData, cg, "CGBitmapContextGetData")
		purego.RegisterLibFunc(&cgContextRelease, cg, "CGContextRelease")
		purego.RegisterLibFunc(&cgContextFillColor, cg, "CGContextSetRGBFillColor")
		purego.RegisterLibFunc(&cgContextFillRect, cg, "CGContextFillRect")
		purego.RegisterLibFunc(&cgContextScale, cg, "CGContextScaleCTM")
		purego.RegisterLibFunc(&cgContextConcat, cg, "CGContextConcatCTM")
		purego.RegisterLibFunc(&cgContextQuality, cg, "CGContextSetInterpolationQuality")
		purego.RegisterLibFunc(&cgContextDrawPDFPage, cg, "CGContextDrawPDFPage")
	})
	return cgErr
}

// PDF is a parsed PDF; its pages draw one at a time. Safe for one
// goroutine at a time.
type PDF struct {
	mu       sync.Mutex
	data     uintptr // CFData (a copy of the bytes)
	provider uintptr
	doc      uintptr
	n        int
}

// ErrNotPDF is a file Core Graphics can't read as a PDF (or one locked
// with a password).
var ErrNotPDF = errors.New("media: not a PDF this Mac can draw")

// OpenPDF parses a PDF from its bytes.
func OpenPDF(b []byte) (*PDF, error) {
	if err := loadCG(); err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return nil, ErrNotPDF
	}
	p := &PDF{}
	p.data = cfDataCreate(0, unsafe.Pointer(&b[0]), len(b)) // copies the bytes
	runtime.KeepAlive(b)
	if p.data == 0 {
		return nil, ErrNotPDF
	}
	p.provider = cgDataProviderCreateWithData(p.data)
	if p.provider != 0 {
		p.doc = cgPDFDocumentCreate(p.provider)
	}
	if p.doc == 0 {
		p.Close()
		return nil, ErrNotPDF
	}
	p.n = int(cgPDFDocumentPages(p.doc))
	if p.n == 0 {
		p.Close()
		return nil, ErrNotPDF
	}
	return p, nil
}

// Pages is how many pages it has.
func (p *PDF) Pages() int { return p.n }

const cropBox = 1 // kCGPDFCropBox: the page as a reader shows it

// Size is page i's size (from 1) in points as it shows, turned as it says.
func (p *PDF) Size(i int) (w, h float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.doc == 0 || i < 1 || i > p.n {
		return 0, 0
	}
	pg := cgPDFDocumentPage(p.doc, uint(i))
	if pg == 0 {
		return 0, 0
	}
	r := cgPDFPageBox(pg, cropBox)
	if rot := ((cgPDFPageRotation(pg) % 360) + 360) % 360; rot == 90 || rot == 270 {
		return r.H, r.W
	}
	return r.W, r.H
}

// Render draws page i (from 1) on white at width pixels wide.
func (p *PDF) Render(i, width int) (*image.RGBA, error) {
	w, h := p.Size(i)
	if w <= 0 || h <= 0 || width <= 0 {
		return nil, ErrNotPDF
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.doc == 0 {
		return nil, ErrNotPDF
	}
	pg := cgPDFDocumentPage(p.doc, uint(i))
	s := float64(width) / w
	pw, ph := width, int(h*s+0.5)
	if ph <= 0 || ph > 20000 {
		return nil, ErrNotPDF
	}
	cs := cgColorSpaceDeviceRGB()
	defer cgColorSpaceRelease(cs)
	// RGBA, premultiplied last, big-endian: Go's image.RGBA order.
	ctx := cgBitmapContextCreate(nil, uint(pw), uint(ph), 8, uint(pw*4), cs, 1|4<<12)
	if ctx == 0 {
		return nil, ErrNotPDF
	}
	defer cgContextRelease(ctx)
	cgContextFillColor(ctx, 1, 1, 1, 1)
	cgContextFillRect(ctx, cgRect{0, 0, float64(pw), float64(ph)})
	cgContextQuality(ctx, 3) // high
	cgContextScale(ctx, s, s)
	cgContextConcat(ctx, cgPDFPageDrawingTransform(pg, cropBox, cgRect{0, 0, w, h}, 0, true))
	cgContextDrawPDFPage(ctx, pg)
	src := unsafe.Slice((*byte)(cgBitmapContextData(ctx)), pw*ph*4)
	img := image.NewRGBA(image.Rect(0, 0, pw, ph))
	copy(img.Pix, src)
	return img, nil
}

// Close lets the document go.
func (p *PDF) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.doc != 0 {
		cgPDFDocumentRelease(p.doc)
		p.doc = 0
	}
	if p.provider != 0 {
		cgDataProviderRelease(p.provider)
		p.provider = 0
	}
	if p.data != 0 {
		cfRelease(p.data)
		p.data = 0
	}
}
