package com.kaushikieee.homelifesync.caretaker;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Launches another installed app (by package name) on THIS device —
 * used for the "Open Mi Band app" action on the caretaker phone.
 * Won't start: window manager overlay etc. — pure launch intent.
 */
@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    @PluginMethod
    public void openPackage(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("packageName is required");
            return;
        }

        final PackageManager pm = getContext().getPackageManager();
        JSObject result = new JSObject();
        result.put("packageName", packageName);

        Intent launch = pm.getLaunchIntentForPackage(packageName);
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            result.put("installed", true);
            result.put("opened", true);
            call.resolve(result);
            return;
        }

        result.put("installed", false);
        result.put("opened", false);
        try {
            Intent market = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=" + packageName));
            market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(market);
            result.put("playStore", true);
        } catch (Exception e) {
            result.put("playStore", false);
        }
        call.resolve(result);
    }
}