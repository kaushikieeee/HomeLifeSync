'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Heart, Droplets, Thermometer, Wind, Activity, Gauge, Ban } from 'lucide-react';
import { Vitals, Detection, Scenario } from '@/lib/health';
import { cn } from '@/lib/utils';

type Props = {
  vitals: Vitals;
  detected: Detection | null;
  scenarios: Scenario[];
  connected: boolean;
  onSimulate: (cmd: string) => void;
};

type Row = {
  key: keyof Vitals;
  label: string;
  icon: ReactNode;
  unit: string;
  tint: string;
  range: string;
  color: (v: number) => string;
  ok: (v: number) => boolean;
};

const VITAL_ROWS: Row[] = [
  { key: 'heartRate',       label: 'Heart rate',    icon: <Heart className="w-4 h-4" />, unit: 'bpm',     tint: 'bg-rose-500/10 text-rose-500',    range: '60–100 bpm',     color: v => v < 60 || v > 100 ? 'text-red-500' : 'text-emerald-500', ok: v => v >= 60 && v <= 100 },
  { key: 'spo2',            label: 'O₂ saturation', icon: <Droplets className="w-4 h-4" />, unit: '%',    tint: 'bg-sky-500/10 text-sky-500',      range: '95–100%',         color: v => v < 95 ? 'text-red-500' : 'text-emerald-500',             ok: v => v >= 95 },
  { key: 'temperature',     label: 'Temperature',   icon: <Thermometer className="w-4 h-4" />, unit: '°C', tint: 'bg-amber-500/10 text-amber-500',  range: '36.1–37.2 °C',    color: v => v < 36.1 || v > 37.2 ? 'text-red-500' : 'text-emerald-500', ok: v => v >= 36.1 && v <= 37.2 },
  { key: 'respiratoryRate', label: 'Respiration',   icon: <Wind className="w-4 h-4" />, unit: '/min',  tint: 'bg-violet-500/10 text-violet-500', range: '12–20 /min',       color: v => v < 12 || v > 20 ? 'text-red-500' : 'text-emerald-500',     ok: v => v >= 12 && v <= 20 },
  { key: 'glucose',         label: 'Glucose',       icon: <Gauge className="w-4 h-4" />, unit: 'mg/dL', tint: 'bg-cyan-500/10 text-cyan-500',    range: '70–180 mg/dL',    color: v => v < 70 || v > 180 ? 'text-red-500' : 'text-emerald-500',    ok: v => v >= 70 && v <= 180 },
  { key: 'systolic',        label: 'Blood pressure', icon: <Activity className="w-4 h-4" />, unit: 'mmHg', tint: 'bg-teal-500/10 text-teal-500',  range: '90–120 mmHg',     color: v => v < 90 || v > 120 ? 'text-red-500' : 'text-emerald-500',    ok: v => v >= 90 && v <= 120 },
];

function StatusLine({ ok }: { ok: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
      ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />
      {ok ? 'In range' : 'Out of range'}
    </span>
  );
}

const GROUPS = ['Heart', 'Oxygen', 'Temperature', 'Pressure', 'Respiratory', 'Glucose'] as const;

function groupStyles(severity: string) {
  if (severity === 'CRITICAL') return 'border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20';
  if (severity === 'WARNING')  return 'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20';
  return 'border-border bg-muted/40 text-foreground hover:bg-muted';
}

export function VitalsCard({ vitals, detected, scenarios, connected, onSimulate }: Props) {
  const normal = !detected;
  const [simOpen, setSimOpen] = useState(false);

  return (
    <div className="bg-card rounded-[24px] p-5 border border-border shadow-sm mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold flex items-center gap-2">
          Wearable Vitals <span className="text-muted-foreground font-normal">(simulated)</span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 normal-case bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
          </span>
        </h2>
        <span className="text-[11px] text-muted-foreground">{connected ? 'From elder device' : 'Local simulation'}</span>
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">Continuous fake stream — same detection engine as the elder device.</p>

      {/* Detected condition banner */}
      <div className={cn(
        "rounded-xl px-4 py-3 mb-4 flex items-center gap-3",
        normal ? "bg-emerald-500/10" : detected.severity === 'CRITICAL' ? "bg-red-500/15 animate-pulse" : "bg-amber-500/15"
      )}>
        {normal ? <Heart className="w-5 h-5 text-emerald-500" /> : <Ban className={cn("w-5 h-5", detected.severity === 'CRITICAL' ? "text-red-500" : "text-amber-500")} />}
        <div className="min-w-0">
          <div className={cn("text-[13px] font-bold uppercase tracking-wide", normal ? "text-emerald-600" : detected.severity === 'CRITICAL' ? "text-red-600" : "text-amber-600")}>
            {normal ? 'No abnormal condition' : `${detected.severity}: ${detected.label}`}
          </div>
          {!normal && (
            <div className="text-[11px] text-muted-foreground">
              {detected.vital} = {vitals[detected.vital]} — sustained abnormal reading confirmed
            </div>
          )}
        </div>
      </div>

      {/* Prominent set-all-normal button — always visible */}
      <button
        onClick={() => onSimulate('HRNORMAL')}
        className="w-full mb-4 h-11 rounded-2xl border border-emerald-300 bg-emerald-500/10 text-[13px] font-semibold text-emerald-700 active:scale-[0.98] transition-all duration-150 cursor-pointer hover:bg-emerald-500/20 flex items-center justify-center gap-2"
      >
        <Heart className="w-4 h-4" />
        Set All Vitals to Normal
      </button>

      {/* Live vitals grid */}
      <div className="mb-5">
        {/* Heart rate hero */}
        {(() => {
          const hr = vitals.heartRate;
          const hrOk = hr >= 60 && hr <= 100;
          return (
            <div className={cn(
              "relative overflow-hidden rounded-[20px] border p-4 mb-3",
              hrOk ? "border-rose-200 bg-gradient-to-br from-rose-50/80 to-rose-100/30" : "border-red-400/50 bg-gradient-to-br from-red-50 to-red-100/40"
            )}>
              <div className="pointer-events-none absolute -right-8 -top-10 w-36 h-36 rounded-full bg-rose-400/10" />
              <div className="relative flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                  hrOk ? "bg-rose-500/15 text-rose-500" : "bg-red-500/20 text-red-600"
                )}>
                  <Heart className={cn("w-6 h-6", hrOk && "animate-pulse")} fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">Heart rate</span>
                    <span className="text-[10px] text-muted-foreground font-mono">60–100 bpm</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={cn("text-[40px] font-bold font-mono leading-none tracking-tight", hrOk ? "text-rose-600 dark:text-rose-400" : "text-red-600")}>
                      {hr}
                    </span>
                    <span className="text-[12px] text-muted-foreground">bpm</span>
                  </div>
                </div>
                <StatusLine ok={hrOk} />
              </div>
            </div>
          );
        })()}

        {/* Remaining vitals — 2×3 grid for breathing room */}
        <div className="grid grid-cols-2 gap-3">
          {VITAL_ROWS.filter(r => r.key !== 'heartRate').map(row => (
            <div key={row.key} className="rounded-[16px] border border-border bg-muted/30 p-4 flex flex-col transition-colors duration-150 hover:bg-muted/60">
              <div className="flex items-center gap-2">
                <span className={cn("w-7 h-7 rounded-[10px] flex items-center justify-center shrink-0", row.tint)}>
                  {row.icon}
                </span>
                <span className="text-[12px] font-semibold text-foreground/80 leading-tight">{row.label}</span>
              </div>

              {row.key === 'systolic' ? (
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className={cn("text-[28px] font-bold font-mono leading-none tracking-tight", row.color(vitals.systolic))}>{vitals.systolic}</span>
                  <span className="text-[16px] font-bold font-mono text-muted-foreground">/</span>
                  <span className={cn("text-[28px] font-bold font-mono leading-none tracking-tight", vitals.diastolic < 60 || vitals.diastolic > 80 ? 'text-red-500' : 'text-emerald-500')}>{vitals.diastolic}</span>
                  <span className="text-[11px] text-muted-foreground ml-0.5">mmHg</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className={cn("text-[28px] font-bold font-mono leading-none tracking-tight", row.color(vitals[row.key]))}>{vitals[row.key]}</span>
                  <span className="text-[11px] text-muted-foreground">{row.unit}</span>
                </div>
              )}

              <div className="mt-auto pt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">{row.range}</span>
                <StatusLine ok={row.key === 'systolic'
                  ? (vitals.systolic >= 90 && vitals.systolic <= 120) && (vitals.diastolic >= 60 && vitals.diastolic <= 80)
                  : row.ok(vitals[row.key])} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simulation section — collapsible so the dashboard stays clean */}
      <div className="border-t border-border pt-3 mt-2">
        <button
          onClick={() => setSimOpen(o => !o)}
          className="w-full flex items-center justify-between py-1 cursor-pointer transition-colors duration-150 hover:text-primary"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-500" />
            <span className="text-[13px] font-semibold">Simulate a health event</span>
            <span className="text-[10px] text-muted-foreground font-normal bg-muted px-1.5 py-0.5 rounded-full">demo</span>
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", simOpen && "rotate-180")} />
        </button>

        {simOpen && (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground mb-3">
              {connected
                ? 'Also switches the elder device into the same state — both alert.'
                : 'Raises a loud caretaker warning locally.'}
            </p>
            {GROUPS.map(g => {
              const items = scenarios.filter(s => s.group === g && s.cmd !== 'HRNORMAL');
              if (items.length === 0) return null;
              return (
                <div key={g} className="mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">{g}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {items.map(s => (
                      <button
                        key={s.cmd}
                        onClick={() => onSimulate(s.cmd)}
                        className={cn("h-10 rounded-xl border text-[11px] font-medium active:scale-[0.97] transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 px-2", groupStyles(s.expectedSeverity))}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => onSimulate('HRNORMAL')}
              className="mt-2 w-full h-10 rounded-xl border border-border bg-muted/50 text-[13px] font-medium text-foreground active:scale-[0.98] transition-all duration-150 cursor-pointer hover:bg-muted"
            >
              Reset to Normal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}