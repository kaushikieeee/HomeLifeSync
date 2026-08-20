package com.homelifesync.tablet;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * HomeSync Tablet — thin shell over the consolidated caretaker web export.
 * The tablet experience lives at the /tablet route of the static export,
 * so after the bridge boots we navigate straight to it.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
getBridge().getWebView().post(() ->
            getBridge().getWebView().loadUrl(getBridge().getLocalUrl() + "/tablet/"));
    } catch (Exception ignored) {
            // Bridge not ready yet — fall back to the default URL.
        }
    }
}