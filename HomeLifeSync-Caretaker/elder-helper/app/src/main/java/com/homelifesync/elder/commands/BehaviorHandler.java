package com.homelifesync.elder.commands;

import android.content.Context;

import com.homelifesync.elder.service.ElderHelperService.ReplyCallback;
import com.homelifesync.elder.util.PrefsHelper;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Behaviour / AI-report commands: NOINACT, BEHAVFLAG, NIGHTMOVE, INACTALERT,
 * WAKEPAT, ROUTINECOMPARE, ROUTINELOG + the five AI reports
 * (AIWEEK, AIPATTERN, AIMOOD, AIPREDICT, AIREMIND).
 *
 * These are heuristic but data-backed: they read the live vitals stream
 * (HealthHandler), the condition-event log, the daily reminder counters and
 * the elapsed-downtime tracker that ElderHelperService updates on every
 * command, so the answers are real device state rather than canned strings.
 */
public class BehaviorHandler {

    private static final String KEY_NIGHT     = "night_move_alerts";
    private static final String KEY_INACT     = "inact_alerts";
    private static final String KEY_EVENTS    = "health_events";      // cond@ts;cond@ts;…
    private static final String KEY_MED_LAST  = "last_med_reminder";
    private static final String KEY_BED_LAST  = "last_bedtime_reminder";

    private final Context     context;
    private final PrefsHelper prefs;

    public BehaviorHandler(Context ctx) {
        context = ctx;
        prefs   = new PrefsHelper(ctx);
    }

    /** Last time ANY command/activity was observed on this phone. */
    public static volatile long lastActivityMs = System.currentTimeMillis();
    public static void touch() { lastActivityMs = System.currentTimeMillis(); }

    // ── Safety / behaviour ────────────────────────────────────────────

    /** NOINACT — how many minutes since the device last acted. */
    public void noInact(ReplyCallback cb) {
        long mins = (System.currentTimeMillis() - lastActivityMs) / 60_000;
        cb.reply("🕐 Last activity " + mins + " min ago"
            + (mins > 60
                ? "\n⚠️ Long inactivity — consider a CHECKIN or RING."
                : "\n✅ Device responding normally."));
    }

    /** BEHAVFLAG — most notable current behaviour anomaly. */
    public void behavFlag(ReplyCallback cb) {
        List<String> flags = new ArrayList<>();
        if (!"OK".equals(HealthHandler.getSeverity()))
            flags.add("Active condition: " + HealthHandler.getCondition() +
                " (" + HealthHandler.getSeverity() + ")");
        if (SafetyHandler.sosActive)         flags.add("🆘 SOS alarm active");
        if (MessagingHandler.isAutoReplyEnabled(context))
            flags.add("🤖 Auto-replies are ON");
        if ("unlocked".equals(new HomeHandler(context).getDeviceState("door", "locked"))
                && prefs.getPrefs().getBoolean(KEY_NIGHT, false))
            flags.add("🚪 Door unlocked + night-alerts ON");

        cb.reply(flags.isEmpty()
            ? "✅ No unusual behaviour flagged."
            : "⚠️ Flags:\n• " + String.join("\n• ", flags));
    }

    /** NIGHTMOVE / NIGHTMOVE on|off — night movement alert toggle. */
    public void nightMove(ReplyCallback cb, String arg) {
        boolean on;
        if ("on".equalsIgnoreCase(arg))          on = true;
        else if ("off".equalsIgnoreCase(arg))    on = false;
        else on = !prefs.getPrefs().getBoolean(KEY_NIGHT, false);
        prefs.getPrefs().edit().putBoolean(KEY_NIGHT, on).apply();
        cb.reply("🌙 Night-movement alerts " + (on ? "ON" : "OFF") + ".");
    }

    /** INACTALERT on|off — inactivity alert toggle. */
    public void inactAlert(ReplyCallback cb, String arg) {
        boolean on;
        if ("on".equalsIgnoreCase(arg))          on = true;
        else if ("off".equalsIgnoreCase(arg))    on = false;
        else on = !prefs.getPrefs().getBoolean(KEY_INACT, false);
        prefs.getPrefs().edit().putBoolean(KEY_INACT, on).apply();
        cb.reply("⏰ Inactivity alerts " + (on ? "ON" : "OFF") + ".");
    }

    /** WAKEPAT — heuristic sleep/wake estimate from the activity log. */
    public void wakePat(ReplyCallback cb) {
        long now = System.currentTimeMillis();
        SimpleDateFormat h24 = new SimpleDateFormat("HH:mm", Locale.US);
        cb.reply("🌅 Wake pattern (approximate, from SMS/notification activity):\n"
            + "• Last wake/active window: " + h24.format(new Date(lastActivityMs))
            + " (today)\n"
            + "• Current hour: " + h24.format(new Date(now))
            + (isNight(now) ? " — in evening rest window 🌙" : " — daytime ☀️")
            + "\n• Bedtime reminder sent: "
            + prefs.getPrefs().getString(KEY_BED_LAST, "never"));
    }

    /** ROUTINELOG — today's reminder summary. */
    public void routineLog(ReplyCallback cb) {
        int today = routineCount(todayKey());
        cb.reply("📆 Routine log — " + dated() + ":\n"
            + "• Reminders delivered: " + today + "\n"
            + "• Last medicine reminder: "
            + prefs.getPrefs().getString(KEY_MED_LAST, "none yet"));
    }

    /** ROUTINECOMPARE — today vs yesterday. */
    public void routineCompare(ReplyCallback cb) {
        int today = routineCount(todayKey());
        int yday  = routineCount(yesterdayKey());
        cb.reply("📊 Routine compare:\n"
            + "• Today: " + today + " reminders\n"
            + "• Yesterday: " + yday + " reminders\n"
            + "• Trend: " + (today == yday ? "same ➡️" : today > yday ? "more active 📈" : "less active 📉"));
    }

    // ── AI reports ────────────────────────────────────────────────────

    /** AIWEEK — condition events across the last 7 days. */
    public void aiWeek(ReplyCallback cb) {
        List<String[]> evs = healthEvents();
        java.util.Map<String, Integer> counts = new java.util.HashMap<>();
        int warnings = 0;
        for (String[] ev : evs) {
            counts.merge(ev[0], 1, Integer::sum);
            if (!"OK".equals(ev[1])) warnings++;
        }
        StringBuilder sb = new StringBuilder("🧠 AIWEEK — 7-day health summary:\n");
        if (counts.isEmpty()) {
            sb.append("No condition events triggered (all clear ✅).");
        } else {
            counts.forEach((c, n) -> sb.append("• ").append(c).append(" ×").append(n).append("\n"));
        }
        sb.append("Alert-level events: ").append(warnings);
        cb.reply(sb.toString());
    }

    /** AIPATTERN — deviations from normal vitals right now. */
    public void aiPattern(ReplyCallback cb) {
        List<String> d = new ArrayList<>();
        int hr  = HealthHandler.getHr();
        int rr  = HealthHandler.getRR();
        int sys = HealthHandler.getSys();
        int spo2 = HealthHandler.getSpo2();
        if (hr < 55 || hr > 105)          d.add("heart rate " + hr + " bpm");
        if (rr < 12 || rr > 20)           d.add("breathing " + rr + "/min");
        if (sys < 105 || sys > 150)       d.add("systolic BP " + sys);
        if (spo2 < 94)                    d.add("SpO₂ " + spo2 + "%");
        if (!"OK".equals(HealthHandler.getSeverity()))
            d.add("active " + HealthHandler.getCondition());
        cb.reply(d.isEmpty()
            ? "🧠 AIPATTERN: vitals inside normal bands ✅"
            : "🧠 AIPATTERN flags: " + String.join(", ", d));
    }

    /** AIMOOD — stress/activity estimate from HR + severity. */
    public void aiMood(ReplyCallback cb) {
        int hr = HealthHandler.getHr();
        String mood;
        if (!"OK".equals(HealthHandler.getSeverity()))
            mood = "Distress sign — " + HealthHandler.getCondition() + " active ⚠️";
        else if (hr > 88)  mood = "Elevated / stressed 😐";
        else if (hr < 64)  mood = "Resting / calm 🧘";
        else               mood = "Comfortable, low stress 😊";
        cb.reply("🧠 AIMOOD (HR " + hr + " bpm): " + mood
            + "\n(Heuristic from live vitals — not a clinical assessment.)");
    }

    /** AIPREDICT — risk text from current severity + trend. */
    public void aiPredict(ReplyCallback cb) {
        String sev = HealthHandler.getSeverity();
        String risk;
        switch (sev) {
            case "CRITICAL": risk = "HIGH — seek immediate attention. Simulated condition is CRITICAL."; break;
            case "WARNING":  risk = "MODERATE — monitor closely; condition active.";                    break;
            default:         risk = "LOW — no active anomaly observed.";                                break;
        }
        cb.reply("🧠 AIPREDICT:\nRisk level: " + risk
            + "\n(ML placeholder — improve with a real model + longitudinal data.)");
    }

    /** AIREMIND — suggest routine follow-ups from last reminder times. */
    public void aiRemind(ReplyCallback cb) {
        String med = prefs.getPrefs().getString(KEY_MED_LAST, null);
        cb.reply("🧠 AIREMIND:\n"
            + (med == null
                ? "• Medicine reminder never sent — suggest MEDR now 💊"
                : "• Last medicine reminder: " + med + " — next dose window approaching ⏰")
            + "\n• Suggest: WATERREM, DAYEND, or MEDR from the caretaker app.");
    }

    // ── shared data helpers ──────────────────────────────────────────

    /** Persisted "condition@ts" / "condition@severity@ts" event log. */
    public static void appendHealthEvent(Context ctx, String condition, String severity) {
        PrefsHelper p = new PrefsHelper(ctx);
        String cur = p.getPrefs().getString(KEY_EVENTS, "");
        List<String> items = new ArrayList<>();
        if (cur != null && !cur.isEmpty())
            for (String s : cur.split(";")) if (!s.isEmpty()) items.add(s);
        items.add(condition + "@" + severity + "@" + System.currentTimeMillis());
        while (items.size() > 200) items.remove(0);
        p.getPrefs().edit().putString(KEY_EVENTS, String.join(";", items)).apply();
    }

    private List<String[]> healthEvents() {
        List<String[]> out = new ArrayList<>();
        String cur = prefs.getPrefs().getString(KEY_EVENTS, "");
        if (cur == null) return out;
        long cutoff = System.currentTimeMillis() - 7L * 24 * 3600 * 1000;
        for (String s : cur.split(";")) {
            String[] p = s.split("@");
            if (p.length >= 3 && Long.parseLong(p[2]) >= cutoff) {
                out.add(new String[]{ p[0], p[1], p[2] });
            }
        }
        return out;
    }

    private static boolean isNight(long t) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.setTimeInMillis(t);
        int h = c.get(java.util.Calendar.HOUR_OF_DAY);
        return h >= 21 || h < 6;
    }

    // ── routine counters ─────────────────────────────────────────────

    public static void logReminder(Context ctx, String kind) {
        PrefsHelper p = new PrefsHelper(ctx);
        String day = new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
        p.getPrefs().edit()
            .putInt("routine_day:" + day,
                p.getPrefs().getInt("routine_day:" + day, 0) + 1)
            .apply();
        if (kind != null) {
            String key = kind.equals("MED") ? KEY_MED_LAST : KEY_BED_LAST;
            p.getPrefs().edit()
                .putString(key,
                    new SimpleDateFormat("HH:mm", Locale.US).format(new Date()))
                .apply();
        }
    }

    private int routineCount(String day) {
        return prefs.getPrefs().getInt("routine_day:" + day, 0);
    }

    private static String todayKey() {
        return new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
    }

    private static String yesterdayKey() {
        long y = System.currentTimeMillis() - 24L * 3600 * 1000;
        return new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date(y));
    }

    private static String dated() {
        return new SimpleDateFormat("EEE dd MMM yyyy", Locale.US).format(new Date());
    }
}