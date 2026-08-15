'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { useRouter, usePathname } from 'next/navigation';

export function BackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let handle: PluginListenerHandle | null = null;

    App.addListener('backButton', ({ canGoBack }) => {
      // Define home routes that should exit app
      const homeRoutes = ['/', '/caretaker'];

      if (homeRoutes.includes(pathname)) {
        // Exit app if on home screen
        App.exitApp();
      } else if (canGoBack) {
        // Navigate back if possible
        router.back();
      } else {
        // Go to home if can't go back
        router.push('/');
      }
    }).then((h) => {
      handle = h;
    });

    return () => {
      if (handle) handle.remove();
    };
  }, [pathname, router]);

  return null;
}
