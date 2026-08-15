/**
 * Caretaker-side Firebase command helpers.
 *
 * DB layout (elder device owns its node):
 *
 * /devices/{deviceId}/
 *   fcmToken              — string  (written by elder app on startup)
 *   status/               — live status snapshot from elder device
 *     lastSeen            — number (epoch ms)
 *     battery             — number
 *     charging            — boolean
 *     lat, lng            — number
 *   commands/{cmdId}/     — written by caretaker, read by elder app
 *     cmd                 — string  e.g. "LOC"
 *     sender              — string  caretaker identifier
 *     ts                  — number  epoch ms
 *     executed            — boolean (elder sets this after running)
 *   replies/{cmdId}/      — written by elder app
 *     text                — string  result text
 *     ts                  — number
 */

import {
  ref, set, onValue, off, push, get, onChildAdded,
  serverTimestamp, DataSnapshot
} from 'firebase/database';
import { getFirebaseDb } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import type { HeartAlert } from './commands';

export type DeviceStatus = {
  lastSeen:  number;
  battery:   number;
  charging:  boolean;
  lat:       number;
  lng:       number;
  deviceId?: string;
  // Live vitals streamed by the elder-helper health monitor (HealthHandler)
  heartRate?:       number;
  spo2?:            number;
  temperature?:     number;
  respiratoryRate?: number;
  systolic?:        number;
  diastolic?:       number;
  glucose?:         number;
  heartCondition?:  string;
  heartSeverity?:   string;
};

export type CommandReply = {
  text: string;
  ts:   number;
};

// ── Send a command to the elder device ──────────────────────────────

/**
 * Write a command to the DB and return the cmdId.
 * The elder's FirebaseMessagingService will pick it up via FCM push
 * and execute it, then write to /replies/{cmdId}.
 */
export async function sendCommand(
  deviceId: string,
  cmd: string,
  caretakerId = 'caretaker'
): Promise<string> {
  const db    = getFirebaseDb();
  const cmdId = uuidv4();

  await set(
    ref(db, `devices/${deviceId}/commands/${cmdId}`),
    {
      cmd,
      cmdId,
      sender:   caretakerId,
      ts:       Date.now(),
      executed: false,
    }
  );

  return cmdId;
}

// ── Listen to command reply ──────────────────────────────────────────

/**
 * Wait for the elder device to write a reply to /replies/{cmdId}.
 * Resolves with the reply text, or rejects after timeoutMs.
 */
export function waitForReply(
  deviceId: string,
  cmdId:    string,
  timeoutMs = 30_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const db      = getFirebaseDb();
    const replyRef = ref(db, `devices/${deviceId}/replies/${cmdId}`);
    let   done    = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        off(replyRef);
        reject(new Error('Command timed out after ' + timeoutMs + 'ms'));
      }
    }, timeoutMs);

    onValue(replyRef, (snap: DataSnapshot) => {
      if (!snap.exists() || done) return;
      const data = snap.val() as CommandReply;
      if (data?.text) {
        done = true;
        clearTimeout(timer);
        off(replyRef);
        resolve(data.text);
      }
    });
  });
}

// ── Subscribe to live device status ─────────────────────────────────

/**
 * Real-time listener on /devices/{deviceId}/status.
 * Returns an unsubscribe function.
 */
export function subscribeToStatus(
  deviceId:  string,
  onChange:  (status: DeviceStatus | null) => void
): () => void {
  const db        = getFirebaseDb();
  const statusRef = ref(db, `devices/${deviceId}/status`);

  onValue(statusRef, (snap: DataSnapshot) => {
    onChange(snap.exists() ? (snap.val() as DeviceStatus) : null);
  });

  return () => off(statusRef);
}

// ── One-shot status read ─────────────────────────────────────────────

export async function getDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
  const db   = getFirebaseDb();
  const snap = await get(ref(db, `devices/${deviceId}/status`));
  return snap.exists() ? (snap.val() as DeviceStatus) : null;
}

// ── Get FCM token (needed if sending via FCM HTTP API directly) ──────

export async function getDeviceFcmToken(deviceId: string): Promise<string | null> {
  const db   = getFirebaseDb();
  const snap = await get(ref(db, `devices/${deviceId}/fcmToken`));
  return snap.exists() ? snap.val() : null;
}

// ── Subscribe to elder heart/health alerts ──────────────────────────
// Fires whenever the elder device writes to /devices/{id}/alerts.
// Used to raise a LOUD medical warning on the caretaker side.

export function subscribeToAlerts(
  deviceId: string,
  onAlert: (alert: HeartAlert) => void
): () => void {
  const db        = getFirebaseDb();
  const alertsRef = ref(db, `devices/${deviceId}/alerts`);

  onChildAdded(alertsRef, (snap) => {
    if (!snap.exists()) return;
    const val = snap.val() as Omit<HeartAlert, 'id'>;
    onAlert({ id: snap.key ?? String(Date.now()), ...val, source: 'elder' });
  });

  return () => off(alertsRef);
}
