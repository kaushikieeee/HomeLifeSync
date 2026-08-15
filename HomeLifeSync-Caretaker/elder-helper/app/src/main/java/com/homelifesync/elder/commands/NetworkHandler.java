package com.homelifesync.elder.commands;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

/** Handles: NETSTATE, PING, WIFIUP, WIFIDOWN */
public class NetworkHandler {

    private final Context context;

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

    private WifiManager wm() {
        return (WifiManager) context.getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
    }
}
