package com.homelifesync.elder.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.text.TextUtils;
import android.util.Log;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.service.ElderHelperService;
import com.homelifesync.elder.util.PrefsHelper;
import com.homelifesync.elder.util.ServiceStarter;

/**
 * FALLBACK command channel — used when the elder device has no internet.
 * When internet is available, FCM handles commands instead.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!android.provider.Telephony.Sms.Intents.SMS_RECEIVED_ACTION
                .equals(intent.getAction())) return;

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus  = (Object[]) bundle.get("pdus");
        if (pdus == null || pdus.length == 0) return;

        String format = bundle.getString("format");
        StringBuilder body = new StringBuilder();
        String sender = null;

        for (Object pdu : pdus) {
            SmsMessage msg = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? SmsMessage.createFromPdu((byte[]) pdu, format)
                : SmsMessage.createFromPdu((byte[]) pdu);
            if (msg != null) {
                if (sender == null) sender = msg.getDisplayOriginatingAddress();
                body.append(msg.getMessageBody());
            }
        }

        if (sender == null || body.length() == 0) return;
        Log.d(TAG, "SMS from " + sender + ": " + body);

        PrefsHelper prefs = new PrefsHelper(context);
        String caretakerNum = prefs.getCaretakerNumber();
        if (!TextUtils.isEmpty(caretakerNum) && !numbersMatch(sender, caretakerNum)) {
            Log.d(TAG, "Ignoring — not from caretaker number");
            return;
        }

        Intent svc = new Intent(context, ElderHelperService.class);
        svc.setAction(ElderHelperService.ACTION_EXECUTE_COMMAND);
        svc.putExtra(ElderHelperService.EXTRA_CMD,    body.toString().trim().toUpperCase());
        svc.putExtra(ElderHelperService.EXTRA_CMD_ID, "");
        svc.putExtra(ElderHelperService.EXTRA_SENDER, sender);
        svc.putExtra(ElderHelperService.EXTRA_CHANNEL, ElderHelperService.CHANNEL_SMS);

        ServiceStarter.startCommandService(context, svc);
    }

    private boolean numbersMatch(String a, String b) {
        String na = digits(a), nb = digits(b);
        if (na.equals(nb)) return true;
        int la = na.length(), lb = nb.length();
        if (la >= 10 && lb >= 10)
            return na.substring(la - 10).equals(nb.substring(lb - 10));
        return false;
    }

    private String digits(String s) { return s.replaceAll("[^0-9]", ""); }
}
