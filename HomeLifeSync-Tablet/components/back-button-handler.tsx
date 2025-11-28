'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useRouter, usePathname } from 'next/navigation';

export function BackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleBackButton = App.addListener('backButton', ({ canGoBack }) => {
      // Define home routes that should exit app
      const homeRoutes = ['/', '/dashboard'];
      
      if (homeRoutes.includes(pathname)) {
        // Exit app if on home screen
        App.exitApp();
      } else if (canGoBack) {
        // Navigate back if possible
        router.back();
      } else {
        // Go to dashboard if can't go back
        router.push('/dashboard');
      }
    });

    return () => {
      handleBackButton.remove();
    };
  }, [pathname, router]);

  return null;
}
