package com.homelifesync.elder.commands;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Environment;
import android.os.StatFs;

import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.util.HashMap;
import java.util.Map;

/** Handles: BATNOW, CHARGESTATE, BATHEALTH, STORAGE, TEMPNOW */
public class BatteryHandler {

    private final Context context;

    public BatteryHandler(Context ctx) { context = ctx; }

    public void getBattery(ReplyCallback cb) {
        cb.reply("🔋 Battery: " + pct() + "%");
    }

    public void getChargeState(ReplyCallback cb) {
        Intent s = sticky();
        if (s == null) { cb.reply("❌ Battery info unavailable."); return; }
        int plugged = s.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        boolean ch  = plugged > 0;
        String src  = plugged == BatteryManager.BATTERY_PLUGGED_AC       ? "AC"
                    : plugged == BatteryManager.BATTERY_PLUGGED_USB      ? "USB"
                    : plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS ? "Wireless" : "";
        // Push to Firebase status too
        Map<String, Object> m = new HashMap<>();
        m.put("battery", pct());
        m.put("charging", ch);
        FirebaseRepository.get(context).updateStatus(m);
        cb.reply((ch ? "⚡ Charging (" + src + ")" : "🔋 Not charging") + " — " + pct() + "%");
    }

    public void getBatteryHealth(ReplyCallback cb) {
        Intent s = sticky();
        if (s == null) { cb.reply("❌ Battery info unavailable."); return; }
        int h = s.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN);
        String hs = h == BatteryManager.BATTERY_HEALTH_GOOD         ? "Good ✅"
                  : h == BatteryManager.BATTERY_HEALTH_OVERHEAT     ? "Overheating 🔥"
                  : h == BatteryManager.BATTERY_HEALTH_DEAD         ? "Dead ❌"
                  : h == BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE ? "Over-voltage ⚠️"
                  : h == BatteryManager.BATTERY_HEALTH_COLD         ? "Too cold 🥶" : "Unknown";
        cb.reply("🔋 Health: " + hs);
    }

    public void getStorage(ReplyCallback cb) {
        StatFs sf   = new StatFs(Environment.getDataDirectory().getPath());
        long bs     = sf.getBlockSizeLong();
        long total  = sf.getBlockCountLong()     * bs / (1024 * 1024);
        long free   = sf.getAvailableBlocksLong() * bs / (1024 * 1024);
        cb.reply("💾 Storage: " + free + " MB free / " + total + " MB");
    }

    public void getTemp(ReplyCallback cb) {
        Intent s = sticky();
        if (s == null) { cb.reply("❌ Temp unavailable."); return; }
        float t = s.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0f;
        cb.reply("🌡️ Device temp: " + t + "°C");
    }

    public String buildStatusSummary() {
        Intent s = sticky();
        if (s == null) return "Status unavailable.";
        int plugged = s.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        return "📊 Battery: " + pct() + "%" + (plugged > 0 ? " ⚡" : "")
             + " | Elder Helper active ✅";
    }

    /** Live status map for the periodic heartbeat (merged into /status). */
    public Map<String, Object> getStatusMap() {
        Map<String, Object> m = new HashMap<>();
        m.put("battery", pct());
        Intent s = sticky();
        int plugged = s != null
            ? s.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) : -1;
        m.put("charging", plugged > 0);
        return m;
    }

    private int pct() {
        Intent s = sticky();
        if (s == null) return -1;
        int l = s.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int sc = s.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        return sc > 0 ? l * 100 / sc : -1;
    }

    private Intent sticky() {
        return context.registerReceiver(null,
            new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    }
}
