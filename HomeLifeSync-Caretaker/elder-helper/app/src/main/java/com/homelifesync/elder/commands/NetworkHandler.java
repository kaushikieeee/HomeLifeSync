package com.homelifesync.elder.commands;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.IOException;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;

/** Handles: NETSTATE, PING, WIFIUP, WIFIDOWN, DATAON, DATAOFF,
 *           HOTSPOTON, HOTSPOTOFF */
public class NetworkHandler {

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public NetworkHandler(Context ctx) { context = ctx; }

    public void getNetState(ReplyCallback cb) {
        ConnectivityManager cm =
            (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean wifi = false, mobile = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network active = cm.getActiveNetwork();
            if (active != null) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(active);
                if (nc != null) {
                    wifi   = nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
                    mobile = nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
                }
            }
        } else {
            android.net.NetworkInfo wi = cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI);
            android.net.NetworkInfo mo = cm.getNetworkInfo(ConnectivityManager.TYPE_MOBILE);
            wifi   = wi != null && wi.isConnected();
            mobile = mo != null && mo.isConnected();
        }
        WifiManager wm = wm();
        boolean wifiOn = wm != null && wm.isWifiEnabled();
        cb.reply("📶 WiFi: " + (wifiOn ? "ON" : "OFF") + (wifi ? " (connected)" : "")
            + " | Mobile: " + (mobile ? "✅" : "❌"));
    }

    public void ping(ReplyCallback cb) {
        new Thread(() -> {
            try {
                HttpURLConnection c =
                    (HttpURLConnection) new URL("https://www.google.com").openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                c.connect();
                int code = c.getResponseCode();
                c.disconnect();
                cb.reply("✅ Online (HTTP " + code + ")");
            } catch (IOException e) {
                cb.reply("❌ Offline / unreachable");
            }
        }).start();
    }

    public void setWifi(ReplyCallback cb, boolean enable) {
        WifiManager wm = wm();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (wm != null) wm.setWifiEnabled(enable);
            cb.reply("📶 WiFi " + (enable ? "ON" : "OFF"));
        } else {
            boolean cur = wm != null && wm.isWifiEnabled();
            cb.reply("⚠️ Android 10+ restricts WiFi toggle.\nCurrent: " + (cur ? "ON" : "OFF"));
        }
    }

    /** DATAON / DATAOFF — reflect into ConnectivityManager (best effort).
     *  Android 13+ hides setMobileDataEnabled; we try reflection and fall
     *  back to opening the accessible Mobile Network settings screen. */
    public void setMobileData(ReplyCallback cb, boolean enable) {
        try {
            ConnectivityManager cm =
                (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Object dataMgr = cm.getClass().getMethod("getDataConnectionManager")
                .invoke(cm);
            if (dataMgr != null) {
                Method m = dataMgr.getClass().getMethod("setMobileDataEnabled",
                    boolean.class);
                m.invoke(dataMgr, enable);
                cb.reply("📱 Mobile data " + (enable ? "ON" : "OFF"));
                return;
            }
            Method m = ConnectivityManager.class.getMethod("setMobileDataEnabled",
                boolean.class);
            m.invoke(cm, enable);
            cb.reply("📱 Mobile data " + (enable ? "ON" : "OFF"));
        } catch (Exception e) {
            cb.reply("⚠️ Android 14+ blocks programmatic mobile-data toggle.\n"
                + "I opened the Mobile Network settings — tap the toggle manually.");
            openMobileSettings();
        }
    }

    /** HOTSPOTON / HOTSPOTOFF — reflect into WifiManager (needs a signal-bearing
     *  or legacy carrier build; otherwise falls back to settings + honest note). */
    public void setHotspot(ReplyCallback cb, boolean enable) {
        WifiManager wm = wm();
        if (wm == null) return;
        try {
            Method m = wm.getClass().getMethod("setWifiApEnabled",
                android.net.wifi.WifiConfiguration.class, boolean.class);
            boolean ok = (boolean) m.invoke(wm, null, enable);
            if (ok) {
                cb.reply("📶 Hotspot " + (enable ? "ON" : "OFF"));
                return;
            }
            cb.reply("⚠️ Hotspot toggle blocked — open Tethering settings to toggle manually.");
        } catch (Exception e) {
            cb.reply("⚠️ Hotspot toggle unavailable here — open Tethering settings to toggle manually.");
        }
        openTetheringSettings();
    }

    private void openMobileSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_DATA_ROAMING_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        } catch (Exception ignored) {}
    }

    private void openTetheringSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        } catch (Exception ignored) {}
    }

    private WifiManager wm() {
        return (WifiManager) context.getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
    }
}
