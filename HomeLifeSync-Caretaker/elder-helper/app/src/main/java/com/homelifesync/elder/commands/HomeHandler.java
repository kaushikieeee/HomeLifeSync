package com.homelifesync.elder.commands;

import android.content.Context;
import android.hardware.ConsumerIrManager;
import android.text.TextUtils;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.PrefsHelper;

/**
 * Home-automation group — "IoT-ready".
 *
 * The elder phone has no bridge to real bulbs/locks/AC, so each command:
 *   1. updates a persisted virtual state (so status queries stay truthful and
 *      survive restarts), and
 *   2. notes honestly that the hardware action awaits a hub/Smart-Meter bridge.
 *
 * ACLINK additionally relays an IR burst through the device's IR blaster when
 * the caretaker supplies a code pattern and the phone has an emitter.
 */
public class HomeHandler {

    private static final String KEY_STATE = "iot_state"; // "living:on;bed:off;fan:on;door:locked"

    private final Context        context;
    private final PrefsHelper    prefs;

    public HomeHandler(Context ctx) {
        context = ctx;
        prefs   = new PrefsHelper(ctx);
    }

    public void light(ReplyCallback cb, String room, boolean on) {
        setDevice(room, on ? "1" : "0");
        cb.reply("💡 " + room + " light " + (on ? "ON" : "OFF")
            + " (virtual)\nWire the phone to a smart relay/switch to control the real bulb.");
    }

    public void fan(ReplyCallback cb, boolean on) {
        setDevice("fan", on ? "1" : "0");
        cb.reply("🌀 Fan " + (on ? "ON" : "OFF")
            + " (virtual)\nConnect a Smart Plug for real control.");
    }

    public void door(ReplyCallback cb, boolean lock) {
        setDevice("door", lock ? "locked" : "unlocked");
        cb.reply((lock ? "🔒 Door LOCKED" : "🔓 Door UNLOCKED")
            + " (virtual)\nEnable the smart-lock integration to act on a real lock.");
    }

    /** ACSTAT — current virtual AC state. */
    public void acState(ReplyCallback cb) {
        ConsumerIrManager ir =
            (ConsumerIrManager) context.getSystemService(Context.CONSUMER_IR_SERVICE);
        cb.reply("❄️ AC: "
            + deviceState("ac", "off")
            + "\nIR blaster: " + (ir != null && ir.hasIrEmitter() ? "present ✅" : "none on this device")
            + "\nSend the AC's HEX/Samsung36 pattern to ACLINK to relay it.");
    }

    /** ACLINK — relay an IR code through the device's emitter (if any). */
    public void acLink(ReplyCallback cb, String hexPattern, int frequencyHz) {
        ConsumerIrManager ir =
            (ConsumerIrManager) context.getSystemService(Context.CONSUMER_IR_SERVICE);
        if (ir == null || !ir.hasIrEmitter()) {
            cb.reply("❌ No IR emitter on this device — can't relay AC codes.");
            return;
        }
        if (TextUtils.isEmpty(hexPattern)) {
            cb.reply("⚠️ ACLINK needs a code, e.g. ACLINK 0000000FF00F 38000\n"
                + "(You can capture it with any IR-reader app.)");
            return;
        }
        try {
            int[] pattern = parseHex(hexPattern);
            ir.transmit(frequencyHz > 0 ? frequencyHz : 38000, pattern);
            setDevice("ac", "irlink");
            cb.reply("📡 IR burst relayed at " + (frequencyHz > 0 ? frequencyHz : 38000)
                + " Hz (" + pattern.length + " pulses).");
        } catch (Exception e) {
            cb.reply("❌ Bad code pattern: " + (e.getMessage() != null ? e.getMessage() : e));
        }
    }

    // ── virtual device table ─────────────────────────────────────────

    private void setDevice(String device, String value) {
        java.util.Map<String, String> map = parse(prefs.getPrefs().getString(KEY_STATE, ""));
        map.put(device, value);
        StringBuilder sb = new StringBuilder();
        for (java.util.Map.Entry<String, String> e : map.entrySet()) {
            if (sb.length() > 0) sb.append(';');
            sb.append(e.getKey()).append(':').append(e.getValue());
        }
        prefs.getPrefs().edit().putString(KEY_STATE, sb.toString()).apply();
    }

    private String deviceState(String device, String def) {
        String v = parse(prefs.getPrefs().getString(KEY_STATE, "")).get(device);
        return v != null ? v : def;
    }

    /** Public read so other handlers (behaviour flags) can query state. */
    public String getDeviceState(String device, String def) {
        return deviceState(device, def);
    }

    private static java.util.Map<String, String> parse(String s) {
        java.util.Map<String, String> m = new java.util.HashMap<>();
        if (s == null || s.isEmpty()) return m;
        for (String kv : s.split(";")) {
            int i = kv.indexOf(':');
            if (i > 0) m.put(kv.substring(0, i), kv.substring(i + 1));
        }
        return m;
    }

    private static int[] parseHex(String s) {
        String[] parts = s.replaceAll("[^0-9a-fA-F]", "").split("(?<=\\G.{2})");
        int[] out = new int[parts.length];
        for (int i = 0; i < parts.length; i++)
            out[i] = Integer.parseInt(parts[i], 16);
        return out;
    }
}