'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartHandshake, Smartphone, CheckCircle2, ArrowRight, ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { useHaptic, useSelectionHaptic, ImpactStyle } from '@/hooks/use-haptic';
import { verifyPairing, DEVICE_ID_RE, PAIRING_CODE_RE } from '@/lib/pairing';

export type CaretakerProfile = {
  name: string;
};

type Props = {
  onComplete: (deviceId: string, profile: CaretakerProfile) => void;
};

const STEPS = [
  { key: 'welcome', icon: <HeartHandshake className="w-5 h-5" />, title: 'Welcome' },
  { key: 'link',    icon: <Smartphone   className="w-5 h-5" />, title: 'Link caretaker' },
  { key: 'done',    icon: <CheckCircle2 className="w-5 h-5" />, title: 'All set' },
];

export function ConnectWizard({ onComplete }: Props) {
  const haptic = useHaptic();
  const selectionHaptic = useSelectionHaptic();

  const [step,      setStep]      = useState(0);
  const [name,      setName]      = useState('');
  const [deviceId,  setDeviceId]  = useState('');
  const [code,      setCode]      = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  const deviceOk = DEVICE_ID_RE.test(deviceId.trim());
  const codeOk   = PAIRING_CODE_RE.test(code.trim());

  const canNext =
    step === 0 ? name.trim().length > 0
    : step === 1 ? deviceOk && codeOk
    : true;

  const next = async () => {
    void selectionHaptic();
    if (step === 1) {
      // Link is the code-verified step — don't advance past it without proof.
      setVerifying(true);
      setVerifyErr(null);
      const result = await verifyPairing(deviceId, code);
      setVerifying(false);
      if (!result.ok) {
        setVerifyErr(result.reason);
        void haptic(ImpactStyle.Light);
        return;
      }
      void haptic(ImpactStyle.Light);
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    void selectionHaptic();
    setStep(s => Math.max(s - 1, 0));
  };

  const finish = () => {
    if (saving) return;
    setSaving(true);
    void haptic(ImpactStyle.Light);
    setTimeout(() => onComplete(deviceId.trim(), { name: name.trim() }), 350);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background p-6 font-sans">
      <div className="w-full max-w-md">

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="text-center mb-8"
        >
          <h1 className="text-[34px] font-bold tracking-tight text-foreground">
            <span className="text-[#FF9933]">Home</span>Sync
            <span className="text-[#138808]">.</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Link caretaker</p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <motion.div key={s.key} className="flex items-center gap-2" layout>
              <motion.div
                animate={{ scale: i === step ? 1 : 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                  i === step
                    ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/25"
                    : i < step
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500"
                      : "border-border text-muted-foreground"
                )}
              >
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : s.icon}
              </motion.div>
              {i < STEPS.length - 1 && (
                <motion.div
                  animate={{ backgroundColor: i < step ? '#34d399' : 'rgba(0,0,0,0.08)' }}
                  className="w-6 h-px rounded"
                />
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          className="bg-card p-6 rounded-[24px] shadow-sm border border-border min-h-[340px] flex flex-col"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="flex-1 flex flex-col"
            >
              {step === 0 && (
                <div className="flex-1 flex flex-col justify-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.05 }}
                    className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4"
                  >
                    <HeartHandshake className="w-7 h-7" />
                  </motion.div>
                  <h2 className="text-xl font-bold tracking-tight mb-1 text-center">Stay close, even from afar</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed text-center mb-6">
                    Monitor your loved one&apos;s location, vitals and safety — and reach
                    them with a tap. Setup takes under a minute.
                  </p>
                  <label className="text-[12px] text-muted-foreground mb-1 block">Your name</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Priya"
                    autoFocus
                    className="h-12 rounded-xl text-center text-lg"
                  />
                </div>
              )}

              {step === 1 && (
                <div className="flex-1">
                  <h2 className="text-lg font-bold tracking-tight mb-1">Link caretaker</h2>
                  <p className="text-muted-foreground text-sm mb-5">
                    Ask your loved one to open HomeSync on their phone — you need
                    the Device&nbsp;ID and the temporary 4-digit pairing code it shows.
                  </p>
                  <Input
                    placeholder="Device ID — e.g. a1b2c3d4"
                    value={deviceId}
                    onChange={e => { setDeviceId(e.target.value); setVerifyErr(null); }}
                    className={cn(
                      "text-center text-lg h-14 rounded-xl font-mono tracking-widest mb-3",
                      deviceId.trim() && !deviceOk && "border-red-400 text-red-500 focus-visible:ring-red-400"
                    )}
                  />
                  <Input
                    placeholder="Pairing code — 4 digits"
                    value={code}
                    onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setVerifyErr(null); }}
                    inputMode="numeric"
                    className={cn(
                      "text-center text-lg h-14 rounded-xl font-mono tracking-[0.5em]",
                      code.trim() && !codeOk && "border-red-400 text-red-500 focus-visible:ring-red-400"
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">
                    The code is temporary (valid 5 minutes) — tap <span className="font-medium">New code</span> on the
                    elder&apos;s app if it expired.
                  </p>
                  <AnimatePresence>
                    {verifyErr && (
                      <motion.p
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="text-[12px] text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2.5 leading-relaxed"
                      >
                        {verifyErr}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {step === 2 && (
                <div className="flex-1 flex flex-col justify-center text-center">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle2 className="w-8 h-8" />
                  </motion.div>
                  <h2 className="text-xl font-bold tracking-tight mb-1">You&apos;re connected</h2>
                  <p className="text-muted-foreground text-sm mb-5">
                    Linked to <span className="font-mono font-semibold text-foreground">{deviceId.trim()}</span>
                    {name && <> · {name}</>}
                  </p>
                  <Button
                    onClick={finish}
                    disabled={saving}
                    className="w-full h-12 rounded-xl bg-primary text-lg font-semibold active:scale-[0.98] transition-transform"
                  >
                    {saving ? 'Opening dashboard…' : 'Open dashboard'}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0}
              className="gap-1 rounded-xl active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            {step < 2 && (
              <Button
                onClick={() => void next()}
                disabled={!canNext || verifying}
                className="gap-1 rounded-xl active:scale-95 transition-transform"
              >
                {verifying
                  ? (<><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>)
                  : (<>{step === 1 ? <KeyRound className="w-4 h-4" /> : null} Continue <ArrowRight className="w-4 h-4" /></>)}
              </Button>
            )}
            {step === 2 && (
              <Button onClick={finish} disabled={saving} className="gap-1 rounded-xl active:scale-95 transition-transform">
                Finish
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}