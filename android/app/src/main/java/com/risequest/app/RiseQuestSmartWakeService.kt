package com.risequest.app

import android.app.*
import android.content.*
import android.hardware.*
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import kotlin.math.sqrt

/** Optional movement-assisted window. The independently scheduled fixed alarm is never removed. */
class RiseQuestSmartWakeService : Service(), SensorEventListener {
  private val handler=Handler(Looper.getMainLooper())
  private var sensor: SensorManager?=null
  private var alarm: JSONObject?=null
  private var deadline=0L
  private var window=15*60000L
  private var movement=0
  private var lastMovement=0L
  private var started=0L
  private val prefs by lazy { getSharedPreferences("risequest_smart_wake", MODE_PRIVATE) }
  override fun onBind(intent:Intent?)=null
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    if(intent?.action=="STOP"){stopSelf();return START_NOT_STICKY}
    try {
      val config=JSONObject(intent?.getStringExtra("config") ?: "{}")
      val target=config.getLong("triggerMs"); val now=System.currentTimeMillis()
      require(target>now && target-now<=16*60*60000L)
      alarm=config;deadline=target;window=config.optLong("windowMinutes",15).coerceIn(5,30)*60000L;started=now
      val manager=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("risequest-smart-wake","Smart wake monitoring",NotificationManager.IMPORTANCE_LOW))
      val stop=PendingIntent.getService(this,1381040140,Intent(this,RiseQuestSmartWakeService::class.java).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val open=PendingIntent.getActivity(this,1381040141,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val notification=NotificationCompat.Builder(this,"risequest-smart-wake").setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle("RiseQuest smart wake is on").setContentText("Movement-assisted window; your fixed alarm remains set.")
        .setOngoing(true).setContentIntent(open).addAction(0,"Stop monitoring",stop).build()
      if(Build.VERSION.SDK_INT>=34)startForeground(1381040140,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
      else startForeground(1381040140,notification)
      sensor=getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val accelerometer=sensor!!.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: throw IllegalStateException("No movement sensor")
      sensor!!.registerListener(this,accelerometer,SensorManager.SENSOR_DELAY_NORMAL)
      prefs.edit().putBoolean("active",true).putLong("deadline",deadline).putString("alarmId",config.getString("id")).putString("status","Monitoring phone movement").apply()
      handler.removeCallbacksAndMessages(null)
      handler.postDelayed({stopSelf()},(deadline-now).coerceAtLeast(1))
    }catch(_:Exception){prefs.edit().putString("status","Monitoring unavailable. Fixed alarm remains set.").apply();stopSelf()}
    return START_NOT_STICKY
  }
  override fun onSensorChanged(event:SensorEvent) {
    val now=System.currentTimeMillis()
    if(now>=deadline){stopSelf();return}
    if(now<deadline-window || now-started<60000)return
    val magnitude=sqrt(event.values[0]*event.values[0]+event.values[1]*event.values[1]+event.values[2]*event.values[2])
    if(kotlin.math.abs(magnitude-SensorManager.GRAVITY_EARTH)>1.2f && now-lastMovement>1000){
      movement=if(now-lastMovement<12000)movement+1 else 1;lastMovement=now
      if(movement>=3){
        val config=alarm?:return
        val info=JSONObject().put("alarmId",config.getString("id")).put("toneUri",config.optString("customToneUri"))
          .put("speechUri",if(config.optBoolean("speechEnabled"))config.optString("speechUri") else "")
          .put("speechRepeats",config.optInt("speechRepeats",1)).put("startVolume",config.optDouble("startVolume",0.35)).put("maxVolume",config.optDouble("maxVolume",1.0)).put("volumeCurve",config.optString("volumeCurve","gentle"))
        val bundle=Bundle().apply{putString("id",config.optString("notificationId"));putString("title",config.optString("label","RiseQuest Alarm"));putString("userInfo",info.toString())}
        try{androidx.core.content.ContextCompat.startForegroundService(this,Intent(this,RiseQuestAlarmService::class.java).putExtra("notification",bundle))
          prefs.edit().putString("status","Movement detected inside your wake window").apply()
        }catch(_:Exception){prefs.edit().putString("status","Fixed alarm remains set.").apply()}
        stopSelf()
      }
    }
  }
  override fun onAccuracyChanged(sensor:Sensor?,accuracy:Int){}
  override fun onDestroy(){handler.removeCallbacksAndMessages(null);sensor?.unregisterListener(this);prefs.edit().putBoolean("active",false).apply();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
