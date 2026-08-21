package com.homelifesync.elder;

import android.Manifest;

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
     *  The first-run wizard collects it as a REQUIRED field; this constant is
     *  only used as a fallback when setup was somehow bypassed. */
    public static final String CARETAKER_NUMBER = "";   // collected at setup

    // ── Firebase Realtime DB paths ────────────────────────────────────
    /** Root node: /devices/{DEVICE_ID}/ */
    public static final String DB_ROOT      = "devices";
    public static final String DB_COMMANDS  = "commands";   // incoming commands
    public static final String DB_STATUS    = "status";     // outgoing status/replies
    public static final String DB_PAIRING   = "pairingCode"; // rotating 4-digit pairing proof

    // ── Pairing code ──────────────────────────────────────────────────
    /** Temporary 4-digit code the tablet pairs with (device ID + code). */
    public static final long   PAIRING_TTL_MS  = 5 * 60_000L;

    // ── Notification ─────────────────────────────────────────────────
    public static final String CHANNEL_ID = "elder_helper_channel";
    public static final int    NOTIF_ID   = 1001;

    // ── SharedPreferences ─────────────────────────────────────────────
    public static final String PREFS_NAME          = "ElderHelperPrefs";
    public static final String PREF_CARETAKER_NUM  = "caretaker_number";
    public static final String PREF_SERVICE_ACTIVE = "service_active";
    public static final String PREF_DEVICE_ID      = "device_id";
    public static final String PREF_ONBOARDED      = "onboarded";
    public static final String PREF_TORCH          = "torch_state";
    public static final String PREF_PAIRING_CODE   = "pairing_code";

    // ── Intent extras ─────────────────────────────────────────────────
    public static final String EXTRA_SMS_SENDER = "sms_sender";
    public static final String EXTRA_SMS_BODY   = "sms_body";

    // ── Reply prefix ──────────────────────────────────────────────────
    public static final String REPLY_PREFIX = "[HS] ";

    // ── Permissions ────────────────────────────────────────────────────
    /** All permissions required by the app. */
    public static final String[] REQUIRED_PERMISSIONS = {
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.SEND_SMS,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.VIBRATE,
        Manifest.permission.MODIFY_AUDIO_SETTINGS,
        Manifest.permission.CALL_PHONE,
    };
}
