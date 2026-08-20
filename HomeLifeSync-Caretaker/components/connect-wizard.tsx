'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartHandshake, UserCircle, Smartphone, CheckCircle2, ArrowRight, ArrowLeft, Baby, Heart, Stethoscope, User } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';

export type CaretakerProfile = {
  role: string;
  name: string;
};

const ROLES = [
  { id: 'child',      label: 'Child',      icon: <Baby className="w-5 h-5" /> },
  { id: 'grandchild', label: 'Grandchild', icon: <Heart className="w-5 h-5" /> },
  { id: 'caregiver',  label: 'Caregiver',  icon: <HeartHandshake className="w-5 h-5" /> },
  { id: 'nurse',      label: 'Nurse',      icon: <Stethoscope className="w-5 h-5" /> },
  { id: 'other',      label: 'Other',      icon: <User className="w-5 h-5" /> },
];

type Props = {
  onComplete: (deviceId: string, profile: CaretakerProfile) => void;
};

const STEPS = [
  { key: 'welcome',  icon: <HeartHandshake className="w-5 h-5" />, title: 'Welcome' },
  { key: 'role',     icon: <UserCircle   className="w-5 h-5" />, title: 'Your role' },
  { key: 'device',   icon: <Smartphone   className="w-5 h-5" />, title: 'Connect' },
  { key: 'done',     icon: <CheckCircle2 className="w-5 h-5" />, title: 'All set' },
];

const DEVICE_ID_RE = /^[0-9a-fA-F]{8}$/;

export function ConnectWizard({ onComplete }: Props) {
  const [step,      setStep]      = useState(0);
  const [role,      setRole]      = useState('');
  const [name,      setName]      = useState('');
  const [deviceId,  setDeviceId]  = useState('');
  const [saving,    setSaving]    = useState(false);

  const deviceOk = DEVICE_ID_RE.test(deviceId.trim());

  const canNext = step === 0 || step === 3 ||
    (step === 1 && role !== '') || (step === 2 && deviceOk);

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const finish = () => {
    if (saving) return;
    setSaving(true);
    setTimeout(() => onComplete(deviceId.trim(), { role, name: name.trim() }), 350);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background p-6 font-sans">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-[34px] font-bold tracking-tight text-foreground">
            <span className="text-[#FF9933]">Home</span>Sync
            <span className="text-[#138808]">.</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Caretaker setup</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                i === step
                  ? "bg-primary border-primary text-primary-foreground"
                  : i < step
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500"
                    : "border-border text-muted-foreground"
              )}>
                {s.icon}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-6 h-px", i < step ? "bg-emerald-500/60" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-card p-6 rounded-[24px] shadow-sm border border-border min-h-[340px] flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex-1 flex flex-col"
            >
              {step === 0 && (
                <div className="flex-1 flex flex-col justify-center text-center">
                  <HeartHandshake className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h2 className="text-xl font-bold tracking-tight mb-2">Stay close, even from afar</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Monitor your loved one's location, vitals and safety — and reach
                    them with a tap. Setup takes under a minute.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="flex-1">
                  <h2 className="text-lg font-bold tracking-tight mb-1">Who are you?</h2>
                  <p className="text-muted-foreground text-sm mb-5">So the dashboard can greet you and label alerts.</p>
                  <div className="grid grid-cols-3 gap-2 mb-5">
                    {ROLES.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setRole(r.label)}
                        className={cn(
                          "h-16 rounded-xl border flex flex-col items-center justify-center gap-1 text-[13px] font-medium active:scale-[0.97] transition-all duration-150 cursor-pointer",
                          role === r.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:border-primary/30"
                        )}
                      >
                        <span className={cn(role === r.label && "text-primary", role !== r.label && "text-muted-foreground")}>{r.icon}</span>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <label className="text-[12px] text-muted-foreground mb-1 block">Your name (optional)</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Priya"
                    className="h-12 rounded-xl"
                  />
                </div>
              )}

              {step === 2 && (
                <div className="flex-1">
                  <h2 className="text-lg font-bold tracking-tight mb-1">Connect to their device</h2>
                  <p className="text-muted-foreground text-sm mb-5">
                    Ask your loved one to open HomeSync on their phone and read the
                    Device&nbsp;ID — it's an 8-character code they can tap to copy.
                  </p>
                  <Input
                    placeholder="e.g. a1b2c3d4"
                    value={deviceId}
                    onChange={e => setDeviceId(e.target.value)}
                    className={cn(
                      "text-center text-lg h-14 rounded-xl font-mono tracking-widest",
                      deviceId.trim() && !deviceOk && "border-red-400 text-red-500 focus-visible:ring-red-400"
                    )}
                    autoFocus={step === 2}
                  />
                  {deviceId.trim() && !deviceOk && (
                    <p className="text-[11px] text-red-500 mt-2 text-center">
                      Device ID must be exactly 8 characters (letters a-f and numbers 0-9). Check for typos like an extra digit.
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">
                    Commands are sent over Firebase — free and instant. No pairing codes, no phone number needed.
                  </p>
                </div>
              )}

              {step === 3 && (
                <div className="flex-1 flex flex-col justify-center text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold tracking-tight mb-1">You're connected</h2>
                  <p className="text-muted-foreground text-sm mb-5">
                    Device <span className="font-mono font-semibold text-foreground">{deviceId.trim()}</span>
                    {role && <> · as <span className="font-medium text-foreground">{role}</span></>}
                    {name && <> · {name}</>}
                  </p>
                  <Button
                    onClick={finish}
                    disabled={saving}
                    className="w-full h-12 rounded-xl bg-primary text-lg font-semibold"
                  >
                    {saving ? 'Opening dashboard…' : 'Open dashboard'}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <Button variant="ghost" onClick={back} disabled={step === 0} className="gap-1 rounded-xl">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            {step < 3 && (
              <Button onClick={next} disabled={!canNext} className="gap-1 rounded-xl">
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            {step === 3 && (
              <Button onClick={finish} disabled={saving} className="gap-1 rounded-xl">
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}