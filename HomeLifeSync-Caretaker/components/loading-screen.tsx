'use client';

import { useEffect, useState } from 'react';

export function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F6F8] flex flex-col items-center justify-center gap-12" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* Text */}
      <h1 className="text-3xl sm:text-4xl font-bold text-[#1A1A1A] tracking-wider">HomeSync</h1>

      {/* Loading Bar - Forward Only */}
      <div className="w-48 h-1.5 bg-[#E0E0E0] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1B9FA4] rounded-full"
          style={{
            animation: 'forwardProgress 6s ease-in-out forwards',
            width: '0%',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes forwardProgress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
