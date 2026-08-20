package com.homelifesync.elder.service;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

import com.homelifesync.elder.Constants;
import com.homelifesync.elder.commands.AppActionHandler;
import com.homelifesync.elder.commands.BatteryHandler;
import com.homelifesync.elder.commands.BehaviorHandler;
import com.homelifesync.elder.commands.DeviceHandler;
import com.homelifesync.elder.commands.GeofenceHandler;
import com.homelifesync.elder.commands.HealthHandler;
import com.homelifesync.elder.commands.HomeHandler;
import com.homelifesync.elder.commands.LocationHandler;
import com.homelifesync.elder.commands.MediaHandler;
import com.homelifesync.elder.commands.MessagingHandler;
import com.homelifesync.elder.commands.NetworkHandler;
import com.homelifesync.elder.commands.RoutineHandler;
import com.homelifesync.elder.commands.SafetyHandler;
import com.homelifesync.elder.commands.SensorHandler;
import com.homelifesync.elder.commands.SystemHandler;
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
    private SensorHandler    sensorHandler;
    private MediaHandler     mediaHandler;
    private AppActionHandler appActionHandler;
    private GeofenceHandler  geofenceHandler;
    private HomeHandler      homeHandler;
    private SystemHandler    systemHandler;
    private BehaviorHandler  behaviorHandler;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        executor  = Executors.newFixedThreadPool(3);
        BehaviorHandler.touch();

        firebase         = FirebaseRepository.get(this);
        locationHandler  = new LocationHandler(this);
        deviceHandler    = new DeviceHandler(this);
        batteryHandler   = new BatteryHandler(this);
        networkHandler   = new NetworkHandler(this);
        safetyHandler    = new SafetyHandler(this);
        messagingHandler = new MessagingHandler(this);
        routineHandler   = new RoutineHandler(this);
        sensorHandler    = new SensorHandler(this);
        mediaHandler     = new MediaHandler(this);
        appActionHandler = new AppActionHandler(this);
        geofenceHandler  = new GeofenceHandler(this);
        homeHandler      = new HomeHandler(this);
        systemHandler    = new SystemHandler(this);
        behaviorHandler  = new BehaviorHandler(this);

        // Continuous fake heart-rate stream + condition simulator
        healthHandler = HealthHandler.get(this);
        healthHandler.start();

        // Restore + publish the remembered flashlight state (state memory).
        deviceHandler.restoreTorch();

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
        try { firebase.stopCommandListener(); } catch (Exception ignored) {}
        if (deviceHandler  != null) deviceHandler.stopSounds();
        if (safetyHandler   != null) safetyHandler.stopSounds();
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
        // Every reply / handler run counts as "device activity" for NOINACT.
        BehaviorHandler.touch();

        // Optional single argument (e.g. "BATLOW 20", "OPENAPP maps").
        String verb = cmd, arg = "";
        int sp = cmd.indexOf(' ');
        if (sp > 0) { verb = cmd.substring(0, sp); arg = cmd.substring(sp + 1).trim(); }

        ReplyCallback cb = text -> reply(channel, sender, cmdId, text);

        // ── Location ────────────────────────────────────────────────
        switch (verb) {
            case "LOC":       locationHandler.getLocation(cb, false); return;
            case "LOCFAST":   locationHandler.getLocation(cb, true);  return;
            case "LOCADDR":   locationHandler.getAddress(cb);         return;
            case "MOVESTATE": locationHandler.getMoveState(cb);       return;
            case "ROUTINE":   locationHandler.getRoutine(cb);         return;
        }

        // ── Device controls ─────────────────────────────────────────
        switch (verb) {
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
        switch (verb) {
            case "BATNOW":      batteryHandler.getBattery(cb);        return;
            case "CHARGESTATE": batteryHandler.getChargeState(cb);    return;
            case "BATHEALTH":   batteryHandler.getBatteryHealth(cb);  return;
            case "STORAGE":     batteryHandler.getStorage(cb);        return;
            case "TEMPNOW":     batteryHandler.getTemp(cb);           return;
            case "BATLOW":      batteryHandler.batteryBelow(cb, parseDbl(arg, 20)); return;
            case "STATUS":      cb.reply(batteryHandler.buildStatusSummary()); return;
        }

        // ── Network ─────────────────────────────────────────────────
        switch (verb) {
            case "NETSTATE":  networkHandler.getNetState(cb);      return;
            case "PING":      networkHandler.ping(cb);             return;
            case "WIFIUP":    networkHandler.setWifi(cb, true);    return;
            case "WIFIDOWN":  networkHandler.setWifi(cb, false);   return;
            case "DATAON":    networkHandler.setMobileData(cb, true);  return;
            case "DATAOFF":   networkHandler.setMobileData(cb, false); return;
            case "HOTSPOTON": networkHandler.setHotspot(cb, true);     return;
            case "HOTSPOTOFF":networkHandler.setHotspot(cb, false);    return;
        }

        // ── Safety ──────────────────────────────────────────────────
        switch (verb) {
            case "SOS":       safetyHandler.handleSos(cb);        return;
            case "SOSACK":    safetyHandler.acknowledgeSos(cb);   return;
            case "FALLCHECK": safetyHandler.fallCheck(cb);        return;
            case "ACTCHECK":  safetyHandler.activityCheck(cb);    return;
        }

        // ── Messaging ───────────────────────────────────────────────
        switch (verb) {
            case "CHECKIN":      messagingHandler.checkIn(cb, cmdId);          return;
            case "ACK":          messagingHandler.ack(cb);                     return;
            case "IOK":          messagingHandler.iAmOk(cb);                   return;
            case "CALLME":       messagingHandler.callCaretaker(cb);           return;
            case "AUTOREPLYON":  messagingHandler.setAutoReply(cb, true);      return;
            case "AUTOREPLYOFF": messagingHandler.setAutoReply(cb, false);     return;
        }

        // ── Routine reminders ────────────────────────────────────────
        switch (verb) {
            case "MEDR":     routineHandler.reminder(cb, "💊 Time to take your medicine!"); return;
            case "WATERREM": routineHandler.reminder(cb, "💧 Please drink some water.");    return;
            case "BEDTIME":  routineHandler.reminder(cb, "🌙 Good night! Time to rest.");   return;
            case "WAKEUP":   routineHandler.reminder(cb, "☀️ Good morning! Time to wake up!"); return;
            case "DAYSTART": routineHandler.reminder(cb, "👋 Morning check-in. How are you feeling?"); return;
            case "DAYEND":   routineHandler.reminder(cb, "🌙 Evening check-in. How was your day?");    return;
        }

        // ── Health simulation + wearable HR queries ──────────────────
        switch (verb) {
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
                healthHandler.simulate(verb, cb);
                return;
            case "HRNOW":   cb.reply(HealthHandler.hrNow());   return;
            case "HRAVG":   cb.reply(HealthHandler.hrAvg());   return;
            case "HRPEAK":  cb.reply(HealthHandler.hrPeak());  return;
            case "HRLOW":   cb.reply(HealthHandler.hrLow());   return;
            case "HRTREND": cb.reply(HealthHandler.hrTrend()); return;
        }

        // ── Behaviour / AI ───────────────────────────────────────────
        switch (verb) {
            case "NOINACT":          behaviorHandler.noInact(cb);              return;
            case "BEHAVFLAG":        behaviorHandler.behavFlag(cb);            return;
            case "NIGHTMOVE":        behaviorHandler.nightMove(cb, arg);       return;
            case "INACTALERT":       behaviorHandler.inactAlert(cb, arg);      return;
            case "WAKEPAT":          behaviorHandler.wakePat(cb);              return;
            case "ROUTINECOMPARE":   behaviorHandler.routineCompare(cb);       return;
            case "ROUTINELOG":       behaviorHandler.routineLog(cb);           return;
            case "AIWEEK":           behaviorHandler.aiWeek(cb);               return;
            case "AIPATTERN":        behaviorHandler.aiPattern(cb);            return;
            case "AIMOOD":           behaviorHandler.aiMood(cb);               return;
            case "AIPREDICT":        behaviorHandler.aiPredict(cb);            return;
            case "AIREMIND":         behaviorHandler.aiRemind(cb);             return;
        }

        // ── Camera & media ───────────────────────────────────────────
        switch (verb) {
            case "PHOTO":        mediaHandler.photo(cb, false, false); return;
            case "PHOTO2":       mediaHandler.photo(cb, true, false);  return;
            case "PHOTONOWIFI":  mediaHandler.photo(cb, false, true);  return;
            case "RECORD":       mediaHandler.record(cb);              return;
            case "SNAPVID":      mediaHandler.snapVideo(cb);           return;
            case "PLAYMSG":      mediaHandler.playMessage(cb);         return;
        }

        // ── App interactions ─────────────────────────────────────────
        switch (verb) {
            case "OPENAPP":   appActionHandler.openApp(cb, arg); return;
            case "CLOSEAPP":  appActionHandler.closeApp(cb, arg); return;
            case "OPENMAP":   appActionHandler.openMap(cb);     return;
            case "OPENCALL":  appActionHandler.openCaller(cb);  return;
            case "OPENMED":   appActionHandler.openMeds(cb);    return;
        }

        // ── Geofencing ───────────────────────────────────────────────
        switch (verb) {
            case "GEOSET": {
                String[] p = arg.split("[, ]+");
                geofenceHandler.set(cb,
                    p.length >= 1 ? p[0] : "",
                    p.length >= 2 ? p[1] : "",
                    p.length >= 3 ? p[2] : null);
                return;
            }
            case "GEOCLEAR":    geofenceHandler.clear(cb);         return;
            case "GEOALERT":    geofenceHandler.toggleAlert(cb);   return;
            case "GEOENTER":    geofenceHandler.setMode(cb, "enter"); return;
            case "GEOEXIT":     geofenceHandler.setMode(cb, "exit");  return;
            case "GEOFENCE":    geofenceHandler.status(cb);        return;
        }

        // ── Environment sensors ──────────────────────────────────────
        switch (verb) {
            case "AMBIENT": sensorHandler.ambient(cb); return;
            case "NOISE":   sensorHandler.noise(cb);   return;
            case "SHAKE":   sensorHandler.shake(cb);   return;
            case "ORIENT":  sensorHandler.orient(cb);  return;
            case "ACCDATA": sensorHandler.accData(cb); return;
        }

        // ── Home automation (IoT-ready) ──────────────────────────────
        switch (verb) {
            case "LIVINGLIGHTON":  homeHandler.light(cb, "Living room", true); return;
            case "LIVINGLIGHTOFF": homeHandler.light(cb, "Living room", false); return;
            case "BEDLIGHTON":     homeHandler.light(cb, "Bedroom", true); return;
            case "BEDLIGHTOFF":    homeHandler.light(cb, "Bedroom", false); return;
            case "FANON":          homeHandler.fan(cb, true);  return;
            case "FANOFF":         homeHandler.fan(cb, false); return;
            case "LOCKDOOR":       homeHandler.door(cb, true);  return;
            case "UNLOCKDOOR":     homeHandler.door(cb, false); return;
            case "ACSTAT":         homeHandler.acState(cb);     return;
            case "ACLINK": {
                String[] p = arg.split(" ");
                homeHandler.acLink(cb,
                    p.length >= 1 ? p[0] : "",
                    p.length >= 2 ? (int) parseDbl(p[1], 0) : 38000);
                return;
            }
        }

        // ── System control ───────────────────────────────────────────
        switch (verb) {
            case "REBOOT":         systemHandler.reboot(cb);          return;
            case "POWEROFF":       systemHandler.powerOff(cb);        return;
            case "RESTARTTASKER":  systemHandler.restartTasker(cb);   return;
            case "CLEARCACHE":     systemHandler.clearCache(cb);      return;
        }

        Log.w(TAG, "Unknown command: " + cmd);
        cb.reply("❓ Unknown command: " + cmd);
    }

    private static double parseDbl(String s, double def) {
        try { return Double.parseDouble(s.trim()); }
        catch (Exception e) { return def; }
    }

    // ── Reply callback interface ─────────────────────────────────────

    public interface ReplyCallback {
        void reply(String text);
    }
}
