import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useCallback } from 'react';

export function useHaptic() {
  const trigger = useCallback(async (style: ImpactStyle = ImpactStyle.Light) => {
    try {
      await Haptics.impact({ style });
    } catch {
      // Fallback for web if Capacitor Haptics is not available or fails
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(1); // Extremely short "tap" for web
      }
    }
  }, []);

  return trigger;
}

export function useSelectionHaptic() {
  const trigger = useCallback(async () => {
    try {
      await Haptics.selectionChanged();
    } catch {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(1);
      }
    }
  }, []);

  return trigger;
}

export function useNotificationHaptic() {
  const trigger = useCallback(async (type: NotificationType) => {
    try {
      await Haptics.notification({ type });
    } catch {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (type === NotificationType.Success) navigator.vibrate([50, 50, 50]);
        else if (type === NotificationType.Error) navigator.vibrate([50, 100, 50]);
        else navigator.vibrate([50]);
      }
    }
  }, []);

  return trigger;
}

export { ImpactStyle, NotificationType };
