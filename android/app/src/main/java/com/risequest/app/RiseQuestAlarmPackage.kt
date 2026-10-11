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
import java.io.File
import android.util.Base64

class RiseQuestAlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RiseQuestAlarmAudio"
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf("distribution" to BuildConfig.RISEQUEST_DISTRIBUTION)
  @ReactMethod fun canPresentFullScreen(promise: Promise) {
    val manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
    promise.resolve(android.os.Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())
  }
  @ReactMethod fun openFullScreenSettings(promise: Promise) {
    try {
      val action = if (android.os.Build.VERSION.SDK_INT >= 34) android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
        else android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS
      context.startActivity(Intent(action, android.net.Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(true)
    } catch (error: Exception) { promise.reject("ALARM_SCREEN_SETTINGS", "Open RiseQuest full-screen alarm settings in Android Settings.", error) }
  }
  @ReactMethod fun cacheSpeech(fingerprint: String, encoded: String, promise: Promise) {
    try {
      require(fingerprint.matches(Regex("[a-f0-9]{64}")) && encoded.length <= 1600100)
      val bytes = Base64.decode(encoded, Base64.DEFAULT)
      require(bytes.size in 46..1200044 && String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE")
      val directory = File(context.noBackupFilesDir, "alarm-speech").apply { mkdirs() }
      val target = File(directory, "$fingerprint.wav")
      val temporary = File(directory, "$fingerprint.tmp")
      temporary.writeBytes(bytes)
      check(temporary.renameTo(target))
      promise.resolve(android.net.Uri.fromFile(target).toString())
    } catch (error: Exception) { promise.reject("SPEECH_CACHE", "Could not save the voice on this phone. Please retry.", error) }
  }
  @ReactMethod fun hasSpeech(fingerprint: String, promise: Promise) {
    promise.resolve(fingerprint.matches(Regex("[a-f0-9]{64}")) && File(context.noBackupFilesDir, "alarm-speech/$fingerprint.wav").length() > 44)
  }
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
      .put("speechUri", if (alarm.optBoolean("speechEnabled")) alarm.optString("speechUri") else "")
      .put("speechRepeats", alarm.optInt("speechRepeats", 1).coerceIn(1, 3))
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
    if (active == alarmId) {
      // Clear the bridge-visible identity before Android asynchronously destroys
      // the service; otherwise an active() poll can immediately restart it.
      context.getSharedPreferences("risequest_alarm_audio", 0).edit().remove("activeId").apply()
      context.stopService(Intent(context, RiseQuestAlarmService::class.java))
    }
  }
  @ReactMethod fun active(promise: Promise) {
    promise.resolve(context.getSharedPreferences("risequest_alarm_audio", 0).getString("activeId", null))
  }
}

class RiseQuestAlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RiseQuestAlarmModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
