package com.homelifesync.elder;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
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

    private static final String[] REQUIRED_PERMISSIONS = {
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.SEND_SMS,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.CAMERA,
        Manifest.permission.VIBRATE,
        Manifest.permission.MODIFY_AUDIO_SETTINGS,
        Manifest.permission.CALL_PHONE,
    };

    private PrefsHelper prefs;

    private LinearLayout stepWelcome, stepDevice, stepNumber, stepPerms;
    private View[]       dots;
    private TextView     tvStepTitle, tvWizDeviceId;
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
        tvStepTitle = findViewById(R.id.tvStepTitle);
        tvWizDeviceId = findViewById(R.id.tvWizDeviceId);
        etWizNumber = findViewById(R.id.etWizNumber);
        btnWizBack  = findViewById(R.id.btnWizBack);
        btnWizNext  = findViewById(R.id.btnWizNext);
        dots = new View[] {
            findViewById(R.id.dot1), findViewById(R.id.dot2),
            findViewById(R.id.dot3), findViewById(R.id.dot4),
        };

        tvWizDeviceId.setText(prefs.getDeviceId());
        String saved = prefs.getCaretakerNumber();
        if (!TextUtils.isEmpty(saved)) etWizNumber.setText(saved);

        findViewById(R.id.btnWizCopy).setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Device ID", prefs.getDeviceId()));
            Toast.makeText(this, "Device ID copied", Toast.LENGTH_SHORT).show();
        });

        btnWizBack.setOnClickListener(v -> {
            if (step > 0) showStep(step - 1);
        });

        btnWizNext.setOnClickListener(v -> {
            if (step == STEP_COUNT - 1) {
                finishSetup();
                return;
            }
            showStep(step + 1);
        });

        showStep(0);
    }

    private void showStep(int next) {
        step = next;
        stepWelcome.setVisibility(next == 0 ? View.VISIBLE : View.GONE);
        stepDevice.setVisibility(next == 1 ? View.VISIBLE : View.GONE);
        stepNumber.setVisibility(next == 2 ? View.VISIBLE : View.GONE);
        stepPerms.setVisibility(next == 3 ? View.VISIBLE : View.GONE);

        String[] titles = { "Welcome", "Device ID", "Caretaker number", "Permissions" };
        tvStepTitle.setText(titles[next]);

        for (int i = 0; i < dots.length; i++) {
            dots[i].setBackgroundColor(ContextCompat.getColor(this,
                i <= next ? R.color.primary : R.color.surface_hint));
        }

        btnWizBack.setEnabled(next > 0);
        btnWizNext.setText(next == STEP_COUNT - 1 ? "Allow & Finish" : "Continue");
    }

    private void finishSetup() {
        String num = etWizNumber.getText().toString().trim();
        if (!num.isEmpty()) prefs.saveCaretakerNumber(num);

        prefs.setOnboarded();

        List<String> missing = new ArrayList<>();
        for (String p : REQUIRED_PERMISSIONS) {
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