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
  private var recognizer: android.speech.SpeechRecognizer? = null
  private var speechPromise: Promise? = null
  private val speechHandler = android.os.Handler(android.os.Looper.getMainLooper())
  private val speechTimeout = Runnable { finishSpeech(null, "Speech timed out. Please try again.") }
  init { context.addLifecycleEventListener(object : LifecycleEventListener {
    override fun onHostResume() {}
    override fun onHostPause() { speechHandler.post { finishSpeech(null, "Listening stopped.") } }
    override fun onHostDestroy() { speechHandler.post { finishSpeech(null, "Listening stopped.") } }
  }) }
  private fun finishSpeech(text: String?, error: String? = null) {
    val pending = speechPromise
    speechPromise = null
    speechHandler.removeCallbacks(speechTimeout)
    recognizer?.destroy(); recognizer = null
    if (error != null) pending?.reject("SPEECH_INPUT", error) else pending?.resolve(text)
  }
  @ReactMethod fun cancelListening() { speechHandler.post { finishSpeech(null) } }
  @ReactMethod fun listenOnce(promise: Promise) {
    speechHandler.post {
      if (speechPromise != null) { promise.reject("SPEECH_BUSY", "Finish the current message first."); return@post }
      if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED || !android.speech.SpeechRecognizer.isRecognitionAvailable(context)) {
        promise.reject("SPEECH_UNAVAILABLE", "Enable microphone and speech recognition, or type instead."); return@post
      }
      speechPromise = promise
      try {
        recognizer = if (android.os.Build.VERSION.SDK_INT >= 31 && android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) android.speech.SpeechRecognizer.createOnDeviceSpeechRecognizer(context) else android.speech.SpeechRecognizer.createSpeechRecognizer(context)
        recognizer!!.setRecognitionListener(object : android.speech.RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onError(error: Int) { if (speechPromise === promise) finishSpeech(null, "Speech could not be recognized. Try again or type your message.") }
          override fun onResults(results: Bundle?) { if (speechPromise === promise) finishSpeech(results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()) }
          override fun onPartialResults(partialResults: Bundle?) {}
          override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        recognizer!!.startListening(Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1)
          putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        })
        speechHandler.postDelayed(speechTimeout, 25000)
      } catch (_: Exception) { finishSpeech(null, "Voice input is unavailable. You can type instead.") }
    }
  }
  @ReactMethod fun reliabilityStatus(promise: Promise) {
    val notification = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
    val audio = context.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
    val power = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
    val alarm = context.getSystemService(android.content.Context.ALARM_SERVICE) as android.app.AlarmManager
    promise.resolve(Arguments.createMap().apply {
      putBoolean("exactAlarms", android.os.Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms())
      putBoolean("fullScreen", android.os.Build.VERSION.SDK_INT < 34 || notification.canUseFullScreenIntent())
      putBoolean("batteryUnrestricted", power.isIgnoringBatteryOptimizations(context.packageName))
      putBoolean("dndAccess", notification.isNotificationPolicyAccessGranted)
      putInt("alarmVolume", audio.getStreamVolume(android.media.AudioManager.STREAM_ALARM))
      putInt("alarmVolumeMax", audio.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM))
    })
  }
  @ReactMethod fun openReliabilitySettings(kind: String, promise: Promise) {
    try {
      val action = when(kind) { "battery" -> android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        "sound" -> android.provider.Settings.ACTION_SOUND_SETTINGS
        "dnd" -> android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS
        else -> android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS }
      val intent=Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if(kind !in listOf("battery","sound","dnd")) intent.data=android.net.Uri.parse("package:"+context.packageName)
      context.startActivity(intent); promise.resolve(true)
    } catch (_:Exception) { promise.reject("SETTINGS", "Open RiseQuest settings on your phone.") }
  }
  @ReactMethod fun startSmartWake(config: String, promise: Promise) {
    try {
      val parsed=JSONObject(config)
      require(parsed.getLong("triggerMs") > System.currentTimeMillis() && parsed.getLong("triggerMs")-System.currentTimeMillis()<=16*60*60000L)
      val sensors=context.getSystemService(android.content.Context.SENSOR_SERVICE) as android.hardware.SensorManager
      require(sensors.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)!=null)
      ContextCompat.startForegroundService(context,Intent(context,RiseQuestSmartWakeService::class.java).putExtra("config",config))
      promise.resolve(true)
    } catch (_:Exception) { promise.reject("SMART_WAKE", "Monitoring is unavailable. Your fixed alarm stays set.") }
  }
  @ReactMethod fun stopSmartWake(promise: Promise) { context.stopService(Intent(context,RiseQuestSmartWakeService::class.java)); promise.resolve(true) }
  @ReactMethod fun smartWakeStatus(promise: Promise) {
    val p=context.getSharedPreferences("risequest_smart_wake",0)
    promise.resolve(Arguments.createMap().apply {putBoolean("active",p.getBoolean("active",false) && p.getLong("deadline",0)>System.currentTimeMillis());putString("status",p.getString("status","Off"));putDouble("deadline",p.getLong("deadline",0).toDouble())})
  }
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
      require(fingerprint.matches(Regex("[a-f0-9]{64}")) && encoded.length <= 19200100)
      val bytes = Base64.decode(encoded, Base64.DEFAULT)
      require(bytes.size in 46..14400044 && String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE")
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
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RiseQuestReader(context), RiseQuestAlarmModule(context), RiseQuestHealthDevices(context), RiseQuestVoiceSession(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

