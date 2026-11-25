package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D562: the shelf fills its column: three tiles a row at 1000, 1150 and 1400
// (a hair of rounding wrapped the row after two and left a third empty).
func TestShelfFillsItsColumn(t *testing.T) {
	for _, w := range []int{1000, 1150, 1400} {
		app, _ := shelfApp(t, i18n.EN, polishFixture(i18n.EN), nil)
		app.winW = float32(w)
		app.OpenApps()
		tt := shelfTester(app, w)
		first, ok1 := tt.Find("Review board")
		third, ok3 := tt.Find("To buy this week")
		if !ok1 || !ok3 || third.Y != first.Y || third.X+third.W > float32(w) {
			t.Errorf("%d: first %+v third %+v", w, first, third)
		}
	}
}
