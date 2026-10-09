package com.risequest.app

import android.content.Intent
import android.os.Bundle
import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject

class RiseQuestAlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RiseQuestAlarmAudio"
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf("distribution" to BuildConfig.RISEQUEST_DISTRIBUTION)
  @ReactMethod fun pickTime(hour: Int, minute: Int, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) { promise.reject("NO_ACTIVITY", "Open the alarm screen to select a time"); return }
    activity.runOnUiThread {
      try {
        val dialog = TimePickerDialog(activity, { _, selectedHour, selectedMinute ->
          promise.resolve(String.format(java.util.Locale.US, "%02d:%02d", selectedHour, selectedMinute))
        }, hour.coerceIn(0, 23), minute.coerceIn(0, 59), DateFormat.is24HourFormat(activity))
        dialog.setOnCancelListener { promise.resolve(null) }
        dialog.show()
      } catch (error: Exception) { promise.reject("TIME_PICKER", error) }
    }
  }
  @ReactMethod fun start(json: String) {
    val alarm = JSONObject(json)
    val info = JSONObject().put("alarmId", alarm.getString("id")).put("toneUri", alarm.optString("customToneUri"))
      .put("startVolume", alarm.optDouble("startVolume", 0.35)).put("maxVolume", alarm.optDouble("maxVolume", 1.0))
      .put("volumeCurve", alarm.optString("volumeCurve", "gentle"))
    val bundle = Bundle().apply {
      putString("id", alarm.getString("notificationId"))
      putString("title", alarm.optString("label", "RiseQuest Alarm"))
      putString("userInfo", info.toString())
    }
    ContextCompat.startForegroundService(context, Intent(context, RiseQuestAlarmService::class.java).putExtra("notification", bundle))
  }
  @ReactMethod fun stop(alarmId: String) {
    // Stopping never starts a service that isn't already active.
    val active = context.getSharedPreferences("risequest_alarm_audio", 0).getString("activeId", null)
    if (active == alarmId) context.stopService(Intent(context, RiseQuestAlarmService::class.java))
  }
  @ReactMethod fun active(promise: Promise) {
    promise.resolve(context.getSharedPreferences("risequest_alarm_audio", 0).getString("activeId", null))
  }
}

class RiseQuestAlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RiseQuestAlarmModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
