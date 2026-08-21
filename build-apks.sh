#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────
# HomeLifeSync — build all three Android APKs and collect them in ./output/apks
#
#   • home-sync-caretaker-debug.apk   Next.js + Capacitor  (com.kaushikieee.homelifesync.caretaker)
#   • home-sync-elder-debug.apk       Native Android      (com.homelifesync.elder) ← elder-helper
#   • home-sync-tablet-debug.apk      Thin shell over the consolidated caretaker
#                                     export, launches straight into /tablet
#                                     (com.homelifesync.tablet)
#
# Requirements:
#   - Android SDK  (reads sdk.dir from local.properties or ANDROID_HOME)
#   - Java 17+ on PATH (the Gradle daemon is auto-pinned to JDK 21 via foojay)
#   - Network on first run (downloads Gradle distributions + JDK 21 toolchain)
# ────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/output/apks"
CAR="$ROOT/HomeLifeSync-Caretaker"
TAB="$ROOT/HomeLifeSync-Tablet"
DEBUG_APK="app/build/outputs/apk/debug/app-debug.apk"
GRADLE_OPTS=(--console=plain)

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
note() { printf '  \033[36m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓ %s\033[0m\n' "$*"; }

# ── Toolchain sanity ────────────────────────────────────────────────────
command -v java >/dev/null 2>&1 || { echo "ERROR: java not found on PATH (need JDK 17+)." >&2; exit 1; }

SDK_DIR=""
if [ -f "$CAR/android/local.properties" ]; then
  SDK_DIR="$(awk -F= '/^sdk\.dir=/{sub(/^[ \t]+/, "", $2); print $2}' "$CAR/android/local.properties" | sed 's/[ \t]*$//')"
  SDK_DIR="${SDK_DIR//\ / }"
fi
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$SDK_DIR}}"
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
  echo "ERROR: Android SDK not found. Install it or set ANDROID_HOME." >&2
  exit 1
fi
ok "Android SDK at $ANDROID_HOME"
ok "Java: $(java -version 2>&1 | head -1)"

# Fresh output dir — never let a partially-failed build leave stale APKs that
# look like current artifacts.
rm -rf "$OUT"
mkdir -p "$OUT"

# ── Repair helpers (so the script is safe on a fresh clone) ─────────────
ensure_gradle_wrapper() {
  # elder-helper historically lost its wrapper jar/scripts; Gradle can't run without them.
  # Restore the whole wrapper (jar + scripts + version + JDK21 daemon pin) from caretaker.
  local proj="$1"
  if [ ! -f "$proj/gradle/wrapper/gradle-wrapper.jar" ] || [ ! -x "$proj/gradlew" ]; then
    note "restoring Gradle wrapper for $(basename "$proj") from caretaker android/"
    mkdir -p "$proj/gradle/wrapper" "$proj/gradle"
    cp "$CAR/android/gradle/wrapper/gradle-wrapper.jar"        "$proj/gradle/wrapper/gradle-wrapper.jar"
    cp "$CAR/android/gradle/wrapper/gradle-wrapper.properties" "$proj/gradle/wrapper/gradle-wrapper.properties"
    cp "$CAR/android/gradle/gradle-daemon-jvm.properties"       "$proj/gradle/gradle-daemon-jvm.properties"
    cp "$CAR/android/gradlew"     "$proj/gradlew"
    cp "$CAR/android/gradlew.bat" "$proj/gradlew.bat"
    chmod +x "$proj/gradlew"
  fi
}

ensure_tablet_android() {
  # The tablet Android project pins Gradle's daemon to JDK 21 via foojay, same
  # as caretaker/elder. Re-apply if the project was regenerated without it.
  if [ -f "$TAB/android/settings.gradle" ] && ! grep -q foojay "$TAB/android/settings.gradle"; then
    note "adding foojay resolver to tablet settings.gradle"
    cp "$CAR/android/settings.gradle" "$TAB/android/settings.gradle"
  fi
  if [ -f "$TAB/android/gradle/gradle-daemon-jvm.properties" ]; then
    ensure_gradle_wrapper "$TAB/android"
  else
    mkdir -p "$TAB/android/gradle"
    cp "$CAR/android/gradle/gradle-daemon-jvm.properties" \
       "$TAB/android/gradle/gradle-daemon-jvm.properties"
    ensure_gradle_wrapper "$TAB/android"
  fi
}

# ── 1. Caretaker web (static export → out/) ─────────────────────────────
log "Building caretaker web app (static export)"
if { [ -n "${NEXT_PUBLIC_FIREBASE_DATABASE_URL:-}" ] && [ "$NEXT_PUBLIC_FIREBASE_DATABASE_URL" != "None" ]; } \
   || grep -qE '^NEXT_PUBLIC_FIREBASE_DATABASE_URL=.+m?[-_a-zA-Z0-9]+' "$CAR/.env.local" 2>/dev/null; then
  note "Firebase env present → APKs will carry the real elder feed config"
else
  note "No Firebase env vars → APKs run in SIMULATION mode (no .env.local found)"
fi
(cd "$CAR" && npm run build)

# ── 2. Caretaker APK ────────────────────────────────────────────────────
log "Syncing caretaker web assets into android/"
(cd "$CAR" && node node_modules/@capacitor/cli/bin/capacitor sync android)

log "Building caretaker APK"
(cd "$CAR/android" && ./gradlew assembleDebug "${GRADLE_OPTS[@]}")
cp "$CAR/android/$DEBUG_APK" "$OUT/home-sync-caretaker-debug.apk"
ok "caretaker → $OUT/home-sync-caretaker-debug.apk"

# ── 3. Elder APK (native) ───────────────────────────────────────────────
log "Building elder APK (elder-helper, native)"
# The elder project applies com.google.gms.google-services unconditionally, so
# a missing google-services.json fails the whole build. Fail fast with guidance.
if [ ! -f "$CAR/elder-helper/app/google-services.json" ]; then
  echo "ERROR: $CAR/elder-helper/app/google-services.json is missing." >&2
  echo "  Copy the example and fill in your Firebase project values:" >&2
  echo "  cp elder-helper/app/google-services.json.example elder-helper/app/google-services.json" >&2
  exit 1
fi
ensure_gradle_wrapper "$CAR/elder-helper"
(cd "$CAR/elder-helper" && ./gradlew assembleDebug "${GRADLE_OPTS[@]}")
cp "$CAR/elder-helper/$DEBUG_APK" "$OUT/home-sync-elder-debug.apk"
ok "elder → $OUT/home-sync-elder-debug.apk"

# ── 4. Tablet APK (thin shell over caretaker export) ────────────────────
log "Preparing tablet web assets (redirect root → /tablet/)"
TAB_WEB="$ROOT/HomeLifeSync-Tablet/tablet-web"
rm -rf "$TAB_WEB"
# Copy everything from caretaker out/
cp -R "$CAR/out" "$TAB_WEB"
# Replace root index.html with redirect to /tablet/
cat > "$TAB_WEB/index.html" <<'REDIRECT'
<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0;url=/tablet/"></head>
<body><script>window.location.replace('/tablet/');</script></body>
</html>
REDIRECT

log "Syncing tablet web assets into android/ (webDir = ../tablet-web)"
(cd "$TAB" && node node_modules/@capacitor/cli/bin/capacitor sync android)

log "Building tablet APK"
ensure_tablet_android
(cd "$TAB/android" && ./gradlew assembleDebug "${GRADLE_OPTS[@]}")
cp "$TAB/android/$DEBUG_APK" "$OUT/home-sync-tablet-debug.apk"
ok "tablet → $OUT/home-sync-tablet-debug.apk"

# ── Summary ─────────────────────────────────────────────────────────────
log "All APKs built"
printf '  %-40s %8s\n' "artifact" "size"
for f in "$OUT"/*.apk; do
  printf '  %-40s %8s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
done
printf '\n  APKs: %s\n' "$OUT"