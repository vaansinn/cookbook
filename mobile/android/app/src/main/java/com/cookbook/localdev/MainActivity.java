package com.cookbook.localdev;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SessionVaultPlugin.class);
        super.onCreate(savedInstanceState);
        // Install after Bridge has loaded CapacitorCookies, and on recreation.
        NativeCookieIsolation.install();
        if (getBridge() != null) {
            getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return !LocalNavigation.allowed(request.getUrl().toString());
                }
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (LocalNavigation.showConnectionHelp(request.isForMainFrame(), request.getUrl().toString(), getBridge().getErrorUrl())) {
                        super.onReceivedError(view, request, error);
                    }
                }
                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    if (LocalNavigation.showConnectionHelp(request.isForMainFrame(), request.getUrl().toString(), getBridge().getErrorUrl())) {
                        super.onReceivedHttpError(view, request, response);
                    }
                }
            });
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView().canGoBack()) {
                    getBridge().getWebView().goBack();
                } else {
                    // Leave the app at the root; do not erase its local attempt state.
                    moveTaskToBack(true);
                }
            }
        });
    }
}
