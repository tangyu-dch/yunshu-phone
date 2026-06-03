#!/bin/bash
set -e

# Make sure we are on Linux
if [ "$(uname)" != "Linux" ]; then
    echo "This script is only supported on Linux."
    exit 1
fi

APP_NAME="云枢"
APP_DIR="build/AppDir"
BIN_PATH="build/bin/${APP_NAME}"

# Clean old AppDir
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"

# Copy binary
cp "${BIN_PATH}" "${APP_DIR}/usr/bin/"

# Copy icon
if [ -f "build/appicon.png" ]; then
    cp "build/appicon.png" "${APP_DIR}/yunshu.png"
    cp "build/appicon.png" "${APP_DIR}/usr/share/icons/hicolor/256x256/apps/yunshu.png"
else
    # Fallback dummy icon if not found
    touch "${APP_DIR}/yunshu.png"
fi

# Create desktop entry
cat <<EOF > "${APP_DIR}/yunshu.desktop"
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec=${APP_NAME} %U
Icon=yunshu
Categories=Utility;
Terminal=false
EOF

# Create AppRun script
cat <<'EOF' > "${APP_DIR}/AppRun"
#!/bin/sh
SELF=$(readlink -f "$0")
HERE=$(dirname "$SELF")
exec "$HERE/usr/bin/云枢" "$@"
EOF
chmod +x "${APP_DIR}/AppRun"

# Download appimagetool if not present
if [ ! -f "./appimagetool" ]; then
    echo "Downloading appimagetool..."
    wget -O appimagetool https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage
    chmod +x appimagetool
fi

# Package AppImage (extract and run to bypass FUSE requirement in headless CI)
echo "Packaging AppImage..."
ARCH=x86_64 ./appimagetool --appimage-extract-and-run "${APP_DIR}" "build/bin/${APP_NAME}-x86_64.AppImage"

echo "AppImage successfully created at build/bin/${APP_NAME}-x86_64.AppImage"
