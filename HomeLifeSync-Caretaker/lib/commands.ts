export type CommandCategory = {
  title: string;
  commands: {
    cmd: string;
    desc: string;
  }[];
};

export const SMS_COMMANDS: CommandCategory[] = [
  {
    title: "Location & Movement",
    commands: [
      { cmd: "LOC", desc: "Returns GPS + accuracy + address" },
      { cmd: "MOVESTATE", desc: "Returns stationary / walking / in vehicle" },
    ]
  },
  {
    title: "Safety & Emergency",
    commands: [
      { cmd: "SOS", desc: "SOS alert + location + photo + call caretaker" },
      { cmd: "CALLME", desc: "Make a call to caretaker" },
      { cmd: "FALLCHECK", desc: "Fall-detection check" },
      { cmd: "CHECKIN", desc: "Send 'Are you OK?'" },
    ]
  },
  {
    title: "Device Controls",
    commands: [
      { cmd: "RING", desc: "Ring device loudly" },
      { cmd: "TORCH", desc: "Toggle flashlight ON/OFF" },
      { cmd: "SCREEN", desc: "Turn screen ON" },
      { cmd: "VIBRATE", desc: "Vibrate device" },
      { cmd: "LOCKSCREEN", desc: "Lock touch input" },
      { cmd: "UNLOCKSCREEN", desc: "Unlock touch input" },
    ]
  },
  {
    title: "Status",
    commands: [
      { cmd: "BATSTATUS", desc: "Battery %, temp, health" },
      { cmd: "NETSTATUS", desc: "Network strength + connectivity state" },
    ]
  }
];

