'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  sendCommand,
  waitForReply,
  subscribeToStatus,
  DeviceStatus,
} from '@/lib/firebase-commands';

export type CommandStatus = 'idle' | 'sending' | 'waiting' | 'done' | 'error';

export type CommandResult = {
  cmd:    string;
  reply:  string;
  time:   Date;
  ok:     boolean;
};

/**
 * Hook that connects the caretaker UI to a specific elder device via Firebase.
 *
 * Usage:
 *   const { status, send, history, connected } = useFirebaseDevice(deviceId);
 */
export function useFirebaseDevice(deviceId: string | null) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [history,      setHistory]      = useState<CommandResult[]>([]);
  const [cmdStatus,    setCmdStatus]    = useState<CommandStatus>('idle');
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to live status whenever deviceId changes
  useEffect(() => {
    if (!deviceId) {
      setDeviceStatus(null);
      return;
    }
    // Tear down previous subscription
    if (unsubRef.current) unsubRef.current();

    unsubRef.current = subscribeToStatus(deviceId, setDeviceStatus);
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [deviceId]);

  /**
   * Send a command and wait for the reply.
   * Returns the reply text (or an error message).
   */
  const send = useCallback(async (cmd: string): Promise<string> => {
    if (!deviceId) return '❌ No device connected.';

    // Fast-fail instead of sitting through a 20 s timeout: with a status
    // snapshot on hand we can tell the elder phone isn't listening (service
    // stopped, phone offline, wrong Device ID) before we even write.
    // 5 minutes mirrors the `connected` window — the elder's heartbeat keeps
    // /status.lastSeen fresh every 60 s while the service runs.
    if (deviceStatus && deviceStatus.lastSeen < Date.now() - 5 * 60 * 1000) {
      const err = '❌ Elder device looks offline (last seen earlier) — start the Elder-Helper service and keep the elder phone online, then try again.';
      setHistory(h => [{ cmd, reply: err, time: new Date(), ok: false }, ...h].slice(0, 20));
      setCmdStatus('error');
      return err;
    }

    setCmdStatus('sending');
    try {
      const cmdId = await sendCommand(deviceId, cmd);
      setCmdStatus('waiting');

      const reply = await waitForReply(deviceId, cmdId, 20_000);
      const result: CommandResult = {
        cmd,
        reply,
        time: new Date(),
        ok:   !reply.startsWith('❌'),
      };
      setHistory(h => [result, ...h].slice(0, 20));
      setCmdStatus('done');
      return reply;
    } catch (err: unknown) {
      const base = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      const errMsg = '❌ ' + (base.includes('timed out')
        ? base + ' — elder app didn’t reply. Check: elder phone online, service running (Start Service), and the Device ID shown on the elder app matches the caretaker’s.'
        : base);
      setHistory(h => [{ cmd, reply: errMsg, time: new Date(), ok: false }, ...h].slice(0, 20));
      setCmdStatus('error');
      return errMsg;
    } finally {
      // Reset to idle after 2 s so the UI can send another command
      setTimeout(() => setCmdStatus('idle'), 2000);
    }
  }, [deviceId]);

  const connected = !!deviceStatus && deviceStatus.lastSeen > Date.now() - 5 * 60 * 1000;

  return { deviceStatus, history, cmdStatus, send, connected };
}
