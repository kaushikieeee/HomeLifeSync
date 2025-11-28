export interface UserStatus {
  deviceId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  batteryLevel: number;
  isCharging: boolean;
  steps: number;
  heartRate: number;
  status: 'active' | 'resting' | 'sos';
  lastUpdated: string;
}

export interface Alert {
  id: string;
  deviceId: string;
  type: 'sos' | 'fall' | 'geofence' | 'battery' | 'inactivity';
  message: string;
  timestamp: string;
  resolved: boolean;
}
