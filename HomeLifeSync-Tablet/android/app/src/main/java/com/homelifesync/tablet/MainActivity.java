package com.homelifesync.tablet;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * HomeSync Tablet — thin shell over the consolidated caretaker web export.
 * The tablet experience lives at the /tablet route of the static export,
 * so after the bridge boots we navigate straight to it.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "TabletMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The Capacitor bridge initializes asynchronously. We wait a short
        // moment for the bridge to be ready, then navigate to the tablet route.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                String url = getBridge().getLocalUrl() + "tablet/";
                Log.d(TAG, "Loading tablet route: " + url);
                getBridge().getWebView().loadUrl(url);
            } catch (Exception e) {
                Log.e(TAG, "Failed to load tablet route, falling back to default", e);
            }
        }, 500);
    }
}