// Simple in-memory store for development
// In a real production app, use a database like Supabase or Firebase

export type UserStatus = {
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
  logs?: LogEntry[];
  callLogs?: CallLog[];
  messages?: SMS[];
  // Additional device info
  deviceModel?: string;
  devicePlatform?: string;
  deviceOsVersion?: string;
  appVersion?: string;
  networkStatus?: 'online' | 'offline';
};

export type CallLog = {
  number: string;
  type: 'incoming' | 'outgoing' | 'missed' | 'unknown';
  date: number;
  duration: number;
  name: string;
};

export type SMS = {
  address: string;
  body: string;
  date: number;
  type: 'sent' | 'received';
};

export type LogEntry = {
  id: string;
  type: 'call' | 'battery' | 'location' | 'system';
  message: string;
  timestamp: string;
};

export type Command = {
  id: string;
  type: 'ring' | 'message';
  payload?: string;
  timestamp: string;
  executed: boolean;
};

// Global storage
declare global {
  var _elderStatus: UserStatus | null;
  var _commands: Command[];
}

if (!global._elderStatus) {
  global._elderStatus = null;
}

if (!global._commands) {
  global._commands = [];
}

export const store = {
  getStatus: () => global._elderStatus,
  updateStatus: (status: UserStatus) => {
    global._elderStatus = status;
  },
  addCommand: (command: Command) => {
    global._commands.push(command);
  },
  getPendingCommands: () => {
    return global._commands.filter(c => !c.executed);
  },
  markCommandExecuted: (id: string) => {
    const cmd = global._commands.find(c => c.id === id);
    if (cmd) cmd.executed = true;
  }
};
