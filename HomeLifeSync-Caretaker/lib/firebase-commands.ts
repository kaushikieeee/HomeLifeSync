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
  ref, set, update, onValue, off, push, get, onChildAdded, query, limitToLast,
  DataSnapshot
} from 'firebase/database';
import { getFirebaseDb } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import type { HeartAlert } from './commands';
import type { Vitals } from './health';

export type DeviceStatus = {
  lastSeen:  number;
  battery:   number;
  charging:  boolean;
  lat:       number;
  lng:       number;
  accuracy?: number;
  deviceId?: string;
  torch?:    boolean;
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
  // Home-automation state pushed by the elder (HomeHandler) + SOS flag
  livingLight?: boolean;
  bedLight?:    boolean;
  fan?:         boolean;
  doorLocked?:  boolean;
  sos?:         boolean;
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

// ── Broadcast a health event to every watcher ────────────────────────
// The caretaker OWNS simulations, so when one fires it must reach the
// elder phone AND every tablet/hub. We publish the exact same shape the
// elder's HealthHandler.pushStatus() writes, plus a /alerts entry (like
// its writeAlert()) so all subscribers wake up even if the elder device
// is offline or slow to process the command.
export async function publishHealthEvent(
  deviceId: string,
  condition: string,
  severity: string,
  vitals: Vitals
): Promise<void> {
  const db = getFirebaseDb();

  await update(
    ref(db, `devices/${deviceId}/status`),
    {
      heartRate:       vitals.heartRate,
      spo2:            vitals.spo2,
      temperature:     vitals.temperature,
      respiratoryRate: vitals.respiratoryRate,
      systolic:        vitals.systolic,
      diastolic:       vitals.diastolic,
      glucose:         vitals.glucose,
      heartCondition:  condition,
      heartSeverity:   severity,
    }
  );

  // Only a real condition gets an alert entry — OK just clears the panel.
  if (severity !== 'OK') {
    push(ref(db, `devices/${deviceId}/alerts`), {
      type:       'HEALTH',
      condition,
      severity,
      ts:         Date.now(),
      heartRate:       vitals.heartRate,
      spo2:            vitals.spo2,
      temperature:     vitals.temperature,
      respiratoryRate: vitals.respiratoryRate,
      systolic:        vitals.systolic,
      diastolic:       vitals.diastolic,
      glucose:         vitals.glucose,
    });
  }
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
//
// Alerts node grows forever and `onChildAdded` replays EVERY existing child
// on attach, so a per-device cursor (module state + localStorage) filters out
// historical alerts on connect/reconnect/reload.

const ALERT_CURSOR_KEY = 'hls:alertCursors';
let alertCursors: Record<string, number> | null = null;

function loadAlertCursors(): Record<string, number> {
  if (alertCursors) return alertCursors;
  let cursors: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(ALERT_CURSOR_KEY);
    if (raw) cursors = JSON.parse(raw);
  } catch { /* ignore */ }
  alertCursors = cursors;
  return cursors;
}

function storeAlertCursor(deviceId: string, ts: number) {
  const cursors = loadAlertCursors();
  cursors[deviceId] = ts;
  try { localStorage.setItem(ALERT_CURSOR_KEY, JSON.stringify(cursors)); } catch { /* ignore */ }
}

export function subscribeToAlerts(
  deviceId: string,
  onAlert: (alert: HeartAlert) => void
): () => void {
  const db        = getFirebaseDb();
  // Bound the sync window to the newest alerts: Firebase push keys sort
  // chronologically, so limitToLast keeps re-attaches (reload / reconnect)
  // from downloading the whole history — the elder prunes the node too.
  const alertsRef = query(
    ref(db, `devices/${deviceId}/alerts`),
    limitToLast(120)
  );

  let cursor = loadAlertCursors()[deviceId] ?? 0;

  onChildAdded(alertsRef, (snap) => {
    if (!snap.exists()) return;
    const val = snap.val();
    const ts  = Number(val?.ts ?? 0);
    // Skip historical alerts already seen (or older than our cursor).
    if (ts !== 0 && ts <= cursor) return;
    if (ts > cursor) {
      cursor = ts;
      storeAlertCursor(deviceId, ts);
    }
    onAlert({ id: snap.key ?? String(Date.now()), ...val, source: 'elder' });
  });

  return () => off(alertsRef);
}
