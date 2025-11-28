'use client';

import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { useHaptic, useSelectionHaptic, useNotificationHaptic, ImpactStyle, NotificationType } from '@/hooks/use-haptic';

interface SlideButtonProps {
  onSuccess: () => void;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  className?: string;
}

export function SlideButton({ onSuccess, label, icon, color = "bg-blue-500", className = "" }: SlideButtonProps) {
  const haptic = useHaptic();
  const selectionHaptic = useSelectionHaptic();
  const notificationHaptic = useNotificationHaptic();
  const [isComplete, setIsComplete] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastHapticX = React.useRef(0);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });
  const x = useMotionValue(0);
  const handleSize = 48; // Width of the handle
  const padding = 4; // Padding on one side

  React.useEffect(() => {
    if (containerRef.current) {
      const width = containerRef.current.offsetWidth;
      setDragConstraints({ 
        left: 0, 
        right: width - handleSize - (padding * 2) 
      });
    }
  }, []);

  const backgroundOpacity = useTransform(x, [0, dragConstraints.right], [0.5, 1]);
  const textOpacity = useTransform(x, [0, dragConstraints.right / 2], [1, 0]);

  const handleDrag = () => {
    const currentX = x.get();
    const delta = Math.abs(currentX - lastHapticX.current);

    // Trigger haptic feedback based on movement speed
    if (delta > 3) {
      // If moving fast (large delta), use stronger feedback
      if (delta > 15) {
        haptic(ImpactStyle.Medium);
      } else {
        haptic(ImpactStyle.Light);
      }
      lastHapticX.current = currentX;
    }
  };

  const handleDragEnd = () => {
    if (x.get() > dragConstraints.right * 0.9) { // 90% threshold
      // Success threshold
      animate(x, dragConstraints.right, { type: "spring", stiffness: 400, damping: 20 });
      setIsComplete(true);
      notificationHaptic(NotificationType.Success);
      onSuccess();
      
      // Reset after delay
      setTimeout(() => {
        setIsComplete(false);
        animate(x, 0, { type: "spring", stiffness: 400, damping: 15 });
        lastHapticX.current = 0;
      }, 2000);
    } else {
      // Snap back - Bouncy
      animate(x, 0, { type: "spring", stiffness: 500, damping: 15 });
      lastHapticX.current = 0;
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative h-14 rounded-full bg-muted/80 backdrop-blur-md overflow-hidden select-none border border-border ${className}`}
    >
      {/* Success Background */}
      <motion.div 
        className={`absolute inset-0 ${color}`}
        style={{ opacity: useTransform(x, [0, dragConstraints.right], [0, 1]) }}
      />

      {/* Label */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center font-semibold text-muted-foreground pointer-events-none"
        style={{ opacity: textOpacity }}
      >
        {label}
      </motion.div>

      {/* Success Label */}
      {isComplete && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center font-bold text-white pointer-events-none"
        >
          Sent!
        </motion.div>
      )}

      {/* Handle */}
      <motion.div
        drag="x"
        dragConstraints={dragConstraints}
        dragElastic={0.1}
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="absolute top-1 left-1 w-[48px] h-[48px] bg-card rounded-full shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing z-10 border border-border"
        whileTap={{ scale: 1.05 }}
      >
        {isComplete ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {icon}
          </motion.div>
        ) : (
          <ChevronRight className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        )}
      </motion.div>
    </div>
  );
}
