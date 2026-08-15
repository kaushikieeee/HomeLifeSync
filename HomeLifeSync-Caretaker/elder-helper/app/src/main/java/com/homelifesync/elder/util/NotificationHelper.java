package com.homelifesync.elder.util;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.MainActivity;
import com.homelifesync.elder.R;

public class NotificationHelper {

    private static final String SOS_CHANNEL_ID   = "elder_helper_sos";
    private static final String SOS_CHANNEL_NAME = "SOS Alerts";
    private static final int    SOS_NOTIF_ID     = 1002;
    private static final int    MEDICAL_NOTIF_ID = 1003;

    private NotificationHelper() {}

    /** Call once on first launch / service start. */
    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        // Main low-importance channel for persistent service notification
        NotificationChannel main = new NotificationChannel(
            Constants.CHANNEL_ID, "Elder Helper Service",
            NotificationManager.IMPORTANCE_LOW);
        main.setDescription("Keeps Elder Helper running in background");
        main.setShowBadge(false);
        nm.createNotificationChannel(main);

        // High-importance channel for SOS / reminders
        NotificationChannel sos = new NotificationChannel(
            SOS_CHANNEL_ID, SOS_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH);
        sos.setDescription("Emergency alerts and reminders");
        sos.enableVibration(true);
        sos.setVibrationPattern(new long[]{0, 500, 200, 500});
        nm.createNotificationChannel(sos);
    }

    /** Persistent foreground-service notification shown in status bar. */
    public static Notification buildNotification(Context context) {
        Intent tap = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 0, tap,
            PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, Constants.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Elder Helper Active")
            .setContentText("Listening for caretaker commands…")
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pi)
            .build();
    }

    /** Full-screen SOS notification on the elder's screen. */
    public static void showSosNotification(Context context) {
        Intent tap = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 1, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(context, SOS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("🆘 SOS Alert")
            .setContentText("Your caretaker triggered an SOS. Tap to open.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(false)
            .setOngoing(true)
            .setFullScreenIntent(pi, true)
            .setVibrate(new long[]{0, 500, 200, 500, 200, 500})
            .setContentIntent(pi)
            .build();

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(SOS_NOTIF_ID, n);
    }

    public static void cancelSosNotification(Context context) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(SOS_NOTIF_ID);
    }

    /** Full-screen medical alert (health emergency) on the elder's screen. */
    public static void showMedicalAlert(Context context, String condition, int hr) {
        showMedicalAlert(context, condition, "WARNING", "Heart rate " + hr + " bpm — caretaker has been alerted.");
    }

    /** Full-screen medical alert with severity + vitals summary. */
    public static void showMedicalAlert(Context context, String condition, String severity, String vitalsSummary) {
        Intent tap = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 2, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(context, SOS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("🫀 " + severity + ": " + condition)
            .setContentText(vitalsSummary + " — caretaker has been alerted.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(false)
            .setOngoing(true)
            .setFullScreenIntent(pi, true)
            .setVibrate(new long[]{0, 600, 300, 600, 300, 900})
            .setContentIntent(pi)
            .build();

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(MEDICAL_NOTIF_ID, n);
    }

    public static void cancelMedicalAlert(Context context) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(MEDICAL_NOTIF_ID);
    }
}
