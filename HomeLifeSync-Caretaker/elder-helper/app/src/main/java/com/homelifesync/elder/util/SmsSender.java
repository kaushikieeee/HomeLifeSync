package com.homelifesync.elder.util;

import android.content.Context;
import android.telephony.SmsManager;
import android.util.Log;

import java.util.ArrayList;

/**
 * Sends reply SMS back to the caretaker. Splits messages > 160 chars automatically.
 */
public class SmsSender {

    private static final String TAG = "SmsSender";

    private SmsSender() {}

    public static void send(Context context, String toNumber, String message) {
        if (toNumber == null || toNumber.isEmpty() || message == null || message.isEmpty()) return;
        Log.d(TAG, "SMS → " + toNumber + " : " + message);
        try {
            SmsManager sm;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                sm = context.getSystemService(SmsManager.class);
            } else {
                sm = SmsManager.getDefault();
            }
            if (message.length() <= 160) {
                sm.sendTextMessage(toNumber, null, message, null, null);
            } else {
                ArrayList<String> parts = sm.divideMessage(message);
                sm.sendMultipartTextMessage(toNumber, null, parts, null, null);
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SEND_SMS permission denied", e);
        } catch (Exception e) {
            Log.e(TAG, "SMS send failed", e);
        }
    }
}
