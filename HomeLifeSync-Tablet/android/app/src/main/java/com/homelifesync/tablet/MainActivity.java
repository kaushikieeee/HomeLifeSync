package com.homelifesync.tablet;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

/**
 * HomeSync Tablet — thin shell over the consolidated caretaker web export.
 * The tablet experience lives at the /tablet route of the static export,
 * so after the bridge boots we navigate straight to it.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "TabletMainActivity";
    private static final int MAX_RETRIES = 10;
    private static final long RETRY_DELAY_MS = 300;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The Capacitor bridge initializes asynchronously. We retry loading
        // the /tablet/ route until the bridge is ready or max retries hit.
        loadTabletRoute(0);
    }

    private void loadTabletRoute(int attempt) {
        if (attempt >= MAX_RETRIES) {
            Log.e(TAG, "Max retries reached, falling back to default URL");
            return;
        }

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                Bridge bridge = getBridge();
                if (bridge == null) {
                    Log.w(TAG, "Bridge not ready yet (attempt " + (attempt + 1) + ")");
                    loadTabletRoute(attempt + 1);
                    return;
                }

                String localUrl = bridge.getLocalUrl();
                if (localUrl == null || localUrl.isEmpty()) {
                    Log.w(TAG, "Local URL empty (attempt " + (attempt + 1) + ")");
                    loadTabletRoute(attempt + 1);
                    return;
                }

                // Ensure URL ends with / then append tablet/
                String url = localUrl.endsWith("/") ? localUrl + "tablet/" : localUrl + "/tablet/";
                Log.d(TAG, "Loading tablet route (attempt " + (attempt + 1) + "): " + url);

                WebView webView = bridge.getWebView();
                if (webView == null) {
                    Log.w(TAG, "WebView not ready (attempt " + (attempt + 1) + ")");
                    loadTabletRoute(attempt + 1);
                    return;
                }

                webView.loadUrl(url);

            } catch (Exception e) {
                Log.w(TAG, "Error loading tablet route (attempt " + (attempt + 1) + "): " + e.getMessage());
                loadTabletRoute(attempt + 1);
            }
        }, RETRY_DELAY_MS);
    }
}