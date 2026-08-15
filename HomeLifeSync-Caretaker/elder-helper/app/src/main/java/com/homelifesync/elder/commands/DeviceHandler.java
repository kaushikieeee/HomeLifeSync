package com.homelifesync.elder.commands;

import android.app.NotificationManager;
import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

/** Handles: RING, ALRM, TORCHON, TORCHOFF, VIBRATE, MUTE, UNMUTE,
 *           SILENT, VOLMAX, VOLLOW, SCREENON, SCREENDIM, SCREENMAX */
public class DeviceHandler {

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaPlayer   player;

    public DeviceHandler(Context ctx) { context = ctx; }

    public void ring(ReplyCallback cb) {
        mainHandler.post(() -> {
            stopPlayer();
            AudioManager am = am();
            am.setStreamVolume(AudioManager.STREAM_RING,
                am.getStreamMaxVolume(AudioManager.STREAM_RING), 0);
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player  = MediaPlayer.create(context, uri);
            if (player == null)
                player = MediaPlayer.create(context,
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
            if (player != null) {
                player.setLooping(true);
                player.start();
                mainHandler.postDelayed(this::stopPlayer, 30_000);
            }
        });
        cb.reply("🔔 Ringing for 30 s.");
    }

    public void alarm(ReplyCallback cb) {
        mainHandler.post(() -> {
            stopPlayer();
            AudioManager am = am();
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            player  = MediaPlayer.create(context, uri);
            if (player != null) {
                player.setLooping(true);
                player.start();
                mainHandler.postDelayed(this::stopPlayer, 60_000);
            }
        });
        cb.reply("🚨 Alarm sounding for 60 s.");
    }

    public void torch(ReplyCallback cb, boolean on) {
        CameraManager cm = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        try {
            cm.setTorchMode(cm.getCameraIdList()[0], on);
            cb.reply("🔦 Flashlight " + (on ? "ON" : "OFF"));
        } catch (CameraAccessException e) {
            cb.reply("❌ Flashlight error: " + e.getMessage());
        }
    }

    public void vibrate(ReplyCallback cb) {
        Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null && v.hasVibrator()) {
            long[] pat = {0, 500, 200, 500, 200, 500};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                v.vibrate(VibrationEffect.createWaveform(pat, -1));
            else v.vibrate(pat, -1);
        }
        cb.reply("📳 Vibrating.");
    }

    public void setMute(ReplyCallback cb, boolean mute) {
        am().adjustStreamVolume(AudioManager.STREAM_RING,
            mute ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0);
        cb.reply(mute ? "🔇 Muted." : "🔊 Unmuted.");
    }

    public void setSilent(ReplyCallback cb) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !nm.isNotificationPolicyAccessGranted()) {
            cb.reply("❌ DND permission needed for silent mode."); return;
        }
        am().setRingerMode(AudioManager.RINGER_MODE_VIBRATE);
        cb.reply("📳 Silent/vibrate mode.");
    }

    public void setVolume(ReplyCallback cb, int pct) {
        AudioManager am = am();
        am.setStreamVolume(AudioManager.STREAM_MUSIC,
            am.getStreamMaxVolume(AudioManager.STREAM_MUSIC) * pct / 100, 0);
        am.setStreamVolume(AudioManager.STREAM_RING,
            am.getStreamMaxVolume(AudioManager.STREAM_RING) * pct / 100, 0);
        cb.reply("🔊 Volume → " + pct + "%");
    }

    public void screenOn(ReplyCallback cb) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
            | PowerManager.ACQUIRE_CAUSES_WAKEUP, "ElderHelper:ScreenOn")
            .acquire(10_000);
        cb.reply("💡 Screen on.");
    }

    public void setBrightness(ReplyCallback cb, int value) {
        try {
            Settings.System.putInt(context.getContentResolver(),
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
            Settings.System.putInt(context.getContentResolver(),
                Settings.System.SCREEN_BRIGHTNESS, Math.min(255, Math.max(0, value)));
            cb.reply("💡 Brightness → " + value);
        } catch (Exception e) {
            cb.reply("❌ Brightness change needs WRITE_SETTINGS permission.");
        }
    }

    private AudioManager am() {
        return (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    /** STOPRING — cancel any active RING / ALRM sound immediately. */
    public void stopRing(ReplyCallback cb) {
        mainHandler.post(this::stopPlayer);
        cb.reply("⏹️ Ringing stopped.");
    }

    private void stopPlayer() {
        if (player != null) {
            try { if (player.isPlaying()) player.stop(); player.release(); }
            catch (Exception ignored) {}
            player = null;
        }
    }
}
