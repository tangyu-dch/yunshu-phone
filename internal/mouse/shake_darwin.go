//go:build darwin

package mouse

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// shakeWindow offsets the main NSWindow position rapidly to create a shake effect.
// It oscillates X ±8px over 6 cycles (~30ms per step), then restores the original position.
void shakeWindow(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = [NSApp mainWindow];
        if (window == nil) {
            return;
        }

        NSRect originalFrame = [window frame];
        CGFloat originalX = originalFrame.origin.x;

        int cycles = 6;
        CGFloat amplitude = 8.0;

        for (int i = 0; i < cycles; i++) {
            // Offset right
            NSRect f = [window frame];
            f.origin.x = originalX + amplitude;
            [window setFrame:f display:YES];

            // Brief pause via usleep (30ms)
            usleep(30000);

            // Offset left
            f = [window frame];
            f.origin.x = originalX - amplitude;
            [window setFrame:f display:YES];

            usleep(30000);
        }

        // Restore original position
        NSRect f = [window frame];
        f.origin.x = originalX;
        [window setFrame:f display:YES];
    });
}
*/
import "C"

// ShakeWindow starts a non-blocking shake animation on the main application window.
// The window oscillates horizontally ±8 pixels for 6 cycles (~360ms total).
func ShakeWindow() {
	go func() {
		C.shakeWindow()
	}()
}
