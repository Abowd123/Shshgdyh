package com.ziptogithub.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZipBridgePlugin.class);
        super.onCreate(savedInstanceState);
        WebView wv = getBridge().getWebView();
        // خطُّ النظام الكبير لا يكسر الواجهة
        wv.getSettings().setTextZoom(100);
        // الرفعُ يستمرّ بسرعته حين يكون التطبيق في الخلفية
        if (Build.VERSION.SDK_INT >= 26) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }
}
