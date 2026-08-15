"use client";

import { useState, useEffect } from "react";
import {
  Battery, Wifi, MapPin, Heart, Shield, Clock, Lock, Unlock, Zap,
  Thermometer, Moon, Sun, Smartphone, CheckCircle2, Wind,
  Volume2, VolumeX, Power, Tv, ArrowRight, Bell, Activity, RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NORMAL_VITALS, Vitals } from "@/lib/health";
import { useFirebaseDevice } from "@/hooks/use-firebase-device";
import { useElderAlerts } from "@/hooks/use-elder-alerts";
import { firebaseConfigured } from "@/lib/firebase";
import { isCriticalHeart } from "@/lib/commands";

// ── Runtime state (mock; a live Firebase feed can drive the same cards) ──

interface RuntimeState {
  sos: boolean;
  fall: boolean;
  doorLocked: boolean;
  livingLight: boolean;
  bedLight: boolean;
  fan: boolean;
  roomTemp: number;
  moving: boolean;
  battery: number;
  charging: boolean;
  wifi: boolean;
  torch: boolean;
  silent: boolean;
  condition: string;
  lastEvent: { message: string; time: Date } | null;
}

const INITIAL: RuntimeState = {
  sos: false, fall: false, doorLocked: true, livingLight: false,
  bedLight: false, fan: false, roomTemp: 24, moving: false, battery: 85,
  charging: false, wifi: true, torch: false, silent: false, condition: "",
  lastEvent: null,
};

function rnd(spread: number) { return (Math.random() - 0.5) * 2 * spread; }
function clamp(v: number, lo: number, hi: number) { return Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10; }

type Setup = { room: string; deviceId: string };
const SETUP_KEY = "tablet_setup";

// ── Setup wizard (first run / reconfigure) ────────────────────────────

function SetupWizard({ initial, onSave, onCancel }: {
  initial: Setup | null;
  onSave: (s: Setup) => void;
  onCancel?: () => void;
}) {
  const [room, setRoom] = useState(initial?.room ?? "");
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? "");
  const ready = room.trim().length > 0 && deviceId.trim().length >= 4;

  return (
    <div className="h-screen bg-background flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[32px] font-bold tracking-tight text-foreground">
            <span className="text-[#FF9933]">Home</span>Sync
            <span className="text-[#138808]">.</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Home display · setup</p>
        </div>

        <div className="bg-card p-6 rounded-[24px] shadow-sm border border-border">
          <Tv className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold tracking-tight text-center mb-1">Where is this screen?</h2>
          <p className="text-muted-foreground text-sm text-center mb-5 leading-relaxed">
            Name this display (e.g. “Kitchen TV”) and enter your loved one's Device
            ID to watch their status from any room.
          </p>

          <label className="text-[12px] text-muted-foreground mb-1 block">Display name</label>
          <Input
            value={room}
            onChange={e => setRoom(e.target.value)}
            placeholder="e.g. Kitchen display"
            className="h-12 rounded-xl mb-4"
          />

          <label className="text-[12px] text-muted-foreground mb-1 block">Elder device ID</label>
          <Input
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            placeholder="e.g. a1b2c3d4"
            className="h-12 rounded-xl text-center font-mono tracking-widest"
          />

          <Button onClick={() => onSave({ room: room.trim(), deviceId: deviceId.trim() })}
            disabled={!ready}
            className="w-full h-12 rounded-xl bg-primary text-lg font-semibold mt-5">
            Start dashboard <ArrowRight className="w-4 h-4" />
          </Button>

          {onCancel && (
            <button onClick={onCancel} className="w-full text-center text-muted-foreground text-[13px] mt-3">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────

export function TabletDashboard() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [run, setRun] = useState<RuntimeState>(INITIAL);
  const [vitals, setVitals] = useState<Vitals>({ ...NORMAL_VITALS });

  useEffect(() => {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) {
      try { setSetup(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  // Live elder feed — only when a device is paired AND Firebase is configured.
  // Without it the display runs its local simulation so it never looks dead.
  const live = !!setup && firebaseConfigured;
  const { deviceStatus, connected } = useFirebaseDevice(live ? setup.deviceId : null);

  // Lively vitals — gentle random walk around normal. Paused while the real
  // elder feed is streaming, otherwise the two writers would fight.
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => {
      setVitals(v => ({
        heartRate:       clamp(v.heartRate + rnd(4), 65, 85),
        spo2:            clamp(v.spo2 + rnd(1), 96, 99),
        temperature:     clamp(v.temperature + rnd(0.15), 36.2, 37.1),
        respiratoryRate: clamp(v.respiratoryRate + rnd(2), 13, 18),
        systolic:        clamp(v.systolic + rnd(4), 112, 128),
        diastolic:       clamp(v.diastolic + rnd(3), 72, 84),
        glucose:         clamp(v.glucose + rnd(4), 100, 120),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [live]);

  // Live vitals from the elder device.
  useEffect(() => {
    if (!deviceStatus || deviceStatus.heartRate == null) return;
    setVitals({
      heartRate:       deviceStatus.heartRate,
      spo2:            deviceStatus.spo2 ?? NORMAL_VITALS.spo2,
      temperature:     deviceStatus.temperature ?? NORMAL_VITALS.temperature,
      respiratoryRate: deviceStatus.respiratoryRate ?? NORMAL_VITALS.respiratoryRate,
      systolic:        deviceStatus.systolic ?? NORMAL_VITALS.systolic,
      diastolic:       deviceStatus.diastolic ?? NORMAL_VITALS.diastolic,
      glucose:         deviceStatus.glucose ?? NORMAL_VITALS.glucose,
    });
  }, [deviceStatus]);

  // Battery / charging streamed from the elder device.
  useEffect(() => {
    if (!deviceStatus) return;
    setRun(p => ({
      ...p,
      battery:  deviceStatus.battery ?? p.battery,
      charging: deviceStatus.charging ?? p.charging,
    }));
  }, [deviceStatus]);

  // A WARNING/CRITICAL condition on the elder device raises the safety card.
  useEffect(() => {
    if (!deviceStatus?.heartSeverity) return;
    if (deviceStatus.heartSeverity === 'CRITICAL' || deviceStatus.heartSeverity === 'WARNING') {
      setRun(p => ({ ...p, condition: deviceStatus.heartCondition ?? 'CONDITION ALERT' }));
    }
  }, [deviceStatus]);

  // Health alerts pushed by the elder device → show on the activity strip.
  useElderAlerts(live ? setup.deviceId : null, (alert) => {
    setRun(p => ({
      ...p,
      lastEvent: { message: `${alert.condition} (${alert.severity})`, time: new Date() },
      ...(isCriticalHeart(alert) ? { condition: alert.condition } : {}),
    }));
  });

  // Event feed (mock SMS events; a live feed hooks in here).
  useEffect(() => {
    const handle = (e: CustomEvent) => {
      const text = String(e.detail?.message ?? "").toUpperCase();
      const now = new Date();
      let msg = `Received: ${text}`;
      setRun(p => {
        const n = { ...p };
        if (text.includes("SOS")) { n.sos = true; msg = "SOS alert"; }
        if (text.includes("SOSACK") || text.includes("SAFE")) { n.sos = false; msg = "SOS cleared"; }
        if (text.includes("FALL")) { n.fall = true; msg = "Fall detected"; }
        if (text.includes("LOCKED")) n.doorLocked = true;
        if (text.includes("UNLOCKED")) n.doorLocked = false;
        if (text.includes("LIVINGLIGHTON")) n.livingLight = true;
        if (text.includes("LIVINGLIGHTOFF")) n.livingLight = false;
        if (text.includes("BEDLIGHTON")) n.bedLight = true;
        if (text.includes("BEDLIGHTOFF")) n.bedLight = false;
        if (text.includes("FANON")) n.fan = true;
        if (text.includes("FANOFF")) n.fan = false;
        if (text.includes("BATLOW")) n.battery = 15;
        if (text.includes("CHARGING")) n.charging = true;
        if (text.includes("NOTCHARGING")) n.charging = false;
        if (text.includes("WIFIDOWN")) n.wifi = false;
        if (text.includes("WIFIUP")) n.wifi = true;
        if (text.includes("TORCHON")) n.torch = true;
        if (text.includes("TORCHOFF")) n.torch = false;
        if (text.includes("SILENT")) n.silent = true;
        if (text.includes("UNMUTE")) n.silent = false;
        if (text.includes("MOVING")) n.moving = true;
        if (text.includes("STATIONARY")) n.moving = false;
        n.lastEvent = { message: msg, time: now };
        return n;
      });
    };
    window.addEventListener("mock-sms", handle as EventListener);
    return () => window.removeEventListener("mock-sms", handle as EventListener);
  }, []);

  // Eldest-source-wins display values (real feed overrides the simulation).
  const battery = deviceStatus?.battery ?? run.battery;
  const charging = deviceStatus?.charging ?? run.charging;
  const wifiUp = live ? connected : run.wifi;

  if (!setup || showWizard) {
    return (
      <SetupWizard
        initial={setup}
        onSave={(s) => { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); setSetup(s); setShowWizard(false); }}
        onCancel={setup ? () => setShowWizard(false) : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background p-5 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            <span className="text-[#FF9933]">Home</span>Sync
            <span className="text-[#138808]">.</span>
          </h1>
          <span className="hidden sm:flex text-muted-foreground text-sm">{setup.room}</span>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
          <div className={cn(
            "hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold",
            wifiUp ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
          )}>
            <span className={cn("w-2 h-2 rounded-full", wifiUp ? "bg-emerald-500" : "bg-amber-500")} />
            {wifiUp ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] font-mono">
            <Battery className={cn("w-4 h-4", battery < 20 ? "text-red-500" : "text-emerald-500")} />
            {battery}%
          </div>
          <div className="text-xl font-mono">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <button
            onClick={() => setShowWizard(true)}
            title="Reconfigure"
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center active:opacity-70"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Safety */}
        <section className={cn(
          "rounded-3xl border p-5 flex flex-col gap-2 col-span-1",
          run.sos || run.condition ? "border-red-500/50 bg-red-500/10 animate-pulse" : "border-border bg-card"
        )}>
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium">
            <Shield className="w-4 h-4" /> Safety
          </div>
          <div className={cn("text-3xl font-bold leading-none mt-1", (run.sos || run.condition) ? "text-red-600" : "text-emerald-600")}>
            {run.sos ? "SOS ACTIVE" : run.condition ? "CONDITION" : "SECURE"}
          </div>
          {run.condition && !run.sos && (
            <div className="mt-1 bg-red-500/15 text-red-600 text-[12px] font-semibold rounded-xl p-2 flex items-center gap-2">
              <Heart className="w-4 h-4" /> {run.condition}
            </div>
          )}
          {run.fall && (
            <div className="mt-1 bg-red-500/15 text-red-600 text-[12px] font-semibold rounded-xl p-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Fall detected
            </div>
          )}
          <div className="text-[12px] text-muted-foreground mt-2">{setup.deviceId}</div>
        </section>

        {/* Vitals */}
        <section className="rounded-3xl border border-border bg-card p-5 col-span-1 sm:col-span-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium mb-3">
            <Heart className="w-4 h-4" /> Vitals <span className="text-[10px] text-muted-foreground/70">· {live ? "from elder device" : "simulated"}</span>
          </div>
          <MonitorPanel vitals={vitals} />
        </section>

        {/* Home */}
        <section className="rounded-3xl border border-border bg-card p-5 col-span-1 sm:col-span-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium mb-3">
            <Zap className="w-4 h-4" /> Home
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ToggleTile active={run.doorLocked} icon={run.doorLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
              label={run.doorLocked ? "Door locked" : "Door unlocked"} accent={run.doorLocked ? "text-blue-500" : "text-orange-500"} />
            <ToggleTile active={run.livingLight} icon={<Sun className="w-5 h-5" />} label="Living room" accent="text-yellow-500" />
            <ToggleTile active={run.bedLight}    icon={<Moon className="w-5 h-5" />} label="Bedroom" accent="text-purple-500" />
            <ToggleTile active={run.fan}         icon={<Wind className="w-5 h-5" />} label="Fan" accent="text-cyan-500" />
          </div>
        </section>

        {/* Device */}
        <section className="rounded-3xl border border-border bg-card p-5 col-span-1">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium mb-3">
            <Smartphone className="w-4 h-4" /> Elder device
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ToggleTile active={run.torch}  icon={<Power className="w-5 h-5" />} label="Torch" accent="text-yellow-500" />
            <ToggleTile active={!run.silent} icon={run.silent ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              label={run.silent ? "Silent" : "Ringing"} accent="text-blue-500" />
            <ToggleTile active={charging} icon={<Zap className="w-5 h-5" />} label={charging ? "Charging" : "On battery"} accent="text-emerald-500" />
            <ToggleTile active={wifiUp} icon={<Wifi className="w-5 h-5" />} label={wifiUp ? "Wi-Fi" : "Offline"} accent="text-sky-500" />
          </div>
        </section>

        {/* Activity + location */}
        <section className="rounded-3xl border border-border bg-card p-5 col-span-1 sm:col-span-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium mb-3">
            <Clock className="w-4 h-4" /> Activity
          </div>
          {run.lastEvent ? (
            <div className="flex items-center gap-3 py-1">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <div className="text-[14px] text-foreground">{run.lastEvent.message}</div>
              <div className="text-[12px] text-muted-foreground ml-auto font-mono">
                {run.lastEvent.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No events yet. Watch this space for alerts and replies.</p>
          )}

          <div className="border-t border-border mt-4 pt-3 mt-3 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <div className="text-[14px] text-foreground">Home — 123 Main St</div>
            <span className={cn(
              "text-[11px] font-semibold px-2.5 py-1 rounded-full",
              run.moving ? "bg-blue-500/10 text-blue-600" : "bg-muted text-muted-foreground"
            )}>
              {run.moving ? "Moving" : "Stationary"}
            </span>
          </div>
        </section>

        {/* Conditions / heartbeat strip */}
        <section className="rounded-3xl border border-border bg-card p-5 col-span-1 sm:col-span-1 flex flex-col justify-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground text-[13px] font-medium">
            <CheckCircle2 className="w-4 h-4" /> Status
          </div>
          <div className={cn(
            "text-[15px] font-semibold flex items-center gap-2",
            run.condition ? "text-red-600" : "text-emerald-600"
          )}>
            <Bell className="w-4 h-4" /> {run.condition ? run.condition : "No alerts"}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-[12px]">
            <Thermometer className="w-4 h-4" /> Home {run.roomTemp}°C
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Monitor-style vitals panel ──────────────────────────────────────

const POINTS = 90;
const GLOW = "drop-shadow(0 0 3px VAR) drop-shadow(0 0 1px VAR)";

type TraceKey = "heartRate" | "spo2" | "temperature" | "respiratoryRate" | "systolic" | "diastolic";

const TRACES: { key: TraceKey; label: string; unit: string; min: number; max: number; color: string }[] = [
  { key: "heartRate",       label: "HR",    unit: "bpm",   min: 55,  max: 105, color: "#4ade80" },
  { key: "spo2",            label: "SpO₂",  unit: "%",     min: 93,  max: 101, color: "#22d3ee" },
  { key: "respiratoryRate", label: "RESP",  unit: "/min",  min: 8,   max: 26,  color: "#facc15" },
  { key: "temperature",     label: "TEMP",  unit: "°C",    min: 35.8, max: 37.6, color: "#fb923c" },
  { key: "systolic",        label: "SYS",   unit: "mmHg",  min: 95,  max: 145, color: "#a78bfa" },
  { key: "diastolic",       label: "DIA",   unit: "mmHg",  min: 60,  max: 100, color: "#f472b6" },
];

function fmt(v: number, t: (typeof TRACES)[number]) {
  return t.key === "temperature" ? v.toFixed(1) : String(Math.round(v));
}

function MonitorPanel({ vitals }: { vitals: Vitals }) {
  const [buffers, setBuffers] = useState<Record<string, number[]>>({});

  useEffect(() => {
    setBuffers(prev => {
      const next: Record<string, number[]> = {};
      for (const t of TRACES) {
        const arr = [...(prev[t.key] ?? []), vitals[t.key]];
        next[t.key] = arr.length > POINTS ? arr.slice(arr.length - POINTS) : arr;
      }
      return next;
    });
  }, [vitals]);

  return (
    <div className="rounded-2xl bg-[#05090f] border border-white/10 overflow-hidden">
      <div className="grid grid-cols-2 gap-x-3">
        {TRACES.map(t => (
          <WaveStrip key={t.key} trace={t} values={buffers[t.key] ?? []} />
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono tracking-widest text-white/50 border-t border-white/10">
        <span>GLUC {vitals.glucose} mg/dL</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
        </span>
      </div>
    </div>
  );
}

function WaveStrip({ trace, values }: { trace: (typeof TRACES)[number]; values: number[] }) {
  const yOf = (v: number) => 2 + (1 - (Math.min(trace.max, Math.max(trace.min, v)) - trace.min) / (trace.max - trace.min)) * 20;
  const points = values.map((v, i) => `${(i / (POINTS - 1)) * 100},${yOf(v).toFixed(2)}`).join(" ");
  const last = values.length ? values[values.length - 1] : null;

  return (
    <div className="flex flex-col h-[74px] px-3 pt-2">
      <div className="flex items-baseline justify-between leading-none">
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/60">{trace.label}</span>
        <span className="text-[12px] font-mono font-bold text-white">
          {last != null ? fmt(last, trace) : "--"}
          <span className="text-white/40 text-[9px] ml-0.5">{trace.unit}</span>
        </span>
      </div>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="flex-1 w-full -ml-1">
        <line x1="0" y1="12" x2="100" y2="12" stroke="rgba(255,255,255,0.07)" />
        <line x1="0" y1="5" x2="100" y2="5" stroke="rgba(255,255,255,0.03)" />
        <line x1="0" y1="19" x2="100" y2="19" stroke="rgba(255,255,255,0.03)" />
        <line x1="100" y1="0" x2="100" y2="24" stroke="rgba(255,255,255,0.12)" />
        {last != null && (
          <line x1="0" y1={yOf(last)} x2="100" y2={yOf(last)} stroke={trace.color} strokeOpacity="0.18" />
        )}
        <polyline
          points={points}
          fill="none"
          stroke={trace.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: GLOW.replaceAll("VAR", trace.color) }}
        />
      </svg>
    </div>
  );
}

function ToggleTile({ active, icon, label, accent }: { active: boolean; icon: React.ReactNode; label: string; accent: string }) {
  return (
    <div className={cn(
      "rounded-2xl border p-3 flex flex-col gap-2 transition-colors",
      active ? "border-border bg-muted/40" : "border-border bg-transparent opacity-60"
    )}>
      <div className={cn(active ? accent : "text-muted-foreground")}>{icon}</div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
      </div>
    </div>
  );
}