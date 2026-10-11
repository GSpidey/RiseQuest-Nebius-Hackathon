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
import java.io.File

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
      manager.createNotificationChannel(NotificationChannel("risequest-alarm-screen", "Ringing alarm screen", NotificationManager.IMPORTANCE_HIGH).apply {
        // The service owns voice then tone; do not play a second channel sound.
        setSound(null, null)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      })
    }
    val launch = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra("notification", Bundle(bundle).apply { putBoolean("userInteraction", true) })
    val pending = PendingIntent.getActivity(this, id, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val alarmScreen = PendingIntent.getActivity(this, id,
      Intent(this, RiseQuestAlarmActivity::class.java).putExtra("alarmId", alarmId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, "risequest-alarm-screen")
      .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("RiseQuest Alarm")
      .setContentText("Time to wake up — open alarm controls")
      .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true).setContentIntent(pending)
      .setFullScreenIntent(alarmScreen, true).build()
    // Store before posting: the lock-screen activity rejects stale notifications.
    getSharedPreferences("risequest_alarm_audio", MODE_PRIVATE).edit().putString("activeId", alarmId).apply()
    // The scheduler posts its reminder first. Reusing that ID would be an
    // update, for which Android does not launch a new full-screen intent.
    manager.cancel(id)
    startForeground(1381040129, notification)
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
    val tone = customUri ?: defaultUri
    val speech = info.optString("speechUri").takeIf { it.startsWith("file://") }?.let(Uri::parse)
    val speechRoot = File(noBackupFilesDir, "alarm-speech").canonicalFile
    val voiceFile = speech?.path?.let { File(it).canonicalFile }
    if (voiceFile != null && voiceFile.parentFile == speechRoot && voiceFile.isFile) {
      playSpeech(Uri.fromFile(voiceFile), info.optInt("speechRepeats", 1).coerceIn(1, 3), tone, if (customUri != null) defaultUri else null)
    } else play(tone, if (customUri != null) defaultUri else null)
    handler.postDelayed({ stopSelf() }, 10 * 60 * 1000L)
    return START_NOT_STICKY
  }

  private fun playSpeech(uri: Uri, repeats: Int, tone: Uri, fallback: Uri?) {
    val next = MediaPlayer()
    player = next
    var left = repeats
    var finished = false
    var prepared = false
    val startTone = {
      if (!finished && player === next) {
        finished = true
        next.release(); player = null
        play(tone, fallback)
      }
    }
    // Bound preparation and total speech. A damaged file never silences an alarm.
    handler.postDelayed({ startTone() }, 80000L)
    try {
      next.setAudioAttributes(attributes)
      next.setDataSource(this, uri)
      next.isLooping = false
      next.setOnPreparedListener {
        prepared = true
        if (player !== next || finished) return@setOnPreparedListener
        if (it.duration !in 1..25000) { startTone(); return@setOnPreparedListener }
        it.setVolume(maxVolume, maxVolume); it.start()
        Log.i("RiseQuestAlarm", "Saved voice started")
      }
      next.setOnCompletionListener {
        left--
        if (left > 0 && player === next && !finished) { it.seekTo(0); it.start() }
        else startTone()
      }
      next.setOnErrorListener { _, _, _ -> startTone(); true }
      next.prepareAsync()
      handler.postDelayed({ if (player === next && !finished && !prepared) startTone() }, 4000L)
    } catch (_: Exception) { startTone() }
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
