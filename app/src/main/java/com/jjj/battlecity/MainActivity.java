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
 * 双人版:手柄 = P1(方向键/摇杆+A开火), 电视遥控器 = P2(WASD+F注入)
 * 按输入设备类型区分玩家。
 */
public class MainActivity extends Activity {
    private WebView web;
    private boolean sU,sD,sL,sR;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDomStorageEnabled(true);
        web.setBackgroundColor(0xFF000000);
        web.setFocusable(false);
        web.setFocusableInTouchMode(false);
        web.loadUrl("file:///android_asset/game.html");
        setContentView(web);
        hideUI();
    }

    private void hideUI() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN
           |View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE
           |View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
    @Override public void onWindowFocusChanged(boolean f){super.onWindowFocusChanged(f);if(f)hideUI();}

    private void js(String code, boolean down) {
        web.evaluateJavascript("window.extKey&&window.extKey('"+code+"',"+down+")", null);
    }

    /** 该事件是否来自游戏手柄 */
    private boolean fromGamepad(KeyEvent e) {
        InputDevice d = e.getDevice();
        if (d == null) return false;
        int src = d.getSources();
        return (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int kc = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        boolean up   = e.getAction() == KeyEvent.ACTION_UP;
        if (!down && !up) return super.dispatchKeyEvent(e);
        if (down && e.getRepeatCount() > 0) return true;
        boolean pad = fromGamepad(e);
        String code = null;
        switch (kc) {
            case KeyEvent.KEYCODE_DPAD_UP:    code = pad ? "ArrowUp"    : "KeyW"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN:  code = pad ? "ArrowDown"  : "KeyS"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT:  code = pad ? "ArrowLeft"  : "KeyA"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: code = pad ? "ArrowRight" : "KeyD"; break;
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_BUTTON_X:   code = "KeyJ"; break;      // 手柄开火 = P1
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:      code = pad ? "KeyJ" : "KeyF"; break; // 遥控OK = P2开火
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU:       code = "Enter"; break;     // 暂停/开始
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BACK:
                if (up) finish();
                return true;
        }
        if (code != null) { js(code, down); return true; }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if ((ev.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                && ev.getAction() == MotionEvent.ACTION_MOVE) {
            float x = ev.getAxisValue(MotionEvent.AXIS_X);
            float y = ev.getAxisValue(MotionEvent.AXIS_Y);
            float hx = ev.getAxisValue(MotionEvent.AXIS_HAT_X);
            float hy = ev.getAxisValue(MotionEvent.AXIS_HAT_Y);
            if (Math.abs(hx) > 0.5f) x = hx;
            if (Math.abs(hy) > 0.5f) y = hy;
            final float DZ = 0.45f;
            set(y < -DZ, y > DZ, x < -DZ, x > DZ);
            return true;
        }
        return super.dispatchGenericMotionEvent(ev);
    }
    private void set(boolean u, boolean d, boolean l, boolean r) {
        if (u != sU) { js("ArrowUp", u);    sU = u; }
        if (d != sD) { js("ArrowDown", d);  sD = d; }
        if (l != sL) { js("ArrowLeft", l);  sL = l; }
        if (r != sR) { js("ArrowRight", r); sR = r; }
    }
}
