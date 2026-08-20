package com.homelifesync.elder.commands;

import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;

import java.io.File;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Environment / sensor commands: AMBIENT (light lux), NOISE (mic level in dB),
 * SHAKE (accelerometer peak magnitude), ORIENT (surface orientation) and
 * ACCDATA (X/Y/Z accelerometer vector).
 *
 * Sensor reads (AMBIENT, SHAKE, ACCDATA) run on the main Looper, collect either
 * the first sample or the peak over a fixed window, then reply. NOISE records
 * ~3 s of mic audio via MediaRecorder and reports the peak amplitude in dB.
 */
public class SensorHandler {

    private static final long FIRST_WINDOW_MS = 2000;   // reply on 1st valid sample
    private static final long PEAK_WINDOW_MS  = 3500;   // SHAKE: collect peak
    private static final long NOISE_WINDOW_MS = 3000;

    private final Context       context;
    private final Handler       main    = new Handler(Looper.getMainLooper());
    private final SensorManager sensors;

    public SensorHandler(Context ctx) {
        context = ctx;
        sensors = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
    }

    /** AMBIENT — external light sensor (lux). */
    public void ambient(ReplyCallback cb) {
        sensorCmd(Sensor.TYPE_LIGHT, FIRST_WINDOW_MS, cb, false, v ->
            cb.reply("💡 Ambient light: " + Math.round(v[0]) + " lx"));
    }

    /** SHAKE — peak accelerometer magnitude over the sampling window. */
    public void shake(ReplyCallback cb) {
        sensorCmd(Sensor.TYPE_ACCELEROMETER, PEAK_WINDOW_MS, cb, true, v -> {
            double g = magnitude(v);
            cb.reply(g > 15
                ? "📳 SHAKE detected (peak " + String.format(Locale.US, "%.1f", g) + " m/s²)"
                : "➡️ No shake (peak " + String.format(Locale.US, "%.1f", g) + " m/s²)");
        });
    }

    /** ACCDATA — latest accelerometer X/Y/Z vector. */
    public void accData(ReplyCallback cb) {
        sensorCmd(Sensor.TYPE_ACCELEROMETER, FIRST_WINDOW_MS, cb, true, v ->
            cb.reply("📈 Accelerometer:\nX " + String.format(Locale.US, "%.2f", v[0])
                + " · Y " + String.format(Locale.US, "%.2f", v[1])
                + " · Z " + String.format(Locale.US, "%.2f", v[2])
                + "  (m/s²)"));
    }

    /** ORIENT — portrait / landscape. */
    public void orient(ReplyCallback cb) {
        int o = context.getResources().getConfiguration().orientation;
        cb.reply("📐 Orientation: "
            + (o == Configuration.ORIENTATION_LANDSCAPE ? "Landscape"
               : o == Configuration.ORIENTATION_PORTRAIT ? "Portrait"
               : "Unknown"));
    }

    /** NOISE — average microphone level (dB) over ~3 s of recording. */
    public void noise(ReplyCallback cb) {
        if (ContextCompat.checkSelfPermission(context,
                android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            cb.reply("❌ RECORD_AUDIO permission needed for noise level.");
            return;
        }
        main.post(() -> {
            MediaRecorder rec = null;
            File f = null;
            try {
                f = File.createTempFile("noise_", ".m4a", context.getCacheDir());
                rec = new MediaRecorder();
                rec.setAudioSource(MediaRecorder.AudioSource.MIC);
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                rec.setOutputFile(f.getAbsolutePath());
                rec.prepare();
                rec.start();
                float maxAmp = 0;
                long start = System.currentTimeMillis();
                while (System.currentTimeMillis() - start < NOISE_WINDOW_MS) {
                    try {
                        float a = rec.getMaxAmplitude();
                        if (a > maxAmp) maxAmp = a;
                    } catch (IllegalStateException ignored) {}
                    Thread.sleep(250);
                }
                rec.stop();
                double db = maxAmp > 0 ? 20.0 * Math.log10(maxAmp) : 0;
                cb.reply("🎤 Noise level: ~" + Math.round(db) + " dB"
                    + (db > 75 ? " 🔊 LOUD" : ""));
            } catch (Exception e) {
                cb.reply("❌ Could not sample noise: "
                    + (e.getMessage() != null ? e.getMessage()
                        : e.getClass().getSimpleName()));
            } finally {
                try { if (rec != null) rec.release(); } catch (Exception ignored) {}
                if (f != null) { try { f.delete(); } catch (Exception ignored) {} }
            }
        });
    }

    // ── shared sensor sampling ──────────────────────────────────────

    /**
     * Sample a one-shot sensor. If {@code peak} is true, keeps the largest
     * |magnitude| sample until the window elapses; otherwise replies on the
     * first valid sample and gives up after FIRST_WINDOW_MS.
     */
    private void sensorCmd(int sensorType, final long windowMs,
                           ReplyCallback cb, boolean peak,
                           Consumer<float[]> onValue) {
        Sensor s = sensors != null ? sensors.getDefaultSensor(sensorType) : null;
        if (s == null) {
            cb.reply("❌ No " + name(sensorType) + " sensor on this device.");
            return;
        }
        AtomicBoolean finished = new AtomicBoolean(false);
        final float[] peakVal = {0, 0, 0};
        final float[] peakMag = {Float.MIN_VALUE};

        SensorEventListener l = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent e) {
                if (finished.get()) return;
                if (peak) {
                    float m = magnitude(e.values);
                    if (m > peakMag[0]) {
                        peakMag[0] = m;
                        System.arraycopy(e.values, 0, peakVal, 0, 3);
                    }
                } else {
                    finished.set(true);
                    sensors.unregisterListener(this);
                    onValue.accept(e.values.clone());
                }
            }
            @Override public void onAccuracyChanged(Sensor s, int a) {}
        };

        main.post(() -> sensors.registerListener(l, s,
            peak ? SensorManager.SENSOR_DELAY_UI : SensorManager.SENSOR_DELAY_GAME));

        main.postDelayed(() -> {
            if (finished.compareAndSet(false, true)) {
                sensors.unregisterListener(l);
                if (peak) {
                    if (peakMag[0] == Float.MIN_VALUE)
                        cb.reply("❌ No " + name(sensorType) + " reading within "
                            + (windowMs / 1000) + " s.");
                    else
                        onValue.accept(peakVal);
                } else {
                    cb.reply("❌ No " + name(sensorType) + " reading within "
                        + (windowMs / 1000) + " s.");
                }
            }
        }, windowMs);
    }

    private static float magnitude(float[] v) {
        return (float) Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static String name(int type) {
        switch (type) {
            case Sensor.TYPE_LIGHT:          return "light";
            case Sensor.TYPE_ACCELEROMETER:  return "accelerometer";
            default:                         return "sensor";
        }
    }
}