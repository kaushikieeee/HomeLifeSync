package com.homelifesync.elder.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.homelifesync.elder.service.ElderHelperService;
import com.homelifesync.elder.util.PrefsHelper;
import com.homelifesync.elder.util.ServiceStarter;

/**
 * Restarts ElderHelperService after device boot or app update.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Boot/update event: " + intent.getAction());

        PrefsHelper prefs = new PrefsHelper(context);
        if (!prefs.isServiceActive()) {
            Log.d(TAG, "Service was stopped intentionally — not restarting.");
            return;
        }

        Intent svc = new Intent(context, ElderHelperService.class);
        ServiceStarter.startCommandService(context, svc);
        Log.d(TAG, "ElderHelperService restarted after boot.");
    }
}
