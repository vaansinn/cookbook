package com.cookbook.localdev;

import java.net.URI;

// No Android dependencies: exercise the policy with a plain JDK as well as on device.
final class LocalNavigation {
    static boolean allowed(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            return "https".equals(uri.getScheme()) && "localhost".equals(uri.getRawAuthority());
        } catch (IllegalArgumentException | NullPointerException error) {
            return false;
        }
    }
    static boolean showConnectionHelp(boolean mainFrame, String failedUrl, String errorUrl) {
        return mainFrame && errorUrl != null && !errorUrl.equals(failedUrl);
    }
}
