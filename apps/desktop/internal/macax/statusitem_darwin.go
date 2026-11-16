//go:build darwin

// Package macax gives AppKit views the accessible names mygo has no call
// for yet. Today: the menu bar item (D306, D310). An image-only status
// item with a tooltip is read by VoiceOver as its help alone; its button
// needs an accessibility label to have a name.
package macax

import (
	"runtime"
	"unsafe"

	"github.com/ebitengine/purego/objc"
)

var (
	selShared   = objc.RegisterName("sharedApplication")
	selWindows  = objc.RegisterName("windows")
	selCount    = objc.RegisterName("count")
	selAt       = objc.RegisterName("objectAtIndex:")
	selContent  = objc.RegisterName("contentView")
	selSubviews = objc.RegisterName("subviews")
	selKind     = objc.RegisterName("isKindOfClass:")
	selLabel    = objc.RegisterName("setAccessibilityLabel:")
	selUTF8     = objc.RegisterName("stringWithUTF8String:")
)

// LabelStatusItems sets label as the accessible name of this app's status
// item buttons (Ducter has one) and reports how many it found. Call it on
// the main thread, after the item exists.
func LabelStatusItems(label string) int {
	app := objc.ID(objc.GetClass("NSApplication")).Send(selShared)
	button := objc.GetClass("NSStatusBarButton")
	if app == 0 || button == 0 {
		return 0
	}
	b := append([]byte(label), 0)
	str := objc.ID(objc.GetClass("NSString")).Send(selUTF8, uintptr(unsafe.Pointer(&b[0])))
	runtime.KeepAlive(b)
	if str == 0 {
		return 0
	}
	wins := app.Send(selWindows)
	found := 0
	for i := range objc.Send[uint](wins, selCount) {
		found += label1(wins.Send(selAt, i).Send(selContent), button, str, 0)
	}
	return found
}

// label1 labels v if it is a status item button, else looks a few levels
// into its subviews.
func label1(v objc.ID, button objc.Class, str objc.ID, depth int) int {
	if v == 0 || depth > 3 {
		return 0
	}
	if objc.Send[bool](v, selKind, button) {
		v.Send(selLabel, str)
		return 1
	}
	subs := v.Send(selSubviews)
	n := 0
	for i := range objc.Send[uint](subs, selCount) {
		n += label1(subs.Send(selAt, i), button, str, depth+1)
	}
	return n
}
