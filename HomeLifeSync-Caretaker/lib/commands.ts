export type CommandCategory = {
  title: string;
  commands: {
    cmd: string;
    desc: string;
  }[];
};

export type HeartAlert = {
  id: string;
  type?: string;
  condition: string;
  severity: string;
  ts: number;
  source?: 'local' | 'elder';
  hr?: number;
  spo2?: number;
  temperature?: number;
  respiratoryRate?: number;
  systolic?: number;
  diastolic?: number;
  glucose?: number;
};

export const isCriticalHeart = (a: HeartAlert) =>
  a.severity === 'CRITICAL' || a.severity === 'WARNING';

/**
 * Commands actually implemented by the elder-helper Android app.
 * Anything not in this set will (honestly) be shown as unavailable in
 * the caretaker UI instead of silently failing with "Unknown command".
 */
export const IMPLEMENTED_COMMANDS: ReadonlySet<string> = new Set([
  // Location
  'LOC', 'LOCFAST', 'LOCADDR', 'MOVESTATE', 'ROUTINE',
  // Wearable health simulation (Scenarios in lib/health.ts)
  'HRNORMAL', 'HRMI', 'HRTACHY', 'HRBRADY', 'HRARRHY', 'HRAFIB',
  'HYPOXIA', 'FEVER', 'HYPOTHERMIA', 'BPCRISIS', 'HYPOTENSION',
  'TACHYPNEA', 'BRADYPNEA', 'HYPERGLYCEMIA', 'HYPOGLYCEMIA',
  // Safety
  'SOS', 'SOSACK', 'FALLCHECK', 'ACTCHECK',
  // Device controls
  'RING', 'ALRM', 'STOPRING', 'TORCHON', 'TORCHOFF', 'SCREENON',
  'SCREENDIM', 'SCREENMAX', 'VIBRATE', 'MUTE', 'UNMUTE', 'SILENT',
  'VOLMAX', 'VOLLOW',
  // Messaging
  'ACK', 'CHECKIN', 'IOK', 'CALLME', 'AUTOREPLYON', 'AUTOREPLYOFF',
  // Battery / status
  'BATNOW', 'BATHEALTH', 'CHARGESTATE', 'TEMPNOW', 'STORAGE', 'STATUS',
  // Connectivity
  'NETSTATE', 'PING', 'WIFIUP', 'WIFIDOWN',
  // Routine reminders
  'MEDR', 'WATERREM', 'BEDTIME', 'WAKEUP', 'DAYSTART', 'DAYEND',
]);

export const SMS_COMMANDS: CommandCategory[] = [
  {
    title: "1. Location & Movement (Basic)",
    commands: [
      { cmd: "LOC", desc: "Get live GPS location" },
      { cmd: "LOCFAST", desc: "Get location with low accuracy but fast" },
      { cmd: "LOCADDR", desc: "Return full address (reverse geocode)" },
      { cmd: "MOVESTATE", desc: "Detect if phone is stationary / moving" },
      { cmd: "ROUTINE", desc: "Return last 3 movement patterns" },
    ]
  },
  {
    title: "2. Health / Wearable Monitoring",
    commands: [
      { cmd: "HRNORMAL", desc: "Reset wearable simulation to normal" },
      { cmd: "HRMI", desc: "Simulate heart attack (MI)" },
      { cmd: "HRAFIB", desc: "Simulate atrial fibrillation" },
      { cmd: "HRTACHY", desc: "Simulate tachycardia" },
      { cmd: "HRBRADY", desc: "Simulate bradycardia" },
      { cmd: "HRARRHY", desc: "Simulate arrhythmia" },
      { cmd: "HYPOXIA", desc: "Simulate low oxygen (SpO2)" },
      { cmd: "FEVER", desc: "Simulate high fever" },
      { cmd: "HYPOTHERMIA", desc: "Simulate hypothermia" },
      { cmd: "BPCRISIS", desc: "Simulate hypertensive crisis" },
      { cmd: "HYPOTENSION", desc: "Simulate hypotension" },
      { cmd: "TACHYPNEA", desc: "Simulate fast breathing" },
      { cmd: "BRADYPNEA", desc: "Simulate slow breathing" },
      { cmd: "HYPERGLYCEMIA", desc: "Simulate high glucose" },
      { cmd: "HYPOGLYCEMIA", desc: "Simulate low glucose" },
      { cmd: "HRNOW", desc: "Fetch current HR from wearable API" },
      { cmd: "HRAVG", desc: "Average HR of last 30 minutes" },
      { cmd: "HRPEAK", desc: "Last recorded HR peak" },
      { cmd: "HRLOW", desc: "Last recorded HR low event" },
      { cmd: "HRTREND", desc: "6-hour heart-rate trend" },
    ]
  },
  {
    title: "3. Safety & Alerts",
    commands: [
      { cmd: "SOS", desc: "Trigger emergency SOS (alarm + vibrate)" },
      { cmd: "SOSACK", desc: "Acknowledge / stop the SOS alarm" },
      { cmd: "FALLCHECK", desc: "Check if device detected fall" },
      { cmd: "NOINACT", desc: "Inactivity for X minutes" },
      { cmd: "ACTCHECK", desc: "Confirm activity now" },
    ]
  },
  {
    title: "4. Behaviour Awareness / AI Flags",
    commands: [
      { cmd: "BEHAVFLAG", desc: "Return last unusual behaviour" },
      { cmd: "NIGHTMOVE", desc: "Night-time movement alert toggle" },
      { cmd: "INACTALERT", desc: "Inactivity alert toggle" },
      { cmd: "WAKEPAT", desc: "Return wake/sleep pattern" },
      { cmd: "ROUTINECOMPARE", desc: "Compare today vs yesterday" },
    ]
  },
  {
    title: "5. Device Controls",
    commands: [
      { cmd: "RING", desc: "Ring phone loudly" },
      { cmd: "ALRM", desc: "Play siren alarm" },
      { cmd: "STOPRING", desc: "Stop ringing / siren immediately" },
      { cmd: "TORCHON", desc: "Turn flashlight ON" },
      { cmd: "TORCHOFF", desc: "Turn flashlight OFF" },
      { cmd: "SCREENON", desc: "Turn device screen ON" },
      { cmd: "SCREENDIM", desc: "Set brightness low" },
      { cmd: "SCREENMAX", desc: "Set brightness max" },
      { cmd: "VIBRATE", desc: "Vibrate device" },
      { cmd: "MUTE", desc: "Mute phone" },
      { cmd: "UNMUTE", desc: "Unmute phone" },
    ]
  },
  {
    title: "6. Messaging & Interaction",
    commands: [
      { cmd: "ACK", desc: "Elder acknowledges" },
      { cmd: "CHECKIN", desc: "Ask elder to tap “I’m OK”" },
      { cmd: "IOK", desc: "Elder manually taps OK" },
      { cmd: "CALLME", desc: "Force device to call caregiver" },
      { cmd: "AUTOREPLYON", desc: "Turn on auto-replies" },
      { cmd: "AUTOREPLYOFF", desc: "Disable auto replies" },
    ]
  },
  {
    title: "7. Camera & Media",
    commands: [
      { cmd: "PHOTO", desc: "Take photo front camera" },
      { cmd: "PHOTO2", desc: "Take photo rear camera" },
      { cmd: "PHOTONOWIFI", desc: "Take photo only if WiFi available" },
      { cmd: "RECORD", desc: "Record short audio" },
      { cmd: "SNAPVID", desc: "Record quick video" },
      { cmd: "PLAYMSG", desc: "Play preloaded caretaker audio" },
    ]
  },
  {
    title: "8. App Interactions",
    commands: [
      { cmd: "OPENAPP", desc: "Open specific app" },
      { cmd: "CLOSEAPP", desc: "Close app (auto input)" },
      { cmd: "OPENMAP", desc: "Open Google Maps with location" },
      { cmd: "OPENCALL", desc: "Open dialer" },
      { cmd: "OPENMED", desc: "Open medicines/reminders app" },
    ]
  },
  {
    title: "9. Battery / Device Status",
    commands: [
      { cmd: "BATNOW", desc: "Battery level" },
      { cmd: "BATHEALTH", desc: "Battery health status" },
      { cmd: "BATLOW", desc: "Alert if battery below %" },
      { cmd: "CHARGESTATE", desc: "Charging or not" },
      { cmd: "TEMPNOW", desc: "Device temperature" },
      { cmd: "STORAGE", desc: "Available storage" },
    ]
  },
  {
    title: "10. Internet & Connectivity",
    commands: [
      { cmd: "NETSTATE", desc: "WiFi/Mobile status" },
      { cmd: "PING", desc: "Check if device is reachable" },
      { cmd: "WIFIUP", desc: "Turn WiFi ON" },
      { cmd: "WIFIDOWN", desc: "Turn WiFi OFF" },
      { cmd: "DATAON", desc: "Enable mobile data" },
      { cmd: "DATAOFF", desc: "Disable mobile data" },
      { cmd: "HOTSPOTON", desc: "Enable hotspot" },
      { cmd: "HOTSPOTOFF", desc: "Disable hotspot" },
    ]
  },
  {
    title: "11. Daily Routine Automation",
    commands: [
      { cmd: "MEDR", desc: "Send medicine reminder" },
      { cmd: "WATERREM", desc: "Drink water reminder" },
      { cmd: "BEDTIME", desc: "Remind elder to sleep" },
      { cmd: "WAKEUP", desc: "Wake-up reminder" },
      { cmd: "ROUTINELOG", desc: "Log behaviour summary" },
      { cmd: "DAYSTART", desc: "Morning check-in" },
      { cmd: "DAYEND", desc: "Night check-in" },
    ]
  },
  {
    title: "12. Geofencing",
    commands: [
      { cmd: "GEOSET", desc: "Set geofence coordinates" },
      { cmd: "GEOCLEAR", desc: "Remove geofence" },
      { cmd: "GEOALERT", desc: "Toggle geofence breach alerts" },
      { cmd: "GEOENTER", desc: "Alert on entry" },
      { cmd: "GEOEXIT", desc: "Alert on exit" },
    ]
  },
  {
    title: "13. Environment Data",
    commands: [
      { cmd: "AMBIENT", desc: "Get brightness sensor value" },
      { cmd: "NOISE", desc: "Get microphone noise level" },
      { cmd: "SHAKE", desc: "Detect device shake event" },
      { cmd: "ORIENT", desc: "Orientation (portrait/landscape)" },
      { cmd: "ACCDATA", desc: "Accelerometer reading" },
    ]
  },
  {
    title: "14. Home Automation (IoT-ready)",
    commands: [
      { cmd: "LIVINGLIGHTON", desc: "Living room light ON" },
      { cmd: "LIVINGLIGHTOFF", desc: "Living room light OFF" },
      { cmd: "BEDLIGHTON", desc: "Bedroom light ON" },
      { cmd: "BEDLIGHTOFF", desc: "Bedroom light OFF" },
      { cmd: "FANON", desc: "Fan ON" },
      { cmd: "FANOFF", desc: "Fan OFF" },
      { cmd: "LOCKDOOR", desc: "Lock door" },
      { cmd: "UNLOCKDOOR", desc: "Unlock door" },
      { cmd: "ACSTAT", desc: "AC status" },
      { cmd: "ACLINK", desc: "Send IR command" },
    ]
  },
  {
    title: "15. System Control",
    commands: [
      { cmd: "REBOOT", desc: "Reboot device" },
      { cmd: "POWEROFF", desc: "Power off (root)" },
      { cmd: "VOLMAX", desc: "Set volume max" },
      { cmd: "VOLLOW", desc: "Set volume low" },
      { cmd: "SILENT", desc: "Silent mode" },
      { cmd: "RESTARTTASKER", desc: "Restart Tasker service" },
      { cmd: "CLEARCACHE", desc: "Clear temp files" },
    ]
  },
  {
    title: "16. AI-Based Behaviour Reports",
    commands: [
      { cmd: "AIWEEK", desc: "Weekly behaviour summary" },
      { cmd: "AIPATTERN", desc: "Highlight unusual patterns" },
      { cmd: "AIMOOD", desc: "Estimate stress/activity level" },
      { cmd: "AIPREDICT", desc: "Predict possible unusual events" },
      { cmd: "AIREMIND", desc: "Auto-suggest routines" },
    ]
  }
];
