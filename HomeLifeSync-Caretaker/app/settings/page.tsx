"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHaptic } from "@/hooks/use-haptic";
import { ImpactStyle } from "@capacitor/haptics";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const haptic = useHaptic();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = () => {
    haptic(ImpactStyle.Heavy);
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const handleThemeChange = (newTheme: string) => {
    haptic(ImpactStyle.Heavy);
    setTheme(newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              className="flex flex-col items-center gap-2 h-24"
              onClick={() => handleThemeChange("light")}
            >
              <Sun className="h-6 w-6" />
              <span>Light</span>
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              className="flex flex-col items-center gap-2 h-24"
              onClick={() => handleThemeChange("dark")}
            >
              <Moon className="h-6 w-6" />
              <span>Dark</span>
            </Button>
            <Button
              variant={theme === "system" ? "default" : "outline"}
              className="flex flex-col items-center gap-2 h-24"
              onClick={() => handleThemeChange("system")}
            >
              <Monitor className="h-6 w-6" />
              <span>System</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
