package com.risequest.app

import android.app.*
import android.content.Intent
import android.content.Context
import android.media.*
import android.net.Uri
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/** Audio for the existing scheduled alarm, independent of the React activity. */
class RiseQuestAlarmService : Service() {
  private var player: MediaPlayer? = null
  private var focus: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var activeId: String? = null
  private var startVolume = 0.35f
  private var maxVolume = 1f
  private var rampMs = 120000L
  private val handler = Handler(Looper.getMainLooper())
  private val audio by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_GAIN -> player?.start()
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> player?.pause()
      AudioManager.AUDIOFOCUS_LOSS -> stopSelf()
    }
  }

  override fun onBind(intent: Intent?) = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "STOP") {
      if (intent.getStringExtra("alarmId") == activeId) stopSelf()
      return START_NOT_STICKY
    }
    val bundle = intent?.getBundleExtra("notification") ?: return START_NOT_STICKY.also { stopSelf() }
    val info = try { JSONObject(bundle.getString("userInfo") ?: "{}") } catch (_: Exception) { JSONObject() }
    val alarmId = info.optString("alarmId")
    if (alarmId.isBlank()) { stopSelf(); return START_NOT_STICKY }
    if (activeId == alarmId && player != null) return START_NOT_STICKY
    releaseAudio()
    handler.removeCallbacksAndMessages(null)
    activeId = alarmId
    startVolume = info.optDouble("startVolume", 0.35).coerceIn(0.05, 1.0).toFloat()
    maxVolume = info.optDouble("maxVolume", 1.0).coerceIn(startVolume.toDouble(), 1.0).toFloat()
    rampMs = when (info.optString("volumeCurve")) { "urgent" -> 15000L; "standard" -> 45000L; else -> 120000L }
    val id = bundle.getString("id")?.toIntOrNull()?.takeIf { it > 0 } ?: 1381040129
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(NotificationChannel("risequest-alarms", "RiseQuest Alarms", NotificationManager.IMPORTANCE_HIGH))
    }
    val launch = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra("notification", Bundle(bundle).apply { putBoolean("userInteraction", true) })
    val pending = PendingIntent.getActivity(this, id, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, "risequest-alarms")
      .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(bundle.getString("title") ?: "RiseQuest Alarm")
      .setContentText("Alarm ringing — tap to open and dismiss")
      .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOngoing(true).setSilent(true).setContentIntent(pending).build()
    startForeground(id, notification)
    getSharedPreferences("risequest_alarm_audio", MODE_PRIVATE).edit().putString("activeId", alarmId).apply()
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RiseQuest:AlarmAudio").apply { acquire(10 * 60 * 1000L) }
    if (Build.VERSION.SDK_INT >= 26) {
      focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build()
      audio.requestAudioFocus(focus!!)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
    val custom = info.optString("toneUri")
    val customUri = custom.takeIf { it.startsWith("file://") || it.startsWith("content://") }?.let(Uri::parse)
    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    play(customUri ?: defaultUri, if (customUri != null) defaultUri else null)
    handler.postDelayed({ stopSelf() }, 10 * 60 * 1000L)
    return START_NOT_STICKY
  }

  private fun play(uri: Uri, fallback: Uri?) {
    val next = MediaPlayer()
    player = next
    try {
      next.setAudioAttributes(attributes)
      next.setDataSource(this, uri)
      next.isLooping = true
      next.setOnPreparedListener {
        it.setVolume(startVolume, startVolume)
        it.start()
        val started = SystemClock.elapsedRealtime()
        val ramp = object : Runnable {
          override fun run() {
            if (player !== next) return
            val progress = ((SystemClock.elapsedRealtime() - started).toFloat() / rampMs).coerceAtMost(1f)
            val volume = startVolume + (maxVolume - startVolume) * progress
            next.setVolume(volume, volume)
            if (progress < 1f) handler.postDelayed(this, 750)
          }
        }
        handler.post(ramp)
        Log.i("RiseQuestAlarm", "Looping alarm audio started")
      }
      next.setOnErrorListener { failed, _, _ ->
        failed.release()
        player = null
        if (fallback != null) play(fallback, null)
        else { Log.e("RiseQuestAlarm", "Alarm sound unavailable"); stopSelf() }
        true
      }
      next.prepareAsync()
    } catch (_: Exception) {
      next.release()
      player = null
      if (fallback != null) play(fallback, null) else stopSelf()
    }
  }

  private fun releaseAudio() {
    player?.release(); player = null
    if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
    else { @Suppress("DEPRECATION") audio.abandonAudioFocus(focusListener) }
    focus = null
    wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    releaseAudio()
    getSharedPreferences("risequest_alarm_audio", MODE_PRIVATE).edit().remove("activeId").apply()
    stopForeground(STOP_FOREGROUND_REMOVE)
    Log.i("RiseQuestAlarm", "Alarm audio stopped")
    super.onDestroy()
  }
}
