package com.homelifesync.elder.commands;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.text.TextUtils;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.PrefsHelper;

import java.util.Locale;

/**
 * App-interaction commands: OPENAPP, CLOSEAPP, OPENMAP, OPENCALL, OPENMED.
 *
 * OPENAPP accepts either a package name or a friendly alias
 * (e.g. "OPENAPP maps", "OPENAPP whatsapp") — unknown aliases are gracefully
 * reported so the caretaker can retry with a real package name.
 */
public class AppActionHandler {

    private final Context context;
    private final FusedLocationProviderClient fused;

    public AppActionHandler(Context ctx) {
        context = ctx;
        fused   = LocationServices.getFusedLocationProviderClient(ctx);
    }

    /** OPENAPP — launch a package or resolve a friendly alias. */
    public void openApp(ReplyCallback cb, String arg) {
        String pkg = resolvePackage(arg);
        if (pkg == null) {
            cb.reply("❌ Unknown app \"" + (TextUtils.isEmpty(arg) ? "" : arg)
                + "\". Try a package name, e.g. OPENAPP com.whatsapp");
            return;
        }
        Intent launch = context.getPackageManager()
            .getLaunchIntentForPackage(pkg);
        if (launch == null) {
            cb.reply("❌ \"" + pkg + "\" is installed but has no launcher activity.");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(launch);
        cb.reply("📲 Opened " + friendlyName(pkg) + ".");
    }

    /** CLOSEAPP — best-effort kill of a background package. */
    public void closeApp(ReplyCallback cb, String arg) {
        String pkg = resolvePackage(arg);
        if (pkg == null) {
            cb.reply("❌ Unknown app \"" + (TextUtils.isEmpty(arg) ? "" : arg) + "\".");
            return;
        }
        try {
            ActivityManager am =
                (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            am.killBackgroundProcesses(pkg);
            cb.reply("🗑️ Closed " + friendlyName(pkg) + " (background).");
        } catch (Exception e) {
            cb.reply("❌ Cannot close foreground apps without root.");
        }
    }

    /** OPENMAP — open Google Maps centred on the current location. */
    public void openMap(ReplyCallback cb) {
        try {
            fused.getLastLocation().addOnSuccessListener(loc -> {
                String q = "geo:0,0?q=";
                if (loc != null)
                    q = String.format(Locale.US, "geo:%f,%f?q=%f,%f",
                        loc.getLatitude(), loc.getLongitude(),
                        loc.getLatitude(), loc.getLongitude());
                try {
                    Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse(q));
                    maps.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(maps);
                    cb.reply("🗺️ Maps opened at " + (loc != null
                        ? String.format(Locale.US, "%.5f,%.5f", loc.getLatitude(), loc.getLongitude())
                        : "current position") + ".");
                } catch (Exception e) {
                    cb.reply("❌ No maps app found on the device.");
                }
            }).addOnFailureListener(e -> {
                try {
                    Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=home"));
                    maps.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(maps);
                    cb.reply("🗺️ Maps opened (last position unavailable).");
                } catch (Exception ex) {
                    cb.reply("❌ No maps app found on the device.");
                }
            });
        } catch (SecurityException e) {
            cb.reply("❌ Location permission denied.");
        }
    }

    /** OPENCALL — open the dialer with the caregiver's number pre-filled. */
    public void openCaller(ReplyCallback cb) {
        String num = new PrefsHelper(context).getCaretakerNumber();
        try {
            Intent dial = new Intent(Intent.ACTION_DIAL,
                Uri.parse("tel:" + (TextUtils.isEmpty(num) ? "" : num)));
            dial.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(dial);
            cb.reply("📞 Dialer opened" + (TextUtils.isEmpty(num) ? " (no number set)." : " for your number."));
        } catch (Exception e) {
            cb.reply("❌ No dialer app found.");
        }
    }

    /** OPENMED — open the installed medicines/reminders app if present. */
    public void openMeds(ReplyCallback cb) {
        String[] candidates = {
            "com.hlselder.meds",      "com.homelifesync.elder.meds",
            "com.android.bbk.logkit", "com.miui.notes",
        };
        for (String pkg : candidates) {
            Intent i = context.getPackageManager().getLaunchIntentForPackage(pkg);
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(i);
                cb.reply("💊 Opened medicines app (" + pkg + ").");
                return;
            }
        }
        cb.reply("❌ No medicines-app installed. I can send MEDR reminders instead.");
    }

    // ── package resolution ────────────────────────────────────────────

    private String resolvePackage(String arg) {
        if (TextUtils.isEmpty(arg)) return null;
        String a = arg.trim().toLowerCase(Locale.ROOT);

        // A raw-looking package name → verify it's installed
        if (a.contains(".") && !alias(a).equals(a)) {
            return isInstalled(arg.trim()) ? arg.trim() : null;
        }
        String alias = alias(a);
        if (isInstalled(alias)) return alias;
        return null;
    }

    private static String alias(String a) {
        switch (a) {
            case "maps":            return "com.google.android.apps.maps";
            case "gmail":           return "com.google.android.gm";
            case "whatsapp":        return "com.whatsapp";
            case "wapp":            return "com.whatsapp";
            case "phone":           return "com.android.dialer";
            case "dialer":          return "com.android.dialer";
            case "sms":             return "com.android.messaging";
            case "messages":        return "com.android.messaging";
            case "camera":          return "com.android.camera2";
            case "settings":        return "com.android.settings";
            case "notes":           return "com.miui.notes";
            case "youtube":         return "com.google.android.youtube";
            case "photos":          return "com.google.android.apps.photos";
            case "pay":             return "com.google.android.apps.walletnfcrel";
            case "playstore":       return "com.android.vending";
            case "launcher":        return "com.android.launcher3";
            default:                return a;
        }
    }

    private boolean isInstalled(String pkg) {
        try {
            context.getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private static String friendlyName(String pkg) {
        switch (pkg) {
            case "com.google.android.apps.maps":  return "Maps";
            case "com.google.android.gm":         return "Gmail";
            case "com.whatsapp":                  return "WhatsApp";
            case "com.android.dialer":            return "Phone";
            case "com.android.messaging":         return "Messages";
            case "com.android.camera2":           return "Camera";
            case "com.android.settings":          return "Settings";
            default: return pkg;
        }
    }
}