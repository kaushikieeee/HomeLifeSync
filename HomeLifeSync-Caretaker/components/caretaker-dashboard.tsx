'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from "motion/react";
import {
  Settings, LogOut, Send, Search, X, Shield, MapPin, Phone,
  Bell, Zap, ChevronRight, Home, Command, Clock, Pill,
  Lock, MessageSquare, Smartphone, Activity, Brain, Wifi, Camera,
  Grid, Thermometer, Power, FileText, MessageCircle, List,
  CheckCircle2, Loader2, Battery, ArrowUpRight, Watch,
  Heart,
} from 'lucide-react';
import { useHaptic, useSelectionHaptic, ImpactStyle } from '@/hooks/use-haptic';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SMS_COMMANDS, IMPLEMENTED_COMMANDS, type HeartAlert } from '@/lib/commands';
import { SlideButton } from '@/components/ui/slide-button';
import { useFirebaseDevice } from '@/hooks/use-firebase-device';
import { useHealthMonitor } from '@/hooks/use-heart-monitor';
import { useElderAlerts } from '@/hooks/use-elder-alerts';
import { VitalsCard } from '@/components/vitals-card';
import { HeartAlertOverlay } from '@/components/heart-alert-overlay';
import { firebaseConfigured } from '@/lib/firebase';
import { SCENARIOS, NORMAL_VITALS } from '@/lib/health';
import { publishHealthEvent } from '@/lib/firebase-commands';
import { ConnectWizard } from '@/components/connect-wizard';

// ── Types ──────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    Fingerprint?: {
      isAvailable: (s: (r: string) => void, e: (m: string) => void) => void;
      show: (opts: object, s: (r: unknown) => void, e: (err: unknown) => void) => void;
    };
  }
}

const DANGEROUS_COMMANDS = new Set(['REBOOT', 'POWEROFF', 'WIPE']);

/** Native bridge (capacitor) — opens an installed app on THIS phone. */
const AppLauncher = registerPlugin<{
  openPackage: (opts: { packageName: string }) => Promise<{
    installed: boolean; opened: boolean; playStore?: boolean;
  }>;
}>('AppLauncher');

// ── Category styling ───────────────────────────────────────────────────────────

const getCategoryStyle = (title: string) => {
  const t = title.replace(/^\d+\.\s*/, '');
  if (t.includes("Location"))    return { icon: <MapPin      className="w-4 h-4" />, chip: "bg-blue-500/10 text-blue-500" };
  if (t.includes("Health"))      return { icon: <Activity    className="w-4 h-4" />, chip: "bg-rose-500/10 text-rose-500" };
  if (t.includes("Safety"))      return { icon: <Shield      className="w-4 h-4" />, chip: "bg-red-500/10 text-red-500" };
  if (t.includes("Behaviour"))   return { icon: <Brain       className="w-4 h-4" />, chip: "bg-violet-500/10 text-violet-500" };
  if (t.includes("Device"))      return { icon: <Smartphone  className="w-4 h-4" />, chip: "bg-slate-500/10 text-slate-500" };
  if (t.includes("Messaging"))   return { icon: <MessageCircle className="w-4 h-4" />, chip: "bg-teal-500/10 text-teal-600" };
  if (t.includes("Camera"))      return { icon: <Camera      className="w-4 h-4" />, chip: "bg-amber-500/10 text-amber-500" };
  if (t.includes("App"))         return { icon: <Grid        className="w-4 h-4" />, chip: "bg-blue-500/10 text-blue-500" };
  if (t.includes("Battery"))     return { icon: <Zap         className="w-4 h-4" />, chip: "bg-emerald-500/10 text-emerald-600" };
  if (t.includes("Internet"))    return { icon: <Wifi        className="w-4 h-4" />, chip: "bg-cyan-500/10 text-cyan-600" };
  if (t.includes("Routine"))     return { icon: <Clock       className="w-4 h-4" />, chip: "bg-teal-500/10 text-teal-600" };
  if (t.includes("Geofencing"))  return { icon: <MapPin      className="w-4 h-4" />, chip: "bg-indigo-500/10 text-indigo-500" };
  if (t.includes("Environment")) return { icon: <Thermometer className="w-4 h-4" />, chip: "bg-orange-500/10 text-orange-500" };
  if (t.includes("Home"))        return { icon: <Home        className="w-4 h-4" />, chip: "bg-emerald-500/10 text-emerald-600" };
  if (t.includes("System"))      return { icon: <Power       className="w-4 h-4" />, chip: "bg-slate-500/10 text-slate-500" };
  if (t.includes("AI"))          return { icon: <FileText    className="w-4 h-4" />, chip: "bg-purple-500/10 text-purple-500" };
  return { icon: <List className="w-4 h-4" />, chip: "bg-muted text-muted-foreground" };
};

const formatTitle = (title: string) =>
  title.replace(/^\d+\s*\.\s*/, '').replace(/ \(.*\)/, '');

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'home' | 'commands';

export function CaretakerDashboard() {
  const router          = useRouter();
  const haptic          = useHaptic();
  const selectionHaptic = useSelectionHaptic();
  const scrollRef       = useRef<HTMLDivElement>(null);

  // ── Device ID state ──────────────────────────────────────────────
  const [deviceId,    setDeviceId]    = useState<string | null>(null);
  const [name,        setName]        = useState('');
  const [scrolled,    setScrolled]    = useState(false);
  const [tab,         setTab]         = useState<Tab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [lastLoc, setLastLoc] = useState<{ reply: string; time: Date } | null>(null);
  const [flashOn, setFlashOn] = useState(false);

  // ── Firebase hook ────────────────────────────────────────────────
  // Only attach when the build ships Firebase config — an empty env would
  // initialize an empty app and throw in the status subscription.
  const fbDevId = firebaseConfigured ? deviceId : null;
  const { deviceStatus, history, cmdStatus, send, connected } =
    useFirebaseDevice(fbDevId);

  // ── Wearable vitals + loud health alerts ─────────────────────────
  const health = useHealthMonitor();
  // Only HEALTH records take the loud path — SOS entries (written by the
  // elder when SOS/SOSACK runs) stay with the tablet/elder display.
  const handleElderHealthAlert = useCallback((alert: HeartAlert) => {
    if (alert.type !== 'HEALTH') return;
    health.pushElderAlert(alert);
  }, [health.pushElderAlert]);
  useElderAlerts(fbDevId, handleElderHealthAlert);

  // Sync vitals from the SAME feed the elder device publishes, so heart
  // rate is identical on the elder phone, the caretaker and the tablet.
  useEffect(() => {
    if (!deviceStatus || deviceStatus.heartRate == null) {
      health.setExternalSource(null);
      return;
    }
    health.setExternalSource({
      heartRate:       deviceStatus.heartRate,
      spo2:            deviceStatus.spo2 ?? NORMAL_VITALS.spo2,
      temperature:     deviceStatus.temperature ?? NORMAL_VITALS.temperature,
      respiratoryRate: deviceStatus.respiratoryRate ?? NORMAL_VITALS.respiratoryRate,
      systolic:        deviceStatus.systolic ?? NORMAL_VITALS.systolic,
      diastolic:       deviceStatus.diastolic ?? NORMAL_VITALS.diastolic,
      glucose:         deviceStatus.glucose ?? NORMAL_VITALS.glucose,
    });
  }, [deviceStatus]);

  // Local simulation; broadcast the SAME scenario to every watcher so the
  // elder phone, caretaker and tablet hubs all converge on one condition.
  const handleSimulate = async (cmd: string) => {
    health.simulate(cmd);
    const s = SCENARIOS.find(x => x.cmd === cmd);
    if (!s) return;

    // Broadcast the condition to tablets/hubs via the shared stream — but
    // ONLY when the elder phone can't do it itself. When `connected` we also
    // push the scenario command below, and the elder writes its own alert
    // on receipt; publishing here too would duplicate /alerts and make every
    // screen re-alarm for the same episode.
    if (deviceId && firebaseConfigured && !connected) {
      try {
        await publishHealthEvent(
          deviceId,
          s.label.toUpperCase(),
          s.expectedSeverity,
          health.vitals
        );
      } catch { /* local simulation still works offline */ }
    }

    // Push the scenario to the elder phone so it raises its own alarm and
    // streams the same condition. HRNORMAL must go too — otherwise the elder
    // keeps streaming the abnormal state and the caretaker's reset is
    // immediately reverted by the live feed (alert loop).
    if (connected && s) runCommand(cmd, s.desc);
  };

  // ── Load saved device ID ─────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('elder_device_id');
    if (saved) setDeviceId(saved);
    setName(localStorage.getItem('caretaker_name') ?? '');
    localStorage.removeItem('caretaker_role'); // purge legacy key
  }, []);

  const saveDeviceId = (id: string) => {
    if (id.trim()) {
      localStorage.setItem('elder_device_id', id.trim());
      setDeviceId(id.trim());
    } else {
      localStorage.removeItem('elder_device_id');
      setDeviceId(null);
    }
  };

  // ── Scroll handler ───────────────────────────────────────────────
  useEffect(() => {
    const div = scrollRef.current;
    if (!div) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setScrolled(div.scrollTop > 20); });
    };
    div.addEventListener('scroll', onScroll, { passive: true });
    return () => { div.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ── Tab switch ───────────────────────────────────────────────────
  const switchTab = (next: Tab) => {
    if (next === tab) return;
    selectionHaptic();
    setTab(next);
    setActiveCategory(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  };

  // ── Run a command via Firebase ───────────────────────────────────
  const runCommand = async (cmd: string, desc: string) => {
    if (!deviceId) { toast.error('No device connected'); return; }

    if (!IMPLEMENTED_COMMANDS.has(cmd)) {
      toast.info(`${cmd} isn't available on the elder device yet.`);
      return;
    }

    if (DANGEROUS_COMMANDS.has(cmd)) {
      const confirmed = await confirmDangerous(cmd, desc);
      if (!confirmed) return;
    }

    haptic(ImpactStyle.Medium);
    const toastId = toast.loading(`Sending ${cmd}…`);
    const reply   = await send(cmd);
    toast.dismiss(toastId);

    if (reply.startsWith('❌')) {
      toast.error(reply);
    } else {
      toast.success(reply.length > 80 ? reply.slice(0, 80) + '…' : reply, {
        description: desc,
      });
    }
  };

  // Biometric / confirm gate for dangerous commands
  const confirmDangerous = (cmd: string, label: string): Promise<boolean> =>
    new Promise(resolve => {
      haptic(ImpactStyle.Heavy);
      if (window.Fingerprint) {
        window.Fingerprint.isAvailable(
          () => window.Fingerprint!.show(
            { title: 'Authentication Required', subtitle: `Authorize: ${label}`, disableBackup: true },
            () => resolve(true),
            () => { toast.error('Authentication failed'); resolve(false); }
          ),
          () => resolve(confirm(`Are you sure you want to ${label}?`))
        );
      } else {
        resolve(confirm(`Are you sure you want to ${label}?`));
      }
    });

  // ── Fetch + display the elder's live location ──────────────────────
  // Sends LOC (elder writes the fix to /status.lat/lng and replies with a
  // maps link), then surfaces it in the Location card on the home tab.
  const locate = async () => {
    if (!deviceId) { toast.error('No device connected'); return; }
    haptic(ImpactStyle.Medium);
    const toastId = toast.loading('Fetching location…');
    const reply   = await send('LOC');
    toast.dismiss(toastId);
    setLastLoc({ reply, time: new Date() });
    if (reply.startsWith('❌')) {
      toast.error(reply);
    } else {
      toast.success('Location updated', { description: reply.split('\n')[0].slice(0, 60) });
    }
  };

  const locLat = deviceStatus?.lat;
  const locLng = deviceStatus?.lng;
  const torchReported = deviceStatus?.torch ?? false;

  // Flashlight toggle — optimistic: flips instantly, reverts if the
  // elder device rejects it; stays in sync with /status.torch.
  useEffect(() => { setFlashOn(torchReported); }, [torchReported]);

  const toggleFlash = async () => {
    if (!deviceId) { toast.error('No device connected'); return; }
    haptic(ImpactStyle.Medium);
    const next = !flashOn;
    setFlashOn(next);
    const reply = await send(next ? 'TORCHON' : 'TORCHOFF');
    if (reply.startsWith('❌')) {
      setFlashOn(torchReported);
      toast.error(reply);
    } else {
      toast.success(next ? 'Flashlight ON' : 'Flashlight OFF');
    }
  };

  // Open the Mi Band companion app on THIS phone (native intent) — the web
  // preview falls back to the Play Store page for the same package.
  const openMiBand = async () => {
    haptic(ImpactStyle.Medium);
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AppLauncher.openPackage({ packageName: 'com.mc.miband1' });
        if (res.opened) toast.success('Opening Mi Band app…');
        else if (res.playStore) toast.info('Mi Band app not installed — opening Play Store');
        else toast.error('Could not open the Mi Band app');
      } catch {
        toast.error('Could not open the Mi Band app');
      }
    } else {
      window.open('https://play.google.com/store/apps/details?id=com.mc.miband1', '_blank');
      toast.info('Opening Mi Band app page (web preview)');
    }
  };

  // ── Command search filter ────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return SMS_COMMANDS.map(cat => ({
      ...cat,
      title:    formatTitle(cat.title),
      commands: q
        ? cat.commands.filter(c =>
            c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
        : cat.commands,
    })).filter(cat => cat.commands.length > 0);
  }, [searchQuery]);

  // ── Connect screen (startup wizard) ─────────────────────────────
  if (!deviceId) {
    return (
      <ConnectWizard
        onComplete={(id, profile) => {
          localStorage.setItem('elder_device_id', id);
          localStorage.setItem('caretaker_name', profile.name);
          setName(profile.name);
          setDeviceId(id);
        }}
      />
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────
  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col font-sans relative">

      {/* Header — floating glass pill */}
      <div className={cn(
        "shrink-0 mx-3 mt-3 mb-2 px-4 pt-safe pb-3 flex items-center justify-between z-30 rounded-[22px] transition-colors duration-200",
        scrolled
          ? "bg-card/85 backdrop-blur-md shadow-sm border border-border"
          : "bg-background/70 backdrop-blur-md border border-transparent"
      )}>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10 text-primary">
            <Heart className="w-5 h-5" />
          </span>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground leading-none">
            <span className="text-[#FF9933]">Home</span>Sync
            <span className="text-[#138808]">.</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Live command status indicator */}
          {cmdStatus === 'sending' || cmdStatus === 'waiting' ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : cmdStatus === 'done' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={() => haptic(ImpactStyle.Medium)}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:opacity-70 cursor-pointer transition-colors hover:bg-muted/70"
              >
                <Settings className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" /> App Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                navigator.clipboard.writeText(deviceId);
                toast.success('Device ID copied');
              }}>
                Copy Device ID
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => saveDeviceId('')}>
                <LogOut className="mr-2 h-4 w-4" /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[140px] pt-4 overscroll-contain"
      >
        <AnimatePresence mode="wait" initial={false}>

          {/* ── Home tab ── */}
          {tab === 'home' ? (
            <motion.div key="home"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {/* Device strip — compact status card */}
              <div className="relative overflow-hidden bg-card rounded-[20px] border border-border shadow-sm px-4 py-3.5 mb-4 flex items-center gap-3">
                <div className="pointer-events-none absolute -right-10 -top-12 w-32 h-32 rounded-full bg-gradient-to-br from-cyan-400/15 to-blue-500/10" />
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold leading-tight truncate">
                    {name || 'Elder device'}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 min-w-0">
                    <span className="font-mono">{deviceId}</span>
                    {deviceStatus && (
                      <>
                        <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50 shrink-0" />
                        <Battery className={cn("w-3 h-3 shrink-0", (deviceStatus.battery ?? 0) < 20 ? "text-red-500" : "text-emerald-500")} />
                        <span className="shrink-0">{deviceStatus.battery ?? '–'}%{deviceStatus.charging ? ' · charging' : ''}</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span className="truncate">Seen {new Date(deviceStatus.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0",
                  connected ? "bg-emerald-500/10" : "bg-amber-500/10"
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  )} />
                  <span className={cn(
                    "text-[11px] font-bold",
                    connected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"
                  )}>
                    {connected ? 'ONLINE' : 'AWAY'}
                  </span>
                </div>
              </div>

              {/* Quick actions */}
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-2.5">
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <QuickTile icon={<Phone className="w-5 h-5" />} label="Call" color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" onClick={() => runCommand("CALLME", "Call device")} />
                <QuickTile icon={<Bell className="w-5 h-5" />} label="Ring" color="bg-blue-500/10 text-blue-500" onClick={() => runCommand("RING", "Ring device")} />

                {/* Flashlight — true toggle (optimistic state) */}
                <button
                  onClick={toggleFlash}
                  aria-pressed={flashOn}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border shadow-sm px-4 py-3.5 active:scale-[0.97] transition-all duration-150 cursor-pointer",
                    flashOn ? "bg-amber-500/15 border-amber-500/40" : "bg-card border-border hover:bg-muted/40"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors duration-150",
                    flashOn ? "bg-amber-500 text-white" : "bg-amber-500/10 text-amber-500"
                  )}>
                    <Zap className={cn("w-5 h-5", flashOn && "fill-current")} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-medium leading-tight">{flashOn ? 'Flashlight on' : 'Flashlight'}</div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", flashOn ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/40")} />
                      <span className={flashOn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                        {flashOn ? 'On' : 'Off'}
                      </span>
                    </div>
                  </div>
                </button>

                <QuickTile icon={<Pill className="w-5 h-5" />} label="Meds" color="bg-rose-500/10 text-rose-500" onClick={() => runCommand("MEDR", "Send medicine reminder")} />
                <QuickTile icon={<MapPin className="w-5 h-5" />} label="Locate" color="bg-blue-500/10 text-blue-500" onClick={locate} />
                <QuickTile icon={<MessageSquare className="w-5 h-5" />} label="Check-in" color="bg-teal-500/10 text-teal-600 dark:text-teal-400" onClick={() => runCommand("CHECKIN", "Check-in")} />
              </div>

              {/* Mi Band — opens the companion app on THIS phone */}
              <button
                onClick={openMiBand}
                className="w-full h-12 mb-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3 px-4 active:scale-[0.98] transition-all duration-150 cursor-pointer hover:bg-muted/40"
              >
                <span className="w-8 h-8 rounded-lg bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center shrink-0">
                  <Watch className="w-4 h-4" />
                </span>
                <span className="text-[14px] font-semibold flex-1 text-left truncate">Open Mi Band app</span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">on this phone</span>
              </button>

              {/* Emergency — one prominent slide action */}
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-2.5">
                Emergency
              </h2>
              <div className="mb-4">
                <SlideButton
                  label="Slide to SOS"
                  onSuccess={() => runCommand("SOS", "Emergency SOS")}
                  color="bg-[#FF3B30]"
                  icon={<Shield className="w-6 h-6 text-white" />}
                />
              </div>

              {/* Live location card */}
              <div className="bg-card rounded-[20px] p-4 border border-border shadow-sm mb-4 overflow-hidden relative">
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-blue-500/5 pointer-events-none" />
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-[14px] font-semibold flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-blue-500" /> Location
                  </h2>
                  {lastLoc && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Fetched {lastLoc.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {locLat != null && locLng != null ? (
                  <div className="mt-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 p-3.5">
                    <div className="font-mono text-[20px] font-bold tracking-tight text-foreground leading-tight">
                      {locLat.toFixed(5)}, {locLng.toFixed(5)}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      {deviceStatus?.accuracy != null && `Accuracy ±${Math.round(deviceStatus.accuracy)} m · `}
                      Last seen {deviceStatus?.lastSeen
                        ? new Date(deviceStatus.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                    <a
                      href={`https://maps.google.com/?q=${locLat},${locLng}`}
                      target="_blank" rel="noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-cyan-700 dark:text-cyan-300 cursor-pointer transition-colors hover:text-cyan-600"
                    >
                      Open in Google Maps <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <p className="mt-2.5 text-[12px] text-muted-foreground">
                    {connected
                      ? 'Tap "Locate" above to fetch the elder position here.'
                      : 'Connect to a device, then tap "Locate" to see their position here.'}
                  </p>
                )}
              </div>

              {/* Wearable vitals + health-event simulation */}
              <VitalsCard
                vitals={health.vitals}
                detected={health.detection}
                scenarios={SCENARIOS}
                connected={connected}
                onSimulate={handleSimulate}
              />

              {/* Command history (from Firebase) */}
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-3">
                Recent
              </h2>
              {history.length === 0 ? (
                <div className="bg-card/50 rounded-2xl border border-dashed border-border p-6 text-center">
                  <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Commands you send will appear here.</p>
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border shadow-sm divide-y divide-border overflow-hidden">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/40">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                        h.ok ? "bg-primary/10" : "bg-red-500/10"
                      )}>
                        {h.ok
                          ? <Send className="w-4 h-4 text-primary" />
                          : <X    className="w-4 h-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold">{h.cmd}</div>
                        <div className="text-[12px] text-muted-foreground truncate">{h.reply}</div>
                      </div>
                      <div className="text-[12px] text-muted-foreground font-mono shrink-0">
                        {h.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

          ) : (
            /* ── Commands tab ── */
            <motion.div key="commands"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {/* Search */}
              <div className="relative mb-4">
                <Search className="w-[18px] h-[18px] text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setActiveCategory(null); }}
                  placeholder="Search commands…"
                  className="w-full h-12 bg-card rounded-2xl border border-border pl-11 pr-10 text-[15px] focus:outline-none focus:border-primary/50 shadow-sm"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category accordions */}
              <div className="space-y-3">
                {filteredCategories.map((category, index) => {
                  const style  = getCategoryStyle(category.title);
                  const isOpen = activeCategory === category.title || searchQuery.length > 0;
                  return (
                    <div key={index} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                      <button
                        onClick={() => { selectionHaptic(); setActiveCategory(isOpen && !searchQuery ? null : category.title); }}
                        className="w-full flex items-center gap-3 p-3.5 active:bg-muted transition-all duration-150 cursor-pointer hover:bg-muted/50"
                      >
                        <div className={cn("w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0", style.chip)}>
                          {style.icon}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-[15px]">{category.title}</div>
                          <div className="text-[12px] text-muted-foreground">
                            {category.commands.length} {category.commands.length === 1 ? 'command' : 'commands'}
                          </div>
                        </div>
                        <ChevronRight className={cn(
                          "w-5 h-5 text-muted-foreground transition-transform duration-300 shrink-0",
                          isOpen && !searchQuery && "rotate-90"
                        )} />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="divide-y divide-border border-t border-border"
                          >
                            {category.commands.map((cmd, ci) => {
                              const supported = IMPLEMENTED_COMMANDS.has(cmd.cmd);
                              return (
                              <button
                                key={ci}
                                onClick={() => runCommand(cmd.cmd, cmd.desc)}
                                disabled={cmdStatus === 'sending' || cmdStatus === 'waiting' || !supported}
                                className="w-full flex items-center justify-between p-4 pl-11 active:bg-muted transition-all duration-150 cursor-pointer group text-left disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/40"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-[15px]">{cmd.cmd}</div>
                                  <div className="text-[13px] text-muted-foreground truncate">
                                    {cmd.desc}{!supported && ' · not available yet'}
                                  </div>
                                </div>
                                <div className={cn(
                                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 ml-3",
                                  DANGEROUS_COMMANDS.has(cmd.cmd)
                                    ? "bg-red-500/10 text-red-500"
                                    : supported
                                      ? "bg-muted text-primary opacity-0 group-active:opacity-100"
                                      : "bg-muted text-muted-foreground"
                                )}>
                                  {DANGEROUS_COMMANDS.has(cmd.cmd)
                                    ? <Lock className="w-3.5 h-3.5" />
                                    : supported
                                      ? <Send className="w-3.5 h-3.5" />
                                      : <X className="w-3.5 h-3.5" />}
                                </div>
                              </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <div className="bg-card/50 rounded-2xl border border-dashed border-border p-6 text-center">
                    <p className="text-sm text-muted-foreground">No commands match &quot;{searchQuery}&quot;.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom tab bar */}
      <div className="absolute bottom-0 inset-x-0 z-40 px-4 pb-4 pt-2 pointer-events-none">
        <div className="pointer-events-auto flex rounded-[24px] bg-card/90 backdrop-blur-xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-1.5 pb-safe">
          <TabButton active={tab === 'home'}     icon={<Home    className="w-5 h-5" />} label="Home"     onClick={() => switchTab('home')} />
          <TabButton active={tab === 'commands'} icon={<Command className="w-5 h-5" />} label="Commands" onClick={() => switchTab('commands')} />
        </div>
      </div>

      {/* Loud full-screen health alarm */}
      <HeartAlertOverlay alert={health.activeCritical} onAcknowledge={() => health.acknowledgeAll()} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TabButton({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn(
      "flex-1 flex flex-col items-center gap-1 py-2 rounded-[16px] transition-all duration-200 active:opacity-80 cursor-pointer",
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-primary"
    )}>
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function QuickTile({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="bg-card rounded-2xl border border-border shadow-sm flex flex-col items-center gap-2 py-4 active:scale-[0.97] transition-all duration-150 cursor-pointer hover:shadow-md hover:-translate-y-0.5"
    >
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", color)}>
        {icon}
      </div>
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  );
}
