package com.homelifesync.elder.commands;

import android.content.Context;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.os.Looper;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Handles: LOC, LOCFAST, LOCADDR, MOVESTATE, ROUTINE */
public class LocationHandler {

    private final Context context;
    private final FusedLocationProviderClient fused;

    private static final LinkedList<Location> history  = new LinkedList<>();
    private static       Location             lastKnown = null;

    public LocationHandler(Context ctx) {
        context = ctx;
        fused   = LocationServices.getFusedLocationProviderClient(ctx);
    }

    /** LOC / LOCFAST */
    public void getLocation(ReplyCallback cb, boolean fast) {
        LocationRequest req = new LocationRequest.Builder(
                fast ? Priority.PRIORITY_BALANCED_POWER_ACCURACY
                     : Priority.PRIORITY_HIGH_ACCURACY, 1000)
            .setMaxUpdates(1)
            .setWaitForAccurateLocation(!fast)
            .build();
        try {
            fused.requestLocationUpdates(req, new LocationCallback() {
                @Override public void onLocationResult(LocationResult r) {
                    fused.removeLocationUpdates(this);
                    Location loc = r.getLastLocation();
                    if (loc != null) {
                        store(loc);
                        // Also push to Firebase status so map updates live
                        pushLocationStatus(loc);
                        String url = "https://maps.google.com/?q="
                            + loc.getLatitude() + "," + loc.getLongitude();
                        cb.reply("📍 "
                            + String.format(Locale.US, "%.5f", loc.getLatitude()) + ", "
                            + String.format(Locale.US, "%.5f", loc.getLongitude())
                            + "\nAcc: " + (int) loc.getAccuracy() + "m\n" + url);
                    } else {
                        cb.reply("❌ Location unavailable.");
                    }
                }
            }, Looper.getMainLooper());
        } catch (SecurityException e) {
            cb.reply("❌ Location permission denied.");
        }
    }

    /** LOCADDR */
    public void getAddress(ReplyCallback cb) {
        try {
            fused.getLastLocation().addOnSuccessListener(loc -> {
                if (loc == null) { cb.reply("❌ No cached location."); return; }
                store(loc);
                if (!Geocoder.isPresent()) {
                    cb.reply("📍 " + loc.getLatitude() + ", " + loc.getLongitude());
                    return;
                }
                try {
                    List<Address> addrs = new Geocoder(context, Locale.getDefault())
                        .getFromLocation(loc.getLatitude(), loc.getLongitude(), 1);
                    if (addrs != null && !addrs.isEmpty()) {
                        Address a = addrs.get(0);
                        StringBuilder sb = new StringBuilder();
                        for (int i = 0; i <= a.getMaxAddressLineIndex(); i++) {
                            if (i > 0) sb.append(", ");
                            sb.append(a.getAddressLine(i));
                        }
                        cb.reply("📍 " + sb);
                    } else {
                        cb.reply("📍 " + loc.getLatitude() + ", " + loc.getLongitude());
                    }
                } catch (IOException e) {
                    cb.reply("❌ Geocoder error.");
                }
            }).addOnFailureListener(e -> cb.reply("❌ Location error."));
        } catch (SecurityException e) {
            cb.reply("❌ Location permission denied.");
        }
    }

    /** MOVESTATE */
    public void getMoveState(ReplyCallback cb) {
        try {
            fused.getLastLocation().addOnSuccessListener(loc -> {
                if (loc == null || lastKnown == null) {
                    cb.reply("🚶 Move state: Unknown (no history)");
                    return;
                }
                float dist    = lastKnown.distanceTo(loc);
                long timeDiff = (loc.getTime() - lastKnown.getTime()) / 1000L;
                cb.reply("🚶 " + (dist > 20 && timeDiff > 0
                    ? "MOVING (~" + (int) dist + "m)"
                    : "STATIONARY"));
            });
        } catch (SecurityException e) {
            cb.reply("❌ Location permission denied.");
        }
    }

    /** ROUTINE — last 3 positions */
    public void getRoutine(ReplyCallback cb) {
        if (history.isEmpty()) { cb.reply("📋 No location history yet."); return; }
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
        StringBuilder sb = new StringBuilder("📋 Last locations:\n");
        int n = 0;
        for (Location l : history) {
            sb.append(sdf.format(new Date(l.getTime()))).append(" → ")
              .append(String.format(Locale.US, "%.4f,%.4f", l.getLatitude(), l.getLongitude()))
              .append("\n");
            if (++n >= 3) break;
        }
        cb.reply(sb.toString().trim());
    }

    // ── helpers ──────────────────────────────────────────────────────

    private static void store(Location loc) {
        lastKnown = loc;
        history.addFirst(loc);
        if (history.size() > 5) history.removeLast();
    }

    private void pushLocationStatus(Location loc) {
        Map<String, Object> m = new HashMap<>();
        m.put("lat", loc.getLatitude());
        m.put("lng", loc.getLongitude());
        m.put("accuracy", (int) loc.getAccuracy());
        FirebaseRepository.get(context).updateStatus(m);
    }
}
