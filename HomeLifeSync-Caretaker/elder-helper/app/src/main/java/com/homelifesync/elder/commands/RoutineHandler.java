package com.homelifesync.elder.commands;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.MainActivity;
import com.homelifesync.elder.R;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.util.concurrent.atomic.AtomicInteger;

/** Handles: MEDR, WATERREM, BEDTIME, WAKEUP, DAYSTART, DAYEND */
public class RoutineHandler {

    private static final AtomicInteger notifId = new AtomicInteger(3000);
    private final Context context;

    public RoutineHandler(Context ctx) { context = ctx; }

    public void reminder(ReplyCallback cb, String message) {
        int id = notifId.incrementAndGet();

        Intent tap = new Intent(context, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, id, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id,
            new NotificationCompat.Builder(context, Constants.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(titleFor(message))
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setFullScreenIntent(pi, true)
                .setVibrate(new long[]{0, 400, 200, 400})
                .setContentIntent(pi)
                .build());

        // Chime
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            MediaPlayer mp = MediaPlayer.create(context, uri);
            if (mp != null) { mp.setOnCompletionListener(MediaPlayer::release); mp.start(); }
        } catch (Exception ignored) {}

        // Vibrate
        Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null && v.hasVibrator()) {
            long[] pat = {0, 300, 150, 300, 150, 300};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                v.vibrate(VibrationEffect.createWaveform(pat, -1));
            else v.vibrate(pat, -1);
        }

        cb.reply("🔔 Reminder delivered: " + message);
    }

    private String titleFor(String msg) {
        if (msg.contains("medicine"))   return "💊 Medicine Reminder";
        if (msg.contains("water"))      return "💧 Water Reminder";
        if (msg.contains("Good night")) return "🌙 Bedtime";
        if (msg.contains("morning"))    return "☀️ Wake Up";
        if (msg.contains("Morning"))    return "👋 Morning Check-in";
        if (msg.contains("Evening"))    return "🌙 Evening Check-in";
        return "🔔 Reminder";
    }
}
