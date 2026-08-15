package com.homelifesync.elder.commands;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.MainActivity;
import com.homelifesync.elder.R;
import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.PrefsHelper;

/** Handles: CHECKIN, ACK, IOK, CALLME, AUTOREPLYON, AUTOREPLYOFF */
public class MessagingHandler {

    private static final int    CHECKIN_NOTIF_ID = 2001;
    private static final String PREF_AUTOREPLY   = "auto_reply_enabled";

    private final Context     context;
    private final PrefsHelper prefs;

    // Stores the cmdId of the pending check-in so IOK can reply correctly
    private static volatile String pendingCheckinCmdId = null;

    public MessagingHandler(Context ctx) {
        context = ctx;
        prefs   = new PrefsHelper(ctx);
    }

    /**
     * CHECKIN — show a full-screen "I'm OK" notification on the elder's screen.
     * cmdId is stored so when the elder taps the notification, the IOK reply
     * goes to the correct /replies/{cmdId} path.
     *
     * @param cmdId the command ID — used to route the IOK reply back
     */
    public void checkIn(ReplyCallback cb, String cmdId) {
        pendingCheckinCmdId = cmdId;

        // The tap intent opens MainActivity which calls writeReply(cmdId, "I'm OK")
        Intent tap = new Intent(context, MainActivity.class);
        tap.putExtra("action",  "IOK");
        tap.putExtra("cmd_id",  cmdId);    // used by MainActivity to write reply
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pi = PendingIntent.getActivity(context, 0, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(CHECKIN_NOTIF_ID,
            new NotificationCompat.Builder(context, Constants.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("👋 Are you OK?")
                .setContentText("Your caretaker is checking in. Tap to reply \"I'm OK\".")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .addAction(R.drawable.ic_notification, "I'm OK ✅", pi)
                .build());

        // Immediately confirm to caretaker that notification was shown
        cb.reply("👋 Check-in notification shown on device.");

        // AUTOREPLYON — skip the human tap and answer automatically.
        if (isAutoReplyEnabled(context)) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                NotificationManager nm2 =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                nm2.cancel(CHECKIN_NOTIF_ID);
                pendingCheckinCmdId = null;
                String auto = "💚 I'm OK! — auto-reply";
                if (cmdId != null && !cmdId.isEmpty())
                    FirebaseRepository.get(context).writeReply(cmdId, auto);
                else
                    FirebaseRepository.get(context).writeReply(null, auto);
            }, 5_000);
        }
    }

    /** ACK — generic acknowledgment */
    public void ack(ReplyCallback cb) {
        cb.reply("✅ ACK — command received.");
    }

    /** IOK — elder tapped the notification or caretaker sent IOK directly */
    public void iAmOk(ReplyCallback cb) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(CHECKIN_NOTIF_ID);
        pendingCheckinCmdId = null;
        cb.reply("💚 I'm OK! — confirmed.");
    }

    /** CALLME — elder's device dials the caretaker */
    public void callCaretaker(ReplyCallback cb) {
        String num = prefs.getCaretakerNumber();
        if (num == null || num.isEmpty()) {
            cb.reply("❌ No caretaker number configured."); return;
        }
        try {
            Intent call = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + num));
            call.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(call);
            cb.reply("📞 Calling you now…");
        } catch (SecurityException e) {
            cb.reply("❌ CALL_PHONE permission denied.");
        }
    }

    /** AUTOREPLYON / AUTOREPLYOFF */
    public void setAutoReply(ReplyCallback cb, boolean on) {
        prefs.getPrefs().edit().putBoolean(PREF_AUTOREPLY, on).apply();
        cb.reply("Auto-reply " + (on ? "ON ✅" : "OFF 🔕"));
    }

    public static boolean isAutoReplyEnabled(Context ctx) {
        return new PrefsHelper(ctx).getPrefs().getBoolean(PREF_AUTOREPLY, false);
    }

    public static String getPendingCheckinCmdId() {
        return pendingCheckinCmdId;
    }
}
