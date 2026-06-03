package update

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"yunshu-phone/internal/api"
	"yunshu-phone/internal/config"
)

// UpdateInfo holds info about an available update
type UpdateInfo struct {
	Version     string `json:"version"`
	DownloadURL string `json:"downloadUrl"`
	Changelog   string `json:"changelog"`
	ForceUpdate bool   `json:"forceUpdate"`
}

// Updater handles checking and applying updates
type Updater struct {
	currentVersion string
	onUpdateFound  func(info UpdateInfo)
}

// NewUpdater creates a new updater with the current app version
func NewUpdater(currentVersion string) *Updater {
	return &Updater{
		currentVersion: currentVersion,
	}
}

// SetOnUpdateFound registers a callback invoked when a new version is detected
func (u *Updater) SetOnUpdateFound(fn func(UpdateInfo)) {
	u.onUpdateFound = fn
}

// CheckForUpdate calls the backend API to check if a newer version is available.
// Returns UpdateInfo if an update is available, or nil if already up-to-date.
func (u *Updater) CheckForUpdate() (*UpdateInfo, error) {
	versionInfo, err := api.GetVersion()
	if err != nil {
		return nil, fmt.Errorf("check version: %w", err)
	}

	if versionInfo == nil || versionInfo.Version == "" {
		return nil, fmt.Errorf("empty version response")
	}

	latestVersion := versionInfo.Version
	if !isNewerVersion(latestVersion, u.currentVersion) {
		log.Printf("[Update] Already up-to-date: current=%s latest=%s", u.currentVersion, latestVersion)
		return nil, nil
	}

	info := UpdateInfo{
		Version:     latestVersion,
		DownloadURL: u.buildDownloadURL(latestVersion),
		Changelog:   "New version available: " + latestVersion,
		ForceUpdate: false,
	}

	log.Printf("[Update] New version available: %s -> %s", u.currentVersion, latestVersion)

	if u.onUpdateFound != nil {
		u.onUpdateFound(info)
	}

	return &info, nil
}

// DownloadAndApply downloads the new binary from downloadURL and replaces the
// current executable. On macOS it replaces the binary inside the .app bundle.
// On other platforms it replaces the binary directly.
func (u *Updater) DownloadAndApply(downloadURL string) error {
	if downloadURL == "" {
		return fmt.Errorf("empty download URL")
	}

	log.Printf("[Update] Downloading update from: %s", downloadURL)

	// Get the current executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("resolve symlinks: %w", err)
	}

	// Download to a temp file
	tmpFile, err := os.CreateTemp("", "yunshu-update-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		tmpFile.Close()
		os.Remove(tmpPath) // clean up temp file
	}()

	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		return fmt.Errorf("write update file: %w", err)
	}
	tmpFile.Close()

	// Make the downloaded file executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("chmod update file: %w", err)
	}

	// Determine the target path for replacement
	targetPath := execPath
	if runtime.GOOS == "darwin" {
		// On macOS, the binary is inside the .app bundle at
		// e.g. /Applications/YunShu.app/Contents/MacOS/yunshu-phone
		// We replace just the binary, not the whole bundle.
		// execPath already points to the binary inside the bundle.
		targetPath = execPath
	}

	// Replace the current binary:
	// 1. Rename current binary to .old
	oldPath := targetPath + ".old"
	if err := os.Rename(targetPath, oldPath); err != nil {
		return fmt.Errorf("backup current binary: %w", err)
	}

	// 2. Move new binary into place
	if err := os.Rename(tmpPath, targetPath); err != nil {
		// Try to restore the old binary
		os.Rename(oldPath, targetPath)
		return fmt.Errorf("install new binary: %w", err)
	}

	// 3. Remove the old binary
	os.Remove(oldPath)

	log.Printf("[Update] Update applied successfully: %s", targetPath)
	return nil
}

// StartPeriodicCheck runs a goroutine that checks for updates at the given interval.
// It stops when stopCh is closed.
func (u *Updater) StartPeriodicCheck(interval time.Duration, stopCh <-chan struct{}) {
	if interval <= 0 {
		interval = 2 * time.Hour
	}

	go func() {
		// Check once on startup after a short delay
		select {
		case <-stopCh:
			return
		case <-time.After(30 * time.Second):
		}

		u.checkAndLog()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-stopCh:
				log.Println("[Update] Periodic check stopped")
				return
			case <-ticker.C:
				u.checkAndLog()
			}
		}
	}()
}

func (u *Updater) checkAndLog() {
	info, err := u.CheckForUpdate()
	if err != nil {
		log.Printf("[Update] Check failed: %v", err)
		return
	}
	if info != nil {
		log.Printf("[Update] Update available: %s", info.Version)
	}
}

// buildDownloadURL constructs the download URL for the given version.
// The URL pattern is based on the API base URL with a version-specific path.
func (u *Updater) buildDownloadURL(version string) string {
	apiBase := config.Get().APIBaseURL
	platform := runtime.GOOS
	arch := runtime.GOARCH

	// Convention: {apiBase}/mer/version/download/{version}/{platform}/{arch}
	// This will be overridden if the API provides a direct URL.
	return fmt.Sprintf("%s/mer/version/download/%s/%s/%s", apiBase, version, platform, arch)
}

// isNewerVersion compares two semver-like version strings.
// Returns true if latest > current.
// Supports formats like "1.2.3", "v1.2.3", "1.2.3-beta", etc.
func isNewerVersion(latest, current string) bool {
	latest = strings.TrimPrefix(latest, "v")
	current = strings.TrimPrefix(current, "v")

	// Strip pre-release suffix for comparison (e.g., "-beta", "-rc1")
	latestBase := strings.SplitN(latest, "-", 2)[0]
	currentBase := strings.SplitN(current, "-", 2)[0]

	latestParts := strings.Split(latestBase, ".")
	currentParts := strings.Split(currentBase, ".")

	maxLen := len(latestParts)
	if len(currentParts) > maxLen {
		maxLen = len(currentParts)
	}

	for i := 0; i < maxLen; i++ {
		var lVal, cVal int
		if i < len(latestParts) {
			lVal, _ = strconv.Atoi(latestParts[i])
		}
		if i < len(currentParts) {
			cVal, _ = strconv.Atoi(currentParts[i])
		}
		if lVal > cVal {
			return true
		}
		if lVal < cVal {
			return false
		}
	}

	// If base versions are equal, a version without pre-release is newer
	// than one with pre-release (e.g., 1.2.3 > 1.2.3-beta)
	latestHasPre := strings.Contains(latest, "-")
	currentHasPre := strings.Contains(current, "-")
	if currentHasPre && !latestHasPre {
		return true
	}

	return false
}
