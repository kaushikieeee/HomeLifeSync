package com.homelifesync.elder;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.homelifesync.elder.service.ElderHelperService;
import com.homelifesync.elder.util.Haptics;
import com.homelifesync.elder.util.PrefsHelper;

import java.util.ArrayList;
import java.util.List;

/**
 * First-run setup wizard. Guides the elder through:
 *   1. Welcome    2. Device ID (share with caretaker)
 *   3. Caretaker number (optional, SMS fallback)  4. Permissions + start.
 * On completion it marks the device as onboarded and starts the helper
 * service; MainActivity then shows the clean dashboard.
 */
public class WizardActivity extends AppCompatActivity {

    private PrefsHelper prefs;

    private LinearLayout stepWelcome, stepDevice, stepNumber, stepPerms;
    private View[]       dots;
    private TextView     tvStepTitle, tvWizDeviceId, tvNumHint;
    private EditText     etWizNumber;
    private MaterialButton btnWizBack, btnWizNext;

    private int step = 0;
    private static final int STEP_COUNT = 4;

    private final ActivityResultLauncher<String[]> permLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> launchCalledService()
        );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_wizard);

        prefs       = new PrefsHelper(this);
        stepWelcome = findViewById(R.id.stepWelcome);
        stepDevice  = findViewById(R.id.stepDevice);
        stepNumber  = findViewById(R.id.stepNumber);
        stepPerms   = findViewById(R.id.stepPerms);
        MaterialButton btnWizFullScreen = findViewById(R.id.btnWizFullScreen);
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            btnWizFullScreen.setVisibility(View.VISIBLE);
            btnWizFullScreen.setOnClickListener(v -> {
                Intent s = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                s.setData(Uri.parse("package:" + getPackageName()));
                try {
                    startActivity(s);
                } catch (Exception e) {
                    Toast.makeText(this,
                        "Full-screen alerts may need enabling in System Settings → Apps → Special app access.",
                        Toast.LENGTH_LONG).show();
                }
            });
        }
        tvStepTitle = findViewById(R.id.tvStepTitle);
        tvWizDeviceId = findViewById(R.id.tvWizDeviceId);
        etWizNumber = findViewById(R.id.etWizNumber);
        tvNumHint   = findViewById(R.id.tvNumHint);
        btnWizBack  = findViewById(R.id.btnWizBack);
        btnWizNext  = findViewById(R.id.btnWizNext);
        dots = new View[] {
            findViewById(R.id.dot1), findViewById(R.id.dot2),
            findViewById(R.id.dot3), findViewById(R.id.dot4),
        };

        tvWizDeviceId.setText(prefs.getDeviceId());
        String saved = prefs.getCaretakerNumber();
        if (!TextUtils.isEmpty(saved)) etWizNumber.setText(saved);

        // Live validation on the caretaker-number step: the Continue button
        // stays disabled until a valid number is entered, so the elder can
        // NEVER get stuck (or silently skip) the SMS-fallback requirement.
        etWizNumber.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(android.text.Editable s) {
                if (step == 2) refreshNumberStep();
            }
        });

        findViewById(R.id.btnWizCopy).setOnClickListener(v -> {
            Haptics.tap(this);
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Device ID", prefs.getDeviceId()));
            Toast.makeText(this, "Device ID copied", Toast.LENGTH_SHORT).show();
        });

        btnWizBack.setOnClickListener(v -> {
            Haptics.tap(this);
            if (step > 0) showStep(step - 1);
        });

        btnWizNext.setOnClickListener(v -> {
            Haptics.tap(this);
            if (step == 2) {
                // Caretaker number is REQUIRED — it powers SMS fallback and
                // CALLME, so the flow refuses to advance without a valid one
                // (the button is disabled until then, no dead-end errors).
                String n = validateNumber(etWizNumber.getText().toString());
                if (n == null) return;
                prefs.saveCaretakerNumber(n);
            }
            if (step == STEP_COUNT - 1) {
                finishSetup();
                return;
            }
            showStep(step + 1);
        });

        showStep(0);
    }

    /**
     * Validates + normalises a phone number. Strips spaces/dashes/parentheses
     * (keeps a leading "+") and requires 10+ digits. Returns null when invalid,
     * so the wizard can gate the Continue button on a real caregiver number.
     */
    private String validateNumber(String raw) {
        if (raw == null) return null;
        String t = raw.trim().replaceAll("[\\s\\-().]", "");
        String digits = t.replaceAll("[^0-9]", "");
        return digits.length() >= 10 ? t : null;
    }

    private void showStep(int next) {
        step = next;
        stepWelcome.setVisibility(next == 0 ? View.VISIBLE : View.GONE);
        stepDevice.setVisibility(next == 1 ? View.VISIBLE : View.GONE);
        stepNumber.setVisibility(next == 2 ? View.VISIBLE : View.GONE);
        stepPerms.setVisibility(next == 3 ? View.VISIBLE : View.GONE);

        // Fluid entrance — the step that appears fades in with a gentle lift;
        // the progress dots pulse toward the current step.
        View incoming = next == 0 ? stepWelcome
                       : next == 1 ? stepDevice
                       : next == 2 ? stepNumber : stepPerms;
        incoming.setAlpha(0f);
        incoming.setTranslationY(28f);
        incoming.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(280)
            .start();

        String[] titles = { "Welcome", "Device ID", "Caretaker number (required)", "Permissions" };
        tvStepTitle.setText(titles[next]);

        for (int i = 0; i < dots.length; i++) {
            dots[i].setBackgroundColor(ContextCompat.getColor(this,
                i <= next ? R.color.primary : R.color.surface_hint));
            dots[i].animate()
                .scaleX(i == next ? 1.3f : 1f)
                .scaleY(i == next ? 1.3f : 1f)
                .setDuration(200)
                .start();
        }

        btnWizBack.setEnabled(next > 0);
        btnWizNext.setText(next == STEP_COUNT - 1 ? "Allow & Finish" : "Continue");

        // The number step holds the flow until a valid number is entered.
        // Every other step always allows advancing.
        if (next == 2) {
            refreshNumberStep();
        } else {
            btnWizNext.setEnabled(true);
            if (tvNumHint != null) tvNumHint.setVisibility(View.GONE);
        }
    }

    /** Live helper under the number field + Continue gating. */
    private void refreshNumberStep() {
        tvNumHint.setVisibility(View.VISIBLE);
        boolean ok = validateNumber(etWizNumber.getText().toString()) != null;
        btnWizNext.setEnabled(ok);
        tvNumHint.setText(ok
            ? "✓ Saved — powers SMS fallback and one-tap CALLME"
            : "Required: enter your caregiver's phone number (10+ digits)");
        tvNumHint.setTextColor(ContextCompat.getColor(this,
            ok ? R.color.status_active : R.color.status_stopped));
    }

    private void finishSetup() {
        String num = validateNumber(etWizNumber.getText().toString());
        if (num != null) prefs.saveCaretakerNumber(num);

        prefs.setOnboarded();

        List<String> missing = new ArrayList<>();
        for (String p : Constants.REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED)
                missing.add(p);
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED)
                missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (missing.isEmpty()) complete();
        else permLauncher.launch(missing.toArray(new String[0]));
    }

    private void launchCalledService() {
        complete();
    }

    private void complete() {
        Haptics.success(this);
        prefs.setServiceActive(true);
        startForegroundServiceSafe();
        Toast.makeText(this, "Setup complete — you're connected 🎉", Toast.LENGTH_LONG).show();
        Intent done = new Intent(this, MainActivity.class);
        done.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(done);
        finish();
    }

    private void startForegroundServiceSafe() {
        try {
            Intent svc = new Intent(this, ElderHelperService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
                startForegroundService(svc);
            else
                startService(svc);
        } catch (Exception e) {
            // Service start blocked on some OEMs — MainActivity can retry.
        }
    }
}