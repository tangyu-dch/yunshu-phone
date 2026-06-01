package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Environment represents the running environment
type Environment string

const (
	EnvProduction Environment = "production"
	EnvTest       Environment = "test"
)

// Config holds all application configuration
type Config struct {
	Env Environment `json:"env"`

	// API base URLs
	APIBaseURL string `json:"api_base_url"`
	WSBaseURL  string `json:"ws_base_url"`

	// Local HTTPS server
	LocalServerPort int `json:"local_server_port"`

	// App info
	AppVersion string `json:"app_version"`
}

var (
	instance *Config
	once     sync.Once
	mu       sync.RWMutex
)

// Default configs for each environment
var envConfigs = map[Environment]*Config{
	EnvProduction: {
		Env:             EnvProduction,
		APIBaseURL:      "https://dolphinapi.51zhulie.com",
		WSBaseURL:       "wss://dolphinapi.51zhulie.com/cc/ws/websocket",
		LocalServerPort: 54320,
	},
	EnvTest: {
		Env:             EnvTest,
		APIBaseURL:      "https://test.api.toyfuns.top/dolphin-gateway",
		WSBaseURL:       "wss://test.api.toyfuns.top/dolphin-gateway/cc/ws/websocket",
		LocalServerPort: 54320,
	},
}

// Get returns the current config singleton
func Get() *Config {
	once.Do(func() {
		instance = envConfigs[EnvTest] // default to test
	})
	return instance
}

// SetEnv switches the active environment
func SetEnv(env Environment) {
	mu.Lock()
	defer mu.Unlock()
	if c, ok := envConfigs[env]; ok {
		instance = c
	}
}

// SetVersion updates the app version
func SetVersion(version string) {
	mu.Lock()
	defer mu.Unlock()
	if instance != nil {
		instance.AppVersion = version
	}
}

// UserConfigPath returns the path to user config file
func UserConfigPath() (string, error) {
	home, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, "yunshu-phone")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// Save persists the current config to disk
func Save() error {
	mu.RLock()
	defer mu.RUnlock()

	path, err := UserConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(instance, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// Load reads config from disk
func Load() error {
	path, err := UserConfigPath()
	if err != nil {
		return err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return err // file doesn't exist yet, use defaults
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}

	mu.Lock()
	defer mu.Unlock()

	if cfg.Env != "" {
		instance = &cfg
	}
	return nil
}
