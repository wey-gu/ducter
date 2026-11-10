//go:build !darwin

package main

// flushWindows: only macOS defers taking a closed window off the screen.
func flushWindows() {}
