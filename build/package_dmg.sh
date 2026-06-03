#!/bin/bash
set -e

# Make sure we are on macOS
if [ "$(uname)" != "Darwin" ]; then
    echo "This script is only supported on macOS."
    exit 1
fi

APP_NAME="云枢"
APP_PATH="build/bin/${APP_NAME}.app"
DMG_PATH="build/bin/${APP_NAME}.dmg"
PACK_DMG="build/bin/pack.dmg"
DMG_ROOT="build/dmg_root"

# Clean any existing mount points to avoid conflicts
if [ -d "/Volumes/${APP_NAME}" ]; then
    echo "Detaching existing volume..."
    hdiutil detach "/Volumes/${APP_NAME}" || true
fi

# Clean old artifacts
rm -rf "${DMG_ROOT}" "${PACK_DMG}" "${DMG_PATH}"
mkdir -p "${DMG_ROOT}"

# Copy App and create Applications link
cp -R "${APP_PATH}" "${DMG_ROOT}/"
ln -s /Applications "${DMG_ROOT}/Applications"

# Create writable image
hdiutil create -volname "${APP_NAME}" -srcfolder "${DMG_ROOT}" -ov -format UDRW "${PACK_DMG}"
rm -rf "${DMG_ROOT}"

# Mount writeable image
hdiutil attach "${PACK_DMG}"

# Run AppleScript to layout icons and hide finder toolbar/statusbar (skip on headless CI)
if [ "$GITHUB_ACTIONS" != "true" ]; then
    echo "Running AppleScript to layout icons..."
    osascript -e "
    tell application \"Finder\"
        tell disk \"${APP_NAME}\"
            open
            set current view of container window to icon view
            set toolbar visible of container window to false
            set statusbar visible of container window to false
            set bounds of container window to {400, 100, 1000, 480}
            set theViewOptions to icon view options of container window
            set icon size of theViewOptions to 128
            set arrangement of theViewOptions to not arranged
            set position of item \"${APP_NAME}.app\" of container window to {160, 170}
            set position of item \"Applications\" of container window to {440, 170}
            update without registering applications
            delay 2
            close
        end tell
    end tell
    "
else
    echo "Headless environment detected (GitHub Actions). Skipping Finder AppleScript GUI styling."
fi

# Unmount and convert to uncompressed UDRO DMG (force detach if busy, ignore benign eject failures)
hdiutil detach "/Volumes/${APP_NAME}" -force || true
hdiutil convert "${PACK_DMG}" -format UDRO -ov -o "${DMG_PATH}"
rm -f "${PACK_DMG}"

echo "DMG package successfully created at ${DMG_PATH}"
