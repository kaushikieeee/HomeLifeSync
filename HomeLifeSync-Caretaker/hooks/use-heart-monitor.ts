'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  NORMAL_VITALS, scenarioByCmd, createHealthEngine,
  Vitals, Detection, HealthSeverity,
} from '@/lib/health';
import { HeartAlert, isCriticalHeart } from '@/lib/commands';

/**
 * Wearable / health monitor for the caretaker device.
 *
 * - Simulates all six vitals (HR, SpO₂, temp, RR, BP, glucose) as a random
 *   walk around the active scenario's targets, every 2 s.
 * - Runs the SAME detection engine as the elder device (see lib/health.ts,
 *   spec in HEALTH_MONITORING.md).
 * - Random health events fire spontaneously while idle (every ~1-3 min),
 *   each lasting 18-38 s before vitals auto-recover — so alerts can arrive
 *   without a manual simulation.
 * - A confirmed WARNING/CRITICAL detection raises ONE loud HeartAlert per
 *   episode (re-armed only after vitals return to normal). Elder-device
 *   alerts arriving via Firebase are injected through pushElderAlert and
 *   share the same list, so the caretaker warns loudly either way.
 */

// Random spontaneous events (weighted + hard limit so it never spams).
// Critical entries only appear rarely — most are mild WARNING drifts.
const RANDOM_EVENTS: { target: Partial<Vitals>; variance?: number; critical?: boolean }[] = [
  { target: { heartRate: 128 }, variance: 4 },
  { target: { heartRate: 46 }, variance: 2 },
  { target: { spo2: 92 } },
  { target: { temperature: 38.4 }, variance: 0.05 },
  { target: { glucose: 190 } },
  { target: { systolic: 165, diastolic: 102 } },
  { target: { respiratoryRate: 26 } },
  { target: { heartRate: 104 }, variance: 22 },
  { target: { heartRate: 136 }, variance: 6, critical: true },
  { target: { spo2: 86 }, critical: true },
  { target: { temperature: 39.6 }, critical: true },
];

const RANDOM_TICK_CHANCE   = 0.02;   // ~1 event per 100 s while idle
const RANDOM_COOLDOWN_MS   = 60_000; // at least 60 s between spontaneous events
const RANDOM_FIRST_DELAY   = 90_000; // nothing before the first minute
const RANDOM_EVENT_DURATION = 18_000 + 20_000; // 18-38 s drift window

export function useHealthMonitor() {
  const [vitals, setVitals] = useState<Vitals>({ ...NORMAL_VITALS });
  const [externalVitals, setExternalVitals] = useState<Vitals | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [alerts, setAlerts] = useState<HeartAlert[]>([]);

  const engineRef        = useRef(createHealthEngine());
  const targetRef        = useRef<Partial<Vitals>>({});
  const varianceRef      = useRef(0);
  const alertsRef        = useRef<HeartAlert[]>([]);
  const armedEpisode     = useRef(true);
  const randomEventRef   = useRef<{ target: Partial<Vitals>; variance: number; endsAt: number } | null>(null);
  const lastRandomRef    = useRef(Date.now()); // seeded so the first event waits

  /**
   * Point the monitor at an external (live) vitals feed — e.g. the SAME
   * stream the elder device publishes, so heart rate stays identical on
   * the caretaker, the tablet and the elder phone. Pass null to fall back
   * to the local simulation.
   */
  const setExternalSource = useCallback((v: Vitals | null) => {
    setExternalVitals(v);
  }, []);

  // ── Continuous fake vitals stream (only when no real feed) ───────
  useEffect(() => {
    if (externalVitals) return;
    const id = setInterval(() => {
      const now = Date.now();

      // Spontaneous health event scheduler (idle-only, auto-recovers)
      const re = randomEventRef.current;
      if (re && now >= re.endsAt) {
        randomEventRef.current = null;
        lastRandomRef.current = now;
      } else if (!randomEventRef.current
          && Object.keys(targetRef.current).length === 0
          && now - lastRandomRef.current > RANDOM_COOLDOWN_MS
          && now > RANDOM_FIRST_DELAY
          && Math.random() < RANDOM_TICK_CHANCE) {
        const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
        randomEventRef.current = {
          target:   ev.target,
          variance: ev.variance ?? 0,
          endsAt:   now + RANDOM_EVENT_DURATION * (0.9 + Math.random() * 0.2),
        };
      }

      setVitals(prev => {
        const active = randomEventRef.current && now < randomEventRef.current.endsAt
          ? randomEventRef.current
          : null;
        const t = active ? active.target : targetRef.current;
        const variance = active ? active.variance : varianceRef.current;
        const target = (name: keyof Vitals) => t[name] ?? NORMAL_VITALS[name];
        const walk = (cur: number, tg: number, spread: number) => {
          // High-variance scenario (arrhythmia / AFib): bounce hard around target
          if (variance > 0 && Math.random() < 0.55) {
            return Math.round((tg + (Math.random() - 0.5) * variance * 2) * 10) / 10;
          }
          let n = cur + (Math.random() - 0.5) * 2 * spread;
          const lo = tg - 5, hi = tg + 5;
          if (n < lo) n = lo;
          if (n > hi) n = hi;
          return Math.round(n * 10) / 10;
        };
        return {
          heartRate:       walk(prev.heartRate,       target('heartRate'),       4),
          spo2:            walk(prev.spo2,            target('spo2'),            1),
          temperature:     walk(prev.temperature,     target('temperature'),     0.15),
          respiratoryRate: walk(prev.respiratoryRate, target('respiratoryRate'), 2),
          systolic:        walk(prev.systolic,        target('systolic'),        4),
          diastolic:       walk(prev.diastolic,       target('diastolic'),       3),
          glucose:         walk(prev.glucose,         target('glucose'),         4),
        };
      });
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalVitals === null]);

  // ── Reflect the synced external feed into the display + detector ──
  useEffect(() => {
    if (externalVitals) setVitals(externalVitals);
  }, [externalVitals]);

  // ── Detection + local alerting (one alert per episode) ─────────
  useEffect(() => {
    const d = engineRef.current.step(vitals);
    setDetection(d);

    if (!d) {
      // Back to normal → re-arm so the next episode alerts again.
      armedEpisode.current = true;
      return;
    }
    if (!armedEpisode.current) return;

    armedEpisode.current = false;
    pushAlert({
      id: `detect-${Date.now()}`,
      type: 'HEALTH',
      condition: d.label.toUpperCase(),
      severity: d.severity,
      ts: Date.now(),
      source: 'local',
      hr: vitals.heartRate,
      spo2: vitals.spo2,
      temperature: vitals.temperature,
      respiratoryRate: vitals.respiratoryRate,
      systolic: vitals.systolic,
      diastolic: vitals.diastolic,
      glucose: vitals.glucose,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitals]);

  const pushAlert = useCallback((alert: HeartAlert) => {
    const dup = alertsRef.current.some(a =>
      a.condition === alert.condition && a.severity === alert.severity &&
      Math.abs(a.ts - alert.ts) < 45_000);
    if (dup) return;
    const next = [...alertsRef.current, alert];
    alertsRef.current = next;
    setAlerts(next);
  }, []);

  /** Simulate a scenario on this device locally. */
  const simulate = useCallback((cmd: string) => {
    const s = scenarioByCmd(cmd);
    if (!s) return;
    engineRef.current.reset();
    armedEpisode.current = true;
    varianceRef.current = s.variance ?? 0;
    targetRef.current   = { ...s.target };
    randomEventRef.current = null;

    if (s.cmd === 'HRNORMAL') {
      targetRef.current = {};
      setVitals({ ...NORMAL_VITALS });
      setDetection(null);
      return;
    }

    setVitals({
      heartRate:       s.target.heartRate       ?? NORMAL_VITALS.heartRate,
      spo2:            s.target.spo2            ?? NORMAL_VITALS.spo2,
      temperature:     s.target.temperature     ?? NORMAL_VITALS.temperature,
      respiratoryRate: s.target.respiratoryRate ?? NORMAL_VITALS.respiratoryRate,
      systolic:        s.target.systolic        ?? NORMAL_VITALS.systolic,
      diastolic:       s.target.diastolic       ?? NORMAL_VITALS.diastolic,
      glucose:         s.target.glucose         ?? NORMAL_VITALS.glucose,
    });
  }, []);

  /** Register an alert arriving from the elder device (Firebase). */
  const pushElderAlert = useCallback((alert: HeartAlert) => {
    pushAlert(alert);
  }, [pushAlert]);

  const acknowledgeAll = useCallback((source?: HeartAlert['source']) => {
    const next = source
      ? alertsRef.current.filter(a => a.source !== source)
      : [];
    alertsRef.current = next;
    setAlerts(next);
  }, []);

  const activeCritical = alerts.filter(isCriticalHeart)
    .sort((a, b) => b.ts - a.ts)[0] ?? null;

  const severity: HealthSeverity = detection ? detection.severity : 'OK';

  return {
    vitals,
    severity,
    detection,
    alerts,
    activeCritical,
    simulate,
    setExternalSource,
    clear: () => simulate('HRNORMAL'),
    pushElderAlert,
    acknowledgeAll,
  };
}