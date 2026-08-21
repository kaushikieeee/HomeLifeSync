package com.homelifesync.elder.commands;

import android.content.Context;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.util.NotificationHelper;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

/** Handles: SOS, SOSACK, FALLCHECK, ACTCHECK */
public class SafetyHandler {

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaPlayer   alarmPlayer;

    public static volatile boolean sosActive    = false;
    public static volatile boolean fallDetected = false;

    public SafetyHandler(Context ctx) { context = ctx; }

    public void handleSos(ReplyCallback cb) {
        sosActive = true;
        mainHandler.post(() -> {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            stopAlarm();
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            alarmPlayer = MediaPlayer.create(context, uri);
            if (alarmPlayer != null) {
                alarmPlayer.setLooping(true);
                alarmPlayer.start();
                mainHandler.postDelayed(this::stopAlarm, 120_000);
            }
            // SOS vibration ··· --- ···
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                long[] pat = {0,200,100,200,100,200,400,500,100,500,100,500,400,200,100,200,100,200};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    v.vibrate(VibrationEffect.createWaveform(pat, -1));
                else v.vibrate(pat, -1);
            }
        });
        NotificationHelper.showSosNotification(context);
        publishSosState(true);
        cb.reply("🆘 SOS received!\nAlarm + vibration active.\nSend SOSACK to stop.");
    }

    public void acknowledgeSos(ReplyCallback cb) {
        sosActive = false;
        mainHandler.post(() -> {
            stopAlarm();
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        });
        NotificationHelper.cancelSosNotification(context);
        publishSosState(false);
        cb.reply("✅ SOS acknowledged. Alarm stopped.");
    }

    public void fallCheck(ReplyCallback cb) {
        cb.reply(fallDetected ? "⚠️ FALL detected recently!" : "✅ No fall detected recently.");
    }

    public void activityCheck(ReplyCallback cb) {
        cb.reply("✅ Device active & responding.\nSOS: " + (sosActive ? "ACTIVE 🆘" : "Clear"));
    }

    private void stopAlarm() {
        if (alarmPlayer != null) {
            try { if (alarmPlayer.isPlaying()) alarmPlayer.stop(); alarmPlayer.release(); }
            catch (Exception ignored) {}
            alarmPlayer = null;
        }
    }

    /**
     * Reflect the SOS state everywhere: /status.sos for live badges and a
     * type=SOS /alerts entry so tablets/hubs flip their Safety panel and log
     * the event, even when they join or reconnect mid-alert.
     */
    private void publishSosState(boolean active) {
        try {
            FirebaseRepository db = FirebaseRepository.get(context);
            java.util.Map<String, Object> status = new java.util.HashMap<>();
            status.put("sos", active);
            db.updateStatus(status);

            java.util.Map<String, Object> alert = new java.util.HashMap<>();
            alert.put("type",      "SOS");
            alert.put("condition", active ? "SOS" : "SOS CLEARED");
            alert.put("severity",  active ? "CRITICAL" : "OK");
            alert.put("active",    active);
            alert.put("ts",        System.currentTimeMillis());
            db.getDeviceRef().child("alerts").push().setValue(alert);
        } catch (Exception ignored) {
            // Best-effort — the phone's own alarm still works without Firebase.
        }
    }

    /** Service teardown — stop any ringing SOS alarm. */
    public void stopSounds() {
        sosActive = false;
        mainHandler.post(this::stopAlarm);
    }
}
