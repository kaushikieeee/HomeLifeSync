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
 * - A confirmed WARNING/CRITICAL detection raises ONE loud HeartAlert per
 *   episode (re-armed only after vitals return to normal). Elder-device
 *   alerts arriving via Firebase are injected through pushElderAlert and
 *   share the same list, so the caretaker warns loudly either way.
 */
export function useHealthMonitor() {
  const [vitals, setVitals] = useState<Vitals>({ ...NORMAL_VITALS });
  const [externalVitals, setExternalVitals] = useState<Vitals | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [alerts, setAlerts] = useState<HeartAlert[]>([]);

  const engineRef    = useRef(createHealthEngine());
  const targetRef    = useRef<Partial<Vitals>>({});
  const varianceRef  = useRef(0);
  const alertsRef    = useRef<HeartAlert[]>([]);
  const armedEpisode = useRef(true);

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
      setVitals(prev => {
        const t = targetRef.current;
        const target = (name: keyof Vitals) => t[name] ?? NORMAL_VITALS[name];
        const walk = (cur: number, tg: number, spread: number) => {
          // High-variance scenario (arrhythmia / AFib): bounce hard around target
          if (varianceRef.current > 0 && Math.random() < 0.55) {
            return Math.round((tg + (Math.random() - 0.5) * varianceRef.current * 2) * 10) / 10;
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
      Math.abs(a.ts - alert.ts) < 20_000);
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