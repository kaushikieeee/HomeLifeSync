'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { HeartAlert } from '@/lib/commands';
import { cn } from '@/lib/utils';

type Props = {
  alert: HeartAlert | null;
  onAcknowledge: () => void;
};

const VITAL_LABELS: { key: 'hr' | 'spo2' | 'temperature' | 'systolic' | 'respiratoryRate' | 'glucose' | 'diastolic'; label: string; unit: string }[] = [
  { key: 'hr',               label: 'Heart rate', unit: 'bpm' },
  { key: 'spo2',             label: 'O₂ sat',     unit: '%' },
  { key: 'temperature',      label: 'Temp',       unit: '°C' },
  { key: 'systolic',         label: 'BP',         unit: 'mmHg' },
  { key: 'respiratoryRate',  label: 'Respiration', unit: '/min' },
  { key: 'glucose',          label: 'Glucose',    unit: 'mg/dL' },
];

function playSiren() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const beep = (freq: number, dur: number, delay: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = 'square';
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + dur);
    };
    [0, 0.28, 0.56, 0.84].forEach((t, i) => beep(i % 2 === 0 ? 880 : 620, 0.26, t));
    setTimeout(() => ctx.close(), 2000);
  } catch {
    /* audio unavailable — visual alarm is enough */
  }
}

export function HeartAlertOverlay({ alert, onAcknowledge }: Props) {
  const sirenPlayedFor = useRef<string | null>(null);

  useEffect(() => {
    if (alert && sirenPlayedFor.current !== alert.id) {
      sirenPlayedFor.current = alert.id;
      playSiren();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([300, 100, 300, 100, 500]);
      }
      toast.error(`${alert.severity}: ${alert.condition}`, {
        description: alert.hr
          ? `HR ${alert.hr} bpm · SpO₂ ${alert.spo2 ?? '–'}%`
          : 'Health alert received from the elder device.',
      });
    }
  }, [alert]);

  const critical = alert?.severity === 'CRITICAL';

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
        >
          {/* Backdrop */}
          <div className={cn(
            "absolute inset-0",
            critical ? "bg-red-600/40 backdrop-blur-sm" : "bg-amber-500/30 backdrop-blur-sm"
          )} />

          {/* Alert card */}
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className={cn(
              "relative w-full max-w-md rounded-[28px] p-7 text-center shadow-2xl border-2 overflow-hidden",
              critical ? "bg-red-950 border-red-500 text-white" : "bg-amber-950 border-amber-400 text-white"
            )}
          >
            {/* Pulsing radial glow */}
            <div className={cn(
              "absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl",
              critical ? "bg-red-500/40 animate-pulse" : "bg-amber-500/40 animate-pulse"
            )} />

            <div className="relative">
              <div className={cn(
                "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 animate-pulse",
                critical ? "bg-red-500/30" : "bg-amber-500/30"
              )}>
                <Heart className="w-10 h-10 text-red-400" fill="currentColor" />
              </div>

              <motion.div
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 bg-white/10"
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[12px] font-bold tracking-widest uppercase">
                  {critical ? 'Critical' : 'Warning'} — Health Alert
                </span>
              </motion.div>

              <h2 className="text-[30px] font-bold leading-tight mb-1 uppercase">
                {alert.condition}
              </h2>
              <p className="text-[13px] text-white/70 mb-6">
                {alert.source === 'elder' ? 'From elder device' : 'Detected on this device'}
                {' · '}{new Date(alert.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>

              {/* Vitals snapshot */}
              <div className="grid grid-cols-3 gap-2 mb-7">
                {VITAL_LABELS.map(v => {
                  const value = v.key === 'systolic' ? alert.systolic : alert[v.key];
                  if (value == null) return null;
                  return (
                    <div key={v.key} className="rounded-xl bg-white/10 p-2.5">
                      <div className="text-[9px] uppercase tracking-wide text-white/60 mb-0.5">{v.label}</div>
                      <div className="text-[17px] font-bold font-mono leading-none">
                        {v.key === 'systolic' && alert.diastolic != null
                          ? `${alert.systolic}/${alert.diastolic}`
                          : value}
                      </div>
                      <div className="text-[9px] text-white/50 font-mono mt-0.5">{v.unit}</div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onAcknowledge}
                className="w-full h-13 py-3.5 rounded-2xl bg-white text-red-700 font-bold text-[16px] active:scale-[0.98] transition-all duration-150 cursor-pointer shadow-lg hover:bg-white/90 hover:shadow-xl"
              >
                ACKNOWLEDGE
              </button>
              <p className="text-[11px] text-white/50 mt-3 flex items-center justify-center gap-1">
                <X className="w-3 h-3" /> Remains dismissed until the condition clears or a new alert arrives
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}