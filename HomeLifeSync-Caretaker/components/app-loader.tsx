'use client';

import { useEffect, useState } from 'react';
import { MacOSLoader } from '@/components/ui/macos-loader';

export function AppLoader() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Show loader for 2 seconds on app open
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F6F8]">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-[#1A1A1A]" style={{ fontFamily: '-apple-system, SF Pro Display, system-ui, sans-serif' }}>
          HomeSync
        </h1>
        <MacOSLoader />
      </div>
    </div>
  );
}
