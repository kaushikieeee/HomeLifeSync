package com.homelifesync.tablet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * HomeSync Tablet — thin shell over the consolidated caretaker web export.
 * The tablet-web/ directory contains a root index.html that redirects to
 * /tablet/ via meta refresh + JS, so no post-load navigation is needed.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
}
