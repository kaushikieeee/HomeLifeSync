package com.homelifesync.elder;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.homelifesync.elder.firebase.FirebaseRepository;
import com.homelifesync.elder.commands.HealthHandler;
import com.homelifesync.elder.service.ElderHelperService;
import com.homelifesync.elder.util.NotificationHelper;
import com.homelifesync.elder.util.Haptics;
import com.homelifesync.elder.util.PrefsHelper;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private Button     btnToggleService;
    private Button     btnWriteSettings;
    private Button     btnDndAccess;
    private Button     btnDisconnect;
    private Button     btnNewCode;
    private TextView   tvStatus;
    private TextView   tvNumber;
    private TextView   tvDeviceId;
    private TextView   tvPairCode;
    private ImageView  ivStatusDot;
    private PrefsHelper prefs;

    private String pairingCode = "";   // current 4-digit code shown on screen

    private VitalsPanelView vitalsPanel;
    private TextView   tvHealthState;
    private LinearLayout simContainer;
    private TextView   tvSimLabel;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());

    private final Runnable refreshVitals = new Runnable() {
        @Override public void run() {
            updateVitals();
            uiHandler.postDelayed(this, 1000);
        }
    };

    private final ActivityResultLauncher<String[]> permLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> startHelperService()
        );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // First-run → setup wizard; show it and bail out of the dashboard.
        prefs = new PrefsHelper(this);
        if (!prefs.isOnboarded()) {
            startActivity(new Intent(this, WizardActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_main);

        btnToggleService  = findViewById(R.id.btnToggleService);
        btnWriteSettings  = findViewById(R.id.btnWriteSettings);
        btnDndAccess      = findViewById(R.id.btnDndAccess);
        btnDisconnect     = findViewById(R.id.btnDisconnect);
        btnNewCode        = findViewById(R.id.btnNewCode);
        tvStatus          = findViewById(R.id.tvStatus);
        tvNumber          = findViewById(R.id.tvNumber);
        tvDeviceId        = findViewById(R.id.tvDeviceId);
        tvPairCode        = findViewById(R.id.tvPairCode);
        ivStatusDot       = findViewById(R.id.ivStatusDot);

        // ── Live vitals (fake heart rate + condition simulator) ──────
        vitalsPanel  = findViewById(R.id.vitalsPanel);
        tvHealthState = findViewById(R.id.tvHealthState);
        simContainer  = findViewById(R.id.simContainer);
        tvSimLabel    = findViewById(R.id.tvSimLabel);

        HealthHandler health = HealthHandler.get(this);
        health.start();
        updateVitals();

        findViewById(R.id.btnHrNormal).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRNORMAL", null); updateVitals(); Toast.makeText(this, "Heart → Normal", Toast.LENGTH_SHORT).show(); });
        findViewById(R.id.btnHrMi).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRMI", null); updateVitals(); Toast.makeText(this, "⚠️ Simulated heart attack", Toast.LENGTH_SHORT).show(); });
        findViewById(R.id.btnHrTachy).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRTACHY", null); updateVitals(); Toast.makeText(this, "⚠️ Simulated tachycardia", Toast.LENGTH_SHORT).show(); });
        findViewById(R.id.btnHrBrady).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRBRADY", null); updateVitals(); Toast.makeText(this, "⚠️ Simulated bradycardia", Toast.LENGTH_SHORT).show(); });
        findViewById(R.id.btnHrArrhythmia).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRARRHY", null); updateVitals(); Toast.makeText(this, "⚠️ Simulated arrhythmia", Toast.LENGTH_SHORT).show(); });
        findViewById(R.id.btnHrAfib).setOnClickListener(v -> { Haptics.tap(this); health.simulate("HRAFIB", null); updateVitals(); Toast.makeText(this, "⚠️ Simulated atrial fibrillation", Toast.LENGTH_SHORT).show(); });

        // Collapsible "Simulate" demo section (keeps the dashboard clean)
        findViewById(R.id.btnSimToggle).setOnClickListener(v -> {
            boolean nowVisible = simContainer.getVisibility() == View.VISIBLE;
            simContainer.setVisibility(nowVisible ? View.GONE : View.VISIBLE);
            tvSimLabel.setText((nowVisible ? "▸ " : "▾ ") + "Simulate health events");
        });

        NotificationHelper.createChannel(this);

        // Show Device ID — elder shares this with caretaker to connect
        String deviceId = prefs.getDeviceId();
        tvDeviceId.setText(deviceId);
        tvDeviceId.setOnClickListener(v -> {
            Haptics.tap(this);
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Device ID", deviceId));
            Toast.makeText(this, "Device ID copied!", Toast.LENGTH_SHORT).show();
        });

        // Temporary 4-digit pairing code — the tablet pairs with device ID +
        // this code, verified against Firebase so a random ID isn't enough.
        pairingCode = prefs.getOrCreatePairingCode();
        tvPairCode.setText(pairingCode);
        tvPairCode.setOnClickListener(v -> {
            Haptics.tap(this);
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Pairing code", pairingCode));
            Toast.makeText(this, "Pairing code copied!", Toast.LENGTH_SHORT).show();
        });
        btnNewCode.setOnClickListener(v -> {
            Haptics.confirm(this);
            pairingCode = prefs.rotatePairingCode();
            tvPairCode.setText(pairingCode);
            tvPairCode.setAlpha(0.4f);
            tvPairCode.animate().alpha(1f).setDuration(400).start();
            publishPairingCode(pairingCode);
            Toast.makeText(this, "New pairing code generated", Toast.LENGTH_SHORT).show();
        });
        publishPairingCode(pairingCode);

        btnToggleService.setOnClickListener(v -> {
            Haptics.tap(this);
            if (ElderHelperService.isRunning) {
                stopService(new Intent(this, ElderHelperService.class));
                prefs.setServiceActive(false);
            } else {
                requestPermissionsAndStart();
            }
            updateUI();
        });

        btnWriteSettings.setOnClickListener(v -> {
            if (Settings.System.canWrite(this)) {
                Toast.makeText(this, "✅ Brightness control already granted.", Toast.LENGTH_SHORT).show();
            } else {
                Intent s = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
                    Uri.parse("package:" + getPackageName()));
                startActivity(s);
            }
        });

        btnDndAccess.setOnClickListener(v -> {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.isNotificationPolicyAccessGranted()) {
                Toast.makeText(this, "✅ DND access already granted.", Toast.LENGTH_SHORT).show();
            } else {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            }
        });

        btnDisconnect.setOnClickListener(v -> confirmDisconnect());

        // SMS-fallback number row — tapping it always lets the caregiver
        // add/change the number, even on installs that were set up before
        // the number step existed (so it is never "missing" from setup).
        tvNumber.setOnClickListener(v -> showNumberDialog());
        tvNumber.setBackgroundResource(android.R.drawable.list_selector_background);
        tvNumber.setClickable(true);

        handleIncomingIntent(getIntent());

        if (prefs.isServiceActive() && !ElderHelperService.isRunning) {
            requestPermissionsAndStart();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Re-arm the vitals visual refresh when the screen is visible.
        uiHandler.removeCallbacks(refreshVitals);
        uiHandler.postDelayed(refreshVitals, 1000);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Stop redrawing the waveform panel when backgrounded (battery).
        uiHandler.removeCallbacks(refreshVitals);
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateUI();
    }

    // ── Disconnect from caretaker (re-pair) ──────────────────────────

    private void showNumberDialog() {
        androidx.appcompat.app.AlertDialog.Builder b =
            new androidx.appcompat.app.AlertDialog.Builder(this);
        b.setTitle("Caretaker / caregiver number");
        b.setMessage("Used for the SMS fallback (commands still arrive without internet) "
            + "and the one-tap CALLME alert.");

        android.widget.EditText input = new android.widget.EditText(this);
        input.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        input.setHint("e.g. +919597140692");
        input.setTypeface(android.graphics.Typeface.MONOSPACE);
        String current = prefs.getCaretakerNumber();
        if (!TextUtils.isEmpty(current)) input.setText(current);
        b.setView(input, 48, 24, 48, 24);

        b.setPositiveButton("Save", (d, w) -> {
            String n = normalizeNumber(input.getText().toString());
            if (n == null) {
                Toast.makeText(this,
                    "Enter a valid number (10+ digits) — e.g. +919597140692",
                    Toast.LENGTH_LONG).show();
                return;
            }
            prefs.saveCaretakerNumber(n);
            updateUI();
            Toast.makeText(this, "SMS fallback number saved", Toast.LENGTH_SHORT).show();
        });
        b.setNegativeButton("Cancel", null);
        b.show();
        input.requestFocus();
    }

    static String normalizeNumber(String raw) {
        if (raw == null) return null;
        String t = raw.trim().replaceAll("[\\s\\-().]", "");
        String digits = t.replaceAll("[^0-9]", "");
        return digits.length() >= 10 ? t : null;
    }

    private void confirmDisconnect() {
        Haptics.tap(this);
        new AlertDialog.Builder(this)
            .setTitle("Disconnect from caretaker?")
            .setMessage("The service will stop and the saved caretaker number will be cleared. Next launch will ask you to pair again. Your device ID stays the same.")
            .setPositiveButton("Disconnect", (d, w) -> disconnect())
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void disconnect() {
        stopService(new Intent(this, ElderHelperService.class));
        prefs.clearSetup();
        Toast.makeText(this, "Disconnected — re-pair on next launch", Toast.LENGTH_SHORT).show();
        startActivity(new Intent(this, WizardActivity.class));
        finish();
    }

    // ── IOK from check-in notification tap ──────────────────────────

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("action");
        String cmdId  = intent.getStringExtra("cmd_id");   // DB command ID

        if ("IOK".equals(action)) {
            // Write IOK reply to the correct /replies/{cmdId} path in Firebase
            String replyText = "💚 I'm OK! — confirmed from device.";
            if (cmdId != null && !cmdId.isEmpty()) {
                FirebaseRepository.get(this).writeReply(cmdId, replyText);
            } else {
                // Fallback — write to lastReply if no cmdId (e.g. SMS-triggered checkin)
                FirebaseRepository.get(this).writeReply(null, replyText);
            }
            Toast.makeText(this, "Sent: I'm OK ✅", Toast.LENGTH_SHORT).show();
        }
    }

    // ── Pairing code publish (best effort — tablet verifies it) ────

    private void publishPairingCode(String code) {
        try {
            FirebaseRepository.get(this).writePairingCode(code);
        } catch (Exception ignored) {
            // Firebase not ready — service start will publish again.
        }
    }

    // ── Permission + service start ───────────────────────────────────

    private void requestPermissionsAndStart() {
        List<String> missing = new ArrayList<>();
        for (String p : Constants.REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED)
                missing.add(p);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED)
                missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (missing.isEmpty()) startHelperService();
        else permLauncher.launch(missing.toArray(new String[0]));
    }

    private void startHelperService() {
        Haptics.confirm(this);
        Intent svc = new Intent(this, ElderHelperService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            startForegroundService(svc);
        else
            startService(svc);
        prefs.setServiceActive(true);
        updateUI();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        uiHandler.removeCallbacksAndMessages(null);
        // Release our ownership of the vitals ticker (refcounted — the
        // foreground service keeps it alive if it is still running).
        try { HealthHandler.get(this).stop(); } catch (Exception ignored) {}
    }

    private void updateVitals() {
        String cond = HealthHandler.getCondition();
        String sev  = HealthHandler.getSeverity();
        int color = "CRITICAL".equals(sev) ? Color.parseColor("#DC2626")
                  : "WARNING".equals(sev)  ? Color.parseColor("#D97706")
                  : Color.parseColor("#059669");
        String icon = "CRITICAL".equals(sev) ? " 🚨" : "WARNING".equals(sev) ? " ⚠️" : " ✓";
        tvHealthState.setText(cond + icon);
        tvHealthState.setTextColor(color);

        if (vitalsPanel != null) {
            vitalsPanel.feed(HealthHandler.getHr(), HealthHandler.getSpo2(),
                HealthHandler.getRR(), HealthHandler.getTemp(),
                HealthHandler.getSys(), HealthHandler.getDia(),
                HealthHandler.getGlucose(), cond, sev);
        }
    }

    private void updateUI() {
        boolean running = ElderHelperService.isRunning;
        tvStatus.setText(running ? "Service: ACTIVE" : "Service: STOPPED");
        int statusColor = ContextCompat.getColor(this,
            running ? R.color.status_active : R.color.status_stopped);
        tvStatus.setTextColor(statusColor);
        ivStatusDot.setColorFilter(statusColor);
        btnToggleService.setText(running ? "Stop Service" : "Start Service");
        String num = prefs.getCaretakerNumber();
        boolean configured = !TextUtils.isEmpty(num);
        tvNumber.setText(configured
            ? "SMS fallback: " + num + "  ·  tap to change"
            : "SMS fallback: not set  ·  tap to add");
        tvNumber.setTextColor(ContextCompat.getColor(this,
            configured ? R.color.text_secondary : R.color.status_stopped));
    }
}
