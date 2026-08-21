"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  House, Smartphone, HeartPulse, Heart, Droplets, Thermometer, Wind,
  Activity, Gauge, Battery, Wifi, Clock, MapPin, ExternalLink, RefreshCcw,
  ShieldCheck, ShieldAlert, Sunrise, CloudSun, MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirebaseDevice } from "@/hooks/use-firebase-device";
import { useElderAlerts } from "@/hooks/use-elder-alerts";
import { useHaptic, useSelectionHaptic } from "@/hooks/use-haptic";
import { verifyPairing, DEVICE_ID_RE, PAIRING_CODE_RE } from "@/lib/pairing";
import { firebaseConfigured } from "@/lib/firebase";
import { NORMAL_VITALS } from "@/lib/health";
import type { HeartAlert } from "@/lib/commands";

// ── Setup (first run / reconfigure) ────────────────────────────────────

type Setup = { room: string; deviceId: string };
const SETUP_KEY = "tablet_setup";

function SetupWizard({ initial, onSave, onCancel }: {
  initial: Setup | null;
  onSave: (s: Setup) => void;
  onCancel?: () => void;
}) {
  const haptic = useHaptic();
  const [room, setRoom] = useState(initial?.room ?? "");
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? "");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const deviceOk = DEVICE_ID_RE.test(deviceId.trim());
  const codeOk = PAIRING_CODE_RE.test(code.trim());
  const ready = room.trim().length > 0 && deviceOk && codeOk;

  // Pairing requires the 4-digit code that the elder app is showing right
  // now — a random device ID alone is never enough.
  const submit = async () => {
    setVerifying(true);
    setVerifyErr(null);
    const result = await verifyPairing(deviceId, code);
    setVerifying(false);
    if (!result.ok) {
      setVerifyErr(result.reason);
      return;
    }
    void haptic();
    onSave({ room: room.trim(), deviceId: deviceId.trim().toLowerCase() });
  };

  return (
    <div className="min-h-screen bg-[#f1ede6] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="text-center mb-7"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-[22px] bg-gradient-to-br from-[#34a853] to-[#0f7b34] flex items-center justify-center shadow-lg shadow-green-500/25">
            <MonitorSmartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#202124]">Link HomeHub</h1>
          <p className="text-[#5f6368] mt-1 text-[15px]">
            Connect this display to your loved one&apos;s device — enter the
            Device&nbsp;ID and the 4-digit pairing code shown on their app.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="bg-white p-6 rounded-[28px] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)]"
        >
          <label className="text-[12px] text-[#5f6368] mb-1.5 block font-medium">Display name</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. Kitchen display"
            className="w-full h-12 rounded-2xl border border-[#dadce0] bg-[#f8f9fa] px-4 text-[15px] text-[#202124] outline-none focus:border-[#4285f4] focus:ring-2 focus:ring-[#4285f4]/20 transition mb-4"
          />

          <label className="text-[12px] text-[#5f6368] mb-1.5 block font-medium">Loved one&apos;s device ID</label>
          <input
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); setVerifyErr(null); }}
            placeholder="e.g. a1b2c3d4"
            className={cn(
              "w-full h-12 rounded-2xl border border-[#dadce0] bg-[#f8f9fa] px-4 text-center text-lg tracking-[0.3em] font-mono text-[#202124] outline-none transition",
              deviceId.trim() && !deviceOk
                ? "border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-300/30"
                : "focus:border-[#4285f4] focus:ring-2 focus:ring-[#4285f4]/20"
            )}
          />
          {deviceId.trim() && !deviceOk && (
            <p className="text-[12px] text-[#d93025] mt-2">
              The ID is 8 characters (letters a&#8211;f and numbers 0&#8211;9). Ask your loved one to tap it on their app.
            </p>
          )}

          <label className="text-[12px] text-[#5f6368] mb-1.5 mt-4 block font-medium">Pairing code</label>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setVerifyErr(null); }}
            placeholder="e.g. 4829"
            inputMode="numeric"
            className={cn(
              "w-full h-12 rounded-2xl border border-[#dadce0] bg-[#f8f9fa] px-4 text-center text-lg tracking-[0.5em] font-mono text-[#202124] outline-none transition",
              code.trim() && !codeOk
                ? "border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-300/30"
                : "focus:border-[#4285f4] focus:ring-2 focus:ring-[#4285f4]/20"
            )}
          />
          <p className="text-[12px] text-[#5f6368] mt-2">
            Shown on the elder&apos;s app — temporary, valid for 5 minutes. Tap
            &quot;New code&quot; there if it expired.
          </p>

          {verifyErr && (
            <p className="text-[12px] text-[#d93025] mt-3 bg-red-50 rounded-xl px-3 py-2.5 leading-relaxed">
              {verifyErr}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={!ready || verifying}
            className={cn(
              "w-full h-12 rounded-2xl mt-5 text-[15px] font-semibold text-white transition flex items-center justify-center gap-2",
              ready && !verifying
                ? "bg-[#1a73e8] hover:bg-[#1765cc] active:scale-[0.98] shadow-md shadow-blue-500/25"
                : "bg-[#dadce0] text-[#5f6368] cursor-not-allowed"
            )}
          >
            {verifying ? "Verifying…" : "Link this display"}
          </button>

          {onCancel && (
            <button onClick={onCancel}
              className="w-full text-center text-[#5f6368] text-[13px] mt-4 cursor-pointer hover:text-[#202124] transition">
              Cancel
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ── Weather (Open-Meteo — free, no API key) ────────────────────────────

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const LOC_KEY = "hub_location";

// Fallback when geolocation is refused/unavailable — set these to the
// elder's home town.
const FALLBACK_LOC = { lat: 9.9312, lng: 76.2673, name: "current town" };

type Weather = {
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  tMax: number;
  tMin: number;
  sunrise: string;
  sunset: string;
  place: string;
};

function wmo(code: number, isDay: boolean): { emoji: string; label: string } {
  if (code === 0) return isDay ? { emoji: "☀️", label: "Clear skies" } : { emoji: "🌙", label: "Clear night" };
  if (code === 1) return isDay ? { emoji: "🌤️", label: "Mostly clear" } : { emoji: "🌙", label: "Clear night" };
  if (code === 2) return { emoji: "⛅", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Overcast" };
  if (code <= 48) return { emoji: "🌫️", label: "Foggy" };
  if (code <= 57) return { emoji: "🌦️", label: "Drizzle" };
  if (code <= 67) return { emoji: "🌧️", label: "Rain" };
  if (code <= 77) return { emoji: "🌨️", label: "Snow" };
  if (code <= 82) return { emoji: "🌧️", label: "Showers" };
  if (code <= 86) return { emoji: "🌨️", label: "Snow showers" };
  return { emoji: "⛈️", label: "Thunderstorm" };
}

function WeatherCard({ onRefresh }: { onRefresh: (w: Weather) => void }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchWeather = useCallback(async () => {
    try {
      let loc = FALLBACK_LOC;
      try {
        const cached = localStorage.getItem(LOC_KEY);
        if (cached) {
          const c = JSON.parse(cached) as { lat: number; lng: number };
          if (typeof c.lat === "number" && typeof c.lng === "number") loc = { lat: c.lat, lng: c.lng, name: "your location" };
        } else {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            const id = navigator.geolocation?.watchPosition(
              (p) => { navigator.geolocation.clearWatch(id); resolve(p); },
              (err) => { navigator.geolocation?.clearWatch(id); reject(err); },
              { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
            );
            if (id == null) reject(new Error("no geolocation"));
            setTimeout(() => { navigator.geolocation?.clearWatch(id); reject(new Error("timeout")); }, 6500);
          });
          loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: "your location" };
          localStorage.setItem(LOC_KEY, JSON.stringify({ lat: loc.lat, lng: loc.lng }));
        }
      } catch { /* fall through to constant */ }

      const params = new URLSearchParams({
        latitude: String(loc.lat),
        longitude: String(loc.lng),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
        timezone: "auto",
        forecast_days: "1",
      });
      const res = await fetch(`${WEATHER_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const j = (await res.json()) as {
        current: { temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; is_day: number; weather_code: number; wind_speed_10m: number };
        daily: { weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] };
      };
      const w: Weather = {
        temp: j.current.temperature_2m,
        feels: j.current.apparent_temperature,
        humidity: j.current.relative_humidity_2m,
        wind: j.current.wind_speed_10m,
        code: j.current.weather_code,
        isDay: j.current.is_day === 1,
        tMax: j.daily.temperature_2m_max[0],
        tMin: j.daily.temperature_2m_min[0],
        sunrise: j.daily.sunrise[0],
        sunset: j.daily.sunset[0],
        place: loc.name,
      };
      setWeather(w);
      setFailed(false);
      onRefresh(w);
    } catch {
      setFailed(true);
    }
  }, [onRefresh]);

  useEffect(() => {
    void fetchWeather();
    const id = setInterval(() => void fetchWeather(), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchWeather]);

  const meta = weather ? wmo(weather.code, weather.isDay) : null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="bg-white rounded-[28px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#5f6368] uppercase tracking-wider mb-3">
        <CloudSun className="w-4 h-4" /> Weather
      </div>
      {!weather && !failed && (
        <div className="text-[13px] text-[#5f6368] py-6 text-center">Fetching the forecast…</div>
      )}
      {!weather && failed && (
        <div className="py-6 flex flex-col items-center gap-3">
          <span className="text-[28px]">🌤️</span>
          <div className="text-[13px] text-[#5f6368] text-center">
            Can&apos;t reach the weather service right now.<br />It&apos;ll retry automatically.
          </div>
        </div>
      )}
      {weather && meta && (
        <div>
          <div className="flex items-center gap-4">
            <span className="text-[52px] leading-none">{meta.emoji}</span>
            <div>
              <div className="text-[34px] font-bold leading-none tabular-nums">
                {Math.round(weather.temp)}°
                <span className="text-[14px] font-medium text-[#5f6368] ml-1">C</span>
              </div>
              <div className="text-[13px] text-[#5f6368] mt-1">{meta.label}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[13px] font-semibold">{weather.place}</div>
              <div className="text-[12px] text-[#5f6368]">
                H {Math.round(weather.tMax)}° · L {Math.round(weather.tMin)}°
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-5 text-center">
            <div className="rounded-2xl bg-[#f8f9fa] py-2.5">
              <div className="text-[11px] text-[#5f6368]">Feels like</div>
              <div className="text-[14px] font-semibold mt-0.5">{Math.round(weather.feels)}°</div>
            </div>
            <div className="rounded-2xl bg-[#f8f9fa] py-2.5">
              <div className="text-[11px] text-[#5f6368] flex items-center justify-center gap-1"><Droplets className="w-3 h-3" /> Humidity</div>
              <div className="text-[14px] font-semibold mt-0.5">{Math.round(weather.humidity)}%</div>
            </div>
            <div className="rounded-2xl bg-[#f8f9fa] py-2.5">
              <div className="text-[11px] text-[#5f6368] flex items-center justify-center gap-1"><Wind className="w-3 h-3" /> Wind</div>
              <div className="text-[14px] font-semibold mt-0.5">{Math.round(weather.wind)} km/h</div>
            </div>
            <div className="rounded-2xl bg-[#f8f9fa] py-2.5">
              <div className="text-[11px] text-[#5f6368] flex items-center justify-center gap-1"><Sunrise className="w-3 h-3" /> Sunset</div>
              <div className="text-[14px] font-semibold mt-0.5">{fmt(weather.sunset)}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Vitals (display only) ──────────────────────────────────────────────

type VitalDef = {
  key: string;
  label: string;
  unit: string;
  icon: React.ReactNode;
  tint: string;
  range: string;
  ok: (v: number) => boolean;
};

const VITAL_DEFS: VitalDef[] = [
  { key: "heartRate",       label: "Heart rate",     unit: "bpm",     icon: <Heart className="w-5 h-5" />, tint: "bg-rose-100 text-rose-600",     range: "60–100", ok: v => v >= 60 && v <= 100 },
  { key: "spo2",            label: "O₂ saturation",  unit: "%",       icon: <Droplets className="w-5 h-5" />, tint: "bg-sky-100 text-sky-600",     range: "95–100%", ok: v => v >= 95 },
  { key: "temperature",     label: "Temperature",    unit: "°C",      icon: <Thermometer className="w-5 h-5" />, tint: "bg-amber-100 text-amber-600", range: "36.1–37.2°C", ok: v => v >= 36.1 && v <= 37.2 },
  { key: "respiratoryRate", label: "Respiration",    unit: "/min",    icon: <Wind className="w-5 h-5" />, tint: "bg-violet-100 text-violet-600", range: "12–20", ok: v => v >= 12 && v <= 20 },
  { key: "bloodPressure",   label: "Blood pressure", unit: "mmHg",    icon: <Activity className="w-5 h-5" />, tint: "bg-teal-100 text-teal-600",   range: "90–120 / 60–80", ok: v => v >= 90 && v <= 120 },
  { key: "glucose",         label: "Glucose",        unit: "mg/dL",   icon: <Gauge className="w-5 h-5" />, tint: "bg-cyan-100 text-cyan-600",    range: "70–180", ok: v => v >= 70 && v <= 180 },
];

function VitalTile({ def, value, muted }: { def: VitalDef; value: number | string | null; muted: boolean }) {
  const isBP = def.key === "bloodPressure";
  const inRange = value != null && (isBP ? true : def.ok(value as number));
  return (
    <div className="bg-white rounded-[24px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", def.tint)}>
          {def.icon}
        </div>
        <span className={cn(
          "w-2 h-2 rounded-full",
          muted ? "bg-[#dadce0]"
          : value == null ? "bg-amber-400 animate-pulse"
          : inRange ? "bg-[#34a853]" : "bg-[#ea4335]"
        )} />
      </div>
      <div className="mt-4 text-[11px] font-semibold text-[#5f6368] uppercase tracking-wider">{def.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn(
          "text-[30px] font-bold leading-none tabular-nums",
          !muted && value != null && !inRange && "text-[#d93025]"
        )}>
          {muted ? "—" : value != null ? value : "…"}
        </span>
        {value != null && !isBP && <span className="text-[13px] text-[#5f6368]">{def.unit}</span>}
      </div>
      <div className="mt-1.5 text-[11px] text-[#9aa0a6]">Normal {def.range}</div>
    </div>
  );
}

// ── Main hub ───────────────────────────────────────────────────────────

type Tab = "home" | "vitals" | "elder";

function greetingFor(h: number) {
  if (h < 5)  return "Still awake";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function TabletDashboard() {
  const selectionHaptic = useSelectionHaptic();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Setup;
        setSetup({ room: parsed.room, deviceId: parsed.deviceId.toLowerCase() });
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const live = !!setup && firebaseConfigured;
  const { deviceStatus, connected } = useFirebaseDevice(live ? setup!.deviceId : null);

  // Safety banner — a triggered condition on the elder flips the hub status.
  const [alarm, setAlarm] = useState<string | null>(null);
  const lastAlertRef = useRef<{ condition: string; severity: string; ts: number } | null>(null);
  const handleElderAlert = useCallback((alert: HeartAlert) => {
    const last = lastAlertRef.current;
    if (last && last.condition === alert.condition && last.severity === alert.severity
        && alert.ts - last.ts < 45_000) return;
    lastAlertRef.current = { condition: alert.condition, severity: alert.severity, ts: alert.ts };

    if (alert.type === "SOS") {
      setAlarm(alert.active ? "SOS activated by the elder" : null);
      return;
    }
    if (alert.severity && alert.severity !== "OK") {
      setAlarm(`${alert.condition} (${alert.severity})`);
    }
  }, []);
  useElderAlerts(live ? setup!.deviceId : null, handleElderAlert);

  const severity = deviceStatus?.heartSeverity;
  const condition = deviceStatus?.heartCondition;
  useEffect(() => {
    if (!deviceStatus) return;
    if (severity && severity !== "OK") {
      setAlarm((a) => a ?? `${condition} (${severity})`);
    } else if (!deviceStatus.sos) {
      setAlarm(null);
    }
  }, [deviceStatus, severity, condition]);

  // Vitals source: sample when unpaired, waiting when paired but silent,
  // otherwise the elder's live stream (display only — no command controls).
  const sample = !live;
  const waiting = live && !connected;
  const vs = deviceStatus;
  const vitals = waiting || !vs ? null : {
    heartRate: vs.heartRate,
    spo2: vs.spo2,
    temperature: vs.temperature,
    respiratoryRate: vs.respiratoryRate,
    systolic: vs.systolic,
    diastolic: vs.diastolic,
    bloodPressure: vs.systolic != null && vs.diastolic != null
      ? Math.round(vs.systolic) + "/" + Math.round(vs.diastolic)
      : null,
    glucose: vs.glucose,
  };

  const battery = deviceStatus?.battery;
  const charging = deviceStatus?.charging;
  const lastSeenMs = deviceStatus?.lastSeen != null ? new Date(deviceStatus.lastSeen).getTime() : null;
  const ageSec = lastSeenMs != null ? (Date.now() - lastSeenMs) / 1000 : null;

  const secure = !alarm && !deviceStatus?.sos;
  const statusText = sample
    ? "Preview"
    : waiting
    ? "Connecting…"
    : ageSec != null
    ? ageSec < 120 ? "Live" : `No update for ${Math.round(ageSec / 60)}m`
    : "Wait…";

  if (!setup || showWizard) {
    return (
      <SetupWizard
        initial={setup}
        onSave={(s) => { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); setSetup(s); setShowWizard(false); }}
        onCancel={setup ? () => setShowWizard(false) : undefined}
      />
    );
  }

  const hour = now.getHours();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateLine = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-[#f1ede6] text-[#202124] font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="px-5 sm:px-8 pt-[calc(1rem+env(safe-area-inset-top))] pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#4285f4] to-[#0b57d0] flex items-center justify-center shadow-md shadow-blue-500/20">
              <House className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[13px] text-[#5f6368] leading-tight">{setup.room}</div>
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">
                {greetingFor(hour)}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
              sample ? "bg-[#e8eaed] text-[#5f6368]"
              : waiting ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                sample ? "bg-[#9aa0a6]"
                : waiting ? "bg-amber-500 animate-pulse"
                : "bg-emerald-500 animate-pulse"
              )} />
              {sample ? "Preview" : waiting ? "Connecting…" : "Live"}
            </span>
            <button
              onClick={() => setShowWizard(true)}
              title="Reconfigure"
              className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#5f6368] active:scale-95 transition cursor-pointer hover:text-[#202124]"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 sm:px-8 pb-28 max-w-[1100px] mx-auto w-full">
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
        {/* ── Home tab ── */}
        {tab === "home" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Big clock — the ambient hub moment */}
            <section className="md:col-span-7 rounded-[28px] p-7 text-white relative overflow-hidden shadow-lg bg-gradient-to-br from-[#1f2740] to-[#0d1424]">
              <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-white/5" />
              <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5" />
              <div className="relative">
                <div className="text-[13px] text-white/70 font-medium tracking-wide uppercase">
                  {dateLine}
                </div>
                <div className="mt-2 text-[64px] sm:text-[76px] font-bold leading-none tabular-nums tracking-tight">
                  {time}
                </div>
                <div className="mt-2 font-medium text-white/85">
                  {greetingFor(hour)}
                  {setup.room && <>
                    <span className="text-white/50 mx-2">·</span>
                    {setup.room}
                  </>}
                </div>
              </div>
            </section>

            {/* Weather */}
            <div className="md:col-span-5">
              <WeatherCard onRefresh={() => { /* weather owns its state */ }} />
            </div>

            {/* Safety banner */}
            <section className={cn(
              "md:col-span-12 rounded-[28px] p-6 text-white relative overflow-hidden shadow-lg transition-colors duration-500",
              secure
                ? "bg-gradient-to-br from-[#34a853] to-[#188038] shadow-green-500/20"
                : "bg-gradient-to-br from-[#ea4335] to-[#b31412] shadow-red-500/25 animate-pulse"
            )}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
              <div className="relative flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                  secure ? "bg-white/20" : "bg-white/25"
                )}>
                  {secure ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[20px] font-bold leading-tight">
                    {secure ? (deviceStatus ? "All clear" : "Safe & sound") : "Needs attention"}
                  </div>
                  <div className="text-[13px] text-white/85 mt-0.5 leading-relaxed">
                    {alarm
                      ? alarm
                      : deviceStatus?.sos
                      ? "SOS is active — the caretaker has been notified."
                      : live
                      ? "Your loved one&apos;s device is reporting normally."
                      : "Pair a device to bring this display to life."}
                  </div>
                </div>
                {statusText !== "Preview" && ageSec != null && !waiting && (
                  <span className="ml-auto hidden sm:flex items-center gap-2 text-[12px] text-white/85 bg-white/15 rounded-full px-3.5 py-2 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    updated {Math.round(ageSec)}s ago
                  </span>
                )}
              </div>
            </section>

            {/* Elder phone status strip */}
            <section className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-[24px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.05)] flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Battery className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#5f6368] uppercase tracking-wider">Battery</div>
                  <div className="text-[20px] font-bold leading-tight tabular-nums">
                    {battery != null ? `${battery}%` : sample ? "—" : "…"}
                    {charging && <span className="text-[11px] font-medium text-[#5f6368] ml-1">⚡</span>}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[24px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.05)] flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#5f6368] uppercase tracking-wider">Connection</div>
                  <div className="text-[20px] font-bold leading-tight">
                    {sample ? "Preview" : waiting ? "Connecting…" : "Online"}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[24px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.05)] flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#5f6368] uppercase tracking-wider">Vitals</div>
                  <div className="text-[20px] font-bold leading-tight">
                    {sample || waiting ? "—" : vitals ? "Streaming" : "—"}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Vitals tab ── */}
        {tab === "vitals" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[20px] font-bold tracking-tight">Vitals</h2>
              <span className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-semibold",
                sample ? "bg-[#e8eaed] text-[#5f6368]"
                : waiting ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
              )}>
                {sample ? "Sample data" : waiting ? "Waiting for signal" : "Live from elder"}
              </span>
            </div>
            <p className="text-[13px] text-[#5f6368] mb-6">
              {sample
                ? "Pair a device to show your loved one's real vitals. Sample values are preview only."
                : waiting
                ? "Your loved one's phone isn't reporting yet — keep the HomeSync service running on it."
                : "The latest readings streamed from your loved one's device."}
            </p>

            {/* Condition banner */}
            <div className={cn(
              "rounded-[24px] px-5 py-4 mb-5 flex items-center gap-4",
              sample ? "bg-emerald-500/10"
              : waiting ? "bg-amber-500/10"
              : secure ? "bg-emerald-500/10"
              : "bg-red-500/15 animate-pulse"
            )}>
              <div className={cn(
                "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
                sample ? "bg-emerald-100 text-emerald-600"
                : waiting ? "bg-amber-100 text-amber-600"
                : secure ? "bg-emerald-100 text-emerald-600"
                : "bg-red-100 text-red-600"
              )}>
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <div className={cn(
                  "text-[15px] font-bold",
                  sample ? "text-emerald-700"
                  : waiting ? "text-amber-700"
                  : secure ? "text-emerald-700"
                  : "text-red-700"
                )}>
                  {sample ? "Healthy readings — preview"
                    : waiting ? "Searching for the elder device…"
                    : alarm ?? (secure ? "All vitals in normal range" : "A condition is being tracked")}
                </div>
                <div className="text-[12px] text-[#5f6368] mt-0.5">
                  {sample ? "No elder device paired yet."
                    : waiting ? "Keep the elder app + service running."
                    : condition ?? "Heart condition monitoring active."}
                </div>
              </div>
            </div>

            {/* Vital tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {VITAL_DEFS.map((def) => (
                <VitalTile
                  key={def.key}
                  def={def}
                  value={sample
                    ? def.key === "bloodPressure"
                      ? "120/78"
                      : NORMAL_VITALS[def.key as keyof typeof NORMAL_VITALS]
                    : vitals
                    ? vitals[def.key as keyof typeof vitals] ?? null
                    : null}
                  muted={sample}
                />
              ))}
            </div>

            <p className="text-[12px] text-[#9aa0a6] mt-6 leading-relaxed">
              Vitals update automatically every few seconds from your loved one&apos;s device.
              {sample && " Colors are muted in preview — live values flag green when in range and red when out of range."}
            </p>
          </div>
        )}

        {/* ── Elder tab ── */}
        {tab === "elder" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <section className="md:col-span-8 bg-white rounded-[28px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-[22px] bg-gradient-to-br from-[#4285f4] to-[#0b57d0] flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Smartphone className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-[20px] font-bold leading-tight">Loved one&apos;s phone</div>
                  <div className="text-[13px] text-[#5f6368] font-mono">{setup.deviceId}</div>
                </div>
                <span className={cn(
                  "ml-auto px-3.5 py-1.5 rounded-full text-[12px] font-semibold",
                  sample ? "bg-[#e8eaed] text-[#5f6368]"
                  : waiting ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
                )}>
                  {sample ? "Preview" : waiting ? "Connecting…" : "Online"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-6">
                <div className="rounded-2xl bg-[#f8f9fa] p-4 text-center">
                  <Battery className={cn("w-5 h-5 mx-auto", battery != null && battery < 20 ? "text-[#d93025]" : "text-[#34a853]")} />
                  <div className="text-[20px] font-bold mt-2">{battery != null ? `${battery}%` : "—"}</div>
                  <div className="text-[11px] text-[#5f6368]">{charging ? "Charging" : "Battery"}</div>
                </div>
                <div className="rounded-2xl bg-[#f8f9fa] p-4 text-center">
                  <Clock className="w-5 h-5 mx-auto text-[#4285f4]" />
                  <div className="text-[20px] font-bold mt-2">{ageSec != null ? `${Math.round(ageSec)}s` : "—"}</div>
                  <div className="text-[11px] text-[#5f6368]">Since last update</div>
                </div>
                <div className="rounded-2xl bg-[#f8f9fa] p-4 text-center">
                  <ShieldCheck className={cn("w-5 h-5 mx-auto", secure ? "text-[#34a853]" : "text-[#ea4335]")} />
                  <div className="text-[20px] font-bold mt-2">{secure ? "Clear" : "Alert"}</div>
                  <div className="text-[11px] text-[#5f6368]">Safety status</div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#f8f9fa] p-4 mt-5">
                <div className="text-[11px] font-semibold text-[#5f6368] uppercase tracking-wider mb-1">Heart condition</div>
                <div className="text-[15px] font-semibold">
                  {sample ? "Monitoring (preview)"
                    : waiting ? "Waiting for first reading…"
                    : condition && severity && severity !== "OK"
                    ? `${condition} — ${severity === "CRITICAL" ? "critical" : "watch"}.`
                    : deviceStatus ? "No issues detected" : "—"}
                </div>
              </div>
            </section>

            <section className="md:col-span-4 flex flex-col gap-5">
              <div className="bg-white rounded-[28px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[#5f6368] uppercase tracking-wider mb-3">
                  <MapPin className="w-4 h-4" /> Position
                </div>
                {deviceStatus?.lat != null && deviceStatus?.lng != null ? (
                  <div>
                    <div className="font-mono text-[15px]">
                      {deviceStatus.lat.toFixed(5)}, {deviceStatus.lng.toFixed(5)}
                    </div>
                    <a href={`https://maps.google.com/?q=${deviceStatus.lat},${deviceStatus.lng}`}
                      target="_blank" rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#1a73e8] cursor-pointer hover:text-[#1765cc] transition">
                      Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <div className="text-[13px] text-[#5f6368]">
                    {sample ? "No position in preview mode." : "Position appears once the device reports."}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-[28px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.05)]">
                <div className="text-[13px] font-semibold text-[#5f6368] uppercase tracking-wider mb-3">Home hub</div>
                <p className="text-[13px] text-[#5f6368] leading-relaxed">
                  This display shows your loved one&apos;s vitals, safety status and the
                  weather at a glance. Everything updates automatically — no buttons needed.
                </p>
              </div>
            </section>
          </div>
        )}
        </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),12px)] px-6 z-40">
        <div className="max-w-[420px] mx-auto bg-white/95 backdrop-blur-xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-black/5 p-1.5 flex">
          {([
            { id: "home" as Tab, label: "Home", icon: <House className="w-5 h-5" /> },
            { id: "vitals" as Tab, label: "Vitals", icon: <HeartPulse className="w-5 h-5" /> },
            { id: "elder" as Tab, label: "Elder", icon: <Smartphone className="w-5 h-5" /> },
          ]).map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                void selectionHaptic();
                setTab(t.id);
              }}
              className={cn(
                "flex-1 h-12 rounded-full flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors cursor-pointer",
                tab === t.id
                  ? "bg-[#e8f0fe] text-[#1a73e8]"
                  : "text-[#5f6368] hover:text-[#202124] hover:bg-[#f8f9fa]"
              )}
            >
              {t.icon}
              {t.label}
            </motion.button>
          ))}
        </div>
      </nav>
    </div>
  );
}