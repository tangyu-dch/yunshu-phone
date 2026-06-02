#include <pjsua-lib/pjsua.h>
#include <pj/log.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "pjsip_bridge.h"

/* Exported Go callbacks */
extern void goRegCallback(int statusCode, const char *reason);
extern void goCallCallback(int eventType, const char *data);

/* PJSUA log writer callback */
static void cb_on_log_write(int level, const char *data, int len) {
    if (data && len > 0) {
        fprintf(stderr, "[PJSUA] %.*s", len, data);
        fflush(stderr);
    }
}

static int pjsip_created = 0;
static __thread pj_thread_desc thread_desc;
static __thread pj_thread_t *thread_ptr = NULL;

static void register_thread_if_needed(void) {
    if (pjsip_created && !pj_thread_is_registered()) {
        pj_thread_register("go_thread", thread_desc, &thread_ptr);
    }
}

/* -------------------------------------------------------------- */
/*  Opaque struct behind the pjsip_phone handle                   */
/* -------------------------------------------------------------- */

struct pjsip_phone {
    pjsua_acc_id    acc_id;
    pjsua_call_id   call_id;
    int             initialized;

    void (*reg_cb)(int status_code, const char* reason);
    void (*call_cb)(int event_type, const char* data);

    char domain[256];
    char username[128];
    int             port;
};

/* -------------------------------------------------------------- */
/*  Forward declarations for PJSUA callbacks                      */
/* -------------------------------------------------------------- */

static void cb_on_reg_state2(pjsua_acc_id acc_id, pjsua_reg_info *info);
static void cb_on_call_state(pjsua_call_id call_id, pjsip_event *e);
static void cb_on_incoming_call(pjsua_acc_id acc_id, pjsua_call_id call_id,
                                 pjsip_rx_data *rdata);

/* -------------------------------------------------------------- */
/*  Lifecycle                                                     */
/* -------------------------------------------------------------- */

pjsip_phone* pjsip_phone_create(void) {
    pjsip_phone *phone = (pjsip_phone *)calloc(1, sizeof(pjsip_phone));
    if (!phone) return NULL;
    phone->acc_id  = PJSUA_INVALID_ID;
    phone->call_id = PJSUA_INVALID_ID;
    return phone;
}

int pjsip_phone_init(pjsip_phone *phone,
                     const char *domain, int port,
                     const char *protocol,
                     const char *username,
                     const char *password,
                     const char *proxy)
{
    if (!phone || !domain || !protocol || !username || !password)
        return -1;

    pj_status_t status;

    snprintf(phone->domain,   sizeof(phone->domain),   "%s", domain);
    snprintf(phone->username,  sizeof(phone->username),  "%s", username);
    phone->port = port;

    /* Create PJSUA endpoint */
    status = pjsua_create();
    if (status != PJ_SUCCESS) return -2;
    pjsip_created = 1;

    /* Endpoint configuration with our callbacks */
    pjsua_config cfg;
    pjsua_config_default(&cfg);
    cfg.cb.on_reg_state2    = &cb_on_reg_state2;
    cfg.cb.on_call_state    = &cb_on_call_state;
    cfg.cb.on_incoming_call = &cb_on_incoming_call;

    pjsua_logging_config log_cfg;
    pjsua_logging_config_default(&log_cfg);
    log_cfg.level = 4;
    log_cfg.cb = &cb_on_log_write;

    pjsua_media_config media_cfg;
    pjsua_media_config_default(&media_cfg);

    pjsua_transport_config tp_cfg;
    pjsua_transport_config_default(&tp_cfg);
    tp_cfg.port = 0;

    int is_local = (strstr(domain, ".local") != NULL ||
                    strcmp(domain, "localhost") == 0 ||
                    strcmp(domain, "127.0.0.1") == 0);
    if (is_local) {
        tp_cfg.bound_addr = pj_str("127.0.0.1");
    }

    pjsip_transport_type_e tp_type;
    if (strcasecmp(protocol, "tcp") == 0) {
        tp_type = PJSIP_TRANSPORT_TCP;
    } else {
        tp_type = PJSIP_TRANSPORT_UDP;
    }

    status = pjsua_init(&cfg, &log_cfg, &media_cfg);
    if (status != PJ_SUCCESS) { pjsua_destroy(); return -3; }

    pjsua_transport_id tp_id;
    status = pjsua_transport_create(tp_type, &tp_cfg, &tp_id);
    if (status != PJ_SUCCESS) { pjsua_destroy(); return -4; }

    status = pjsua_start();
    if (status != PJ_SUCCESS) { pjsua_destroy(); return -5; }

    /* Account configuration: sip:username@domain:port */
    pjsua_acc_config acc_cfg;
    pjsua_acc_config_default(&acc_cfg);

    char uri[512];
    snprintf(uri, sizeof(uri), "sip:%s@%s:%d", username, domain, port);
    acc_cfg.id = pj_str(uri);

    char reg_uri[512];
    snprintf(reg_uri, sizeof(reg_uri), "sip:%s:%d", domain, port);
    acc_cfg.reg_uri = pj_str(reg_uri);

    // Bypass DNS for local domains by routing through outbound proxy
    if (is_local) {
        acc_cfg.proxy_cnt = 1;
        acc_cfg.proxy[0] = pj_str("sip:127.0.0.1:5060;transport=udp;lr");
        acc_cfg.allow_contact_rewrite = PJ_FALSE;
        acc_cfg.allow_via_rewrite = PJ_FALSE;
        acc_cfg.rtp_cfg.bound_addr = pj_str("127.0.0.1");
    }

    acc_cfg.cred_count = 2;
    
    // 优先尝试 ha1b 格式 (username@domain)，适配后端多租户认证
    char auth_username[256];
    snprintf(auth_username, sizeof(auth_username), "%s@%s", username, domain);
    acc_cfg.cred_info[0].scheme    = pj_str("digest");
    acc_cfg.cred_info[0].realm     = pj_str("*");
    acc_cfg.cred_info[0].username  = pj_str(auth_username);
    acc_cfg.cred_info[0].data_type = PJSIP_CRED_DATA_PLAIN_PASSWD;
    acc_cfg.cred_info[0].data      = pj_str((char *)password);
    
    // 兼容原有的 ha1 格式 (username)，防止服务端不支持 ha1b
    acc_cfg.cred_info[1].scheme    = pj_str("digest");
    acc_cfg.cred_info[1].realm     = pj_str("*");
    acc_cfg.cred_info[1].username  = pj_str((char *)username);
    acc_cfg.cred_info[1].data_type = PJSIP_CRED_DATA_PLAIN_PASSWD;
    acc_cfg.cred_info[1].data      = pj_str((char *)password);
    // acc_cfg.transport_id = tp_id;
    acc_cfg.user_data = phone;

    if (proxy && strlen(proxy) > 0) {
        acc_cfg.proxy_cnt = 1;
        char proxy_uri[512];
        snprintf(proxy_uri, sizeof(proxy_uri), "sip:%s:%d;transport=%s;lr", proxy, port, protocol);
        acc_cfg.proxy[0] = pj_str(proxy_uri);
    }

    status = pjsua_acc_add(&acc_cfg, PJ_TRUE, &phone->acc_id);
    if (status != PJ_SUCCESS) { pjsua_destroy(); return -6; }

    phone->initialized = 1;
    return 0;
}

int pjsip_phone_register(pjsip_phone *phone) {
    register_thread_if_needed();
    if (!phone || phone->acc_id == PJSUA_INVALID_ID) return -1;
    return (int)pjsua_acc_set_registration(phone->acc_id, PJ_TRUE);
}

int pjsip_phone_call(pjsip_phone *phone,
                     const char *number,
                     const char *extra_headers_json)
{
    register_thread_if_needed();
    if (!phone || !number || phone->acc_id == PJSUA_INVALID_ID) return -1;

    char uri_buf[512];
    int is_local = (strstr(phone->domain, ".local") != NULL ||
                    strcmp(phone->domain, "localhost") == 0 ||
                    strcmp(phone->domain, "127.0.0.1") == 0);
    if (is_local) {
        snprintf(uri_buf, sizeof(uri_buf), "sip:%s@127.0.0.1:%d", number, phone->port);
    } else {
        snprintf(uri_buf, sizeof(uri_buf), "sip:%s@%s:%d", number, phone->domain, phone->port);
    }
    pj_str_t uri = pj_str(uri_buf);

    pjsua_msg_data msg_data;
    pjsua_msg_data_init(&msg_data);

    pj_pool_t *pool = pjsua_pool_create("call_hdr", 1024, 1024);
    if (!pool) return -2;

    /* Parse simple JSON {"key":"value",...} into SIP headers */
    if (extra_headers_json && strlen(extra_headers_json) > 2) {
        const char *p = extra_headers_json;
        while (*p && (*p == ' ' || *p == '\t' || *p == '{')) p++;
        while (*p && *p != '}') {
            while (*p && (*p == ' ' || *p == '\t' || *p == ',')) p++;
            if (*p != '"') break;
            p++;
            char key[256]; int ki = 0;
            while (*p && *p != '"' && ki < 255) { key[ki++] = *p++; }
            key[ki] = '\0';
            if (*p == '"') p++;
            while (*p && (*p == ':' || *p == ' ' || *p == '\t')) p++;
            if (*p == '"') p++;
            char val[512]; int vi = 0;
            while (*p && *p != '"' && vi < 511) { val[vi++] = *p++; }
            val[vi] = '\0';
            if (*p == '"') p++;
            if (ki > 0 && vi > 0) {
                pj_str_t k = pj_str(key);
                pj_str_t v = pj_str(val);
                pjsip_generic_string_hdr *hdr =
                    pjsip_generic_string_hdr_create(pool, &k, &v);
                if (hdr) pj_list_push_back(&msg_data.hdr_list, hdr);
            }
        }
    }

    pjsua_call_id call_id;
    pj_status_t st = pjsua_call_make_call(phone->acc_id, &uri,
                                           NULL, phone, &msg_data, &call_id);
    if (st == PJ_SUCCESS) phone->call_id = call_id;
    pj_pool_release(pool);
    return (int)st;
}

int pjsip_phone_answer(pjsip_phone *phone) {
    register_thread_if_needed();
    if (!phone || phone->call_id == PJSUA_INVALID_ID) return -1;
    return (int)pjsua_call_answer(phone->call_id, 200, NULL, NULL);
}

int pjsip_phone_hangup(pjsip_phone *phone,
                       const char *reason,
                       const char *hangup_header)
{
    register_thread_if_needed();
    if (!phone || phone->call_id == PJSUA_INVALID_ID) return -1;

    pjsua_msg_data msg_data;
    pjsua_msg_data_init(&msg_data);

    pj_pool_t *pool = pjsua_pool_create("hangup_hdr", 512, 512);
    if (!pool) return -2;

    if (hangup_header && strlen(hangup_header) > 0) {
        pj_str_t name_str = pj_str("X-Dolphoin-Custom-Hangup");
        pj_str_t val_str = pj_str((char *)hangup_header);
        pjsip_generic_string_hdr *hdr =
            pjsip_generic_string_hdr_create(pool, &name_str, &val_str);
        if (hdr) pj_list_push_back(&msg_data.hdr_list, hdr);
    }

    pj_str_t reason_str = reason
        ? pj_str((char *)reason)
        : pj_str("Normal call clearing");
    pj_status_t st = pjsua_call_hangup(phone->call_id, 200,
                                        &reason_str, &msg_data);
    phone->call_id = PJSUA_INVALID_ID;
    pj_pool_release(pool);
    return (int)st;
}

int pjsip_phone_send_dtmf(pjsip_phone *phone, const char *digits) {
    register_thread_if_needed();
    if (!phone || !digits || phone->call_id == PJSUA_INVALID_ID) return -1;
    pj_str_t d = pj_str((char *)digits);
    return (int)pjsua_call_dial_dtmf(phone->call_id, &d);
}

void pjsip_phone_destroy(pjsip_phone *phone) {
    if (!phone) return;
    register_thread_if_needed();
    if (phone->initialized) {
        pjsip_created = 0;
        pjsua_call_hangup_all();
        pjsua_destroy();
        phone->initialized = 0;
    }
    phone->acc_id  = PJSUA_INVALID_ID;
    phone->call_id = PJSUA_INVALID_ID;
    free(phone);
}

/* -------------------------------------------------------------- */
/*  Status queries                                                */
/* -------------------------------------------------------------- */

int pjsip_phone_get_reg_status(pjsip_phone *phone) {
    register_thread_if_needed();
    if (!phone || phone->acc_id == PJSUA_INVALID_ID) return -1;
    pjsua_acc_info info;
    if (pjsua_acc_get_info(phone->acc_id, &info) != PJ_SUCCESS) return -1;
    return (int)info.status;
}

int pjsip_phone_get_call_state(pjsip_phone *phone) {
    register_thread_if_needed();
    if (!phone || phone->call_id == PJSUA_INVALID_ID) return 0;
    pjsua_call_info info;
    if (pjsua_call_get_info(phone->call_id, &info) != PJ_SUCCESS) return 0;
    return (int)info.state;
}

/* -------------------------------------------------------------- */
/*  Callback setters                                              */
/* -------------------------------------------------------------- */

void pjsip_phone_set_reg_callback(pjsip_phone *phone,
                                  void (*cb)(int, const char*)) {
    if (phone) phone->reg_cb = cb;
}

void pjsip_phone_set_call_callback(pjsip_phone *phone,
                                   void (*cb)(int, const char*)) {
    if (phone) phone->call_cb = cb;
}

/* -------------------------------------------------------------- */
/*  PJSUA callback: registration state change                     */
/* -------------------------------------------------------------- */

static void cb_on_reg_state2(pjsua_acc_id acc_id, pjsua_reg_info *info) {
    pjsua_acc_info acc_info;
    if (pjsua_acc_get_info(acc_id, &acc_info) != PJ_SUCCESS) return;

    pjsip_phone *phone = (pjsip_phone *)pjsua_acc_get_user_data(acc_id);
    if (!phone) return;

    int code = (int)acc_info.status;
    const char *reason = "unknown";
    char reason_buf[256];

    if (info && info->cbparam && info->cbparam->reason.slen > 0) {
        int len = (int)info->cbparam->reason.slen;
        if (len > 255) len = 255;
        memcpy(reason_buf, info->cbparam->reason.ptr, len);
        reason_buf[len] = '\0';
        reason = reason_buf;
    }

    goRegCallback(code, reason);
}

/* -------------------------------------------------------------- */
/*  PJSUA callback: call state change                             */
/* -------------------------------------------------------------- */

static void cb_on_call_state(pjsua_call_id call_id, pjsip_event *e) {
    pjsua_call_info info;
    if (pjsua_call_get_info(call_id, &info) != PJ_SUCCESS) return;

    pjsip_phone *phone = (pjsip_phone *)pjsua_call_get_user_data(call_id);
    if (!phone) return;

    char peer_buf[256] = {0};
    if (info.remote_info.slen > 0) {
        int len = (int)info.remote_info.slen;
        if (len > 255) len = 255;
        memcpy(peer_buf, info.remote_info.ptr, len);
        peer_buf[len] = '\0';
    }

    char data_buf[512] = {0};

    switch (info.state) {
    case PJSIP_INV_STATE_CALLING:
    case PJSIP_INV_STATE_EARLY:
        goCallCallback(0, peer_buf);  /* progress */
        break;

    case PJSIP_INV_STATE_CONNECTING:
        goCallCallback(1, NULL);  /* accepted */
        break;

    case PJSIP_INV_STATE_CONFIRMED:
        goCallCallback(2, NULL);  /* confirmed */
        break;

    case PJSIP_INV_STATE_DISCONNECTED:
        phone->call_id = PJSUA_INVALID_ID;
        if (info.last_status > 0 && info.last_status < 200) {
            snprintf(data_buf, sizeof(data_buf), "%d:%.*s",
                     (int)info.last_status,
                     (int)info.last_status_text.slen,
                     info.last_status_text.ptr);
            goCallCallback(4, data_buf);  /* failed */
        } else if (info.last_status >= 200 && info.last_status < 300) {
            if (info.last_status_text.slen > 0) {
                int len = (int)info.last_status_text.slen;
                if (len > 255) len = 255;
                memcpy(data_buf, info.last_status_text.ptr, len);
                data_buf[len] = '\0';
            } else {
                snprintf(data_buf, sizeof(data_buf), "Normal call clearing");
            }
            goCallCallback(3, data_buf);  /* hangup */
        } else {
            snprintf(data_buf, sizeof(data_buf), "%d:%.*s",
                     (int)info.last_status,
                     (int)info.last_status_text.slen,
                     info.last_status_text.ptr);
            goCallCallback(4, data_buf);  /* failed */
        }
        break;

    default:
        break;
    }
}

/* -------------------------------------------------------------- */
/*  PJSUA callback: incoming call                                 */
/* -------------------------------------------------------------- */

static void cb_on_incoming_call(pjsua_acc_id acc_id,
                                 pjsua_call_id call_id,
                                 pjsip_rx_data *rdata)
{
    pjsua_call_info info;
    if (pjsua_call_get_info(call_id, &info) != PJ_SUCCESS) return;

    pjsip_phone *phone = (pjsip_phone *)pjsua_acc_get_user_data(acc_id);
    if (!phone) return;

    phone->call_id = call_id;
    pjsua_call_set_user_data(call_id, phone);

    /* Extract caller URI from Contact header */
    char caller_buf[256] = {0};
    if (info.remote_contact.slen > 0) {
        const char *start = info.remote_contact.ptr;
        int len = (int)info.remote_contact.slen;

        /* Try to find sip: URI inside angle brackets */
        const char *sip = NULL;
        int sip_len = 0;
        for (int i = 0; i < len - 3; i++) {
            if (start[i]=='s' && start[i+1]=='i' &&
                start[i+2]=='p' && start[i+3]==':') {
                sip = &start[i];
                for (int j = i; j < len; j++) {
                    if (start[j] == '>' || start[j] == ';' || start[j] == ' ') {
                        sip_len = j - i; break;
                    }
                    if (j == len - 1) { sip_len = len - i; break; }
                }
                break;
            }
        }
        if (sip && sip_len > 0) {
            if (sip_len > 255) sip_len = 255;
            memcpy(caller_buf, sip, sip_len);
            caller_buf[sip_len] = '\0';
        } else {
            if (len > 255) len = 255;
            memcpy(caller_buf, start, len);
            caller_buf[len] = '\0';
        }
    } else if (info.remote_info.slen > 0) {
        int len = (int)info.remote_info.slen;
        if (len > 255) len = 255;
        memcpy(caller_buf, info.remote_info.ptr, len);
        caller_buf[len] = '\0';
    }

    goCallCallback(5, caller_buf);  /* incoming */
}
