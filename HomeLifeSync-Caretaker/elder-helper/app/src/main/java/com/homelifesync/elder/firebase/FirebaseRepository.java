package com.homelifesync.elder.firebase;

import android.content.Context;
import android.util.Log;

import com.google.firebase.database.ChildEventListener;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.messaging.FirebaseMessaging;
import com.homelifesync.elder.Constants;
import com.homelifesync.elder.util.PrefsHelper;

import java.util.HashMap;
import java.util.Map;

/**
 * Single access point for all Firebase Realtime DB operations on the elder device.
 *
 * Option A command flow:
 *   1. Caretaker writes to /devices/{id}/commands/{cmdId}
 *   2. ChildEventListener.onChildAdded() fires immediately on Android
 *   3. We dispatch the command and write reply to /devices/{id}/replies/{cmdId}
 *   4. Caretaker's waitForReply() listener picks up the reply
 *
 * DB structure:
 * /devices/{deviceId}/
 *   fcmToken                — this device's FCM registration token
 *   status/                 — live status snapshot
 *     lastSeen              — epoch ms
 *     battery, charging, lat, lng …
 *   commands/{cmdId}/       — written by caretaker
 *     cmd                   — e.g. "LOC"
 *     cmdId                 — echo of the key
 *     sender                — caretaker identifier
 *     ts                    — epoch ms
 *     executed              — boolean
 *   replies/{cmdId}/        — written by elder after execution
 *     text                  — result string
 *     ts                    — epoch ms
 */
public class FirebaseRepository {

    private static final String TAG = "FirebaseRepo";

    private static FirebaseRepository instance;

    private final DatabaseReference deviceRef;
    private final String            deviceId;

    /** Callback invoked when a new command arrives from the DB listener. */
    public interface CommandListener {
        void onCommand(String cmdId, String cmd, String sender);
    }

    private CommandListener commandListener;
    private ChildEventListener commandChildListener;
    private DatabaseReference commandsRef;

    // ── Singleton ────────────────────────────────────────────────────

    private FirebaseRepository(Context ctx) {
        PrefsHelper prefs = new PrefsHelper(ctx);
        deviceId  = prefs.getDeviceId();

        // setPersistenceEnabled must be called before any other DB usage
        // and only once. Guard against double-init with try/catch.
        try {
            FirebaseDatabase.getInstance().setPersistenceEnabled(true);
        } catch (Exception ignored) {
            // Already enabled — safe to ignore
        }

        deviceRef = FirebaseDatabase.getInstance()
            .getReference(Constants.DB_ROOT)
            .child(deviceId);
    }

    public static synchronized FirebaseRepository get(Context ctx) {
        if (instance == null)
            instance = new FirebaseRepository(ctx.getApplicationContext());
        return instance;
    }

    // ── Option A: DB command listener ────────────────────────────────

    /**
     * Attach a ChildEventListener on /devices/{id}/commands/.
     * Fires onChildAdded for every command the caretaker writes.
     * Call this once from ElderHelperService.onCreate().
     *
     * Uses a plain listener (no orderByChild) so it needs no `.indexOn`
     * security rule, and skips commands already marked `executed` so a
     * re-attach (service restart, reconnection) never re-runs history.
     */
    public void startCommandListener(CommandListener listener) {
        this.commandListener = listener;

        // Tear down any previous listener (service restarts attach again).
        if (commandsRef != null && commandChildListener != null) {
            commandsRef.removeEventListener(commandChildListener);
        }

        commandsRef = deviceRef.child(Constants.DB_COMMANDS);
        commandChildListener = new ChildEventListener() {

            @Override
            public void onChildAdded(DataSnapshot snap, String prev) {
                if (!snap.exists()) return;

                // Skip commands we already executed (dedupe on re-listen).
                Boolean executed = snap.child("executed").getValue(Boolean.class);
                if (Boolean.TRUE.equals(executed)) return;

                String cmdId  = snap.getKey();
                String cmd    = snap.child("cmd").getValue(String.class);
                String sender = snap.child("sender").getValue(String.class);

                if (cmd == null || cmd.isEmpty()) return;

                Log.d(TAG, "DB command received: " + cmd + " id=" + cmdId);

                // Mark as executed immediately so reconnects don't re-run it
                snap.getRef().child("executed").setValue(true);

                if (commandListener != null) {
                    commandListener.onCommand(
                        cmdId  != null ? cmdId  : "",
                        cmd.toUpperCase().trim(),
                        sender != null ? sender : ""
                    );
                }
            }

            @Override public void onChildChanged(DataSnapshot s, String p) {}
            @Override public void onChildRemoved(DataSnapshot s) {}
            @Override public void onChildMoved(DataSnapshot s, String p) {}
            @Override public void onCancelled(DatabaseError e) {
                Log.e(TAG, "Command listener cancelled: " + e.getMessage());
            }
        };
        commandsRef.addChildEventListener(commandChildListener);

        Log.d(TAG, "DB command listener started for device: " + deviceId);
    }

    /** Detach the command listener (service teardown) so restarts don't stack. */
    public void stopCommandListener() {
        if (commandsRef != null && commandChildListener != null) {
            commandsRef.removeEventListener(commandChildListener);
            commandChildListener = null;
            Log.d(TAG, "DB command listener stopped for device: " + deviceId);
        }
    }

    // ── Command reply ────────────────────────────────────────────────

    /**
     * Write reply to /devices/{id}/replies/{cmdId}/
     * Caretaker's waitForReply() listener resolves when this appears.
     */
    public void writeReply(String cmdId, String reply) {
        DatabaseReference replyRef = (cmdId != null && !cmdId.isEmpty())
            ? deviceRef.child("replies").child(cmdId)
            : deviceRef.child("lastReply");

        Map<String, Object> data = new HashMap<>();
        data.put("text", reply);
        data.put("ts",   System.currentTimeMillis());

        replyRef.setValue(data)
            .addOnSuccessListener(v -> Log.d(TAG, "Reply written: " + cmdId))
            .addOnFailureListener(e -> Log.e(TAG, "Reply write failed", e));
    }

    // ── Status snapshot ──────────────────────────────────────────────

    public void updateStatus(Map<String, Object> statusMap) {
        statusMap.put("lastSeen", System.currentTimeMillis());
        statusMap.put("deviceId", deviceId);
        deviceRef.child(Constants.DB_STATUS).updateChildren(statusMap)
            .addOnFailureListener(e -> Log.e(TAG, "Status update failed", e));
    }

    public void heartbeat() {
        deviceRef.child(Constants.DB_STATUS)
            .child("lastSeen")
            .setValue(System.currentTimeMillis());
    }

    // ── Temporary pairing code ──────────────────────────────────────

    /**
     * Publish the rotating 4-digit pairing code under /devices/{id}/pairingCode
     * with a timestamp. The tablet reads this node and refuses to pair unless
     * the code matches and is younger than PAIRING_TTL_MS.
     */
    public void writePairingCode(String code) {
        Map<String, Object> data = new HashMap<>();
        data.put("code", code);
        data.put("ts",   System.currentTimeMillis());
        deviceRef.child(Constants.DB_PAIRING).setValue(data)
            .addOnSuccessListener(v -> Log.d(TAG, "Pairing code published: " + code))
            .addOnFailureListener(e -> Log.e(TAG, "Pairing code publish failed", e));
    }

    // ── Health alerts ────────────────────────────────────────────────

    /**
     * Write a HEALTH alert to /devices/{id}/alerts/{pushId} with the full
     * vitals snapshot. The caretaker app subscribes to this node and raises
     * a loud warning.
     */
    public void writeAlert(String condition, String severity, Map<String, Object> vitals) {
        DatabaseReference alertRef = deviceRef.child("alerts").push();
        Map<String, Object> data = new HashMap<>();
        data.put("type", "HEALTH");
        data.put("condition", condition);
        data.put("severity", severity);
        data.put("ts", System.currentTimeMillis());
        if (vitals != null) data.putAll(vitals);
        alertRef.setValue(data)
            .addOnSuccessListener(v -> {
                Log.d(TAG, "Alert written: " + condition);
                pruneAlerts();
            })
            .addOnFailureListener(e -> Log.e(TAG, "Alert write failed", e));
    }

    /**
     * Keep /alerts bounded. Each app reload re-subscribes and re-syncs the
     * whole node (onChildAdded replays every child), so an ever-growing log
     * slows every wake-up. Firebase push keys sort chronologically, so
     * deleting the lexicographically-first 25 children removes the OLDEST
     * 25 — orderByKey needs no .indexOn rule. The node stabilizes around
     * ~50-100 entries even with heavy demo use.
     */
    private void pruneAlerts() {
        deviceRef.child("alerts").orderByKey().limitToFirst(25).get()
            .addOnSuccessListener(snap -> {
                for (DataSnapshot child : snap.getChildren()) {
                    child.getRef().removeValue();
                }
            })
            .addOnFailureListener(e -> Log.d(TAG, "Alert prune skipped: " + e.getMessage()));
    }

    // ── Accessors ────────────────────────────────────────────────────

    public String          getDeviceId()  { return deviceId;  }
    public DatabaseReference getDeviceRef() { return deviceRef; }
}
