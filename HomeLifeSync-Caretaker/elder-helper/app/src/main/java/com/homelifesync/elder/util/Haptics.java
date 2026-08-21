package com.homelifesync.elder.util;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Tiny, consistent haptic feedback helpers.
 *
 * Android 12+ uses the system VibratorManager (which respects the platform
 * haptics profile); older devices fall back to the legacy Vibrator. Every
 * call is best-effort — a missing VIBRATE permission or hardware never
 * throws.
 */
public final class Haptics {

    public static final long   TAP_MS        = 18L;
    public static final long   CONFIRM_MS    = 40L;
    public static final long[] SUCCESS_PATTERN = { 0, 45, 35, 60 };

    private Haptics() {}

    /** Light tick — button presses, copies, toggles. */
    public static void tap(Context ctx) {
        vibrate(ctx, TAP_MS, null);
    }

    /** Slightly stronger tick — completing an action. */
    public static void confirm(Context ctx) {
        vibrate(ctx, CONFIRM_MS, null);
    }

    /** Gentle double beat — successful flow completion (wizard done). */
    public static void success(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            vibrate(ctx, 0, VibrationEffect.createWaveform(SUCCESS_PATTERN, -1));
        } else {
            vibrate(ctx, CONFIRM_MS, null);
        }
    }

    private static void vibrate(Context ctx, long ms, VibrationEffect effect) {
        try {
            Vibrator v = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm =
                    (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) v = vm.getDefaultVibrator();
            } else {
                v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(effect != null ? effect : VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(ms);
                }
            }
        } catch (Exception ignored) {
            // Best effort only — never let a missing permission crash a tap.
        }
    }
}