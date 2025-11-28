'use client';

import { motion } from 'motion/react';

export function MacOSLoader() {
  return (
    <div className="flex items-center justify-center gap-1">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] h-3 bg-[#1B9FA4] rounded-full"
          animate={{
            opacity: [0.2, 1, 0.2],
            scaleY: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
          style={{
            transformOrigin: 'center',
          }}
        />
      ))}
    </div>
  );
}
