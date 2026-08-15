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
  color: (v: number) => string;
};

const VITAL_ROWS: Row[] = [
  { key: 'heartRate',       label: 'Heart rate',       icon: <Heart className="w-4 h-4" />, unit: 'bpm',     color: v => v < 60 || v > 100 ? 'text-red-500' : 'text-emerald-500' },
  { key: 'spo2',            label: 'O₂ saturation',    icon: <Droplets className="w-4 h-4" />, unit: '%',     color: v => v < 95 ? 'text-red-500' : 'text-emerald-500' },
  { key: 'temperature',     label: 'Temperature',      icon: <Thermometer className="w-4 h-4" />, unit: '°C', color: v => v < 36.1 || v > 37.2 ? 'text-red-500' : 'text-emerald-500' },
  { key: 'respiratoryRate', label: 'Respiration',      icon: <Wind className="w-4 h-4" />, unit: '/min',  color: v => v < 12 || v > 20 ? 'text-red-500' : 'text-emerald-500' },
  { key: 'glucose',         label: 'Glucose',          icon: <Gauge className="w-4 h-4" />, unit: 'mg/dL', color: v => v < 70 || v > 180 ? 'text-red-500' : 'text-emerald-500' },
  { key: 'systolic',        label: 'Blood pressure',   icon: <Activity className="w-4 h-4" />, unit: 'mmHg', color: v => v < 90 || v > 120 ? 'text-red-500' : 'text-emerald-500' },
];

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
        <h2 className="text-[15px] font-semibold">Wearable Vitals <span className="text-muted-foreground font-normal">(simulated)</span></h2>
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

      {/* Live vitals grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {VITAL_ROWS.map(row => (
          <div key={row.key} className="rounded-2xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
              {row.icon}
              {row.label}
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-[24px] font-bold font-mono leading-none", row.color(vitals[row.key]))}>{vitals[row.key]}</span>
              <span className="text-[10px] text-muted-foreground">{row.unit}</span>
            </div>
            {row.key === 'systolic' && (
              <div className="text-[12px] font-mono text-muted-foreground">/
                <span className={vitals.diastolic < 60 || vitals.diastolic > 80 ? 'text-red-500' : 'text-emerald-500'}>{vitals.diastolic}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Simulation section — collapsible so the dashboard stays clean */}
      <div className="border-t border-border pt-3 mt-2">
        <button
          onClick={() => setSimOpen(o => !o)}
          className="w-full flex items-center justify-between py-1"
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
                        className={cn("h-10 rounded-xl border text-[11px] font-medium active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5 px-2", groupStyles(s.expectedSeverity))}
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
              className="mt-2 w-full h-10 rounded-xl border border-border bg-muted/50 text-[13px] font-medium text-foreground active:scale-[0.98] transition-transform"
            >
              Reset to Normal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}