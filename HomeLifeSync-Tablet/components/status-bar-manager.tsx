"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

export function StatusBarManager() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const updateStatusBar = async () => {
      try {
        const isDark = resolvedTheme === "dark";
        
        // Style.Dark = Light Text (for dark backgrounds)
        // Style.Light = Dark Text (for light backgrounds)
        await StatusBar.setStyle({
          style: isDark ? Style.Dark : Style.Light,
        });

        if (Capacitor.getPlatform() === 'android') {
           // Match the theme background colors
           // Dark: Deep Slate (#262933 approx for oklch(0.15 0.02 260))
           // Light: iOS Gray (#F2F2F7) to match dashboard background
           await StatusBar.setBackgroundColor({
             color: isDark ? '#262933' : '#F2F2F7'
           });
        }
      } catch (e) {
        console.error("Failed to update status bar", e);
      }
    };

    updateStatusBar();
  }, [resolvedTheme]);

  return null;
}
