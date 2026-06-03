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
	hdiutil create -volname "云枢" -srcfolder build/bin/yunshu-phone.app -ov -format UDZO build/bin/yunshu-phone.dmg
endif

build-prod:
	BASE_ENV=production $(WAILS) build
ifeq ($(shell uname), Darwin)
	hdiutil create -volname "云枢" -srcfolder build/bin/yunshu-phone.app -ov -format UDZO build/bin/yunshu-phone.dmg
endif

clean:
	rm -rf build/bin/yunshu-phone*
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
