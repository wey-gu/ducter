//go:build !darwin

package local

func backgroundStatus(string) BackgroundStatus { return BackgroundUnknown }
