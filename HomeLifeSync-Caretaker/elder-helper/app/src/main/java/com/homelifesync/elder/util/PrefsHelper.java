package com.homelifesync.elder.util;

import android.content.Context;
import android.content.SharedPreferences;

import com.homelifesync.elder.Constants;

import java.util.UUID;

public class PrefsHelper {

    private final SharedPreferences prefs;

    public PrefsHelper(Context ctx) {
        prefs = ctx.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE);
    }

    public SharedPreferences getPrefs() { return prefs; }

    /** Stable device ID — generated once, persisted forever. Used as Firebase node key. */
    public String getDeviceId() {
        String id = prefs.getString(Constants.PREF_DEVICE_ID, null);
        if (id == null) {
            id = UUID.randomUUID().toString().substring(0, 8); // short, readable
            prefs.edit().putString(Constants.PREF_DEVICE_ID, id).apply();
        }
        return id;
    }

    public String getCaretakerNumber() {
        String saved = prefs.getString(Constants.PREF_CARETAKER_NUM, null);
        if (saved != null && !saved.isEmpty()) return saved;
        return Constants.CARETAKER_NUMBER;
    }

    public void saveCaretakerNumber(String number) {
        prefs.edit().putString(Constants.PREF_CARETAKER_NUM, number).apply();
    }

    public boolean isServiceActive() {
        return prefs.getBoolean(Constants.PREF_SERVICE_ACTIVE, false);
    }

    public void setServiceActive(boolean active) {
        prefs.edit().putBoolean(Constants.PREF_SERVICE_ACTIVE, active).apply();
    }

    /** First-run wizard completed (device paired with a caretaker). */
    public boolean isOnboarded() {
        return prefs.getBoolean(Constants.PREF_ONBOARDED, false);
    }

    public void setOnboarded() {
        prefs.edit().putBoolean(Constants.PREF_ONBOARDED, true).apply();
    }

    /** Persisted flashlight/torch state — survives restarts (state memory). */
    public boolean getTorchState() {
        return prefs.getBoolean(Constants.PREF_TORCH, false);
    }

    public void setTorchState(boolean on) {
        prefs.edit().putBoolean(Constants.PREF_TORCH, on).apply();
    }

    /**
     * Rotating 4-digit pairing code. Created once on first use and kept until
     * rotated ("New code") or the device disconnects — the tablet must enter
     * it together with the device ID to pair. The creation/rotation timestamp
     * backs the 5-minute validity check on the tablet side.
     */
    public String getOrCreatePairingCode() {
        String code = prefs.getString(Constants.PREF_PAIRING_CODE, null);
        if (!PairingCode.isValid(code)) {
            code = PairingCode.generate();
            prefs.edit()
                .putString(Constants.PREF_PAIRING_CODE, code)
                .apply();
        }
        return code;
    }

    public String rotatePairingCode() {
        String code = PairingCode.generate();
        prefs.edit()
            .putString(Constants.PREF_PAIRING_CODE, code)
            .apply();
        return code;
    }

    /**
     * Disconnect from the caretaker: clear pairing state (onboarded flag,
     * caretaker number, service-active flag, pairing code). The device ID is
     * kept — it is this phone's identity — so re-pairing shows the same ID to
     * share.
     */
    public void clearSetup() {
        prefs.edit()
            .remove(Constants.PREF_ONBOARDED)
            .remove(Constants.PREF_CARETAKER_NUM)
            .remove(Constants.PREF_SERVICE_ACTIVE)
            .remove(Constants.PREF_PAIRING_CODE)
            .apply();
    }
}
