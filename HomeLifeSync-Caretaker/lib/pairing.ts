'use client';

import { get, ref } from 'firebase/database';
import { firebaseConfigured, getFirebaseDb } from '@/lib/firebase';

/**
 * Shared device pairing: entering the elder's device ID ALONE is never
 * enough — a 4-digit pairing code must be verified too.
 *
 * The elder app publishes /devices/{id}/pairingCode = { code, ts } and the
 * code is only valid for PAIRING_TTL_MS. Both the caretaker app ("Link
 * Caretaker") and the tablet hub ("Link HomeHub") pair through this.
 */

export const PAIRING_TTL_MS = 5 * 60 * 1000;

export const DEVICE_ID_RE = /^[0-9a-fA-F]{8}$/;
export const PAIRING_CODE_RE = /^\d{4}$/;

export type PairVerify =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyPairing(deviceId: string, code: string): Promise<PairVerify> {
  const device = deviceId.trim().toLowerCase();
  const candidate = code.trim();

  if (!DEVICE_ID_RE.test(device)) {
    return { ok: false, reason: 'Device ID must be exactly 8 characters (a-f, 0-9).' };
  }
  if (!PAIRING_CODE_RE.test(candidate)) {
    return { ok: false, reason: 'Pairing code must be 4 digits.' };
  }
  if (!firebaseConfigured) {
    return { ok: false, reason: "This build has no Firebase config — pairing can't be verified." };
  }

  try {
    const snap = await get(ref(getFirebaseDb(), `devices/${device}/pairingCode`));
    if (!snap.exists()) {
      return {
        ok: false,
        reason: 'No pairing code found for this ID — open the HomeSync app on the elder\u2019s phone so it can publish one.',
      };
    }
    const p = snap.val() as { code?: string; ts?: number };
    if (!p?.code || p.code !== candidate) {
      return {
        ok: false,
        reason: 'That code doesn\u2019t match — ask the elder to open HomeSync and read the current pairing code.',
      };
    }
    if (!p.ts || Date.now() - p.ts > PAIRING_TTL_MS) {
      return {
        ok: false,
        reason: 'That code expired (valid for 5 minutes) — tap \u201cNew code\u201d on the elder app and try again.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'Couldn\u2019t verify the code right now — check the connection and retry.',
    };
  }
}