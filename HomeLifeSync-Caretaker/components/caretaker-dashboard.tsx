'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from "motion/react";
import { 
  User,
  Settings,
  LogOut,
  MessageSquare,
  Send,
  Search, Star, Zap, MapPin, Phone, Bell, Activity, Shield,
  Home, Smartphone, Wifi, Battery, Camera, Grid, Clock,
  Thermometer, Power, FileText, Brain, MessageCircle, List,
  ChevronRight, X, Lock, RefreshCw, Trash2
} from 'lucide-react';
import { useHaptic, useSelectionHaptic, ImpactStyle } from '@/hooks/use-haptic';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SMS_COMMANDS } from '@/lib/commands';
import { SlideButton } from '@/components/ui/slide-button';

// Add type definition for Cordova SMS plugin
declare global {
  interface Window {
    sms?: {
      send: (
        number: string,
        message: string,
        options: { android: { intent: string } },
        success: () => void,
        error: (err: any) => void
      ) => void;
      hasPermission: (
        success: (hasPermission: boolean) => void,
        error: (err: any) => void
      ) => void;
    };
    SMSReceive?: {
      startWatch: (
        success: () => void,
        error: (err: any) => void
      ) => void;
      stopWatch: (
        success: () => void,
        error: (err: any) => void
      ) => void;
    };
    Fingerprint?: {
      isAvailable: (
        success: (result: "OK" | "finger" | "face" | "biometric") => void,
        error: (message: string) => void
      ) => void;
      show: (
        options: {
          title?: string;
          subtitle?: string;
          description?: string;
          fallbackButtonTitle?: string;
          disableBackup?: boolean;
          clientId?: string;
          clientSecret?: string;
        },
        success: (result: any) => void,
        error: (err: any) => void
      ) => void;
    };
  }
}

// iOS Colors
const IOS_COLORS = {
  blue: "bg-[#007AFF]",
  green: "bg-[#34C759]",
  indigo: "bg-[#5856D6]",
  orange: "bg-[#FF9500]",
  pink: "bg-[#FF2D55]",
  purple: "bg-[#AF52DE]",
  red: "bg-[#FF3B30]",
  teal: "bg-[#5AC8FA]",
  yellow: "bg-[#FFCC00]",
  gray: "bg-[#8E8E93]",
  gray2: "bg-[#AEAEB2]",
  gray3: "bg-[#C7C7CC]",
  gray4: "bg-[#D1D1D6]",
  gray5: "bg-[#E5E5EA]",
  gray6: "bg-[#F2F2F7]",
};

// 9-Grid Important Commands
const IMPORTANT_COMMANDS = [
  { cmd: "LOC", label: "Locate", icon: <MapPin className="w-5 h-5" />, color: "bg-blue-500" },
  { cmd: "SOS", label: "SOS", icon: <Shield className="w-5 h-5" />, color: "bg-red-500" },
  { cmd: "RING", label: "Ring", icon: <Bell className="w-5 h-5" />, color: "bg-yellow-500" },
  { cmd: "CALLME", label: "Call Me", icon: <Phone className="w-5 h-5" />, color: "bg-green-500" },
  { cmd: "BATNOW", label: "Battery", icon: <Battery className="w-5 h-5" />, color: "bg-green-500" },
  { cmd: "PHOTO", label: "Photo", icon: <Camera className="w-5 h-5" />, color: "bg-indigo-500" },
  { cmd: "CHECKIN", label: "Check In", icon: <Activity className="w-5 h-5" />, color: "bg-teal-500" },
  { cmd: "TORCHON", label: "Torch", icon: <Zap className="w-5 h-5" />, color: "bg-orange-500" },
  { cmd: "ALRM", label: "Siren", icon: <Bell className="w-5 h-5" />, color: "bg-red-600" },
];

// High Level Commands
const HIGH_LEVEL_COMMANDS = [
  { cmd: "LOCK", label: "Lock Device", icon: <Lock className="w-5 h-5" />, color: "bg-gray-900" },
  { cmd: "POWEROFF", label: "Power Off", icon: <Power className="w-5 h-5" />, color: "bg-red-600" },
  { cmd: "REBOOT", label: "Reboot", icon: <RefreshCw className="w-5 h-5" />, color: "bg-orange-600" },
  { cmd: "WIPE", label: "Wipe Data", icon: <Trash2 className="w-5 h-5" />, color: "bg-red-800" },
];

// Icon mapping with colors
const getCategoryStyle = (title: string) => {
  if (title.includes("Location")) return { icon: <MapPin className="w-5 h-5 text-white" />, color: IOS_COLORS.blue };
  if (title.includes("Health")) return { icon: <Activity className="w-5 h-5 text-white" />, color: IOS_COLORS.red };
  if (title.includes("Safety")) return { icon: <Shield className="w-5 h-5 text-white" />, color: IOS_COLORS.orange };
  if (title.includes("Behaviour")) return { icon: <Brain className="w-5 h-5 text-white" />, color: IOS_COLORS.purple };
  if (title.includes("Device")) return { icon: <Smartphone className="w-5 h-5 text-white" />, color: IOS_COLORS.gray };
  if (title.includes("Messaging")) return { icon: <MessageCircle className="w-5 h-5 text-white" />, color: IOS_COLORS.green };
  if (title.includes("Camera")) return { icon: <Camera className="w-5 h-5 text-white" />, color: IOS_COLORS.yellow };
  if (title.includes("App")) return { icon: <Grid className="w-5 h-5 text-white" />, color: IOS_COLORS.indigo };
  if (title.includes("Battery")) return { icon: <Battery className="w-5 h-5 text-white" />, color: IOS_COLORS.green };
  if (title.includes("Internet")) return { icon: <Wifi className="w-5 h-5 text-white" />, color: IOS_COLORS.blue };
  if (title.includes("Routine")) return { icon: <Clock className="w-5 h-5 text-white" />, color: IOS_COLORS.teal };
  if (title.includes("Geofencing")) return { icon: <MapPin className="w-5 h-5 text-white" />, color: IOS_COLORS.pink };
  if (title.includes("Environment")) return { icon: <Thermometer className="w-5 h-5 text-white" />, color: IOS_COLORS.orange };
  if (title.includes("Home")) return { icon: <Home className="w-5 h-5 text-white" />, color: IOS_COLORS.yellow };
  if (title.includes("System")) return { icon: <Power className="w-5 h-5 text-white" />, color: IOS_COLORS.gray };
  if (title.includes("AI")) return { icon: <FileText className="w-5 h-5 text-white" />, color: IOS_COLORS.purple };
  return { icon: <List className="w-5 h-5 text-white" />, color: IOS_COLORS.gray };
};

export function CaretakerDashboard() {
  const router = useRouter();
  const haptic = useHaptic();
  const selectionHaptic = useSelectionHaptic();
  const [targetPhoneNumber, setTargetPhoneNumber] = useState<string | null>('9597140692');
  const [phoneInput, setPhoneInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [elderBattery, setElderBattery] = useState<string | null>(null);

  // Handle scroll for header blur effect
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        setScrolled(scrollRef.current.scrollTop > 20);
      }
    };
    const div = scrollRef.current;
    div?.addEventListener('scroll', handleScroll);
    return () => div?.removeEventListener('scroll', handleScroll);
  }, []);

  // Load saved phone number
  useEffect(() => {
    const savedPhone = localStorage.getItem('target_phone_number');
    if (savedPhone) {
      setTargetPhoneNumber(savedPhone);
    } else {
      localStorage.setItem('target_phone_number', '9597140692');
    }
  }, []);

  // SMS Listener for Battery Status
  useEffect(() => {
    if (typeof window !== 'undefined' && window.SMSReceive) {
      window.SMSReceive.startWatch(
        () => {
          console.log('SMS Watch started');
          document.addEventListener('onSMSArrive', (e: any) => {
            const sms = e.data;
            console.log('SMS Arrived:', sms);
            // Check for battery format: "BATTERY: 85%" or similar
            if (sms.body && sms.body.includes('BATTERY:')) {
               const parts = sms.body.split('BATTERY:');
               if (parts.length > 1) {
                 const level = parts[1].trim();
                 setElderBattery(level);
                 toast.success(`Elder Battery Updated: ${level}`);
               }
            }
          });
        },
        (err) => console.error('Error starting SMS watch', err)
      );
    }
    
    return () => {
      if (typeof window !== 'undefined' && window.SMSReceive) {
        window.SMSReceive.stopWatch(() => {}, () => {});
      }
    };
  }, []);

  const savePhoneNumber = (phone: string) => {
    if (phone) {
      localStorage.setItem('target_phone_number', phone);
      setTargetPhoneNumber(phone);
      toast.success('Phone number saved');
    } else {
      localStorage.removeItem('target_phone_number');
      setTargetPhoneNumber(null);
    }
  };

  const handleConnect = () => {
    if (phoneInput) {
      savePhoneNumber(phoneInput);
    }
  };

  const handleHighLevelCommand = (cmd: string, label: string) => {
    haptic(ImpactStyle.Medium);
    if (!targetPhoneNumber) {
      toast.error("No phone number set");
      return;
    }

    const performAction = () => {
      sendSMS(cmd, label);
    };

    if (window.Fingerprint) {
      window.Fingerprint.isAvailable(
        () => {
          window.Fingerprint!.show(
            {
              title: "Authentication Required",
              subtitle: `Authenticate to ${label}`,
              description: "This action requires authorization",
              fallbackButtonTitle: "Cancel",
              disableBackup: true,
            },
            () => {
              performAction();
            },
            (err) => {
              toast.error("Authentication failed");
            }
          );
        },
        () => {
          // Biometric not available
          if (confirm(`Are you sure you want to ${label}?`)) {
            performAction();
          }
        }
      );
    } else {
      if (confirm(`Are you sure you want to ${label}?`)) {
        performAction();
      }
    }
  };

  const sendSMS = (command: string, description: string) => {
    if (!targetPhoneNumber) {
      toast.error("No phone number set");
      return;
    }
    
    haptic(ImpactStyle.Medium);
    
    if (typeof window !== 'undefined' && window.sms) {
      const send = () => {
        toast.info(`Sending ${command}...`);
        window.sms!.send(
          targetPhoneNumber,
          command,
          { android: { intent: '' } },
          () => {
            toast.success(`Sent: ${command}`);
          },
          (err) => {
            console.error('SMS Send Error:', err);
            toast.error(`Failed to send automatically. Opening app...`);
            const smsLink = `sms:${targetPhoneNumber}?body=${encodeURIComponent(command)}`;
            window.open(smsLink, '_self');
          }
        );
      };

      window.sms.hasPermission(
        (hasPermission) => {
          if (hasPermission) {
            send();
          } else {
            send();
          }
        },
        (err) => {
          send();
        }
      );
    } else {
      const smsLink = `sms:${targetPhoneNumber}?body=${encodeURIComponent(command)}`;
      window.open(smsLink, '_self');
      toast.success(`Preparing to send: ${command}`, {
        description: description
      });
    }
  };

  // Filter commands based on search
  const filteredCategories = SMS_COMMANDS.map(cat => ({
    ...cat,
    commands: cat.commands.filter(c => 
      c.cmd.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.desc.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.commands.length > 0);

  if (!targetPhoneNumber) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="bg-card p-8 rounded-[20px] shadow-sm w-full max-w-md text-center border border-border">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2 tracking-tight text-foreground">Welcome</h2>
          <p className="text-muted-foreground mb-8">Enter the Elder's phone number to get started.</p>
          
          <div className="space-y-4">
            <Input 
              placeholder="+1234567890" 
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="text-center text-lg h-12 rounded-xl bg-muted border-border"
              type="tel"
            />
            <Button onClick={handleConnect} className="w-full h-12 rounded-xl bg-[#007AFF] hover:bg-[#0069D9] text-lg font-semibold text-white">
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col font-sans">
      {/* iOS Header - Sticky & Glassmorphic */}
      <div className="sticky top-0 z-50 pt-safe bg-background/70 backdrop-blur-2xl border-b border-border supports-[backdrop-filter]:bg-background/60 transition-all duration-200">
        <div className="px-4 pb-2 flex items-center justify-between pt-2">
          <div className="flex flex-col">
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[34px] font-bold tracking-tight text-foreground"
            >
              HomeSync<span className="text-[#FFCC00]">.</span>
            </motion.h1>
            {elderBattery && (
               <motion.div 
                 initial={{ opacity: 0, y: -10 }} 
                 animate={{ opacity: 1, y: 0 }}
                 className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100/80 px-2.5 py-1 rounded-full w-fit mt-0.5 backdrop-blur-sm border border-green-200"
               >
                 <Battery className="w-3.5 h-3.5 fill-current" />
                 <span>Elder: {elderBattery}</span>
               </motion.div>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                onClick={() => haptic(ImpactStyle.Medium)}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-[#007AFF] active:opacity-70 transition-opacity backdrop-blur-sm"
              >
                <Settings className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                router.push('/settings');
              }}>
                <Settings className="mr-2 h-4 w-4" /> App Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (targetPhoneNumber) {
                  navigator.clipboard.writeText(targetPhoneNumber);
                  toast.success("Number Copied");
                }
              }}>
                Copy Number
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => savePhoneNumber('')}>
                <LogOut className="mr-2 h-4 w-4" /> Change Number
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search Bar - Removed */}

      </div>

      {/* Main Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-[120px] pt-4 space-y-6"
      >
        {/* Quick Actions - Slide to Send */}
        {!searchQuery && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-4">Critical Actions</h2>
            <div className="space-y-3">
              <SlideButton 
                label="Slide to SOS" 
                onSuccess={() => sendSMS("SOS", "Emergency SOS")}
                color="bg-[#FF3B30]"
                icon={<Shield className="w-6 h-6 text-white" />}
              />
              <SlideButton 
                label="Slide to Locate" 
                onSuccess={() => sendSMS("LOC", "Locating Device")}
                color="bg-[#007AFF]"
                icon={<MapPin className="w-6 h-6 text-white" />}
              />
            </div>

            {/* 9-Grid Quick Center */}
            <div>
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-4 mb-3">Quick Center</h2>
              <div className="grid grid-cols-3 gap-3">
                {IMPORTANT_COMMANDS.map((cmd, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendSMS(cmd.cmd, cmd.label)}
                    className="aspect-square bg-card rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform border border-border"
                  >
                    <div className={`w-10 h-10 rounded-full ${cmd.color} flex items-center justify-center text-white`}>
                      {cmd.icon}
                    </div>
                    <span className="text-[13px] font-medium text-foreground">{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* High Level Commands */}
            <div>
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-4 mb-3">High Level Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                {HIGH_LEVEL_COMMANDS.map((cmd, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleHighLevelCommand(cmd.cmd, cmd.label)}
                    className="h-14 bg-card rounded-2xl flex items-center px-4 gap-3 shadow-sm active:scale-95 transition-transform border border-border"
                  >
                    <div className={`w-8 h-8 rounded-full ${cmd.color} flex items-center justify-center text-white`}>
                      {cmd.icon}
                    </div>
                    <span className="text-[15px] font-medium text-foreground">{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Categories List */}
        <div className="space-y-6 pb-8">
          {filteredCategories.map((category, index) => {
            const style = getCategoryStyle(category.title);
            const isOpen = activeCategory === category.title || searchQuery.length > 0;

            return (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {!searchQuery && (
                  <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide ml-4 mb-2">
                    {category.title.replace(/^\d+\.\s*/, '')}
                  </h2>
                )}
                
                <div className="bg-card rounded-[10px] overflow-hidden shadow-sm border border-border">
                  {/* Category Header (only if not searching, acts as toggle) */}
                  {!searchQuery && (
                    <button 
                      onClick={() => {
                        selectionHaptic();
                        setActiveCategory(activeCategory === category.title ? null : category.title);
                      }}
                      className="w-full flex items-center justify-between p-3 active:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-[6px] ${style.color} flex items-center justify-center`}>
                          {style.icon}
                        </div>
                        <span className="font-medium text-[17px] text-foreground">{category.title.replace(/^\d+\s*\.\s*/, '')}</span>
                      </div>
                      <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                  )}

                  {/* Commands List */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="divide-y divide-border border-t border-border"
                      >
                        {category.commands.map((cmd, cmdIndex) => (
                          <button
                            key={cmdIndex}
                            onClick={() => sendSMS(cmd.cmd, cmd.desc)}
                            className="w-full flex items-center justify-between p-4 pl-12 hover:bg-muted active:bg-muted/80 transition-colors group"
                          >
                            <div className="text-left">
                              <span className="block font-medium text-[17px] text-foreground">
                                {cmd.cmd}
                              </span>
                              <span className="text-[13px] text-muted-foreground">
                                {cmd.desc}
                              </span>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[#007AFF] opacity-0 group-hover:opacity-100 transition-opacity">
                              <Send className="w-4 h-4" />
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Floating Bottom Search Bar */}
      <div className="absolute bottom-8 left-4 right-4 z-50">
        <div className="relative group shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-full">
          <div className="absolute inset-0 bg-card/20 backdrop-blur-2xl rounded-full border border-border/30" />
          <div className="relative flex items-center px-4 h-[56px]">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <input 
              type="text"
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none text-[17px] text-foreground placeholder:text-muted-foreground focus:ring-0 outline-none h-full"
            />
            {searchQuery && (
              <button 
                onClick={() => {
                  haptic(ImpactStyle.Medium);
                  setSearchQuery('');
                }}
                className="p-1 rounded-full bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

