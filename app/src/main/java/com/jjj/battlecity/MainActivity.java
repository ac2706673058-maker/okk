package com.jjj.battlecity;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 坦克大战 TV 版壳
 * 关键点:Android WebView 不支持 Gamepad API,
 * 所以在原生层拦截蓝牙手柄的 KeyEvent / 摇杆 MotionEvent,
 * 通过 evaluateJavascript 调 window.extKey(code, down) 注入游戏。
 */
public class MainActivity extends Activity {

    private WebView web;
    // 摇杆当前注入状态,避免重复注入
    private boolean stickUp, stickDown, stickLeft, stickRight;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 全屏 + 常亮
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // 允许音效自动播放
        s.setDomStorageEnabled(true);                 // localStorage 存最高分
        web.setBackgroundColor(0xFF000000);
        web.setFocusable(false);                      // 焦点留在 Activity,按键全走 dispatchKeyEvent
        web.setFocusableInTouchMode(false);
        web.loadUrl("file:///android_asset/game.html");
        setContentView(web);
        hideSystemUI();
    }

    private void hideSystemUI() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
              | View.SYSTEM_UI_FLAG_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void js(String code, boolean down) {
        web.evaluateJavascript("window.extKey&&window.extKey('" + code + "'," + down + ")", null);
    }

    /** 手柄/遥控器按键 → 游戏键位 */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int kc = event.getKeyCode();
        boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        boolean up   = event.getAction() == KeyEvent.ACTION_UP;
        if (!down && !up) return super.dispatchKeyEvent(event);
        if (down && event.getRepeatCount() > 0) return true; // 忽略系统重复,游戏自己处理连发

        String code = null;
        switch (kc) {
            case KeyEvent.KEYCODE_DPAD_UP:      code = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN:    code = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT:    code = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:   code = "ArrowRight"; break;
            case KeyEvent.KEYCODE_BUTTON_A:     // Xbox A
            case KeyEvent.KEYCODE_DPAD_CENTER:  // 遥控器确认键也能开火
            case KeyEvent.KEYCODE_BUTTON_X:     // X 也给开火,更顺手
                code = "KeyJ"; break;
            case KeyEvent.KEYCODE_BUTTON_START: // Start = 暂停/开始
            case KeyEvent.KEYCODE_MENU:
                code = "Enter"; break;
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BACK:
                if (up) finish();               // B/返回键退出
                return true;
        }
        if (code != null) {
            js(code, down);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    /** 左摇杆 → 方向键 */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if ((ev.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                && ev.getAction() == MotionEvent.ACTION_MOVE) {
            float x = ev.getAxisValue(MotionEvent.AXIS_X);
            float y = ev.getAxisValue(MotionEvent.AXIS_Y);
            // Xbox 手柄十字键在部分固件下走 HAT 轴
            float hx = ev.getAxisValue(MotionEvent.AXIS_HAT_X);
            float hy = ev.getAxisValue(MotionEvent.AXIS_HAT_Y);
            if (Math.abs(hx) > 0.5f) x = hx;
            if (Math.abs(hy) > 0.5f) y = hy;
            final float DZ = 0.45f;
            setStick(y < -DZ, y > DZ, x < -DZ, x > DZ);
            return true;
        }
        return super.dispatchGenericMotionEvent(ev);
    }

    private void setStick(boolean u, boolean d, boolean l, boolean r) {
        if (u != stickUp)    { js("ArrowUp", u);    stickUp = u; }
        if (d != stickDown)  { js("ArrowDown", d);  stickDown = d; }
        if (l != stickLeft)  { js("ArrowLeft", l);  stickLeft = l; }
        if (r != stickRight) { js("ArrowRight", r); stickRight = r; }
    }
}
