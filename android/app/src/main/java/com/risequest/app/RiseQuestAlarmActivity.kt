package com.risequest.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

/** Dedicated lock-screen surface: never expose account, contact or health data. */
class RiseQuestAlarmActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var opening = false
  override fun onNewIntent(next: Intent) { super.onNewIntent(next); setIntent(next); recreate() }
  private fun active(): Boolean = intent.getStringExtra("alarmId")?.let {
    it == getSharedPreferences("risequest_alarm_audio", MODE_PRIVATE).getString("activeId", null)
  } ?: false
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    if (!active()) { finish(); return }
    if (android.os.Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true); setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
    val density = resources.displayMetrics.density
    val pad = (28 * density).toInt()
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(pad, pad * 2, pad, pad * 2)
      background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.rgb(255,249,239), Color.rgb(238,226,255)))
    }
    fun label(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
      text = value; textSize = size; gravity = Gravity.CENTER; setTextColor(Color.rgb(52,40,85))
      setPadding(0, pad / 2, 0, pad / 2)
      if (bold) setTypeface(typeface, Typeface.BOLD)
      layout.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    label("☀", 64f)
    label("RiseQuest", 24f, true)
    val clock = label(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date()), 54f, true)
    label("Time for your next good step", 22f)
    val button = Button(this).apply {
      text = "Open wake-up controls"; isAllCaps = false; textSize = 19f
      setTextColor(Color.WHITE)
      background = GradientDrawable().apply { setColor(Color.rgb(103,76,176)); cornerRadius = 24 * density }
      setPadding(pad, pad, pad, pad); setOnClickListener { openControls() }
    }
    layout.addView(button, LinearLayout.LayoutParams(-1, -2).apply { topMargin = pad })
    label("Unlock if asked to use your alarm controls. Your personal screens stay private.", 16f)
    setContentView(layout)
    val ticker = object : Runnable {
      override fun run() {
        if (!active()) { finish(); return }
        clock.text = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date())
        handler.postDelayed(this, 1000)
      }
    }
    handler.post(ticker)
    if (!(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked) openControls()
  }
  private fun openControls() {
    if (opening || !active()) return
    opening = true
    val keyguard = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
    val launch = {
      if (active()) startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
      finish()
    }
    if (keyguard.isKeyguardLocked && android.os.Build.VERSION.SDK_INT >= 26) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() { launch() }
        override fun onDismissCancelled() { opening = false }
        override fun onDismissError() { opening = false }
      })
    } else launch()
  }
  override fun onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy() }
}
