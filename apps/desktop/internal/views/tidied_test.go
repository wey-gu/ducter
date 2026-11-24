package views

import "testing"

// D514: the card's line says sizes as protocol tidy.ts's tidySize does (the web and the CLI).
func TestTidySize(t *testing.T) {
	cases := map[float64]string{
		512:                       "512 B",
		540 * 1024 * 1024:         "540 MB",
		3.4 * 1024 * 1024 * 1024:  "3.4 GB",
		1.6 * 1024 * 1024 * 1024:  "1.6 GB",
		12.4 * 1024 * 1024 * 1024: "12 GB",
	}
	for n, want := range cases {
		if got := tidySize(n); got != want {
			t.Errorf("tidySize(%v) = %q, want %q", n, got, want)
		}
	}
}
