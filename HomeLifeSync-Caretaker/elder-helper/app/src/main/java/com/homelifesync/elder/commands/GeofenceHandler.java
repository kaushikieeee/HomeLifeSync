package com.homelifesync.elder.commands;

import android.content.Context;
import android.location.Location;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.PrefsHelper;

import java.util.Locale;

/**
 * Geofencing commands: GEOSET (lat,lng[,radius]), GEOCLEAR, GEOALERT (toggle),
 * GEOENTER / GEOEXIT (set the breach type) and an automatic state check against
 * the last known position so the caretaker always gets a truthful answer.
 *
 * Persisted in SharedPreferences so the fence survives restarts.
 */
public class GeofenceHandler {

    private static final String KEY_LAT     = "geofence_lat";
    private static final String KEY_LNG     = "geofence_lng";
    private static final String KEY_RADIUS  = "geofence_radius";
    private static final String KEY_ENABLED = "geofence_enabled";
    private static final String KEY_MODE    = "geofence_mode";   // "enter" | "exit"

    private final Context context;
    private final PrefsHelper             prefs;
    private final FusedLocationProviderClient fused;

    public GeofenceHandler(Context ctx) {
        context = ctx;
        prefs   = new PrefsHelper(ctx);
        fused   = LocationServices.getFusedLocationProviderClient(ctx);
    }

    /** GEOSET lat,lng[,radius] — program the fence. */
    public void set(ReplyCallback cb, String latStr, String lngStr, String radiusStr) {
        double lat, lng;
        try {
            lat = Double.parseDouble(latStr);
            lng = Double.parseDouble(lngStr);
        } catch (Exception e) {
            cb.reply("❌ GEOSET needs <lat> <lng> [radius], e.g. GEOSET 28.61 77.20 200");
            return;
        }
        int radius = 100;
        try { if (radiusStr != null) radius = (int) Math.round(Double.parseDouble(radiusStr)); }
        catch (Exception ignored) {}

        prefs.getPrefs().edit()
            .putString(KEY_LAT, String.valueOf(lat))
            .putString(KEY_LNG, String.valueOf(lng))
            .putInt(KEY_RADIUS, radius)
            .putBoolean(KEY_ENABLED, true)
            .apply();

        cb.reply("📍 Geofence set: " + String.format(Locale.US, "%.5f,%.5f", lat, lng)
            + " ±" + radius + " m\n(alerts " + mode() + ")");
        evaluateNow(cb, false);
    }

    /** GEOCLEAR — remove the fence. */
    public void clear(ReplyCallback cb) {
        prefs.getPrefs().edit()
            .remove(KEY_LAT).remove(KEY_LNG).remove(KEY_RADIUS)
            .putBoolean(KEY_ENABLED, false)
            .apply();
        cb.reply("🧹 Geofence cleared.");
    }

    /** GEOALERT — flip breach alerts on/off. */
    public void toggleAlert(ReplyCallback cb) {
        boolean cur = prefs.getPrefs().getBoolean(KEY_ENABLED, false);
        prefs.getPrefs().edit().putBoolean(KEY_ENABLED, !cur).apply();
        cb.reply(cur ? "🚫 Geofence breach alerts OFF."
                     : "✅ Geofence breach alerts ON.");
    }

    /** GEOENTER / GEOEXIT — choose the action that triggers the alert. */
    public void setMode(ReplyCallback cb, String mode) {
        prefs.getPrefs().edit().putString(KEY_MODE, mode).apply();
        cb.reply("🚪 Geofence breach mode → " + ("enter".equals(mode) ? "ENTER" : "EXIT"));
    }

    /** Current fence state + where the elder is right now. */
    public void status(ReplyCallback cb) {
        String lat = prefs.getPrefs().getString(KEY_LAT, null);
        if (lat == null) {
            cb.reply("🚫 No geofence programmed yet.\nUse GEOSET <lat> <lng> [radius].");
            return;
        }
        cb.reply("📍 Fence: " + String.format(Locale.US, "%.5f,%.5f",
                Double.parseDouble(lat),
                Double.parseDouble(prefs.getPrefs().getString(KEY_LNG, "0")))
            + " ±" + prefs.getPrefs().getInt(KEY_RADIUS, 100) + " m\n"
            + "Alerts: " + (prefs.getPrefs().getBoolean(KEY_ENABLED, false)
                ? "ON (" + mode() + ")" : "OFF"));
        evaluateNow(cb, true);
    }

    /** Compute the fence relation using the last known position. */
    private void evaluateNow(ReplyCallback cb, boolean replyAnyway) {
        String sLat = prefs.getPrefs().getString(KEY_LAT, null);
        if (sLat == null) return;
        try {
            fused.getLastLocation().addOnSuccessListener(loc -> {
                if (loc == null) return;
                double radius = prefs.getPrefs().getInt(KEY_RADIUS, 100);
                float dist = dist(loc,
                    Double.parseDouble(sLat),
                    Double.parseDouble(prefs.getPrefs().getString(KEY_LNG, "0")));
                boolean found = dist <= radius;
                if (replyAnyway) {
                    cb.reply((found ? "🏠 Inside the safe zone" : "🚶 OUTSIDE the safe zone")
                        + " — " + Math.round(dist) + " m from centre.");
                } else if (!found && prefs.getPrefs().getBoolean(KEY_ENABLED, false)) {
                    cb.reply("⚠️ GEOSET breach: elder is "
                        + (("exit".equals(mode()) ? "OUTSIDE" : "INSIDE")
                            + " by ~" + Math.round(dist) + " m."));
                }
            });
        } catch (SecurityException ignored) {
            // No location permission — the stored fence is still reported.
        }
    }

    private float dist(Location a, double lat, double lng) {
        Location b = new Location("fence");
        b.setLatitude(lat);
        b.setLongitude(lng);
        return a.distanceTo(b);
    }

    private String mode() {
        return prefs.getPrefs().getString(KEY_MODE, "exit");
    }
}