//go:build !darwin

package macax

// LabelStatusItems does nothing off macOS.
func LabelStatusItems(string) int { return 0 }
