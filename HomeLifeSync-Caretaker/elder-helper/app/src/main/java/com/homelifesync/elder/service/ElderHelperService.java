package com.homelifesync.elder.service;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.commands.BatteryHandler;
import com.homelifesync.elder.commands.DeviceHandler;
import com.homelifesync.elder.commands.HealthHandler;
import com.homelifesync.elder.commands.LocationHandler;
import com.homelifesync.elder.commands.MessagingHandler;
import com.homelifesync.elder.commands.NetworkHandler;
import com.homelifesync.elder.commands.RoutineHandler;
import com.homelifesync.elder.commands.SafetyHandler;
import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.util.NotificationHelper;
import com.homelifesync.elder.util.SmsSender;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Persistent foreground service.
 *
 * Command sources:
 *   PRIMARY  — Firebase Realtime DB ChildEventListener (Option A)
 *              Caretaker writes to /devices/{id}/commands/{cmdId}
 *              → onChildAdded fires immediately → dispatch()
 *   FALLBACK — SMS BroadcastReceiver (when no internet)
 *
 * Replies route back through whichever channel delivered the command.
 */
public class ElderHelperService extends Service {

    private static final String TAG = "ElderHelperService";

    // ── Intent contract (used by SMS fallback path) ──────────────────
    public static final String ACTION_EXECUTE_COMMAND = "com.homelifesync.elder.EXECUTE";
    public static final String EXTRA_CMD     = "cmd";
    public static final String EXTRA_CMD_ID  = "cmdId";
    public static final String EXTRA_SENDER  = "sender";
    public static final String EXTRA_CHANNEL = "channel";

    public static final String CHANNEL_FCM = "fcm";   // DB / FCM path
    public static final String CHANNEL_SMS = "sms";   // SMS fallback

    public static volatile boolean isRunning = false;

    private static final long HEARTBEAT_INTERVAL_MS = 60_000;

    private ExecutorService    executor;
    private FirebaseRepository firebase;
    private final Handler      heartbeatHandler = new Handler(Looper.getMainLooper());

    private final Runnable heartbeatTask = new Runnable() {
        @Override public void run() {
            if (!isRunning) return;
            sendHeartbeat();
            heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
        }
    };

    // ── Handlers ─────────────────────────────────────────────────────
    private LocationHandler  locationHandler;
    private DeviceHandler    deviceHandler;
    private BatteryHandler   batteryHandler;
    private NetworkHandler   networkHandler;
    private SafetyHandler    safetyHandler;
    private MessagingHandler messagingHandler;
    private RoutineHandler   routineHandler;
    private HealthHandler    healthHandler;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        executor  = Executors.newFixedThreadPool(3);

        firebase         = FirebaseRepository.get(this);
        locationHandler  = new LocationHandler(this);
        deviceHandler    = new DeviceHandler(this);
        batteryHandler   = new BatteryHandler(this);
        networkHandler   = new NetworkHandler(this);
        safetyHandler    = new SafetyHandler(this);
        messagingHandler = new MessagingHandler(this);
        routineHandler   = new RoutineHandler(this);

        // Continuous fake heart-rate stream + condition simulator
        healthHandler = HealthHandler.get(this);
        healthHandler.start();

        NotificationHelper.createChannel(this);
        startForeground(Constants.NOTIF_ID, NotificationHelper.buildNotification(this));

        // Save FCM token so caretaker can read it
        firebase.refreshAndSaveFcmToken();
        sendHeartbeat();

        // Keep /status.lastSeen fresh so the caretaker dashboard stays ONLINE
        heartbeatHandler.removeCallbacks(heartbeatTask);
        heartbeatHandler.postDelayed(heartbeatTask, HEARTBEAT_INTERVAL_MS);

        // ── Option A: attach DB listener ────────────────────────────
        // Fires whenever caretaker writes a new command to the DB.
        firebase.startCommandListener((cmdId, cmd, sender) ->
            executor.execute(() -> dispatch(cmd, cmdId, sender, CHANNEL_FCM))
        );

        Log.d(TAG, "ElderHelperService started — device: " + firebase.getDeviceId());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // SMS fallback path — SmsReceiver starts the service with this action
        if (intent != null && ACTION_EXECUTE_COMMAND.equals(intent.getAction())) {
            String cmd     = intent.getStringExtra(EXTRA_CMD);
            String cmdId   = intent.getStringExtra(EXTRA_CMD_ID);
            String sender  = intent.getStringExtra(EXTRA_SENDER);
            String channel = intent.getStringExtra(EXTRA_CHANNEL);

            if (cmd != null) {
                executor.execute(() -> dispatch(
                    cmd.toUpperCase().trim(),
                    cmdId   != null ? cmdId   : "",
                    sender  != null ? sender  : "",
                    channel != null ? channel : CHANNEL_SMS
                ));
            }
        }
        return START_STICKY;
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        isRunning = false;
        heartbeatHandler.removeCallbacksAndMessages(null);
        if (healthHandler != null) healthHandler.stop();
        executor.shutdown();
        super.onDestroy();
    }

    // ── Periodic status heartbeat ───────────────────────────────────
    // Pushes battery + charging + lastSeen so the caretaker's live
    // dashboard never marks the device as AWAY while the service runs.
    private void sendHeartbeat() {
        try {
            firebase.updateStatus(batteryHandler.getStatusMap());
        } catch (Exception ignored) {
            Log.e(TAG, "Heartbeat failed", ignored);
        }
    }

    // ── Unified reply ────────────────────────────────────────────────

    private void reply(String channel, String sender, String cmdId, String text) {
        if (CHANNEL_SMS.equals(channel)) {
            // SMS fallback: reply back to the phone number
            SmsSender.send(this, sender, Constants.REPLY_PREFIX + text);
        } else {
            // DB path: write to /devices/{id}/replies/{cmdId}
            firebase.writeReply(cmdId, text);
        }
    }

    // ── Command dispatch ─────────────────────────────────────────────

    private void dispatch(String cmd, String cmdId, String sender, String channel) {
        Log.d(TAG, "[" + channel.toUpperCase() + "] " + cmd + " id=" + cmdId);

        ReplyCallback cb = text -> reply(channel, sender, cmdId, text);

        // ── Location ────────────────────────────────────────────────
        switch (cmd) {
            case "LOC":       locationHandler.getLocation(cb, false); return;
            case "LOCFAST":   locationHandler.getLocation(cb, true);  return;
            case "LOCADDR":   locationHandler.getAddress(cb);         return;
            case "MOVESTATE": locationHandler.getMoveState(cb);       return;
            case "ROUTINE":   locationHandler.getRoutine(cb);         return;
        }

        // ── Device controls ─────────────────────────────────────────
        switch (cmd) {
            case "RING":       deviceHandler.ring(cb);             return;
            case "ALRM":       deviceHandler.alarm(cb);            return;
            case "STOPRING":   deviceHandler.stopRing(cb);         return;
            case "TORCHON":    deviceHandler.torch(cb, true);      return;
            case "TORCHOFF":  deviceHandler.torch(cb, false);     return;
            case "VIBRATE":   deviceHandler.vibrate(cb);          return;
            case "MUTE":      deviceHandler.setMute(cb, true);    return;
            case "UNMUTE":    deviceHandler.setMute(cb, false);   return;
            case "SILENT":    deviceHandler.setSilent(cb);        return;
            case "VOLMAX":    deviceHandler.setVolume(cb, 100);   return;
            case "VOLLOW":    deviceHandler.setVolume(cb, 20);    return;
            case "SCREENON":  deviceHandler.screenOn(cb);         return;
            case "SCREENDIM": deviceHandler.setBrightness(cb, 30);  return;
            case "SCREENMAX": deviceHandler.setBrightness(cb, 255); return;
        }

        // ── Battery / status ────────────────────────────────────────
        switch (cmd) {
            case "BATNOW":      batteryHandler.getBattery(cb);        return;
            case "CHARGESTATE": batteryHandler.getChargeState(cb);    return;
            case "BATHEALTH":   batteryHandler.getBatteryHealth(cb);  return;
            case "STORAGE":     batteryHandler.getStorage(cb);        return;
            case "TEMPNOW":     batteryHandler.getTemp(cb);           return;
            case "STATUS":      cb.reply(batteryHandler.buildStatusSummary()); return;
        }

        // ── Network ─────────────────────────────────────────────────
        switch (cmd) {
            case "NETSTATE":  networkHandler.getNetState(cb);      return;
            case "PING":      networkHandler.ping(cb);             return;
            case "WIFIUP":    networkHandler.setWifi(cb, true);    return;
            case "WIFIDOWN":  networkHandler.setWifi(cb, false);   return;
        }

        // ── Safety ──────────────────────────────────────────────────
        switch (cmd) {
            case "SOS":       safetyHandler.handleSos(cb);       return;
            case "SOSACK":    safetyHandler.acknowledgeSos(cb);   return;
            case "FALLCHECK": safetyHandler.fallCheck(cb);        return;
            case "ACTCHECK":  safetyHandler.activityCheck(cb);    return;
        }

        // ── Messaging ───────────────────────────────────────────────
        switch (cmd) {
            case "CHECKIN":      messagingHandler.checkIn(cb, cmdId);          return;
            case "ACK":          messagingHandler.ack(cb);                     return;
            case "IOK":          messagingHandler.iAmOk(cb);                   return;
            case "CALLME":       messagingHandler.callCaretaker(cb);           return;
            case "AUTOREPLYON":  messagingHandler.setAutoReply(cb, true);      return;
            case "AUTOREPLYOFF": messagingHandler.setAutoReply(cb, false);     return;
        }

        // ── Routine reminders ────────────────────────────────────────
        switch (cmd) {
            case "MEDR":     routineHandler.reminder(cb, "💊 Time to take your medicine!"); return;
            case "WATERREM": routineHandler.reminder(cb, "💧 Please drink some water.");    return;
            case "BEDTIME":  routineHandler.reminder(cb, "🌙 Good night! Time to rest.");   return;
            case "WAKEUP":   routineHandler.reminder(cb, "☀️ Good morning! Time to wake up!"); return;
            case "DAYSTART": routineHandler.reminder(cb, "👋 Morning check-in. How are you feeling?"); return;
            case "DAYEND":   routineHandler.reminder(cb, "🌙 Evening check-in. How was your day?");    return;
        }

        // ── Health simulation (all 15 scenarios, see HEALTH_MONITORING.md) ──
        switch (cmd) {
            case "HRNORMAL":
            case "HRMI":
            case "HRTACHY":
            case "HRBRADY":
            case "HRARRHY":
            case "HRAFIB":
            case "HYPOXIA":
            case "FEVER":
            case "HYPOTHERMIA":
            case "BPCRISIS":
            case "HYPOTENSION":
            case "TACHYPNEA":
            case "BRADYPNEA":
            case "HYPERGLYCEMIA":
            case "HYPOGLYCEMIA":
                healthHandler.simulate(cmd, cb);
                return;
        }

        Log.w(TAG, "Unknown command: " + cmd);
        cb.reply("❓ Unknown command: " + cmd);
    }

    // ── Reply callback interface ─────────────────────────────────────

    public interface ReplyCallback {
        void reply(String text);
    }
}
