# HomeLifeSync — Elder Helper App

A **native Android app** that runs silently on the elder's device. It listens for SMS commands
from the caretaker's phone number and executes them automatically — no interaction needed from
the elder.

## How It Works

```
Caretaker App  --SMS--> Elder's Phone --SMS Receiver--> ElderHelperService --> Execute Action --> Reply SMS
```

1. Caretaker sends an SMS command (e.g. `LOC`, `RING`, `TORCHON`) to the elder's phone number.
2. The `SmsReceiver` BroadcastReceiver intercepts it (works even with screen off / app killed).
3. It is handed to `ElderHelperService` which parses and executes the action.
4. A reply SMS is automatically sent back to the caretaker's number with the result.

## Supported Commands

| Category | Commands |
|----------|----------|
| Location | `LOC`, `LOCFAST`, `LOCADDR`, `MOVESTATE`, `ROUTINE` |
| Device | `RING`, `ALRM`, `STOPRING`, `TORCHON`, `TORCHOFF`, `VIBRATE`, `MUTE`, `UNMUTE`, `VOLMAX`, `VOLLOW`, `SILENT`, `SCREENON`, `SCREENDIM`, `SCREENMAX` |
| Battery | `BATNOW`, `CHARGESTATE`, `BATHEALTH`, `STORAGE`, `TEMPNOW`, `STATUS` |
| Connectivity | `NETSTATE`, `PING`, `WIFIUP`, `WIFIDOWN` |
| Safety | `SOS`, `SOSACK`, `FALLCHECK`, `ACTCHECK` |
| Messaging | `CHECKIN`, `ACK`, `IOK`, `CALLME`, `AUTOREPLYON`, `AUTOREPLYOFF` |
| Routines | `MEDR`, `WATERREM`, `BEDTIME`, `WAKEUP`, `DAYSTART`, `DAYEND` |

> Commands listed in the caretaker UI but not in this table (HR tracking,
> camera/media, geofencing, home automation, AI reports, etc.) are **not yet
> implemented** on the elder device and are shown as unavailable in the UI.
> `FALLCHECK` currently reports "no fall" — real sensor-based fall detection
> is not yet implemented.

## Setup

1. Open project in Android Studio
2. In `Constants.java`, set `CARETAKER_NUMBER` to the caretaker's phone number
3. Build & install on elder's device
4. Grant all requested permissions
5. Enable "Autostart" in phone's battery settings to keep it alive

## Permissions Required

- `RECEIVE_SMS` — intercept incoming SMS
- `SEND_SMS` — reply with results
- `ACCESS_FINE_LOCATION` — GPS for LOC commands
- `CAMERA` — flashlight (TORCHON/TORCHOFF)
- `VIBRATE` — VIBRATE command
- `CALL_PHONE` — CALLME command
- `MODIFY_AUDIO_SETTINGS` — volume/mute commands
- `FOREGROUND_SERVICE` — persistent background service
- `RECEIVE_BOOT_COMPLETED` — auto-start after reboot
- `POST_NOTIFICATIONS` — show persistent notification
- `USE_FULL_SCREEN_INTENT` — full-screen CHECKIN / SOS notification

## Architecture

```
app/src/main/java/com/homelifesync/elder/
├── MainActivity.java              # Setup screen + permission requests
├── Constants.java                 # Caretaker number, app config
├── receiver/
│   ├── SmsReceiver.java           # BroadcastReceiver for incoming SMS (fallback)
│   └── BootReceiver.java          # Auto-start service on device boot
├── service/
│   └── ElderHelperService.java    # Foreground service + command dispatcher
├── commands/
│   ├── LocationHandler.java       # LOC, LOCFAST, LOCADDR, MOVESTATE, ROUTINE
│   ├── DeviceHandler.java         # RING, TORCHON, MUTE, VOLMAX, etc.
│   ├── BatteryHandler.java        # BATNOW, CHARGESTATE, STORAGE
│   ├── NetworkHandler.java        # NETSTATE, WIFIUP, WIFIDOWN, PING
│   ├── SafetyHandler.java         # SOS, SOSACK, FALLCHECK
│   ├── MessagingHandler.java      # CHECKIN, ACK, CALLME
│   └── RoutineHandler.java        # MEDR, WATERREM, BEDTIME, WAKEUP
└── util/
    ├── SmsSender.java             # Helper to send reply SMS
    ├── NotificationHelper.java    # Persistent foreground notification
    └── PrefsHelper.java           # SharedPreferences wrapper
```
