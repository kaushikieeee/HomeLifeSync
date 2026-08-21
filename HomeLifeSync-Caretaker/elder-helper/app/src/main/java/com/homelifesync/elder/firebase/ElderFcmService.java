package com.homelifesync.elder.firebase;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.homelifesync.elder.Constants;
import com.homelifesync.elder.service.ElderHelperService;
import com.homelifesync.elder.util.PrefsHelper;
import com.homelifesync.elder.util.ServiceStarter;

import java.util.Map;

/**
 * PRIMARY command channel.
 *
 * Firebase delivers a data message (not a notification message) to this
 * service. Android guarantees delivery even when the app is killed —
 * FCM uses a system-level persistent connection that Google Play Services
 * maintains independently of this app.
 *
 * Message payload format (data fields):
 *   cmd      — command string, e.g. "LOC", "RING", "TORCHON"
 *   cmdId    — unique ID so the caretaker can match the reply
 *   sender   — caretaker's UID / identifier for the reply path
 */
public class ElderFcmService extends FirebaseMessagingService {

    private static final String TAG = "ElderFcmService";

    /**
     * Called when a new FCM data message arrives.
     * Works even when the app is in the background or killed.
     */
    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data.isEmpty()) {
            Log.w(TAG, "FCM message had no data payload — ignoring.");
            return;
        }

        String cmd    = data.get("cmd");
        String cmdId  = data.get("cmdId");
        String sender = data.get("sender");   // caretaker node ID for reply routing

        if (cmd == null || cmd.isEmpty()) {
            Log.w(TAG, "FCM message missing 'cmd' field.");
            return;
        }

        Log.d(TAG, "FCM command received: " + cmd + " (id=" + cmdId + ")");

        // Forward to ElderHelperService for execution (same dispatcher as SMS)
        Intent svc = new Intent(this, ElderHelperService.class);
        svc.setAction(ElderHelperService.ACTION_EXECUTE_COMMAND);
        svc.putExtra(ElderHelperService.EXTRA_CMD,    cmd.toUpperCase().trim());
        svc.putExtra(ElderHelperService.EXTRA_CMD_ID, cmdId != null ? cmdId : "");
        svc.putExtra(ElderHelperService.EXTRA_SENDER, sender != null ? sender : "");
        svc.putExtra(ElderHelperService.EXTRA_CHANNEL, ElderHelperService.CHANNEL_FCM);

        ServiceStarter.startCommandService(this, svc);
    }
}
