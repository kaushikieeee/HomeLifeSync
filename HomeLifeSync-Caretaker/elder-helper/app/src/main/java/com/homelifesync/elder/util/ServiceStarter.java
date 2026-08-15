package com.homelifesync.elder.util;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Starts {@code ElderHelperService} without crashing on Android 12+.
 *
 * Starting a foreground service from the background (e.g. from an SMS
 * broadcast) throws ForegroundServiceStartNotAllowedException. When that
 * happens we degrade gracefully: the command is dropped, but the service
 * (kept alive via START_STICKY / BootReceiver) stays up and the primary
 * Firebase DB channel keeps working.
 */
public final class ServiceStarter {

    private static final String TAG = "ServiceStarter";

    private ServiceStarter() {}

    public static void startCommandService(Context context, Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not start foreground service from background", t);
        }
    }
}