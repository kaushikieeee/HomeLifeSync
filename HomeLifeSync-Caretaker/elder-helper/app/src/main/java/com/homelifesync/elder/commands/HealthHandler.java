package com.homelifesync.elder.commands;

import android.content.Context;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.NotificationHelper;

import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Placeholder "health monitor" for the elder device.
 *
 * Mirrors lib/health.ts on the caretaker side (see HEALTH_MONITORING.md):
 * simulates ALL six vitals (heart rate, SpO₂, temperature, respiratory rate,
 * blood pressure, glucose) as a continuous random walk around the active
 * scenario's targets, streams them to Firebase status, and — when a condition
 * is simulated — raises the alarm, shows a full-screen alert and writes a
 * HEALTH alert to /devices/{id}/alerts/ for the caretaker to hear.
 */
public class HealthHandler {

    private static final String TAG = "HealthHandler";
    private static final long   TICK_MS  = 2000;
    private static final int    ALARM_MS = 20_000;

    private static volatile double currentHr        = 72;
    private static volatile double currentSpo2      = 98;
    private static volatile double currentTemp      = 36.7;
    private static volatile double currentRR        = 16;
    private static volatile double currentSys       = 120;
    private static volatile double currentDia       = 78;
    private static volatile double currentGlucose   = 110;

    private static volatile String currentCondition = "NORMAL";
    private static volatile String currentSeverity  = "OK";

    private static HealthHandler instance;

    // ── Wearable history (HR NOW / AVG / PEAK / LOW / TREND) ──────────
    // Rolling buffer shared across all owners. Filled every tick → supports
    // HRNOW, HRAVG, HRPEAK, HRLOW and a short HRTREND without a real band.
    private static final int    HISTORY_CAP   = 256;
    private static final double[] hrHistory   = new double[HISTORY_CAP];
    private static       int    hrHistoryN    = 0;

    private final Context context;
    private final Handler  main          = new Handler(Looper.getMainLooper());
    private final Handler  ticker        = new Handler(Looper.getMainLooper());
    private final Random   rng           = new Random();
    private       boolean  ticking       = false;
    private       int      owners        = 0;
    private       MediaPlayer alarmPlayer;

    // Active scenario targets + heart-rate variability (for arrhythmia looks)
    private volatile double targetHr      = 72;
    private volatile double targetSpo2    = 98;
    private volatile double targetTemp    = 36.7;
    private volatile double targetRR      = 16;
    private volatile double targetSys     = 120;
    private volatile double targetDia     = 78;
    private volatile double targetGlucose = 110;
    private volatile double variance      = 0;

    // ── Scenario table (same conditions as caretaker lib/health.ts) ──
    private static final class Scenario {
        final String condition, severity;
        final double hr, spo2, temp, rr, sys, dia, glucose;
        final double variance;
        Scenario(String condition, String severity, double hr, double spo2, double temp,
                 double rr, double sys, double dia, double glucose, double variance) {
            this.condition = condition; this.severity = severity;
            this.hr = hr; this.spo2 = spo2; this.temp = temp; this.rr = rr;
            this.sys = sys; this.dia = dia; this.glucose = glucose; this.variance = variance;
        }
        static Scenario normal() {
            return new Scenario("NORMAL", "OK", 72, 98, 36.7, 16, 120, 78, 110, 0);
        }
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            stepVitals();
            pushStatus();
            ticker.postDelayed(this, TICK_MS);
        }
    };

    private HealthHandler(Context ctx) { context = ctx.getApplicationContext(); }

    public static synchronized HealthHandler get(Context ctx) {
        if (instance == null) instance = new HealthHandler(ctx);
        return instance;
    }

    /**
     * Each owner (MainActivity + ElderHelperService) calls start()/stop().
     * The ticker stays alive while at least one owner is around, so stopping
     * the dashboard never kills the service's vitals stream and vice-versa.
     */
    public synchronized void start() {
        owners++;
        if (ticking) return;
        ticking = true;
        ticker.removeCallbacks(tick);
        ticker.post(tick);
    }

    public synchronized void stop() {
        owners = Math.max(0, owners - 1);
        if (owners > 0 || !ticking) return;
        ticking = false;
        ticker.removeCallbacks(tick);
        stopAlarm();
    }

    // ── Accessors (UI) ──────────────────────────────────────────────

    public static int     getHr()        { return (int) Math.round(currentHr); }
    public static int     getSpo2()      { return (int) Math.round(currentSpo2); }
    public static double  getTemp()      { return currentTemp; }
    public static int     getRR()        { return (int) Math.round(currentRR); }
    public static int     getSys()       { return (int) Math.round(currentSys); }
    public static int     getDia()       { return (int) Math.round(currentDia); }
    public static int     getGlucose()   { return (int) Math.round(currentGlucose); }
    public static String  getCondition() { return currentCondition; }
    public static String  getSeverity()  { return currentSeverity; }

    // ── Wearable HR queries (HRNOW, HRAVG, HRPEAK, HRLOW, HRTREND) ────

    /** HRNOW — current reading from the wearable stream. */
    public static String hrNow() {
        return "❤️ HR now: " + getHr() + " bpm"
            + " (SpO₂ " + (int) Math.round(currentSpo2) + "%)"
            + ("OK".equals(currentSeverity) ? "" : " · state: " + currentCondition);
    }

    /** HRAVG — average over the buffered sample window. */
    public static String hrAvg() {
        double[] w = window();
        if (w.length == 0) return "❌ No HR samples yet.";
        double sum = 0; for (double v : w) sum += v;
        return "📈 Avg HR (" + w.length + " samples): "
            + Math.round(sum / w.length) + " bpm";
    }

    /** HRPEAK — highest reading in the buffer (+ rough time). */
    public static String hrPeak() {
        double[] w = window();
        if (w.length == 0) return "❌ No HR samples yet.";
        double peak = w[0]; for (double v : w) if (v > peak) peak = v;
        return "⛰️ HR peak (window): " + Math.round(peak) + " bpm";
    }

    /** HRLOW — lowest reading in the buffer. */
    public static String hrLow() {
        double[] w = window();
        if (w.length == 0) return "❌ No HR samples yet.";
        double low = w[0]; for (double v : w) if (v < low) low = v;
        return "🍃 HR low (window): " + Math.round(low) + " bpm";
    }

    /** HRTREND — last 8 readings + direction (up/down/stable). */
    public static String hrTrend() {
        double[] w = window();
        if (w.length < 2) return "❌ Not enough HR history yet.";
        StringBuilder sb = new StringBuilder("🔀 HR trend (recent):\n");
        int start = Math.max(0, w.length - 8);
        double first = 0, last = 0;
        for (int i = start; i < w.length; i++) {
            sb.append(Math.round(w[i])).append(" bpm");
            if (i < w.length - 1) sb.append(" → ");
            if (i == start) last = w[i];
            first = w[i];
        }
        double d = first - last;
        sb.append("\nDirection: ")
          .append(d > 4 ? "Rising 📈" : d < -4 ? "Falling 📉" : "Stable ➡️");
        return sb.toString();
    }

    private static double[] window() {
        int n = Math.min(hrHistoryN, HISTORY_CAP);
        double[] out = new double[n];
        int off = Math.max(0, hrHistoryN - n);
        for (int i = 0; i < n; i++) out[i] = hrHistory[(off + i) % HISTORY_CAP];
        return out;
    }

    /**
     * Simulate a condition. command is one of the 15 scenarios in
     * HEALTH_MONITORING.md (HRNORMAL … HYPOGLYCEMIA).
     */
    public void simulate(String cmd, ReplyCallback cb) {
        Scenario s = apply(cmd);
        if (s == null) {
            if (cb != null) cb.reply("❓ Unknown health condition: " + cmd);
            return;
        }

        stepVitals();
        pushStatus();

        // CRITICAL → full-screen alert + looping alarm.
        // WARNING → notification only, no siren.
        // OK     → clear any started alert/alarm.
        if ("CRITICAL".equals(currentSeverity)) {
            raiseAlert(true);
        } else if ("WARNING".equals(currentSeverity)) {
            raiseAlert(false);
        } else {
            stopAlarm();
            NotificationHelper.cancelMedicalAlert(context);
        }

        if (cb != null) {
            String reply = "🫀 Health simulation → " + currentCondition
                + " (" + getHr() + " bpm, " + (int) Math.round(currentSpo2) + "% SpO₂, "
                + String.format(Locale.US, "%.1f", currentTemp) + "°C)";
            cb.reply(reply);
        }
    }

    private Scenario apply(String cmd) {
        Scenario s;
        switch (cmd) {
            case "HRNORMAL":      s = Scenario.normal();           break;
            case "HRMI":          s = new Scenario("MYOCARDIAL INFARCTION", "CRITICAL", 30,  92, 36.7, 16, 85, 55, 110, 6);  break;
            case "HRAFIB":        s = new Scenario("ATRIAL FIBRILLATION",  "CRITICAL", 135, 98, 36.7, 16, 120, 78, 110, 34); break;
            case "HRTACHY":       s = new Scenario("TACHYCARDIA",         "CRITICAL", 165, 98, 36.7, 16, 120, 78, 110, 8);  break;
            case "HRBRADY":       s = new Scenario("BRADYCARDIA",         "CRITICAL", 42,  98, 36.7, 16, 120, 78, 110, 4);  break;
            case "HRARRHY":       s = new Scenario("ARRHYTHMIA",          "WARNING",  95,  98, 36.7, 16, 120, 78, 110, 24); break;
            case "HYPOXIA":       s = new Scenario("HYPOXIA",             "CRITICAL", 72,  87, 36.7, 16, 120, 78, 110, 0);  break;
            case "FEVER":         s = new Scenario("HIGH FEVER",          "CRITICAL", 88,  98, 39.5, 18, 120, 78, 110, 0);  break;
            case "HYPOTHERMIA":   s = new Scenario("HYPOTHERMIA",         "CRITICAL", 52,  96, 33.0, 10, 100, 65, 90,  0);  break;
            case "BPCRISIS":      s = new Scenario("HYPERTENSIVE CRISIS", "CRITICAL", 88,  97, 36.8, 18, 188, 128, 120, 0); break;
            case "HYPOTENSION":   s = new Scenario("HYPOTENSION",         "CRITICAL", 98,  97, 36.5, 14, 82,  50, 100, 0);  break;
            case "TACHYPNEA":     s = new Scenario("TACHYPNEA",           "CRITICAL", 78,  95, 36.7, 32, 118, 76, 110, 0);  break;
            case "BRADYPNEA":     s = new Scenario("BRADYPNEA",           "CRITICAL", 60,  94, 36.6, 5,  110, 70, 100, 0);  break;
            case "HYPERGLYCEMIA": s = new Scenario("HYPERGLYCEMIA",       "CRITICAL", 72,  98, 36.7, 16, 120, 78, 300, 0);  break;
            case "HYPOGLYCEMIA":  s = new Scenario("HYPOGLYCEMIA",        "CRITICAL", 62,  98, 36.6, 14, 110, 70, 48,  0);  break;
            default:
                return null;
        }

        currentCondition = s.condition;
        currentSeverity  = s.severity;
        BehaviorHandler.appendHealthEvent(context, s.condition, s.severity);
        currentHr      = targetHr      = s.hr;
        currentSpo2    = targetSpo2    = s.spo2;
        currentTemp    = targetTemp    = s.temp;
        currentRR      = targetRR      = s.rr;
        currentSys     = targetSys     = s.sys;
        currentDia     = targetDia     = s.dia;
        currentGlucose = targetGlucose = s.glucose;
        variance       = s.variance;
        return s;
    }

    /** Random walk each vital around the active scenario's targets. */
    private void stepVitals() {
        currentHr      = walk(currentHr,      targetHr,      4);
        currentSpo2    = walk(currentSpo2,    targetSpo2,    1);
        currentTemp    = walk(currentTemp,    targetTemp,    0.15);
        currentRR      = walk(currentRR,      targetRR,      2);
        currentSys     = walk(currentSys,     targetSys,     4);
        currentDia     = walk(currentDia,     targetDia,     3);
        currentGlucose = walk(currentGlucose, targetGlucose, 4);
        recordHr(currentHr);
    }

    private static void recordHr(double hr) {
        hrHistory[hrHistoryN % HISTORY_CAP] = hr;
        hrHistoryN++;
    }

    private double walk(double cur, double tg, double spread) {
        if (variance > 0 && rng.nextDouble() < 0.55)
            return round1(tg + (rng.nextDouble() - 0.5) * variance * 2);
        double n = cur + (rng.nextDouble() - 0.5) * 2 * spread;
        double lo = tg - 5, hi = tg + 5;
        if (n < lo) n = lo;
        if (n > hi) n = hi;
        return round1(n);
    }

    private static double round1(double v) { return Math.round(v * 10.0) / 10.0; }

    private void pushStatus() {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("heartRate",      currentHr);
        m.put("spo2",           currentSpo2);
        m.put("temperature",    currentTemp);
        m.put("respiratoryRate", currentRR);
        m.put("systolic",       currentSys);
        m.put("diastolic",      currentDia);
        m.put("glucose",        currentGlucose);
        m.put("heartCondition", currentCondition);
        m.put("heartSeverity",  currentSeverity);
        FirebaseRepository.get(context).updateStatus(m);
    }

    private void raiseAlert(boolean alarming) {
        String summary = "HR " + getHr()
            + " · SpO₂ " + (int) Math.round(currentSpo2) + "%"
            + " · " + String.format(Locale.US, "%.1f", currentTemp) + "°C"
            + " · BP " + (int) Math.round(currentSys) + "/" + (int) Math.round(currentDia)
            + " · RR " + (int) Math.round(currentRR) + "/min"
            + " · Glu " + (int) Math.round(currentGlucose);

        NotificationHelper.showMedicalAlert(context, currentCondition, currentSeverity, summary);

        if (alarming) {
            main.post(() -> {
                try {
                    stopAlarm();
                    AudioManager am =
                        (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                    am.setStreamVolume(AudioManager.STREAM_ALARM,
                        am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
                    Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    alarmPlayer = MediaPlayer.create(context, uri);
                    if (alarmPlayer != null) {
                        alarmPlayer.setLooping(true);
                        alarmPlayer.start();
                        main.removeCallbacks(stopAlarmRunnable);
                        main.postDelayed(stopAlarmRunnable, ALARM_MS);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Alarm error", e);
                }
            });
        }

        Map<String, Object> vitals = new java.util.HashMap<>();
        vitals.put("hr",              currentHr);
        vitals.put("spo2",            currentSpo2);
        vitals.put("temperature",     currentTemp);
        vitals.put("respiratoryRate", currentRR);
        vitals.put("systolic",        currentSys);
        vitals.put("diastolic",       currentDia);
        vitals.put("glucose",         currentGlucose);
        FirebaseRepository.get(context).writeAlert(currentCondition, currentSeverity, vitals);
    }

    private final Runnable stopAlarmRunnable = this::stopAlarm;

    private void stopAlarm() {
        if (alarmPlayer != null) {
            try { if (alarmPlayer.isPlaying()) alarmPlayer.stop(); alarmPlayer.release(); }
            catch (Exception ignored) {}
            alarmPlayer = null;
        }
    }
}