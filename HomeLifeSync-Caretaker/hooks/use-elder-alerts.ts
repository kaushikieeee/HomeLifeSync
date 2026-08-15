'use client';

import { useEffect } from 'react';
import { subscribeToAlerts } from '@/lib/firebase-commands';
import { HeartAlert } from '@/lib/commands';

/**
 * Subscribes to the elder device's /alerts node. Whenever the elder device
 * writes a HEART alert (a simulated condition), the callback fires so the
 * caretaker can raise a loud warning.
 */
export function useElderAlerts(
  deviceId: string | null,
  onAlert: (alert: HeartAlert) => void
) {
  useEffect(() => {
    if (!deviceId) return;
    return subscribeToAlerts(deviceId, onAlert);
  }, [deviceId, onAlert]);
}