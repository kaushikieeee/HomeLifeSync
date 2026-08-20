package com.homelifesync.elder.commands;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.File;

/**
 * System-control commands: REBOOT, POWEROFF, RESTARTTASKER, CLEARCACHE.
 *
 * REBOOT / POWEROFF are root-or-device-owner operations guarded here so the
 * caretaker gets an honest capability report instead of a silent no-op.
 * CLEARCACHE actually deletes the app's own cache files.
 */
public class SystemHandler {

    private final Context context;

    public SystemHandler(Context ctx) { context = ctx; }

    /** REBOOT — requires root / device-owner; otherwise honest report. */
    public void reboot(ReplyCallback cb) {
        if (tryShell("reboot")) {
            cb.reply("🔁 Rebooting device…");
            return;
        }
        if (isDeviceOwner()) {
            try {
                PowerManager pm =
                    (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                pm.reboot(null);
                cb.reply("🔁 Rebooting device…");
                return;
            } catch (Exception ignored) {}
        }
        cb.reply("❌ REBOOT needs root or device-owner privilege.\n"
            + "The device is not rooted — no reboot performed.");
    }

    /** POWEROFF — root-only on most handsets. */
    public void powerOff(ReplyCallback cb) {
        if (tryShell("reboot -p")) {
            cb.reply("📴 Powering off device…");
            return;
        }
        cb.reply("❌ POWEROFF needs root (su is not available).\n"
            + "Ask the family to hold the power key instead.");
    }

    /** RESTARTTASKER — ask the Tasker app to restart its profile engine. */
    public void restartTasker(ReplyCallback cb) {
        try {
            Intent i = new Intent("net.dinglisch.android.taskerm.ACTION_RESTART");
            i.setPackage("net.dinglisch.android.taskerm");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
            cb.reply("🔄 Restart sent to Tasker (if installed).");
        } catch (Exception e) {
            cb.reply("❌ Tasker not installed / won't accept remote restart.");
        }
    }

    /** CLEARCACHE — actually wipe the app's cache directories. */
    public void clearCache(ReplyCallback cb) {
        long freed = 0;
        File[] dirs = { context.getCacheDir(), context.getExternalCacheDir() };
        for (File d : dirs) {
            if (d == null) continue;
            freed += size(d);
            deleteRecursive(d);
        }
        cb.reply("🧹 Cache cleared (~" + kb(freed) + " KB freed).");
    }

    // ── helpers ─────────────────────────────────────────────────────

    private boolean isDeviceOwner() {
        try {
            android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) context
                    .getSystemService(Context.DEVICE_POLICY_SERVICE);
            return dpm.isDeviceOwnerApp(context.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tryShell(String cmd) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"su", "-c", cmd});
            int code = p.waitFor();
            return code == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static void deleteRecursive(File f) {
        File[] all = f.listFiles();
        if (all != null) for (File c : all) deleteRecursive(c);
        f.delete();
    }

    private static long size(File f) {
        long s = 0;
        File[] all = f.listFiles();
        if (all != null) for (File c : all) s += c.isDirectory() ? size(c) : c.length();
        return s;
    }

    private static long kb(long bytes) { return bytes / 1024; }
}