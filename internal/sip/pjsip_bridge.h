#ifndef PJSIP_BRIDGE_H
#define PJSIP_BRIDGE_H

/* Opaque handle type wrapping the PJSUA endpoint + account */
typedef struct pjsip_phone pjsip_phone;

/* --- Lifecycle --- */

pjsip_phone* pjsip_phone_create(void);

/*
 * Initialise the PJSUA endpoint, add transport and account.
 * domain   – SIP registrar domain (e.g. "sip.example.com")
 * port     – registrar port (e.g. 5060)
 * protocol – "udp" or "tcp"
 * username – SIP auth username
 * password – SIP auth password
 * Returns 0 on success, non-zero on error.
 */
int pjsip_phone_init(pjsip_phone* phone,
                     const char* domain, int port,
                     const char* protocol,
                     const char* username,
                     const char* password);

/*
 * Trigger (re-)registration on the default account.
 * Returns 0 on success.
 */
int pjsip_phone_register(pjsip_phone* phone);

/*
 * Place an outgoing call.
 * number           – phone number / extension (will become sip:number@domain)
 * extra_headers_json – JSON object string, e.g. {"X-Foo":"bar"} (may be NULL)
 * Returns 0 on success; sets phone->call_id on success.
 */
int pjsip_phone_call(pjsip_phone* phone,
                     const char* number,
                     const char* extra_headers_json);

/*
 * Answer the current incoming call with 200 OK.
 * Returns 0 on success.
 */
int pjsip_phone_answer(pjsip_phone* phone);

/*
 * Hang up the current call.
 * reason        – human-readable reason for the SIP Reason header (may be NULL)
 * hangup_header – value for the X-Dolphoin-Custom-Hangup header (may be NULL)
 * Returns 0 on success.
 */
int pjsip_phone_hangup(pjsip_phone* phone,
                       const char* reason,
                       const char* hangup_header);

/*
 * Send DTMF digits on the current call (RFC 2833).
 * Returns 0 on success.
 */
int pjsip_phone_send_dtmf(pjsip_phone* phone, const char* digits);

/*
 * Tear down: hang up all calls and destroy the PJSUA endpoint.
 * Safe to call multiple times or on a NULL handle.
 */
void pjsip_phone_destroy(pjsip_phone* phone);

/* --- Status queries --- */

/* Returns the last known registration SIP status code (200 = registered). */
int pjsip_phone_get_reg_status(pjsip_phone* phone);

/* Returns the PJSIP call state enum for the current call. */
int pjsip_phone_get_call_state(pjsip_phone* phone);

/* --- Callbacks (function pointers set from Go) --- */

/*
 * Registration status callback.
 * status_code – SIP status code (200 = OK, 403 = forbidden, etc.)
 * reason      – human-readable reason phrase
 */
typedef void (*reg_callback_t)(int status_code, const char* reason);

/*
 * Call event callback.
 * event_type:
 *   0 = progress   (data = peer URI / display number)
 *   1 = accepted   (data unused)
 *   2 = confirmed  (data unused)
 *   3 = hangup     (data = reason / cause text)
 *   4 = failed     (data = "code:reason")
 *   5 = incoming   (data = caller URI)
 */
typedef void (*call_callback_t)(int event_type, const char* data);

void pjsip_phone_set_reg_callback(pjsip_phone* phone, reg_callback_t cb);
void pjsip_phone_set_call_callback(pjsip_phone* phone, call_callback_t cb);

#endif /* PJSIP_BRIDGE_H */
