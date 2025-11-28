"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Battery, Wifi, Signal, MapPin, Heart, Shield, 
  Bell, Zap, Lock, Unlock, Home, Thermometer, 
  Activity, Moon, Sun, Smartphone, Camera, 
  MessageSquare, Clock, AlertTriangle, CheckCircle,
  Droplets, Wind, Volume2, VolumeX, Power
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// Types for our dashboard state
interface DashboardState {
  location: { address: string; isMoving: boolean; lastUpdate: Date };
  health: { heartRate: number; trend: 'up' | 'down' | 'stable'; lastUpdate: Date };
  safety: { sosActive: boolean; fallDetected: boolean; lastCheck: Date };
  device: { 
    battery: number; 
    isCharging: boolean; 
    wifi: boolean; 
    mobileData: boolean; 
    signalStrength: number;
    ringer: 'normal' | 'silent' | 'vibrate';
    torch: boolean;
  };
  home: {
    doorLocked: boolean;
    livingLight: boolean;
    bedLight: boolean;
    fan: boolean;
    temperature: number;
  };
  lastMessage: { text: string; time: Date } | null;
}

const INITIAL_STATE: DashboardState = {
  location: { address: "Home - 123 Main St", isMoving: false, lastUpdate: new Date() },
  health: { heartRate: 72, trend: 'stable', lastUpdate: new Date() },
  safety: { sosActive: false, fallDetected: false, lastCheck: new Date() },
  device: { 
    battery: 85, 
    isCharging: false, 
    wifi: true, 
    mobileData: true, 
    signalStrength: 4,
    ringer: 'normal',
    torch: false
  },
  home: {
    doorLocked: true,
    livingLight: false,
    bedLight: false,
    fan: false,
    temperature: 24
  },
  lastMessage: null
};

export function TabletDashboard() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [logs, setLogs] = useState<{time: Date, message: string, type: 'info' | 'alert' | 'success'}[]>([]);

  // Function to process incoming commands/status text
  const processIncomingText = (text: string) => {
    const cmd = text.toUpperCase().trim();
    const now = new Date();
    let logType: 'info' | 'alert' | 'success' = 'info';
    let logMsg = `Received: ${text}`;

    setState(prev => {
      const newState = { ...prev };
      newState.lastMessage = { text, time: now };

      // --- Safety & Alerts ---
      if (cmd.includes("SOS") || cmd.includes("HELP")) {
        newState.safety.sosActive = true;
        logType = 'alert';
        logMsg = "SOS ALERT ACTIVATED";
      }
      if (cmd.includes("SAFE") || cmd.includes("SOSACK")) {
        newState.safety.sosActive = false;
        logType = 'success';
        logMsg = "SOS Cleared";
      }
      if (cmd.includes("FALL")) {
        newState.safety.fallDetected = true;
        logType = 'alert';
        logMsg = "FALL DETECTED";
      }

      // --- Home Automation ---
      if (cmd.includes("LOCKED") || cmd.includes("LOCKDOOR")) {
        newState.home.doorLocked = true;
        logType = 'success';
        logMsg = "Door Locked";
      }
      if (cmd.includes("UNLOCKED") || cmd.includes("UNLOCKDOOR")) {
        newState.home.doorLocked = false;
        logType = 'alert'; // Alert because unlocked might be unsafe
        logMsg = "Door Unlocked";
      }
      if (cmd.includes("LIVINGLIGHTON")) newState.home.livingLight = true;
      if (cmd.includes("LIVINGLIGHTOFF")) newState.home.livingLight = false;
      if (cmd.includes("BEDLIGHTON")) newState.home.bedLight = true;
      if (cmd.includes("BEDLIGHTOFF")) newState.home.bedLight = false;
      if (cmd.includes("FANON")) newState.home.fan = true;
      if (cmd.includes("FANOFF")) newState.home.fan = false;

      // --- Device Status ---
      if (cmd.includes("BATLOW")) {
        newState.device.battery = 15;
        logType = 'alert';
        logMsg = "Battery Low Alert";
      }
      if (cmd.includes("CHARGING") || cmd.includes("CHARGESTATE")) newState.device.isCharging = true;
      if (cmd.includes("NOTCHARGING")) newState.device.isCharging = false;
      if (cmd.includes("WIFIUP")) newState.device.wifi = true;
      if (cmd.includes("WIFIDOWN")) newState.device.wifi = false;
      if (cmd.includes("TORCHON")) newState.device.torch = true;
      if (cmd.includes("TORCHOFF")) newState.device.torch = false;
      if (cmd.includes("SILENT")) newState.device.ringer = 'silent';
      if (cmd.includes("RING") || cmd.includes("UNMUTE")) newState.device.ringer = 'normal';

      // --- Movement ---
      if (cmd.includes("MOVING") || cmd.includes("MOVESTATE")) newState.location.isMoving = true;
      if (cmd.includes("STATIONARY")) newState.location.isMoving = false;

      return newState;
    });

    // Add to log
    setLogs(prev => [{ time: now, message: logMsg, type: logType }, ...prev].slice(0, 50));
    
    // Show toast
    if (logType === 'alert') toast.error(logMsg);
    else if (logType === 'success') toast.success(logMsg);
    else toast.info(logMsg);
  };

  // Simulate SMS listener (In a real app, use cordova-plugin-sms-receiver)
  useEffect(() => {
    // Mock listener for browser testing
    const handleMockSMS = (e: CustomEvent) => {
      processIncomingText(e.detail.message);
    };
    
    window.addEventListener('mock-sms', handleMockSMS as EventListener);
    
    // Real SMS Plugin Listener (Commented out but ready)
    /*
    const onSMSArrive = (e: any) => {
      const sms = e.data;
      processIncomingText(sms.body);
    };
    document.addEventListener('onSMSArrive', onSMSArrive);
    */

    return () => {
      window.removeEventListener('mock-sms', handleMockSMS as EventListener);
      // document.removeEventListener('onSMSArrive', onSMSArrive);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans">
      {/* Header Status Bar */}
      <header className="flex items-center justify-between mb-8 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
            HomeSync<span className="text-yellow-400">.</span> Dashboard
          </h1>
          <Badge variant={state.device.wifi ? "default" : "destructive"} className="h-6">
            {state.device.wifi ? "Online" : "Offline"}
          </Badge>
        </div>
        
        <div className="flex items-center gap-6 text-slate-400">
          <div className="flex items-center gap-2">
            <Signal className="w-5 h-5" />
            <span>5G</span>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className={`w-5 h-5 ${state.device.wifi ? 'text-blue-400' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Battery className={`w-6 h-6 ${state.device.battery < 20 ? 'text-red-500' : 'text-green-400'}`} />
              {state.device.isCharging && (
                <Zap className="w-3 h-3 text-yellow-400 absolute -top-1 -right-1 fill-current" />
              )}
            </div>
            <span className="font-mono">{state.device.battery}%</span>
          </div>
          <div className="text-xl font-mono border-l border-slate-700 pl-6">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
        {/* Left Column - Critical Status (4 cols) */}
        <div className="col-span-4 space-y-6 flex flex-col">
          {/* SOS / Safety Card */}
          <Card className={`border-0 shadow-lg transition-all duration-500 ${state.safety.sosActive ? 'bg-red-500/20 animate-pulse ring-2 ring-red-500' : 'bg-slate-900/50'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Shield className="w-5 h-5" /> Safety Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className={`text-4xl font-bold ${state.safety.sosActive ? 'text-red-500' : 'text-emerald-400'}`}>
                  {state.safety.sosActive ? "SOS ACTIVE" : "SECURE"}
                </span>
                {state.safety.sosActive ? (
                  <AlertTriangle className="w-12 h-12 text-red-500 animate-bounce" />
                ) : (
                  <CheckCircle className="w-12 h-12 text-emerald-500/50" />
                )}
              </div>
              {state.safety.fallDetected && (
                <div className="mt-4 bg-red-500/20 p-3 rounded-lg flex items-center gap-3 text-red-200">
                  <Activity className="w-5 h-5" />
                  <span className="font-bold">FALL DETECTED</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Door / Lock Status */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Home className="w-5 h-5" /> Home Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Main Door</div>
                  <div className={`text-2xl font-bold ${state.home.doorLocked ? 'text-blue-400' : 'text-orange-400'}`}>
                    {state.home.doorLocked ? "LOCKED" : "UNLOCKED"}
                  </div>
                </div>
                <div className={`p-4 rounded-full ${state.home.doorLocked ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                  {state.home.doorLocked ? <Lock className="w-8 h-8" /> : <Unlock className="w-8 h-8" />}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Map Placeholder */}
          <Card className="bg-slate-900/50 border-slate-800 flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <MapPin className="w-5 h-5" /> Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video bg-slate-800 rounded-xl flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/0,0,10,0/600x400?access_token=YOUR_TOKEN')] bg-cover opacity-50" />
                <MapPin className="w-8 h-8 text-blue-500 z-10 drop-shadow-lg animate-bounce" />
                <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                  Live
                </div>
              </div>
              <div>
                <div className="text-lg font-medium text-white">{state.location.address}</div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className={`${state.location.isMoving ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                    {state.location.isMoving ? "Moving" : "Stationary"}
                  </Badge>
                  <span className="text-xs text-slate-500">Updated: {state.location.lastUpdate.toLocaleTimeString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Environment & Health (4 cols) */}
        <div className="col-span-4 space-y-6">
          {/* Health Stats */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Heart className="w-5 h-5" /> Vitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-sm text-slate-400 mb-1">Heart Rate</div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-rose-400">{state.health.heartRate}</span>
                    <span className="text-sm text-rose-400/70 mb-1">BPM</span>
                  </div>
                  <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 w-[60%]" />
                  </div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-sm text-slate-400 mb-1">Status</div>
                  <div className="text-xl font-medium text-emerald-400">Normal</div>
                  <div className="text-xs text-slate-500 mt-2">Trend: Stable</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Home Automation Grid */}
          <Card className="bg-slate-900/50 border-slate-800 flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Zap className="w-5 h-5" /> Smart Home
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <StatusTile 
                  icon={<Sun className="w-6 h-6" />} 
                  label="Living Room" 
                  active={state.home.livingLight} 
                  color="text-yellow-400"
                />
                <StatusTile 
                  icon={<Moon className="w-6 h-6" />} 
                  label="Bedroom" 
                  active={state.home.bedLight} 
                  color="text-purple-400"
                />
                <StatusTile 
                  icon={<Wind className="w-6 h-6" />} 
                  label="Fan" 
                  active={state.home.fan} 
                  color="text-cyan-400"
                />
                <StatusTile 
                  icon={<Thermometer className="w-6 h-6" />} 
                  label={`${state.home.temperature}°C`} 
                  active={true} 
                  color="text-orange-400"
                  subLabel="Indoor"
                />
              </div>
            </CardContent>
          </Card>

          {/* Device Controls Status */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Smartphone className="w-5 h-5" /> Device State
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between gap-2">
                <div className={`flex flex-col items-center gap-2 p-3 rounded-xl w-full ${state.device.torch ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-800/50 text-slate-500'}`}>
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-medium">Torch</span>
                </div>
                <div className={`flex flex-col items-center gap-2 p-3 rounded-xl w-full ${state.device.ringer === 'silent' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800/50 text-slate-500'}`}>
                  {state.device.ringer === 'silent' ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  <span className="text-xs font-medium">{state.device.ringer === 'silent' ? 'Silent' : 'Ring'}</span>
                </div>
                <div className={`flex flex-col items-center gap-2 p-3 rounded-xl w-full ${state.device.isCharging ? 'bg-green-500/20 text-green-400' : 'bg-slate-800/50 text-slate-500'}`}>
                  <Power className="w-5 h-5" />
                  <span className="text-xs font-medium">{state.device.isCharging ? 'Charging' : 'Battery'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Logs & Debug (4 cols) */}
        <div className="col-span-4 flex flex-col gap-6">
          {/* Activity Log */}
          <Card className="bg-slate-900/50 border-slate-800 flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-slate-300">
                <Clock className="w-5 h-5" /> Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full px-6 pb-4">
                <div className="space-y-4 pt-2">
                  <AnimatePresence initial={false}>
                    {logs.map((log, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex gap-3 pb-3 border-b border-slate-800/50 last:border-0`}
                      >
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                          log.type === 'alert' ? 'bg-red-500' : 
                          log.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                        }`} />
                        <div>
                          <div className="text-sm font-medium text-slate-200">{log.message}</div>
                          <div className="text-xs text-slate-500">{log.time.toLocaleTimeString()}</div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Debug / Simulation Input */}
          <Card className="bg-slate-800/30 border-slate-800 border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Simulation Console
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.target as any).cmd.value;
                  if(input) {
                    window.dispatchEvent(new CustomEvent('mock-sms', { detail: { message: input } }));
                    (e.target as any).cmd.value = "";
                  }
                }}
                className="flex gap-2"
              >
                <input 
                  name="cmd"
                  type="text" 
                  placeholder="Type 'LOCKED', 'SOS', 'BATLOW'..." 
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </form>
              <div className="flex flex-wrap gap-2 mt-3">
                {['LOCKED', 'UNLOCKED', 'SOS', 'SAFE', 'BATLOW', 'MOVING'].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => window.dispatchEvent(new CustomEvent('mock-sms', { detail: { message: cmd } }))}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusTile({ icon, label, active, color, subLabel }: { icon: any, label: string, active: boolean, color: string, subLabel?: string }) {
  return (
    <div className={`p-3 rounded-xl border transition-all duration-300 ${active ? 'bg-slate-800 border-slate-700' : 'bg-slate-900/30 border-transparent opacity-60'}`}>
      <div className={`mb-2 ${active ? color : 'text-slate-500'}`}>
        {icon}
      </div>
      <div className="font-medium text-slate-200">{label}</div>
      {subLabel && <div className="text-xs text-slate-500">{subLabel}</div>}
      <div className="flex items-center gap-1 mt-1">
        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-slate-600'}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{active ? 'ON' : 'OFF'}</span>
      </div>
    </div>
  );
}
