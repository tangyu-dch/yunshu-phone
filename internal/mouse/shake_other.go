//go:build !darwin

package mouse

// ShakeWindow is a no-op on non-macOS platforms.
func ShakeWindow() {
	// Not implemented for this platform
}
