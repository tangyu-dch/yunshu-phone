.PHONY: dev build build-prod clean install-deps doctor help

# Detect Wails binary path
WAILS := $(shell which wails 2>/dev/null)
ifeq ($(WAILS),)
  WAILS_HOME_BIN := $(shell echo $$HOME/go/bin/wails)
  ifneq ($(wildcard $(WAILS_HOME_BIN)),)
    WAILS := $(WAILS_HOME_BIN)
  else
    WAILS := wails
  endif
endif

# Default target
all: help

dev:
	$(WAILS) dev

build:
	$(WAILS) build
ifeq ($(shell uname), Darwin)
	./build/package_dmg.sh
	rm -rf build/pkg_root && mkdir -p build/pkg_root/Applications
	cp -R build/bin/云枢.app build/pkg_root/Applications/
	pkgbuild --root build/pkg_root --install-location / build/bin/云枢.pkg
	rm -rf build/pkg_root
endif

build-prod:
	BASE_ENV=production $(WAILS) build
ifeq ($(shell uname), Darwin)
	./build/package_dmg.sh
	rm -rf build/pkg_root && mkdir -p build/pkg_root/Applications
	cp -R build/bin/云枢.app build/pkg_root/Applications/
	pkgbuild --root build/pkg_root --install-location / build/bin/云枢.pkg
	rm -rf build/pkg_root
endif

build-windows:
	$(WAILS) build -platform windows/amd64 -nsis

build-windows-prod:
	BASE_ENV=production $(WAILS) build -platform windows/amd64 -nsis

clean:
	rm -rf build/bin/云枢* build/bin/yunshu-phone*
	cd frontend && rm -rf dist node_modules

install-deps:
	cd frontend && npm install
	go mod download

doctor:
	$(WAILS) doctor

help:
	@echo "Available commands:"
	@echo "  make dev         - Start live development server (wails dev)"
	@echo "  make build       - Build application bundle"
	@echo "  make build-prod  - Build production application bundle (BASE_ENV=production)"
	@echo "  make clean       - Clean build artifacts and node_modules"
	@echo "  make install-deps- Install dependencies"
	@echo "  make doctor      - Run wails diagnostics"
