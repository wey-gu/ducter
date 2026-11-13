package views

import (
	"fmt"
	"strings"
)

// researchPDF is research/75's summary as a small A4 PDF of a few pages
// (Helvetica, set by hand): what a task would hand over as "the report".
func researchPDF() []byte { return researchPDFTimes(1) }

// researchPDFTimes is the same report n times over (a long PDF).
func researchPDFTimes(n int) []byte {
	one := []string{
		"# 75. Opening a file a task made",
		"## What Ducter did, what T3 Code does",
		"Open sent the person's browser to the home's address with a per-file key that never expires: not the device token, but a capability that lands in synced browser history.",
		"## 1. What Open did, per client",
		"Mac: Open called OpenURL(home + /media/<id>?k=<key>&dl=1), which hands the address to the default browser. Phone and web: a link with target=_blank and download.",
		"What the home answered: every non-picture got content-disposition inline even with &dl=1, under a sandboxing CSP. The browser showed a Markdown file as a bare page of raw text.",
		"## 2. What leaked",
		"The device token: no. The file's key: yes. It opens that one file, never expires, and can't be revoked short of rotating the secret, which breaks every picture in the Log.",
		"## 3. T3 Code",
		"Files open in the app, in a viewer per kind: rendered Markdown with a source toggle, a virtual table for CSV, large text in a worker, PDF through pdf.js with zoom and find, Office files unzipped and drawn.",
		"Assets are signed URLs with an expiry in the signed payload. A PDF frame is left unsandboxed: Chromium's PDF plugin requires an unsandboxed frame.",
		"## 4. What Ducter already has to reuse",
		"The picture viewer: shared-element growth from the tile, Save, Copy, From {task}. The workbench's file view: the highlighter, the lines with numbers, MyGo's editor on the Mac.",
		"## Implications for Ducter",
		"Never navigate to a media URL. A file opens in a viewer that suits it. Reads are bounded. Later: pdf.js or a native PDF view; expiring media keys; a find bar in long files.",
	}
	var paras []string
	for i := 0; i < n; i++ {
		paras = append(paras, one...)
	}
	const W, H, margin, width = 595, 842, 64, 467
	var pages []string
	var b strings.Builder
	y := float64(H - margin)
	flush := func() {
		pages = append(pages, b.String())
		b.Reset()
		y = H - margin
	}
	esc := strings.NewReplacer(`\`, `\\`, "(", `\(`, ")", `\)`)
	for _, p := range paras {
		size, lead, font := 11.0, 16.0, "F1"
		switch {
		case strings.HasPrefix(p, "# "):
			p, size, lead, font = p[2:], 22, 30, "F2"
		case strings.HasPrefix(p, "## "):
			p, size, lead, font = p[3:], 14, 22, "F2"
			y -= 8
		}
		// Wrap by an average glyph width of half the size.
		per := int(width / (size * 0.5))
		var lines []string
		for _, w := range strings.Fields(p) {
			if n := len(lines); n > 0 && len(lines[n-1])+1+len(w) <= per {
				lines[n-1] += " " + w
			} else {
				lines = append(lines, w)
			}
		}
		for _, l := range lines {
			if y < margin+lead {
				flush()
			}
			fmt.Fprintf(&b, "BT /%s %.0f Tf %d %.1f Td (%s) Tj ET\n", font, size, margin, y-size, esc.Replace(l))
			y -= lead
		}
		y -= 8
	}
	flush()
	// Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then a page and its content per page.
	objs := []string{"", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"}
	var kids []string
	for _, content := range pages {
		pg := len(objs) + 1
		kids = append(kids, fmt.Sprintf("%d 0 R", pg))
		objs = append(objs,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>", W, H, pg+1),
			fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(content), content))
	}
	objs[0] = "<< /Type /Catalog /Pages 2 0 R >>"
	objs[1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pages))
	var out strings.Builder
	out.WriteString("%PDF-1.4\n")
	offs := make([]int, len(objs))
	for i, o := range objs {
		offs[i] = out.Len()
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	x := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, o := range offs {
		fmt.Fprintf(&out, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, x)
	return []byte(out.String())
}
