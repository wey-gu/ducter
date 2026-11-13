//go:build !darwin

package media

import (
	"errors"
	"image"
)

// PDF draws a PDF's pages: on the Mac only (pdf_darwin.go); elsewhere the
// viewer offers Save a copy.
type PDF struct{}

// ErrNotPDF is a file this build can't draw as a PDF.
var ErrNotPDF = errors.New("media: PDFs are drawn on the Mac only")

func OpenPDF([]byte) (*PDF, error)                  { return nil, ErrNotPDF }
func (p *PDF) Pages() int                           { return 0 }
func (p *PDF) Size(int) (float64, float64)          { return 0, 0 }
func (p *PDF) Render(int, int) (*image.RGBA, error) { return nil, ErrNotPDF }
func (p *PDF) Close()                               {}
