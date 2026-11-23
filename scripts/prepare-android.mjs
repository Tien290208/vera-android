import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const mode = process.argv[2] || '';

async function prepareAssets() {
  const candidates = ['vera-icon.jpg', 'vera-icon.jpeg', 'vera-icon.png'];
  const srcIcon = candidates.find(f => fs.existsSync(f));
  if (!srcIcon) {
    throw new Error('Không tìm thấy file vera-icon.jpg ở thư mục gốc dự án!');
  }

  fs.mkdirSync('assets', { recursive: true });

  // 1. Icon chính 1024x1024 PNG
  await sharp(srcIcon).resize(1024, 1024, { fit: 'cover' }).png().toFile('assets/icon-only.png');

  // 2. Adaptive Icon Foreground (căn gọn vùng an toàn 680px để Android bo tròn không cắt chữ V)
  const fgLogo = await sharp(srcIcon).resize(680, 680, { fit: 'cover' }).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 4, g: 13, b: 29, alpha: 1 } }
  })
    .composite([{ input: fgLogo, gravity: 'center' }])
    .png()
    .toFile('assets/icon-foreground.png');

  // 3. Adaptive Icon Background màu xanh đen đồng bộ logo
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 4, g: 13, b: 29, alpha: 1 } }
  })
    .png()
    .toFile('assets/icon-background.png');

  // 4. Splash Screen 2732x2732 (cả Sáng & Tối) với logo nổi giữa màn hình
  const splashLogo = await sharp(srcIcon).resize(540, 540, { fit: 'cover' }).png().toBuffer();
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({
      create: { width: 2732, height: 2732, channels: 4, background: { r: 4, g: 13, b: 29, alpha: 1 } }
    })
      .composite([{ input: splashLogo, gravity: 'center' }])
      .png()
      .toFile(path.join('assets', name));
  }

  console.log('✓ Đã tạo xong bộ Adaptive Icon & Splash Screen chuẩn Android.');
}

function patchAndroidProject() {
  // 1. Bổ sung quyền Camera, Micro, Thông báo vào AndroidManifest.xml
  const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let xml = fs.readFileSync(manifestPath, 'utf8');
    const perms = [
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.POST_NOTIFICATIONS'
    ];
    const missing = perms
      .filter(p => !xml.includes(p))
      .map(p => `    <uses-permission android:name="${p}" />`)
      .join('\n');

    if (missing) {
      xml = xml.replace('<application', `${missing}\n\n    <application`);
      fs.writeFileSync(manifestPath, xml, 'utf8');
    }
  }

  // 2. Nâng cấp MainActivity.java: đồng bộ thanh hệ thống #040d1d + xử lý nút Back chuẩn app gốc
  const mainActPath = path.join(
    'android', 'app', 'src', 'main', 'java', 'com', 'veratiez', 'app', 'MainActivity.java'
  );
  if (fs.existsSync(mainActPath)) {
    const javaCode = `package com.veratiez.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private long lastBackPress = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        if (win != null) {
            int darkBg = Color.parseColor("#040d1d");
            win.setStatusBarColor(darkBg);
            win.setNavigationBarColor(darkBg);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    long now = System.currentTimeMillis();
                    if (now - lastBackPress < 2000) {
                        finish();
                    } else {
                        lastBackPress = now;
                        Toast.makeText(
                            MainActivity.this,
                            "Nhấn quay lại lần nữa để thoát VERA",
                            Toast.LENGTH_SHORT
                        ).show();
                    }
                }
            }
        });
    }
}
`;
    fs.writeFileSync(mainActPath, javaCode, 'utf8');
  }

  console.log('✓ Đã cấu hình xong AndroidManifest.xml và MainActivity.java.');
}

if (mode === '--prep-assets') {
  await prepareAssets();
} else if (mode === '--patch-android') {
  patchAndroidProject();
} else {
  console.log('Sử dụng: --prep-assets hoặc --patch-android');
}