# HomeLifeSync - Caretaker App

This is the **Caretaker App** - designed for family members or caregivers to monitor elderly loved ones.

## Features

- **Real-time Monitoring**: View live location, health stats, and device status
- **Interactive Map**: See location on embedded Google Maps
- **Remote Commands**:
  - Ring the Elder's device
  - Request location updates
  - Send messages
- **Call & SMS History**: View recent communications
- **Multi-Device Support**: Connect to multiple Elder devices
- **Health Alerts**: Monitor heart rate, battery, and activity levels

## Setup

### Prerequisites

- Node.js 18+ and pnpm
- Android Studio (for mobile deployment)
- Java 21+

### Installation

```bash
# Install dependencies
pnpm install

# Build the web app
pnpm build

# For mobile deployment:
pnpm cap:sync
pnpm cap:open
```

### Configuration

The app connects to Firebase Realtime Database. Configuration is in `hooks/use-caretaker-data.ts`:

```typescript
const FIREBASE_DB_URL = 'https://homelifesync-1e3ba-default-rtdb.asia-southeast1.firebasedatabase.app';
```

## First-Time Setup

1. **Launch the App**: You'll see a "Connect Device" screen
2. **Get Device ID**: From the Elder App, copy the Device ID (UUID) displayed at the top
3. **Enter ID**: Paste the Device ID into the Caretaker App
4. **Connect**: Tap "Connect" to start monitoring

## Features Overview

### Dashboard

- **Live Location Panel**: Shows real-time GPS coordinates with embedded map
- **Vitals Cards**: Heart rate, steps, battery level
- **Recent Alerts**: Important notifications and events
- **Quick Actions**: Call, message, check-in buttons

### Remote Commands

**Ring Device**: Makes the Elder's phone play a loud ringtone (useful for finding lost phones or getting attention)

**Request Location**: Forces an immediate GPS update

**Refresh**: Manually pull latest data from Firebase

### Settings Menu

- **Copy Device ID**: Quick copy to clipboard
- **Disconnect**: Remove current device and pair with a different one

### Location Features

- **Embedded Map**: Google Maps iframe showing exact location
- **Open in Google Maps**: Launch full Google Maps app for navigation
- **Coordinate Display**: Precise latitude/longitude with accuracy info

## How It Works

1. **Device Pairing**: Enter the Elder's Device ID to establish connection
2. **Data Polling**: Every 5 seconds, fetches latest data from Firebase `/users/{deviceId}`
3. **Command System**: Sends commands to Firebase `/commands/{deviceId}` which the Elder app executes
4. **Visual Updates**: Real-time UI updates with location, vitals, and status

## Permissions

- **INTERNET**: Required for Firebase communication
- No sensitive device permissions needed

## Scripts

- `pnpm dev` - Start development server (http://localhost:3000)
- `pnpm build` - Build production bundle
- `pnpm cap:sync` - Sync web assets to Android
- `pnpm cap:open` - Open Android Studio
- `pnpm android` - Build and open in one command

## Project Structure

```
/
├── app/                    # Next.js pages
│   └── page.tsx           # Main dashboard page
├── components/            # React components
│   ├── caretaker-dashboard.tsx  # Main UI
│   ├── call-logs-panel.tsx
│   ├── messages-panel.tsx
│   └── ui/               # shadcn/ui components
├── hooks/                 # Custom React hooks
│   └── use-caretaker-data.ts  # Firebase connection
├── lib/                   # Utilities
│   └── store.ts          # Type definitions
├── android/              # Android native code
└── public/               # Static assets
```

## UI Components

### Device Connection Screen

Displayed when no device is connected. Features:
- Large Device ID input field
- Connect button
- Instructions

### Main Dashboard

After connection, shows:
- **Header**: Connected device info, last update time, online status
- **Location Panel**: Map and coordinates
- **Vitals Grid**: 3-column health metrics
- **Alerts Feed**: Chronological event list
- **Quick Actions**: 3 action buttons + Ring button

### Dropdown Menus

- **Settings Menu**: Device management
- **Location Menu**: Map actions

## Monitoring Multiple Devices

To switch devices:

1. Click **Settings** (gear icon)
2. Select **Disconnect**
3. Enter new Device ID
4. Click **Connect**

The app remembers the last connected device using `localStorage`.

## Customization

### Adding New Metrics

1. Update `UserStatus` type in `lib/store.ts`
2. Modify dashboard in `components/caretaker-dashboard.tsx`
3. Add new card components as needed

### Changing Alert Logic

Edit the `alerts` array in `caretaker-dashboard.tsx` to customize alert types and severity levels.

### Styling

The app uses Tailwind CSS with custom design tokens:
- Primary: `#F56A3F` (Orange)
- Secondary: `#3B6EFF` (Blue)
- Background: `#F5F6F8` (Light gray)

## Troubleshooting

### Device Not Connecting

1. Verify Device ID is correct (UUID format)
2. Ensure Elder app is running and syncing
3. Check Firebase URL is correct
4. Verify internet connection

### Location Not Showing

1. Ensure Elder device has granted location permissions
2. Check that GPS is enabled on Elder device
3. Wait for next sync cycle (5 seconds)

### Map Not Loading

1. Check internet connection
2. Verify Google Maps iframe is not blocked
3. Ensure coordinates are valid numbers

### Commands Not Working

1. Verify Firebase database rules allow writes to `/commands/`
2. Check Elder app is polling for commands
3. Ensure Elder device has internet connection

## Firebase Database Structure

```json
{
  "users": {
    "{deviceId}": {
      "deviceId": "uuid",
      "timestamp": "ISO string",
      "latitude": 0.0,
      "longitude": 0.0,
      "batteryLevel": 100,
      "isCharging": false,
      "steps": 0,
      "heartRate": 0,
      "status": "active",
      "lastUpdated": "string",
      "callLogs": [...],
      "messages": [...]
    }
  },
  "commands": {
    "{deviceId}": {
      "{commandId}": {
        "type": "ring|request-location|message",
        "timestamp": 0,
        "executed": false
      }
    }
  }
}
```

## Security Recommendations

1. **Firebase Rules**: Implement authentication and proper security rules
2. **Device ID Privacy**: Treat Device IDs as sensitive information
3. **HTTPS Only**: Ensure all connections use HTTPS
4. **Data Retention**: Implement policies to delete old data

## Building for Production

```bash
# Build web bundle
pnpm build

# For Android:
pnpm cap:sync

# Open Android Studio
pnpm cap:open

# Create signed APK in Android Studio:
# Build > Generate Signed Bundle / APK
```

## Web Deployment

The app can also run as a web application:

```bash
pnpm build
pnpm start  # or deploy 'out' folder to hosting
```

## License

MIT
