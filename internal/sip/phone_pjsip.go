//go:build pjsip

package sip

// ==========================================================================
// CGo preamble: compiler/linker flags + full C bridge implementation.
//
// The C implementation lives here (rather than in a separate .c file) so
// that it is only compiled when the "pjsip" build tag is active. Go's build
// system compiles all .c files in a package directory unconditionally,
// which would break non-pjsip builds.
// ==========================================================================

// #cgo CFLAGS: -I/usr/local/include -I/opt/homebrew/include
// #cgo LDFLAGS: -L/usr/local/lib -L/opt/homebrew/lib -lpjsua2 -lpjsua -lpjsip-ua -lpjsip-simple -lpjsip -lpjmedia -lpjmedia-codec -lpjnath -lpjlib-util -lpj -lsrtp -lresample -lgsmcodec -lspeex -lilbcc -lg7221codec -lssl -lcrypto -lm -lpthread
// #cgo darwin LDFLAGS: -framework AudioToolbox -framework CoreAudio -framework CoreFoundation -framework AudioUnit
//
// #include <pjsua-lib/pjsua.h>
// #include <pj/log.h>
// #include <stdlib.h>
// #include <string.h>
// #include <stdio.h>
//
// /* -------------------------------------------------------------- */
// /*  Opaque struct behind the pjsip_phone handle                   */
// /* -------------------------------------------------------------- */
//
// struct pjsip_phone {
//     pjsua_acc_id    acc_id;
//     pjsua_call_id   call_id;
//     int             initialized;
//
//     void (*reg_cb)(int status_code, const char* reason);
//     void (*call_cb)(int event_type, const char* data);
//
//     char domain[256];
//     char username[128];
// };
//
// /* -------------------------------------------------------------- */
// /*  Forward declarations for PJSUA callbacks                      */
// /* -------------------------------------------------------------- */
//
// static void cb_on_reg_state2(pjsua_acc_id acc_id, pjsua_reg_info *info);
// static void cb_on_call_state2(pjsua_call_id call_id, pjsua_call_info *info,
//                                pjsip_event *e);
// static void cb_on_incoming_call(pjsua_acc_id acc_id, pjsua_call_id call_id,
//                                  pjsip_rx_data *rdata);
//
// /* -------------------------------------------------------------- */
// /*  Lifecycle                                                     */
// /* -------------------------------------------------------------- */
//
// static pjsip_phone* pjsip_phone_create(void) {
//     pjsip_phone *phone = (pjsip_phone *)calloc(1, sizeof(pjsip_phone));
//     if (!phone) return NULL;
//     phone->acc_id  = PJSUA_INVALID_ID;
//     phone->call_id = PJSUA_INVALID_ID;
//     return phone;
// }
//
// static int pjsip_phone_init(pjsip_phone *phone,
//                              const char *domain, int port,
//                              const char *protocol,
//                              const char *username,
//                              const char *password)
// {
//     if (!phone || !domain || !protocol || !username || !password)
//         return -1;
//
//     pj_status_t status;
//
//     snprintf(phone->domain,   sizeof(phone->domain),   "%s", domain);
//     snprintf(phone->username,  sizeof(phone->username),  "%s", username);
//
//     /* Create PJSUA endpoint */
//     status = pjsua_create();
//     if (status != PJ_SUCCESS) return -2;
//
//     /* Endpoint configuration with our callbacks */
//     pjsua_config cfg;
//     pjsua_config_default(&cfg);
//     cfg.cb.on_reg_state2    = &cb_on_reg_state2;
//     cfg.cb.on_call_state2   = &cb_on_call_state2;
//     cfg.cb.on_incoming_call = &cb_on_incoming_call;
//     cfg.log_level           = 3;
//
//     pjsua_logging_config log_cfg;
//     pjsua_logging_config_default(&log_cfg);
//     log_cfg.level = 3;
//
//     pjsua_transport_config tp_cfg;
//     pjsua_transport_config_default(&tp_cfg);
//     tp_cfg.port = (unsigned)(port > 0 ? port : 5060);
//
//     pjsip_transport_type_e tp_type;
//     if (strcasecmp(protocol, "tcp") == 0) {
//         tp_type = PJSIP_TRANSPORT_TCP;
//     } else {
//         tp_type = PJSIP_TRANSPORT_UDP;
//     }
//
//     status = pjsua_init(&cfg, &log_cfg, &tp_cfg);
//     if (status != PJ_SUCCESS) { pjsua_destroy(); return -3; }
//
//     pjsua_transport_id tp_id;
//     status = pjsua_transport_create(tp_type, &tp_cfg, &tp_id);
//     if (status != PJ_SUCCESS) { pjsua_destroy(); return -4; }
//
//     status = pjsua_start();
//     if (status != PJ_SUCCESS) { pjsua_destroy(); return -5; }
//
//     /* Account configuration: sip:username@domain:port */
//     pjsua_acc_config acc_cfg;
//     pjsua_acc_config_default(&acc_cfg);
//
//     char uri[512];
//     snprintf(uri, sizeof(uri), "sip:%s@%s:%d", username, domain, port);
//     acc_cfg.id = pj_str(uri);
//
//     char reg_uri[512];
//     snprintf(reg_uri, sizeof(reg_uri), "sip:%s:%d", domain, port);
//     acc_cfg.reg_uri = pj_str(reg_uri);
//
//     acc_cfg.cred_count = 1;
//     acc_cfg.cred_info[0].scheme    = pj_str("digest");
//     acc_cfg.cred_info[0].realm     = pj_str("*");
//     acc_cfg.cred_info[0].username  = pj_str((char *)username);
//     acc_cfg.cred_info[0].data_type = PJSIP_CRED_DATA_PLAIN_PASSWD;
//     acc_cfg.cred_info[0].data      = pj_str((char *)password);
//     acc_cfg.transport_id = tp_id;
//
//     status = pjsua_acc_add(&acc_cfg, PJ_TRUE, &phone->acc_id);
//     if (status != PJ_SUCCESS) { pjsua_destroy(); return -6; }
//
//     phone->initialized = 1;
//     return 0;
// }
//
// static int pjsip_phone_register(pjsip_phone *phone) {
//     if (!phone || phone->acc_id == PJSUA_INVALID_ID) return -1;
//     return (int)pjsua_acc_set_registration(phone->acc_id, PJ_TRUE);
// }
//
// static int pjsip_phone_call(pjsip_phone *phone,
//                              const char *number,
//                              const char *extra_headers_json)
// {
//     if (!phone || !number || phone->acc_id == PJSUA_INVALID_ID) return -1;
//
//     char uri_buf[512];
//     snprintf(uri_buf, sizeof(uri_buf), "sip:%s@%s", number, phone->domain);
//     pj_str_t uri = pj_str(uri_buf);
//
//     pjsua_msg_data msg_data;
//     pjsua_msg_data_init(&msg_data);
//
//     /* Parse simple JSON {"key":"value",...} into SIP headers */
//     if (extra_headers_json && strlen(extra_headers_json) > 2) {
//         const char *p = extra_headers_json;
//         while (*p && (*p == ' ' || *p == '\t' || *p == '{')) p++;
//         while (*p && *p != '}') {
//             while (*p && (*p == ' ' || *p == '\t' || *p == ',')) p++;
//             if (*p != '"') break;
//             p++;
//             char key[256]; int ki = 0;
//             while (*p && *p != '"' && ki < 255) { key[ki++] = *p++; }
//             key[ki] = '\0';
//             if (*p == '"') p++;
//             while (*p && (*p == ':' || *p == ' ' || *p == '\t')) p++;
//             if (*p == '"') p++;
//             char val[512]; int vi = 0;
//             while (*p && *p != '"' && vi < 511) { val[vi++] = *p++; }
//             val[vi] = '\0';
//             if (*p == '"') p++;
//             if (ki > 0 && vi > 0) {
//                 pjsip_generic_string_hdr *hdr =
//                     pjsip_generic_string_hdr_create(pjsua_var.pool,
//                         &pj_str(key), &pj_str(val));
//                 if (hdr) pj_list_push_back(&msg_data.hdr_list, hdr);
//             }
//         }
//     }
//
//     pjsua_call_id call_id;
//     pj_status_t st = pjsua_call_make_call(phone->acc_id, &uri,
//                                            NULL, NULL, &msg_data, &call_id);
//     if (st == PJ_SUCCESS) phone->call_id = call_id;
//     return (int)st;
// }
//
// static int pjsip_phone_answer(pjsip_phone *phone) {
//     if (!phone || phone->call_id == PJSUA_INVALID_ID) return -1;
//     return (int)pjsua_call_answer(phone->call_id, 200, NULL, NULL);
// }
//
// static int pjsip_phone_hangup(pjsip_phone *phone,
//                                const char *reason,
//                                const char *hangup_header)
// {
//     if (!phone || phone->call_id == PJSUA_INVALID_ID) return -1;
//
//     pjsua_msg_data msg_data;
//     pjsua_msg_data_init(&msg_data);
//
//     if (hangup_header && strlen(hangup_header) > 0) {
//         pjsip_generic_string_hdr *hdr =
//             pjsip_generic_string_hdr_create(pjsua_var.pool,
//                 &pj_str("X-Dolphoin-Custom-Hangup"),
//                 &pj_str((char *)hangup_header));
//         if (hdr) pj_list_push_back(&msg_data.hdr_list, hdr);
//     }
//
//     pj_str_t reason_str = reason
//         ? pj_str((char *)reason)
//         : pj_str("Normal call clearing");
//     pj_status_t st = pjsua_call_hangup(phone->call_id, 200,
//                                         &reason_str, &msg_data);
//     phone->call_id = PJSUA_INVALID_ID;
//     return (int)st;
// }
//
// static int pjsip_phone_send_dtmf(pjsip_phone *phone, const char *digits) {
//     if (!phone || !digits || phone->call_id == PJSUA_INVALID_ID) return -1;
//     pj_str_t d = pj_str((char *)digits);
//     return (int)pjsua_call_dial_dtmf(phone->call_id, &d);
// }
//
// static void pjsip_phone_destroy(pjsip_phone *phone) {
//     if (!phone) return;
//     if (phone->initialized) {
//         pjsua_call_hangup_all();
//         pjsua_destroy();
//         phone->initialized = 0;
//     }
//     phone->acc_id  = PJSUA_INVALID_ID;
//     phone->call_id = PJSUA_INVALID_ID;
//     free(phone);
// }
//
// /* -------------------------------------------------------------- */
// /*  Status queries                                                */
// /* -------------------------------------------------------------- */
//
// static int pjsip_phone_get_reg_status(pjsip_phone *phone) {
//     if (!phone || phone->acc_id == PJSUA_INVALID_ID) return -1;
//     pjsua_acc_info info;
//     if (pjsua_acc_get_info(phone->acc_id, &info) != PJ_SUCCESS) return -1;
//     return (int)info.status;
// }
//
// static int pjsip_phone_get_call_state(pjsip_phone *phone) {
//     if (!phone || phone->call_id == PJSUA_INVALID_ID) return 0;
//     pjsua_call_info info;
//     if (pjsua_call_get_info(phone->call_id, &info) != PJ_SUCCESS) return 0;
//     return (int)info.state;
// }
//
// /* -------------------------------------------------------------- */
// /*  Callback setters                                              */
// /* -------------------------------------------------------------- */
//
// static void pjsip_phone_set_reg_callback(pjsip_phone *phone,
//                                           void (*cb)(int, const char*)) {
//     if (phone) phone->reg_cb = cb;
// }
//
// static void pjsip_phone_set_call_callback(pjsip_phone *phone,
//                                            void (*cb)(int, const char*)) {
//     if (phone) phone->call_cb = cb;
// }
//
// /* -------------------------------------------------------------- */
// /*  PJSUA callback: registration state change                     */
// /* -------------------------------------------------------------- */
//
// extern void goRegCallback(int status_code, const char* reason);
// extern void goCallCallback(int event_type, const char* data);
//
// static void cb_on_reg_state2(pjsua_acc_id acc_id, pjsua_reg_info *info) {
//     pjsua_acc_info acc_info;
//     if (pjsua_acc_get_info(acc_id, &acc_info) != PJ_SUCCESS) return;
//
//     pjsip_phone *phone = (pjsip_phone *)acc_info.user_data;
//     if (!phone || !phone->reg_cb) return;
//
//     int code = (int)acc_info.status;
//     const char *reason = "unknown";
//     char reason_buf[256];
//
//     if (info && info->cbparam && info->cbparam->reason.slen > 0) {
//         int len = (int)info->cbparam->reason.slen;
//         if (len > 255) len = 255;
//         memcpy(reason_buf, info->cbparam->reason.ptr, len);
//         reason_buf[len] = '\0';
//         reason = reason_buf;
//     }
//
//     phone->reg_cb(code, reason);
// }
//
// /* -------------------------------------------------------------- */
// /*  PJSUA callback: call state change                             */
// /* -------------------------------------------------------------- */
//
// static void cb_on_call_state2(pjsua_call_id call_id,
//                                pjsua_call_info *info,
//                                pjsip_event *e)
// {
//     if (!info) return;
//
//     pjsip_phone *phone = (pjsip_phone *)info->user_data;
//     if (!phone || !phone->call_cb) return;
//
//     char peer_buf[256] = {0};
//     if (info->remote_info.slen > 0) {
//         int len = (int)info->remote_info.slen;
//         if (len > 255) len = 255;
//         memcpy(peer_buf, info->remote_info.ptr, len);
//         peer_buf[len] = '\0';
//     }
//
//     char data_buf[512] = {0};
//
//     switch (info->state) {
//     case PJSIP_INV_STATE_CALLING:
//     case PJSIP_INV_STATE_EARLY:
//         phone->call_cb(0, peer_buf);  /* progress */
//         break;
//
//     case PJSIP_INV_STATE_CONNECTING:
//         phone->call_cb(1, NULL);  /* accepted */
//         break;
//
//     case PJSIP_INV_STATE_CONFIRMED:
//         phone->call_cb(2, NULL);  /* confirmed */
//         break;
//
//     case PJSIP_INV_STATE_DISCONNECTED:
//         phone->call_id = PJSUA_INVALID_ID;
//         if (info->last_status > 0 && info->last_status < 200) {
//             snprintf(data_buf, sizeof(data_buf), "%d:%.*s",
//                      (int)info->last_status,
//                      (int)info->last_status_text.slen,
//                      info->last_status_text.ptr);
//             phone->call_cb(4, data_buf);  /* failed */
//         } else if (info->last_status >= 200 && info->last_status < 300) {
//             if (info->last_status_text.slen > 0) {
//                 int len = (int)info->last_status_text.slen;
//                 if (len > 255) len = 255;
//                 memcpy(data_buf, info->last_status_text.ptr, len);
//                 data_buf[len] = '\0';
//             } else {
//                 snprintf(data_buf, sizeof(data_buf), "Normal call clearing");
//             }
//             phone->call_cb(3, data_buf);  /* hangup */
//         } else {
//             snprintf(data_buf, sizeof(data_buf), "%d:%.*s",
//                      (int)info->last_status,
//                      (int)info->last_status_text.slen,
//                      info->last_status_text.ptr);
//             phone->call_cb(4, data_buf);  /* failed */
//         }
//         break;
//
//     default:
//         break;
//     }
// }
//
// /* -------------------------------------------------------------- */
// /*  PJSUA callback: incoming call                                 */
// /* -------------------------------------------------------------- */
//
// static void cb_on_incoming_call(pjsua_acc_id acc_id,
//                                  pjsua_call_id call_id,
//                                  pjsip_rx_data *rdata)
// {
//     pjsua_call_info info;
//     if (pjsua_call_get_info(call_id, &info) != PJ_SUCCESS) return;
//
//     pjsip_phone *phone = (pjsip_phone *)info.user_data;
//     if (!phone) {
//         pjsua_acc_info acc_info;
//         if (pjsua_acc_get_info(acc_id, &acc_info) == PJ_SUCCESS)
//             phone = (pjsip_phone *)acc_info.user_data;
//     }
//     if (!phone || !phone->call_cb) return;
//
//     phone->call_id = call_id;
//
//     /* Extract caller URI from Contact header */
//     char caller_buf[256] = {0};
//     if (info.remote_contact.slen > 0) {
//         const char *start = info.remote_contact.ptr;
//         int len = (int)info.remote_contact.slen;
//
//         /* Try to find sip: URI inside angle brackets */
//         const char *sip = NULL;
//         int sip_len = 0;
//         for (int i = 0; i < len - 3; i++) {
//             if (start[i]=='s' && start[i+1]=='i' &&
//                 start[i+2]=='p' && start[i+3]==':') {
//                 sip = &start[i];
//                 for (int j = i; j < len; j++) {
//                     if (start[j] == '>' || start[j] == ';' || start[j] == ' ') {
//                         sip_len = j - i; break;
//                     }
//                     if (j == len - 1) { sip_len = len - i; break; }
//                 }
//                 break;
//             }
//         }
//         if (sip && sip_len > 0) {
//             if (sip_len > 255) sip_len = 255;
//             memcpy(caller_buf, sip, sip_len);
//             caller_buf[sip_len] = '\0';
//         } else {
//             if (len > 255) len = 255;
//             memcpy(caller_buf, start, len);
//             caller_buf[len] = '\0';
//         }
//     } else if (info.remote_info.slen > 0) {
//         int len = (int)info.remote_info.slen;
//         if (len > 255) len = 255;
//         memcpy(caller_buf, info.remote_info.ptr, len);
//         caller_buf[len] = '\0';
//     }
//
//     phone->call_cb(5, caller_buf);  /* incoming */
// }
import "C"

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
	"unsafe"
)

// globalPhone is the package-level reference used by CGo callbacks to route
// events back to the active PJSIPPhone instance. PJSUA supports only one
// endpoint per process, so a single global is appropriate.
var (
	globalPhone     *PJSIPPhone
	globalPhoneLock sync.Mutex
)

// ---------------------------------------------------------------------------
// CGo callback exports -- called from C on the PJSUA thread.
// They must be safe to call from any OS thread.
// ---------------------------------------------------------------------------

//export goRegCallback
func goRegCallback(statusCode C.int, reason *C.char) {
	globalPhoneLock.Lock()
	p := globalPhone
	globalPhoneLock.Unlock()

	if p == nil {
		return
	}

	code := int(statusCode)
	goReason := ""
	if reason != nil {
		goReason = C.GoString(reason)
	}

	log.Printf("[PJSIP] Registration callback: status=%d reason=%s", code, goReason)

	p.mu.Lock()
	defer p.mu.Unlock()

	switch {
	case code == 200:
		p.setRegStatusLocked(RegRegistered)
	case code == 0:
		p.setRegStatusLocked(RegFailed)
		if p.regCb.OnRegistrationFailed != nil {
			go p.regCb.OnRegistrationFailed(code, goReason)
		}
	default:
		if code >= 400 {
			p.setRegStatusLocked(RegFailed)
			if p.regCb.OnRegistrationFailed != nil {
				go p.regCb.OnRegistrationFailed(code, goReason)
			}
		} else {
			p.setRegStatusLocked(RegConnecting)
		}
	}
}

//export goCallCallback
func goCallCallback(eventType C.int, data *C.char) {
	globalPhoneLock.Lock()
	p := globalPhone
	globalPhoneLock.Unlock()

	if p == nil {
		return
	}

	goData := ""
	if data != nil {
		goData = C.GoString(data)
	}

	et := int(eventType)
	log.Printf("[PJSIP] Call callback: event=%d data=%s", et, goData)

	p.mu.Lock()
	defer p.mu.Unlock()

	switch et {
	case 0: // progress
		p.callState = CallRinging
		if p.callCb.OnProgress != nil {
			go p.callCb.OnProgress(goData)
		}

	case 1: // accepted (183/200 early)
		p.callState = CallRinging
		if p.callCb.OnAccepted != nil {
			go p.callCb.OnAccepted()
		}

	case 2: // confirmed (media established)
		p.callState = CallInProgress
		if p.callCb.OnConfirmed != nil {
			go p.callCb.OnConfirmed()
		}

	case 3: // hangup (normal disconnect)
		p.callState = CallIdle
		if p.callCb.OnHangup != nil {
			go p.callCb.OnHangup(goData)
		}

	case 4: // failed (error)
		p.callState = CallIdle
		code := 0
		reason := goData
		for i, c := range goData {
			if c == ':' {
				fmt.Sscanf(goData[:i], "%d", &code)
				reason = goData[i+1:]
				break
			}
		}
		if p.callCb.OnFailed != nil {
			go p.callCb.OnFailed(code, reason)
		}

	case 5: // incoming call
		p.callState = CallRinging
		if p.callCb.OnIncomingCall != nil {
			go p.callCb.OnIncomingCall(goData)
		}
	}
}

// ---------------------------------------------------------------------------
// PJSIPPhone -- real PJSIP implementation via CGo
// ---------------------------------------------------------------------------

// PJSIPPhone implements the Phone interface using the PJSUA C library.
type PJSIPPhone struct {
	mu             sync.RWMutex
	params         Params
	regStatus      RegStatus
	callState      CallState
	callCb         CallCallbacks
	regCb          RegCallbacks
	handle         *C.struct_pjsip_phone
	maxReconnect   int
	reconnectCount int
	initVersion    int
}

// NewPJSIPPhone creates a new PJSIP phone instance backed by a real PJSUA handle.
func NewPJSIPPhone() *PJSIPPhone {
	handle := C.pjsip_phone_create()
	return &PJSIPPhone{
		handle:       handle,
		regStatus:    RegUnregistered,
		callState:    CallIdle,
		maxReconnect: 5,
	}
}

func (p *PJSIPPhone) Init(params Params) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.params = params
	p.initVersion++

	log.Printf("[PJSIP] Initializing with domain=%s port=%s protocol=%s user=%s",
		params.Domain, params.Port, params.Protocol, params.Username)

	// If already initialised from a previous Init() call, tear down first.
	if p.handle != nil {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil
	}

	p.handle = C.pjsip_phone_create()
	if p.handle == nil {
		return fmt.Errorf("pjsip_phone_create failed: out of memory")
	}

	// Register as the global phone so CGo callbacks can find us.
	globalPhoneLock.Lock()
	globalPhone = p
	globalPhoneLock.Unlock()

	// Install CGo callback bridges.
	C.pjsip_phone_set_reg_callback(p.handle, nil)
	C.pjsip_phone_set_call_callback(p.handle, nil)
	// The actual Go callback functions are called from the C callbacks via
	// the extern goRegCallback / goCallCallback declarations.  We pass nil
	// here because the C callbacks call goRegCallback / goCallCallback
	// directly (declared extern in the preamble).

	// Parse port (default 5060).
	port := 5060
	if params.Port != "" {
		if _, err := fmt.Sscanf(params.Port, "%d", &port); err != nil || port <= 0 {
			port = 5060
		}
	}

	cDomain := C.CString(params.Domain)
	defer C.free(unsafe.Pointer(cDomain))
	cProtocol := C.CString(params.Protocol)
	defer C.free(unsafe.Pointer(cProtocol))
	cUsername := C.CString(params.Username)
	defer C.free(unsafe.Pointer(cUsername))
	cPassword := C.CString(params.Password)
	defer C.free(unsafe.Pointer(cPassword))

	status := C.pjsip_phone_init(p.handle, cDomain, C.int(port),
		cProtocol, cUsername, cPassword)
	if status != 0 {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil

		globalPhoneLock.Lock()
		globalPhone = nil
		globalPhoneLock.Unlock()

		return fmt.Errorf("pjsip_phone_init failed with code %d", int(status))
	}

	p.setRegStatusLocked(RegConnected)
	return nil
}

func (p *PJSIPPhone) Register() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.regStatus == RegRegistered {
		return nil
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	p.setRegStatusLocked(RegConnecting)
	log.Printf("[PJSIP] Registering %s@%s", p.params.Username, p.params.Domain)

	status := C.pjsip_phone_register(p.handle)
	if status != 0 {
		p.setRegStatusLocked(RegFailed)
		return fmt.Errorf("pjsip_phone_register failed: code %d", int(status))
	}

	// Registration result arrives asynchronously via goRegCallback.
	return nil
}

func (p *PJSIPPhone) Call(phoneNumber string, extraHeaders map[string]string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallIdle {
		return fmt.Errorf("already in call")
	}

	if p.regStatus != RegRegistered {
		return fmt.Errorf("not registered")
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Calling %s", phoneNumber)

	cNumber := C.CString(phoneNumber)
	defer C.free(unsafe.Pointer(cNumber))

	var cHeaders *C.char
	if len(extraHeaders) > 0 {
		headersJSON, err := json.Marshal(extraHeaders)
		if err != nil {
			return fmt.Errorf("failed to marshal extra headers: %w", err)
		}
		cHeaders = C.CString(string(headersJSON))
		defer C.free(unsafe.Pointer(cHeaders))
	}

	status := C.pjsip_phone_call(p.handle, cNumber, cHeaders)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_call failed: code %d", int(status))
	}

	p.callState = CallRinging
	return nil
}

func (p *PJSIPPhone) Answer() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallRinging {
		return fmt.Errorf("no incoming call to answer")
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Answering call")

	status := C.pjsip_phone_answer(p.handle)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_answer failed: code %d", int(status))
	}

	p.callState = CallInProgress
	return nil
}

func (p *PJSIPPhone) Hangup(reason string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState == CallIdle {
		return nil
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Hanging up: %s", reason)

	var cReason *C.char
	if reason != "" {
		cReason = C.CString(reason)
		defer C.free(unsafe.Pointer(cReason))
	}

	cHangupHeader := C.CString(reason)
	defer C.free(unsafe.Pointer(cHangupHeader))

	status := C.pjsip_phone_hangup(p.handle, cReason, cHangupHeader)
	p.callState = CallIdle

	if status != 0 {
		return fmt.Errorf("pjsip_phone_hangup failed: code %d", int(status))
	}
	return nil
}

func (p *PJSIPPhone) SendDTMF(digit string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.callState != CallInProgress {
		return fmt.Errorf("not in call")
	}

	if p.handle == nil {
		return fmt.Errorf("not initialized")
	}

	log.Printf("[PJSIP] Sending DTMF: %s", digit)

	cDigits := C.CString(digit)
	defer C.free(unsafe.Pointer(cDigits))

	status := C.pjsip_phone_send_dtmf(p.handle, cDigits)
	if status != 0 {
		return fmt.Errorf("pjsip_phone_send_dtmf failed: code %d", int(status))
	}
	return nil
}

func (p *PJSIPPhone) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	log.Printf("[PJSIP] Stopping")

	if p.handle != nil {
		C.pjsip_phone_destroy(p.handle)
		p.handle = nil
	}

	globalPhoneLock.Lock()
	globalPhone = nil
	globalPhoneLock.Unlock()

	p.callState = CallIdle
	p.regStatus = RegUnregistered
	return nil
}

func (p *PJSIPPhone) GetRegStatus() RegStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.regStatus
}

func (p *PJSIPPhone) GetCallState() CallState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.callState
}

func (p *PJSIPPhone) SetCallCallbacks(cb CallCallbacks) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.callCb = cb
}

func (p *PJSIPPhone) SetRegCallbacks(cb RegCallbacks) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.regCb = cb
}

// setRegStatusLocked updates registration status and fires the corresponding
// callback. Must be called with p.mu already held.
func (p *PJSIPPhone) setRegStatusLocked(s RegStatus) {
	p.regStatus = s
	switch s {
	case RegConnecting:
		if p.regCb.OnConnecting != nil {
			go p.regCb.OnConnecting()
		}
	case RegConnected:
		if p.regCb.OnConnected != nil {
			go p.regCb.OnConnected()
		}
	case RegRegistered:
		if p.regCb.OnRegistered != nil {
			go p.regCb.OnRegistered()
		}
	case RegUnregistered:
		if p.regCb.OnUnregistered != nil {
			go p.regCb.OnUnregistered()
		}
	case RegFailed:
		if p.regCb.OnRegistrationFailed != nil {
			go p.regCb.OnRegistrationFailed(0, "registration failed")
		}
	}
}

// ---------------------------------------------------------------------------
// Auto-reconnect
// ---------------------------------------------------------------------------

// StartAutoReconnect monitors registration status and reconnects automatically.
func (p *PJSIPPhone) StartAutoReconnect(stopCh <-chan struct{}) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			p.mu.RLock()
			status := p.regStatus
			p.mu.RUnlock()

			if status == RegUnregistered || status == RegFailed {
				if p.reconnectCount < p.maxReconnect {
					p.reconnectCount++
					log.Printf("[PJSIP] Auto-reconnect attempt %d/%d",
						p.reconnectCount, p.maxReconnect)
					if err := p.Register(); err != nil {
						log.Printf("[PJSIP] Auto-reconnect failed: %v", err)
					}
				}
			}
		}
	}
}
