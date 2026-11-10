//go:build darwin

package main

import "github.com/ebitengine/purego/objc"

// flushWindows commits the window server changes made on this turn of the
// main thread (windows ordered out or closed) now, instead of at the end
// of the run loop's turn. A quit stops the run loop right after closing
// the windows, so without this they stay on screen, blank, until the
// process exits. Main thread only.
func flushWindows() {
	if c := objc.GetClass("CATransaction"); c != 0 {
		objc.ID(c).Send(objc.RegisterName("flush"))
	}
}
