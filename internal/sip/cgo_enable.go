package sip

// This file exists solely to keep CGo active for the package in every build.
// Without at least one Go file that has "import C", Go rejects any .c files
// in the package directory. The real PJSIP C implementation lives inside the
// CGo preamble of phone_pjsip.go (enabled by the "pjsip" build tag).
//
// When the "pjsip" tag is NOT set, phone_stub.go is used and the C symbols
// declared here are never referenced, so the linker doesn't complain about
// missing definitions.

// #include "pjsip_bridge.h"
import "C"
