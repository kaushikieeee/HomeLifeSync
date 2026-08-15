import { CapacitorConfig } from '@capacitor/cli';

// HomeSync Tablet — thin Android shell over the CONSOLIDATED caretaker web
// app. The tablet experience lives at /tablet in HomeLifeSync-Caretaker, so
// this project packages that static export and launches straight into it
// (see MainActivity). Build with build-apks.sh.
const config: CapacitorConfig = {
  appId: 'com.homelifesync.tablet',
  appName: 'HomeSync Tablet',
  webDir: '../HomeLifeSync-Caretaker/out',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#00000000',
      overlay: true
    }
  }
};

export default config;
