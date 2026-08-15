package com.homelifesync.elder;

/**
 * App-wide constants.
 *
 * CARETAKER_NUMBER is only used as the SMS fallback.
 * Firebase is the primary command channel — no number needed.
 */
public final class Constants {

    private Constants() {}

    // ── SMS fallback ──────────────────────────────────────────────────
    /** Caretaker's phone number for SMS fallback (E.164 or local format).
     *  Leave "" to accept SMS from any number (less secure). */
    public static final String CARETAKER_NUMBER = "";   // ← optional

    // ── Firebase Realtime DB paths ────────────────────────────────────
    /** Root node: /devices/{DEVICE_ID}/ */
    public static final String DB_ROOT      = "devices";
    public static final String DB_COMMANDS  = "commands";   // incoming commands
    public static final String DB_STATUS    = "status";     // outgoing status/replies
    public static final String DB_FCM_TOKEN = "fcmToken";   // stored so caretaker can push

    // ── Notification ─────────────────────────────────────────────────
    public static final String CHANNEL_ID = "elder_helper_channel";
    public static final int    NOTIF_ID   = 1001;

    // ── SharedPreferences ─────────────────────────────────────────────
    public static final String PREFS_NAME          = "ElderHelperPrefs";
    public static final String PREF_CARETAKER_NUM  = "caretaker_number";
    public static final String PREF_SERVICE_ACTIVE = "service_active";
    public static final String PREF_DEVICE_ID      = "device_id";
    public static final String PREF_ONBOARDED      = "onboarded";

    // ── Intent extras ─────────────────────────────────────────────────
    public static final String EXTRA_SMS_SENDER = "sms_sender";
    public static final String EXTRA_SMS_BODY   = "sms_body";

    // ── Reply prefix ──────────────────────────────────────────────────
    public static final String REPLY_PREFIX = "[HS] ";
}
