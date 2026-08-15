"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Battery, Wifi, Signal, MapPin, Heart, Shield, 
  Zap, Lock, Unlock, Home, Thermometer, 
  Activity, Moon, Sun, Smartphone, 
  Clock, AlertTriangle, CheckCircle,
  Wind, Volume2, VolumeX, Power, Phone, Ambulance,
  LayoutDashboard, Lightbulb, Map as MapIcon, List, Settings, TestTube,
  Pill, Video, Cloud, CloudRain, Camera
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';

declare global {
  interface Window {
    cordova?: any;
    SMSReceive?: {
      startWatch: (success: () => void, error: (err: any) => void) => void;
      stopWatch: (success: () => void, error: (err: any) => void) => void;
    };
  }
}

// Types for our dashboard state
interface DashboardState {
  location: { address: string; latitude: number; longitude: number; isMoving: boolean; lastUpdate: Date };
  health: { 
    heartRate: number; 
    bpSystolic: number;
    bpDiastolic: number;
    trend: 'up' | 'down' | 'stable'; 
    lastUpdate: Date;
    condition: string;
    history: { time: string; hr: number; sys: number; dia: number }[];
  };
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
    livingLightColor: string;
    bedLight: boolean;
    fan: boolean;
    temperature: number;
    fanSpeed: number;
    lightBrightness: number;
  };
  medications: { id: number; name: string; time: string; taken: boolean }[];
  weather: { temp: number; condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Night' };
  lastMessage: { text: string; time: Date } | null;
  settings: {
    developerMode: boolean;
    simulationActive: boolean;
    activeScenario: 'none' | 'heart_attack' | 'hypertension';
    scenarioStartTime: number | null;
    checkInDialogOpen: boolean;
    checkInCountdown: number;
  };
}

const INITIAL_STATE: DashboardState = {
  location: { address: "Locating...", latitude: 0, longitude: 0, isMoving: false, lastUpdate: new Date() },
  health: { 
    heartRate: 72, 
    bpSystolic: 120,
    bpDiastolic: 80,
    trend: 'stable', 
    lastUpdate: new Date(),
    condition: 'Normal',
    history: Array(20).fill(0).map((_, i) => ({ time: '', hr: 72, sys: 120, dia: 80 }))
  },
  safety: { sosActive: false, fallDetected: false, lastCheck: new Date() },
  device: { 
    battery: 100, 
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
    livingLightColor: '#fbbf24', // Warm yellow default
    bedLight: false,
    fan: false,
    temperature: 24,
    fanSpeed: 3,
    lightBrightness: 80
  },
  medications: [
    { id: 1, name: 'Aspirin', time: '08:00 AM', taken: true },
    { id: 2, name: 'Vitamin D', time: '02:00 PM', taken: false },
    { id: 3, name: 'Metoprolol', time: '08:00 PM', taken: false },
  ],
  weather: { temp: 22, condition: 'Cloudy' },
  lastMessage: null,
  settings: {
    developerMode: false,
    simulationActive: true,
    activeScenario: 'none',
    scenarioStartTime: null,
    checkInDialogOpen: false,
    checkInCountdown: 3
  }
};

export function TabletDashboard() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [logs, setLogs] = useState<{time: Date, message: string, type: 'info' | 'alert' | 'success'}[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('overview');
  const [isFanDialogOpen, setIsFanDialogOpen] = useState(false);
  const [isLightDialogOpen, setIsLightDialogOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio('/emergency.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 1.0; // Max volume
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle Emergency Sound
  useEffect(() => {
    if (state.safety.sosActive) {
      if (audioRef.current) {
        audioRef.current.volume = 1.0; // Ensure max volume on play
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [state.safety.sosActive]);

  // Camera handling
  useEffect(() => {
    if (isCameraOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        .then(stream => {
          setCameraStream(stream);
          const video = document.getElementById('camera-feed') as HTMLVideoElement;
          if (video) {
            video.srcObject = stream;
            video.play();
          }
        })
        .catch(err => {
          console.error("Camera error:", err);
          toast.error("Could not access camera");
        });
    } else {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraOpen]);

  // Live Time Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live Battery Update
  useEffect(() => {
    const updateBattery = async () => {
      const info = await Device.getBatteryInfo();
      setState(prev => ({
        ...prev,
        device: {
          ...prev.device,
          battery: Math.round((info.batteryLevel || 1) * 100),
          isCharging: info.isCharging || false
        }
      }));
    };
    updateBattery();
    const interval = setInterval(updateBattery, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // GPS Location Update
  useEffect(() => {
    const updateLocation = async () => {
      try {
        const coordinates = await Geolocation.getCurrentPosition();
        setState(prev => ({
          ...prev,
          location: {
            ...prev.location,
            latitude: coordinates.coords.latitude,
            longitude: coordinates.coords.longitude,
            address: `${coordinates.coords.latitude.toFixed(4)}, ${coordinates.coords.longitude.toFixed(4)}`,
            lastUpdate: new Date()
          }
        }));
      } catch (e) {
        console.error("Error getting location", e);
      }
    };
    
    updateLocation();
    const interval = setInterval(updateLocation, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Live Health Simulation (Heart Rate & BP)
  useEffect(() => {
    if (!state.settings.simulationActive) return;

    const interval = setInterval(() => {
      setState(prev => {
        let newHr = prev.health.heartRate;
        let newSys = prev.health.bpSystolic;
        let newDia = prev.health.bpDiastolic;
        let condition = prev.health.condition;
        let sosActive = prev.safety.sosActive;

        if (prev.settings.activeScenario === 'heart_attack' && prev.settings.scenarioStartTime) {
          const elapsed = (Date.now() - prev.settings.scenarioStartTime) / 1000;
          
          let checkInOpen = prev.settings.checkInDialogOpen;
          let countdown = prev.settings.checkInCountdown;

          // Check-in Logic
          if (elapsed >= 5 && elapsed < 8) {
             if (!checkInOpen && countdown === 3) {
                 checkInOpen = true;
             }
             if (checkInOpen) {
                 countdown = Math.max(0, Math.ceil(8 - elapsed));
             }
          } else if (elapsed >= 8 && checkInOpen) {
             checkInOpen = false;
             sosActive = true; // Trigger SOS if timeout
          }

          if (elapsed < 5) {
            // Stage 1: Predictive Phase (0-5s)
            // HR Normal (70-90), HRV Drop (simulated by less variance), BP Unstable
            condition = "Predictive: HRV Drop & BP Instability";
            newHr = 75 + Math.random() * 5; // Tight range (low HRV)
            newSys = 130 + Math.random() * 15; // Fluctuating 130-145
            newDia = 85 + Math.random() * 10; // Drifting up
          } else if (elapsed < 8) {
             // Check-in Phase (5-8s) - Continue Predictive Vitals
             condition = "Predictive: HRV Drop & BP Instability";
             newHr = 75 + Math.random() * 5;
             newSys = 130 + Math.random() * 15;
             newDia = 85 + Math.random() * 10;
          } else if (elapsed < 20) {
            // Stage 2: Pre-Attack / BP Rise (8-20s)
            // BP Rising before HR, HR Irregularities
            condition = "WARNING: BP Rising / HR Irregular";
            newHr = 85 + (Math.random() > 0.8 ? 10 : -5); // Skips/Bounces
            newSys = 140 + Math.random() * 20; // 140-160
            newDia = 90 + Math.random() * 10; // 90-100
          } else if (elapsed < 35) {
            // Stage 3: Ischemia Onset (20-35s)
            // HR Up, BP Down (Classic Ischemia Pattern)
            condition = "CRITICAL: Ischemia Pattern (HR↑ BP↓)";
            newHr = 100 + (elapsed - 20) * 2 + Math.random() * 10; // Rising
            newSys = 120 - (elapsed - 20) * 1 + Math.random() * 5; // Falling
            newDia = 80 - (elapsed - 20) * 0.5 + Math.random() * 5; // Falling
            if (elapsed > 8) sosActive = true;
          } else if (elapsed < 45) {
            // Stage 4: Acute Attack / Instability (35-45s)
            condition = "EMERGENCY: Acute Cardiac Event";
            newHr = 140 + Math.random() * 40; // Spike
            newSys = 90 + Math.random() * 10; // Hypotension
            newDia = 60 + Math.random() * 10;
            sosActive = true;
          } else {
            // Stage 5: Collapse (45s+)
            condition = "CARDIAC ARREST ALERT";
            newHr = Math.max(0, 40 - (elapsed - 45) * 5); // Rapid drop
            newSys = Math.max(0, 80 - (elapsed - 45) * 5); // Rapid drop
            newDia = Math.max(0, 50 - (elapsed - 45) * 5);
            sosActive = true;
          }
          
          newHr = Math.round(newHr);
          newSys = Math.round(newSys);
          newDia = Math.round(newDia);
        } else {
          // Normal Random Walk Simulation
          condition = "Normal";
          if (prev.health.heartRate < 60 && prev.health.bpSystolic < 160) {
             // Smooth random walk with sine wave for "breathing" effect (RSA)
             const time = Date.now() / 1000;
             const breathingEffect = Math.sin(time * 0.5) * 2; // +/- 2 BPM wave
             
             const deltaHr = (Math.random() * 3 - 1.5) + breathingEffect; 
             newHr = Math.min(100, Math.max(80, prev.health.heartRate + deltaHr));
  
             const deltaSys = (Math.random() * 2 - 1);
             newSys = Math.min(130, Math.max(110, prev.health.bpSystolic + deltaSys));
  
             const deltaDia = (Math.random() * 1.5 - 0.75);
             newDia = Math.min(85, Math.max(70, prev.health.bpDiastolic + deltaDia));
             
             newHr = Math.round(newHr);
             newSys = Math.round(newSys);
             newDia = Math.round(newDia);
          } else {
            // Jitter high values to make graph look alive even in crisis
            newHr = prev.health.heartRate + (Math.random() > 0.5 ? 2 : -2);
            newSys = prev.health.bpSystolic + (Math.random() > 0.5 ? 2 : -2);
          }
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const newHistory = [...prev.health.history.slice(1), { 
          time: timeStr, 
          hr: newHr,
          sys: newSys,
          dia: newDia
        }];

        return {
          ...prev,
          settings: {
            ...prev.settings,
            checkInDialogOpen: typeof checkInOpen !== 'undefined' ? checkInOpen : prev.settings.checkInDialogOpen,
            checkInCountdown: typeof countdown !== 'undefined' ? countdown : prev.settings.checkInCountdown
          },
          safety: { ...prev.safety, sosActive: sosActive },
          health: {
            ...prev.health,
            heartRate: newHr,
            bpSystolic: newSys,
            bpDiastolic: newDia,
            condition: condition,
            lastUpdate: now,
            history: newHistory
          }
        };
      });
    }, 1000); // Update every second for smooth graph
    return () => clearInterval(interval);
  }, [state.settings.simulationActive, state.settings.activeScenario, state.settings.scenarioStartTime]);

  // Developer Mode Triggers
  const triggerHeartAttack = () => {
    setState(prev => ({
      ...prev,
      settings: { 
        ...prev.settings, 
        activeScenario: 'heart_attack',
        scenarioStartTime: Date.now(),
        checkInDialogOpen: false,
        checkInCountdown: 3
      }
    }));
    toast.error("SIMULATION STARTED: HEART ATTACK SEQUENCE");
  };

  const triggerHypertensiveCrisis = () => {
    setState(prev => {
      const newHistory = [...prev.health.history.slice(1), { 
        time: new Date().toLocaleTimeString(), 
        hr: 95,
        sys: 195,
        dia: 125
      }];
      return {
        ...prev,
        safety: { ...prev.safety, sosActive: true },
        health: { ...prev.health, bpSystolic: 195, bpDiastolic: 125, history: newHistory }
      };
    });
    processIncomingText("SOS");
    toast.error("SIMULATION: HYPERTENSIVE CRISIS TRIGGERED");
  };


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

  const handleCheckInResponse = (isOk: boolean) => {
    if (isOk) {
      setState(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          checkInDialogOpen: false,
          activeScenario: 'none',
          scenarioStartTime: null
        }
      }));
      toast.success("Check-in Confirmed: User is OK.");
    } else {
      setState(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          checkInDialogOpen: false
        },
        safety: { ...prev.safety, sosActive: true }
      }));
    }
  };

  // Simulate SMS listener (In a real app, use cordova-plugin-sms-receiver)
  useEffect(() => {
    // Mock listener for browser testing
    const handleMockSMS = (e: CustomEvent) => {
      processIncomingText(e.detail.message);
    };
    
    window.addEventListener('mock-sms', handleMockSMS as EventListener);
    
    // Real SMS Plugin Listener
    if (typeof window !== 'undefined') {
      const startSMSWatch = () => {
        if (window.SMSReceive) {
          window.SMSReceive.startWatch(
            () => {
              console.log('SMS Watcher started');
              document.addEventListener('onSMSArrive', (e: any) => {
                const sms = e.data;
                console.log('SMS Arrived:', sms);
                processIncomingText(sms.body);
              });
            },
            (err: any) => {
              console.error('Error starting SMS watcher', err);
            }
          );
        }
      };

      if (window.cordova) {
        document.addEventListener('deviceready', startSMSWatch, false);
      } else {
        // Try immediately if already ready or not in cordova context (though check above handles it)
        startSMSWatch();
      }
    }

    return () => {
      window.removeEventListener('mock-sms', handleMockSMS as EventListener);
      if (window.SMSReceive) {
        window.SMSReceive.stopWatch(() => {}, () => {});
      }
    };
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'home', label: 'Smart Home', icon: Lightbulb },
    { id: 'device', label: 'Device & Location', icon: MapIcon },
    { id: 'activity', label: 'Activity Log', icon: List },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Header Status Bar */}
      <header className="flex items-center justify-between px-8 pb-4 pt-[calc(2rem+env(safe-area-inset-top))] bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
            HomeSync
          </h1>
          <Badge variant={state.device.wifi ? "default" : "destructive"} className="h-6">
            {state.device.wifi ? "Online" : "Offline"}
          </Badge>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  isActive 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        
        <div className="flex items-center gap-6 text-gray-500">
          <div className="flex items-center gap-2">
            <Signal className="w-5 h-5" />
            <span className="text-sm font-medium">5G</span>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className={`w-5 h-5 ${state.device.wifi ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Battery className={`w-6 h-6 ${state.device.battery < 20 ? 'text-red-500' : 'text-green-600'}`} />
              {state.device.isCharging && (
                <Zap className="w-3 h-3 text-yellow-500 absolute -top-1 -right-1 fill-current" />
              )}
            </div>
            <span className="font-mono font-medium">{state.device.battery}%</span>
          </div>
          <div className="flex items-center gap-2 px-4 border-l border-gray-300">
            {state.weather.condition === 'Sunny' ? <Sun className="w-5 h-5 text-yellow-500" /> :
             state.weather.condition === 'Rainy' ? <CloudRain className="w-5 h-5 text-blue-500" /> :
             <Cloud className="w-5 h-5 text-gray-500" />}
            <span className="font-medium text-gray-700">{state.weather.temp}°C</span>
          </div>
          <div className="text-xl font-mono border-l border-gray-300 pl-6 text-gray-700">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Quick Actions */}
              <section>
                <h2 className="text-lg font-medium text-gray-500 mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5" /> Quick Actions
                </h2>
                <div className="grid grid-cols-4 gap-6">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="destructive" 
                      className="w-full h-32 text-xl font-bold flex flex-col gap-3 shadow-xl shadow-red-500/20 rounded-2xl whitespace-nowrap"
                      onClick={() => processIncomingText("SOS")}
                    >
                      <AlertTriangle className="w-10 h-10" />
                      <span className="text-lg">SOS EMERGENCY</span>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      className="w-full h-32 text-xl font-bold flex flex-col gap-3 bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 rounded-2xl whitespace-nowrap"
                      onClick={() => toast.success("Calling Caretaker...")}
                    >
                      <Phone className="w-10 h-10" />
                      <span className="text-lg">Call Caretaker</span>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="secondary"
                      className="w-full h-32 text-xl font-bold flex flex-col gap-3 bg-white hover:bg-gray-50 text-gray-800 shadow-lg border border-gray-200 rounded-2xl whitespace-nowrap"
                      onClick={() => processIncomingText("LOCKED")}
                    >
                      <Lock className="w-10 h-10 text-blue-500" />
                      <span className="text-lg">Lock All Doors</span>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="secondary"
                      className="w-full h-32 text-xl font-bold flex flex-col gap-3 bg-white hover:bg-gray-50 text-gray-800 shadow-lg border border-gray-200 rounded-2xl whitespace-nowrap"
                      onClick={() => toast.info("Ambulance Alert Sent")}
                    >
                      <Ambulance className="w-10 h-10 text-red-500" />
                      <span className="text-lg">Call Ambulance</span>
                    </Button>
                  </motion.div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-8">
                {/* Safety Status */}
                <Card className={`border-0 shadow-xl transition-all duration-500 rounded-3xl overflow-hidden ${state.safety.sosActive ? 'bg-red-50 ring-4 ring-red-100' : 'bg-white'}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xl font-medium text-gray-700">
                      <Shield className="w-6 h-6" /> Safety Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Current State</span>
                        <span className={`text-5xl font-bold mt-2 ${state.safety.sosActive ? 'text-red-600' : 'text-emerald-500'}`}>
                          {state.safety.sosActive ? "SOS ACTIVE" : "SECURE"}
                        </span>
                        {state.health.condition !== 'Normal' && (
                          <span className="text-lg font-bold text-orange-600 mt-2 animate-pulse">
                            {state.health.condition}
                          </span>
                        )}
                      </div>
                      {state.safety.sosActive ? (
                        <div className="p-6 bg-red-100 rounded-full animate-pulse">
                          <AlertTriangle className="w-16 h-16 text-red-600" />
                        </div>
                      ) : (
                        <div className="p-6 bg-emerald-100 rounded-full">
                          <CheckCircle className="w-16 h-16 text-emerald-600" />
                        </div>
                      )}
                    </div>
                    {state.safety.fallDetected && (
                      <div className="mt-4 bg-red-100 p-4 rounded-xl flex items-center gap-3 text-red-800 border border-red-200">
                        <Activity className="w-6 h-6" />
                        <span className="font-bold text-lg">FALL DETECTED - CHECK IMMEDIATELY</span>
                      </div>
                    )}
                    {state.health.heartRate > 60 && (
                      <div className="mt-4 bg-rose-100 p-4 rounded-xl flex items-center gap-3 text-rose-800 border border-rose-200">
                        <Heart className="w-6 h-6 animate-pulse" />
                        <span className="font-bold text-lg">HIGH HEART RATE DETECTED</span>
                      </div>
                    )}
                    {(state.health.bpSystolic > 160 || state.health.bpDiastolic > 100) && (
                      <div className="mt-4 bg-orange-100 p-4 rounded-xl flex items-center gap-3 text-orange-800 border border-orange-200">
                        <Activity className="w-6 h-6" />
                        <span className="font-bold text-lg">HIGH BLOOD PRESSURE DETECTED</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Vitals Summary with Graphs */}
                <Card className="border-0 shadow-xl bg-white rounded-3xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xl font-medium text-gray-700">
                      <Heart className="w-6 h-6" /> Vitals Monitor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Heart Rate Graph */}
                      <div className="h-32 w-full">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-sm font-medium text-gray-500">Heart Rate</span>
                          <span className="text-2xl font-bold text-rose-500">{state.health.heartRate} <span className="text-sm text-gray-400">BPM</span></span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={state.health.history}>
                            <defs>
                              <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorHr)" isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Blood Pressure Graph */}
                      <div className="h-32 w-full border-t border-gray-100 pt-4">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-sm font-medium text-gray-500">Blood Pressure</span>
                          <span className="text-2xl font-bold text-blue-500">
                            {state.health.bpSystolic}/{state.health.bpDiastolic} <span className="text-sm text-gray-400">mmHg</span>
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={state.health.history}>
                            <Line type="monotone" dataKey="sys" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="dia" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Routine Section */}
              <section>
                <h2 className="text-lg font-medium text-gray-500 mb-4 flex items-center gap-2 mt-8">
                  <List className="w-5 h-5" /> Daily Routine
                </h2>
                <div className="grid grid-cols-3 gap-6">
                  {/* Medication Card */}
                  <Card className="col-span-2 border-0 shadow-lg bg-white rounded-3xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Pill className="w-5 h-5 text-blue-500" /> Medication Schedule
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {state.medications.map(med => (
                          <div key={med.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${med.taken ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                <Pill className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{med.name}</p>
                                <p className="text-sm text-gray-500">{med.time}</p>
                              </div>
                            </div>
                            <Button 
                              variant={med.taken ? "ghost" : "default"}
                              size="sm"
                              className={med.taken ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "bg-blue-600 hover:bg-blue-700"}
                              onClick={() => {
                                setState(prev => ({
                                  ...prev,
                                  medications: prev.medications.map(m => 
                                    m.id === med.id ? { ...m, taken: !m.taken } : m
                                  )
                                }));
                                if (!med.taken) toast.success(`Taken ${med.name}`);
                              }}
                            >
                              {med.taken ? "Taken" : "Take"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Next Appointment */}
                  <Card className="border-0 shadow-lg bg-blue-50 rounded-3xl">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-blue-800">
                           <Clock className="w-5 h-5" /> Next Check-up
                        </CardTitle>
                     </CardHeader>
                     <CardContent>
                        <div className="text-center py-8">
                           <p className="text-5xl font-bold text-blue-600 mb-2">14</p>
                           <p className="text-blue-800 font-medium text-lg">Days Left</p>
                           <div className="mt-6 p-3 bg-white/50 rounded-xl">
                             <p className="font-semibold text-blue-900">Dr. Smith</p>
                             <p className="text-sm text-blue-600">Cardiology</p>
                           </div>
                        </div>
                     </CardContent>
                  </Card>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-3 gap-6"
            >
              {/* Living Room Light */}
              <Dialog open={isLightDialogOpen} onOpenChange={setIsLightDialogOpen}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsLightDialogOpen(true)}>
                    <StatusTile 
                      icon={<Sun className="w-8 h-8" />} 
                      label="Living Room" 
                      active={state.home.livingLight} 
                      color="text-yellow-500"
                      subLabel={`${state.home.lightBrightness}% Brightness`}
                      large
                    />
                  </motion.div>
                </DialogTrigger>
                <DialogContent className="bg-white text-gray-900">
                  <DialogHeader>
                    <DialogTitle>Living Room Light</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-8">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium">Power</span>
                      <Button 
                        size="lg"
                        variant={state.home.livingLight ? "default" : "outline"}
                        onClick={() => processIncomingText(state.home.livingLight ? "LIVINGLIGHTOFF" : "LIVINGLIGHTON")}
                        className={state.home.livingLight ? "bg-yellow-500 hover:bg-yellow-600" : ""}
                      >
                        {state.home.livingLight ? "ON" : "OFF"}
                      </Button>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Brightness</span>
                        <span>{state.home.lightBrightness}%</span>
                      </div>
                      <Slider 
                        value={[state.home.lightBrightness]} 
                        max={100} 
                        step={1}
                        onValueChange={(val) => setState(prev => ({ ...prev, home: { ...prev.home, lightBrightness: val[0] } }))}
                        className="py-4"
                      />
                    </div>
                    <div className="space-y-4">
                      <span className="text-sm text-gray-500">Color Temperature</span>
                      <div className="flex gap-3">
                        {['#ffffff', '#fbbf24', '#f97316', '#ef4444', '#3b82f6'].map((color) => (
                          <button
                            key={color}
                            onClick={() => setState(prev => ({ ...prev, home: { ...prev.home, livingLightColor: color } }))}
                            className={`w-10 h-10 rounded-full border-2 transition-all ${state.home.livingLightColor === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Bedroom Light */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => processIncomingText(state.home.bedLight ? "BEDLIGHTOFF" : "BEDLIGHTON")}>
                <StatusTile 
                  icon={<Moon className="w-8 h-8" />} 
                  label="Bedroom" 
                  active={state.home.bedLight} 
                  color="text-purple-500"
                  subLabel="Night Mode"
                  large
                />
              </motion.div>

              {/* Fan Control */}
              <Dialog open={isFanDialogOpen} onOpenChange={setIsFanDialogOpen}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsFanDialogOpen(true)}>
                    <StatusTile 
                      icon={<Wind className="w-8 h-8" />} 
                      label="Ceiling Fan" 
                      active={state.home.fan} 
                      color="text-cyan-500"
                      subLabel={`Speed: ${state.home.fanSpeed}`}
                      large
                    />
                  </motion.div>
                </DialogTrigger>
                <DialogContent className="bg-white text-gray-900">
                  <DialogHeader>
                    <DialogTitle>Fan Control</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-8">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium">Power</span>
                      <Button 
                        size="lg"
                        variant={state.home.fan ? "default" : "outline"}
                        onClick={() => processIncomingText(state.home.fan ? "FANOFF" : "FANON")}
                        className={state.home.fan ? "bg-cyan-500 hover:bg-cyan-600" : ""}
                      >
                        {state.home.fan ? "ON" : "OFF"}
                      </Button>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Speed</span>
                        <span>{state.home.fanSpeed}</span>
                      </div>
                      <Slider 
                        value={[state.home.fanSpeed]} 
                        max={5} 
                        min={1}
                        step={1}
                        onValueChange={(val) => setState(prev => ({ ...prev, home: { ...prev.home, fanSpeed: val[0] } }))}
                        className="py-4"
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Thermostat */}
              <motion.div whileHover={{ scale: 1.02 }}>
                <StatusTile 
                  icon={<Thermometer className="w-8 h-8" />} 
                  label={`${state.home.temperature}°C`} 
                  active={true} 
                  color="text-orange-500"
                  subLabel="Indoor Temperature"
                  large
                />
              </motion.div>

              {/* Security Camera */}
              <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsCameraOpen(true)}>
                    <StatusTile 
                      icon={<Camera className="w-8 h-8" />} 
                      label="Front Door" 
                      active={true} 
                      color="text-blue-500"
                      subLabel="Live Feed"
                      large
                    />
                  </motion.div>
                </DialogTrigger>
                <DialogContent className="bg-white text-gray-900 sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Video className="w-5 h-5" /> Front Door Camera
                    </DialogTitle>
                  </DialogHeader>
                  <div className="aspect-video bg-gray-900 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold animate-pulse z-10">
                      LIVE
                    </div>
                    <div className="absolute bottom-4 left-4 text-white text-sm font-mono z-10">
                      {new Date().toLocaleDateString()} {currentTime.toLocaleTimeString()}
                    </div>
                    {/* Camera Feed */}
                    <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                      {isCameraOpen ? (
                        <video 
                          id="camera-feed" 
                          className="w-full h-full object-cover" 
                          autoPlay 
                          playsInline 
                          muted 
                        />
                      ) : (
                        <div className="text-center">
                          <Camera className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p>Camera Feed Active</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <Button variant="outline" className="flex gap-2">
                      <Volume2 className="w-4 h-4" /> Talk
                    </Button>
                    <Button variant="outline" className="flex gap-2">
                      <AlertTriangle className="w-4 h-4" /> Alarm
                    </Button>
                    <Button variant="outline" className="flex gap-2">
                      <Lock className="w-4 h-4" /> Unlock Door
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Door Lock */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => processIncomingText(state.home.doorLocked ? "UNLOCKED" : "LOCKED")}>
                <StatusTile 
                  icon={state.home.doorLocked ? <Lock className="w-8 h-8" /> : <Unlock className="w-8 h-8" />} 
                  label={state.home.doorLocked ? "Locked" : "Unlocked"} 
                  active={state.home.doorLocked} 
                  color="text-blue-500"
                  subLabel="Main Entrance"
                  large
                />
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'device' && (
            <motion.div 
              key="device"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-3 gap-6">
                <Card className="bg-white border-0 shadow-lg rounded-2xl p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-full ${state.device.isCharging ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                    <Battery className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Battery</div>
                    <div className="text-xl font-bold">{state.device.battery}% {state.device.isCharging && '(Charging)'}</div>
                  </div>
                </Card>
                <Card className="bg-white border-0 shadow-lg rounded-2xl p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-full ${state.device.wifi ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                    <Wifi className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Network</div>
                    <div className="text-xl font-bold">{state.device.wifi ? 'Connected' : 'Offline'}</div>
                  </div>
                </Card>
                <Card className="bg-white border-0 shadow-lg rounded-2xl p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-full ${state.device.ringer === 'silent' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                    {state.device.ringer === 'silent' ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Ringer</div>
                    <div className="text-xl font-bold capitalize">{state.device.ringer}</div>
                  </div>
                </Card>
              </div>

              <Card className="bg-white border-0 shadow-xl rounded-3xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" /> Live Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="aspect-video bg-gray-100 relative">
                    {/* Placeholder for Map - In real app use Google Maps or Mapbox */}
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-200">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 text-blue-500 mx-auto mb-2 animate-bounce" />
                        <p className="text-gray-500 font-medium">Map View</p>
                        <p className="text-xs text-gray-400">{state.location.latitude.toFixed(6)}, {state.location.longitude.toFixed(6)}</p>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg max-w-xs">
                      <div className="font-medium text-gray-900">{state.location.address}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={state.location.isMoving ? "default" : "secondary"}>
                          {state.location.isMoving ? "Moving" : "Stationary"}
                        </Badge>
                        <span className="text-xs text-gray-500">Updated: {state.location.lastUpdate.toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div 
              key="activity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex gap-6"
            >
              <Card className="flex-1 bg-white border-0 shadow-xl rounded-3xl overflow-hidden min-h-[600px]">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" /> System Logs
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[600px] px-6 py-4">
                    <div className="space-y-4">
                      {logs.map((log, i) => (
                        <div key={i} className="flex gap-4 pb-4 border-b border-gray-100 last:border-0">
                          <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                            log.type === 'alert' ? 'bg-red-500' : 
                            log.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                          }`} />
                          <div>
                            <div className="font-medium text-gray-900">{log.message}</div>
                            <div className="text-xs text-gray-500">{log.time.toLocaleTimeString()}</div>
                          </div>
                        </div>
                      ))}
                      {logs.length === 0 && (
                        <div className="text-center text-gray-400 py-10">No activity recorded yet</div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Debug Console */}
              <Card className="w-80 bg-gray-50 border-dashed border-2 border-gray-200 h-fit">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Simulation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      placeholder="Command..." 
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
                    >
                      Send
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    {['LOCKED', 'UNLOCKED', 'SOS', 'SAFE', 'BATLOW', 'MOVING'].map(cmd => (
                      <button
                        key={cmd}
                        onClick={() => window.dispatchEvent(new CustomEvent('mock-sms', { detail: { message: cmd } }))}
                        className="text-xs bg-white hover:bg-gray-100 text-gray-600 px-2 py-1.5 rounded border border-gray-200 transition-colors shadow-sm"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card className="bg-white border-0 shadow-xl rounded-3xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-6 h-6" /> App Settings
                  </CardTitle>
                  <CardDescription>Configure application preferences and developer tools</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="space-y-0.5">
                      <Label className="text-base font-medium">Developer Mode</Label>
                      <p className="text-sm text-gray-500">Enable advanced testing and simulation tools</p>
                    </div>
                    <Switch 
                      checked={state.settings.developerMode}
                      onCheckedChange={(checked) => setState(prev => ({ ...prev, settings: { ...prev.settings, developerMode: checked } }))}
                    />
                  </div>

                  {state.settings.developerMode && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-6 border-t border-gray-100 pt-6"
                    >
                      <div className="flex items-center gap-2 text-blue-600 font-medium">
                        <TestTube className="w-5 h-5" /> Developer Tools
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Simulation Control</h3>
                          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="space-y-0.5">
                              <Label className="font-medium text-blue-900">Live Health Data</Label>
                              <p className="text-xs text-blue-700">Simulate heart rate & BP fluctuations</p>
                            </div>
                            <Switch 
                              checked={state.settings.simulationActive}
                              onCheckedChange={(checked) => setState(prev => ({ ...prev, settings: { ...prev.settings, simulationActive: checked } }))}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Device Simulation</h3>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <Label className="text-sm">Fall Detected</Label>
                              <Switch 
                                checked={state.safety.fallDetected}
                                onCheckedChange={(checked) => {
                                  setState(prev => ({ ...prev, safety: { ...prev.safety, fallDetected: checked } }));
                                  if(checked) toast.error("SIMULATION: FALL DETECTED");
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <Label className="text-sm">Low Battery (15%)</Label>
                              <Switch 
                                checked={state.device.battery <= 15}
                                onCheckedChange={(checked) => {
                                  setState(prev => ({ ...prev, device: { ...prev.device, battery: checked ? 15 : 100 } }));
                                  if(checked) toast.warning("SIMULATION: LOW BATTERY");
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <Label className="text-sm">WiFi Disconnected</Label>
                              <Switch 
                                checked={!state.device.wifi}
                                onCheckedChange={(checked) => {
                                  setState(prev => ({ ...prev, device: { ...prev.device, wifi: !checked } }));
                                  if(checked) toast.warning("SIMULATION: WIFI LOST");
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Emergency Triggers</h3>
                          <div className="grid grid-cols-1 gap-3">
                            <Button 
                              variant="destructive" 
                              className="w-full justify-start gap-3 h-12"
                              onClick={triggerHeartAttack}
                            >
                              <Activity className="w-5 h-5" />
                              Simulate Heart Attack Sequence (1 min)
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                                  <Heart className="w-5 h-5 text-rose-500" />
                                  View Live Health Graphs
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-3xl">
                                <DialogHeader>
                                  <DialogTitle>Live Health Monitor</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-6 py-4">
                                  <div className="h-48 w-full">
                                    <div className="flex justify-between items-end mb-2">
                                      <span className="text-sm font-medium text-gray-500">Heart Rate</span>
                                      <span className="text-2xl font-bold text-rose-500">{state.health.heartRate} <span className="text-sm text-gray-400">BPM</span></span>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={state.health.history}>
                                        <defs>
                                          <linearGradient id="colorHrDev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorHrDev)" isAnimationActive={false} />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <div className="h-48 w-full border-t border-gray-100 pt-4">
                                    <div className="flex justify-between items-end mb-2">
                                      <span className="text-sm font-medium text-gray-500">Blood Pressure</span>
                                      <span className="text-2xl font-bold text-blue-500">
                                        {state.health.bpSystolic}/{state.health.bpDiastolic} <span className="text-sm text-gray-400">mmHg</span>
                                      </span>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={state.health.history}>
                                        <Line type="monotone" dataKey="sys" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line type="monotone" dataKey="dia" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button 
                              className="w-full justify-start gap-3 h-12 bg-orange-600 hover:bg-orange-700"
                              onClick={triggerHypertensiveCrisis}
                            >
                              <AlertTriangle className="w-5 h-5" />
                              Simulate Hypertensive Crisis
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AlertDialog open={state.settings.checkInDialogOpen}>
        <AlertDialogContent className="bg-white border-2 border-rose-100 shadow-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-center text-gray-900">
              Are you OK?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg text-gray-600">
              Abnormal vitals detected. SOS will trigger in...
            </AlertDialogDescription>
            <div className="flex justify-center py-6">
              <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-rose-50 border-4 border-rose-500">
                <span className="text-4xl font-bold text-rose-600">{state.settings.checkInCountdown}</span>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-4">
            <AlertDialogAction 
              onClick={() => handleCheckInResponse(true)}
              className="w-full h-14 text-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
            >
              YES, I AM OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusTile({ icon, label, active, color, subLabel, large }: { icon: any, label: string, active: boolean, color: string, subLabel?: string, large?: boolean }) {
  return (
    <div className={`
      relative overflow-hidden transition-all duration-300 cursor-pointer group
      ${large ? 'p-6 h-48 flex flex-col justify-between' : 'p-3'}
      ${active ? 'bg-white shadow-lg ring-1 ring-black/5' : 'bg-gray-100/50 hover:bg-gray-100'}
      rounded-3xl
    `}>
      <div className={`
        ${large ? 'w-12 h-12 rounded-full flex items-center justify-center mb-4' : 'mb-2'}
        ${active ? `bg-${color.split('-')[1]}-100 ${color}` : 'bg-gray-200 text-gray-500'}
        transition-colors
      `}>
        {icon}
      </div>
      
      <div>
        <div className={`font-semibold text-gray-900 ${large ? 'text-lg' : 'text-sm'}`}>{label}</div>
        {subLabel && <div className={`text-gray-500 ${large ? 'text-sm mt-1' : 'text-xs'}`}>{subLabel}</div>}
      </div>

      {large && (
        <div className={`absolute top-6 right-6 w-3 h-3 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`} />
      )}
    </div>
  );
}

