package com.risequest.app

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import androidx.core.app.NotificationCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class RiseQuestReaderService:Service(){
  private val handler=Handler(Looper.getMainLooper())
  private var projection:MediaProjection?=null
  private var display:VirtualDisplay?=null
  private var reader:ImageReader?=null
  private var recognizer=com.google.mlkit.vision.text.TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private var processing=false
  private var lastFrame=0L
  private var session=""
  private var destroyed=false
  override fun onBind(intent:Intent?)=null
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    if(intent?.action=="STOP"){stopSelf();return START_NOT_STICKY}
    if(projection!=null||intent==null){stopSelf();return START_NOT_STICKY}
    try {
      session=intent.getStringExtra("session")?:throw Exception()
      require(session==ReaderCaptureState.session&&ReaderCaptureState.active)
      val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("reader-capture","Screen reading",NotificationManager.IMPORTANCE_LOW))
      val stop=PendingIntent.getService(this,8943,Intent(this,RiseQuestReaderService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val open=packageManager.getLaunchIntentForPackage(packageName)?.let{PendingIntent.getActivity(this,8944,it,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)}
      val capture=PendingIntent.getActivity(this,8945,Intent(this,RiseQuestCaptureActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val notification=NotificationCompat.Builder(this,"reader-capture").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("RiseQuest screen reading")
        .setContentText("Tap Read screen on the page you want. Ends after two minutes.").setOngoing(true).setContentIntent(open).addAction(android.R.drawable.ic_menu_view,"Read screen",capture).addAction(android.R.drawable.ic_media_pause,"Stop",stop).build()
      if(Build.VERSION.SDK_INT>=29)startForeground(8943,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)else startForeground(8943,notification)
      @Suppress("DEPRECATION") val permission=intent.getParcelableExtra<Intent>("permission")?:throw Exception()
      projection=(getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager).getMediaProjection(intent.getIntExtra("result",Activity.RESULT_CANCELED),permission)
      projection!!.registerCallback(object:MediaProjection.Callback(){override fun onStop(){stopSelf()}},handler)
      val metrics=resources.displayMetrics
      val factor=1200.0/maxOf(metrics.widthPixels,metrics.heightPixels)
      val width=(metrics.widthPixels*factor).toInt().coerceAtLeast(1);val height=(metrics.heightPixels*factor).toInt().coerceAtLeast(1)
      reader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2)
      reader!!.setOnImageAvailableListener({ source ->
        val image=source.acquireLatestImage()?:return@setOnImageAvailableListener
        try{
          if(destroyed||session!=ReaderCaptureState.session||!ReaderCaptureState.active||System.currentTimeMillis()>ReaderCaptureState.deadline||
            getSharedPreferences("risequest_alarm_audio",0).getString("activeId",null)!=null){stopSelf();return@setOnImageAvailableListener}
          if(processing||!ReaderCaptureState.requested||System.currentTimeMillis()-lastFrame<1000)return@setOnImageAvailableListener
          ReaderCaptureState.requested=false;processing=true;lastFrame=System.currentTimeMillis()
          val plane=image.planes[0];val paddedWidth=width+(plane.rowStride-plane.pixelStride*width)/plane.pixelStride
          val padded=Bitmap.createBitmap(paddedWidth,height,Bitmap.Config.ARGB_8888);padded.copyPixelsFromBuffer(plane.buffer)
          val bitmap=Bitmap.createBitmap(padded,0,0,width,height);if(bitmap!==padded)padded.recycle()
          recognizer.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener { result ->
            if(!destroyed&&session==ReaderCaptureState.session&&ReaderCaptureState.active&&result.text.isNotBlank())ReaderCaptureState.text=result.text.take(30000)
          }.addOnCompleteListener{bitmap.recycle();processing=false}
        }catch(_:Exception){processing=false;stopSelf()}finally{image.close()}
      },handler)
      display=projection!!.createVirtualDisplay("RiseQuest reader",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader!!.surface,null,handler)
      handler.postDelayed({stopSelf()},120000)
    }catch(_:Exception){stopSelf()}
    return START_NOT_STICKY
  }
  override fun onTaskRemoved(rootIntent:Intent?){stopSelf()}
  override fun onDestroy(){
    destroyed=true;handler.removeCallbacksAndMessages(null)
    if(session==ReaderCaptureState.session)ReaderCaptureState.active=false
    display?.release();reader?.close();projection?.stop();projection=null;recognizer.close();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
  }
}
