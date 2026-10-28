package com.risequest.app

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import android.speech.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.Locale
import android.util.Log

class RiseQuestVoiceSession(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
 override fun getName()="RiseQuestVoiceSession"
 init { VoiceConversationService.emit={kind,value->if(context.hasActiveReactInstance())context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("risequestVoice",Arguments.createMap().apply{putString("kind",kind);putString("value",value)})};context.addLifecycleEventListener(this) }
 @ReactMethod fun addListener(name:String) {}
 @ReactMethod fun removeListeners(count:Double) {}
 @ReactMethod fun start(background:Boolean,promise:Promise){
  UiThreadUtil.runOnUiThread {try{
   val activity=context.currentActivity
   check(activity!=null && !activity.isFinishing)
   check(context.lifecycleState==com.facebook.react.common.LifecycleState.RESUMED)
   check(ContextCompat.checkSelfPermission(context,android.Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED)
   check(SpeechRecognizer.isRecognitionAvailable(context))
   if(Build.VERSION.SDK_INT>=33)check(ContextCompat.checkSelfPermission(context,android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)
   VoiceConversationService.requested=true
   ContextCompat.startForegroundService(context,Intent(context,VoiceConversationService::class.java).setAction("START").putExtra("background",background));promise.resolve(true)
  }catch(_:Exception){VoiceConversationService.requested=false;promise.reject("VOICE_START","Allow microphone and notifications, then start voice chat while RiseQuest is open.")}}
 }
 @ReactMethod fun stop(){UiThreadUtil.runOnUiThread{VoiceConversationService.requested=false;VoiceConversationService.instance?.finish()}}
 @ReactMethod fun resume(){UiThreadUtil.runOnUiThread{VoiceConversationService.instance?.listen()}}
 @ReactMethod fun pause(){UiThreadUtil.runOnUiThread{VoiceConversationService.instance?.pauseForReply()}}
 @ReactMethod fun speak(text:String){UiThreadUtil.runOnUiThread{VoiceConversationService.instance?.speak(text)}}
 @ReactMethod fun play(uri:String){UiThreadUtil.runOnUiThread{VoiceConversationService.instance?.play(uri)}}
 override fun onHostResume(){}
 override fun onHostPause(){if(VoiceConversationService.instance?.background!=true)stop()}
 override fun onHostDestroy(){stop()}
 override fun invalidate(){stop();VoiceConversationService.emit=null;context.removeLifecycleEventListener(this);super.invalidate()}
}
class VoiceConversationService:Service(),RecognitionListener {
 companion object {@Volatile var requested=false;var instance:VoiceConversationService?=null;var emit:((String,String)->Unit)?=null;const val CHANNEL="risequest_voice_session";const val ID=29105}
 private val handler=Handler(Looper.getMainLooper())
 private var recognizer:SpeechRecognizer?=null
 private var player:MediaPlayer?=null
 private var tts:TextToSpeech?=null
 private var ttsReady=false
 private var pendingText:String?=null
 private var stopped=true
 private var waiting=false
 private val recovery=VoiceRecognitionRecovery()
 private var onDeviceRecognizer=false
 var background=false
 private var focus:AudioFocusRequest?=null
 private val manager by lazy {getSystemService(AUDIO_SERVICE) as AudioManager}
 private val focusListener=AudioManager.OnAudioFocusChangeListener{change->if(change==AudioManager.AUDIOFOCUS_LOSS || change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)handler.post{finish("Voice chat stopped for another audio activity.")}}
 private var lock:PowerManager.WakeLock?=null
 private val watchdog=Runnable{finish("Voice chat timed out. Tap to start again.")}
 private val restartListening=Runnable{listen()}
 private val recognitionWatchdog=Runnable{if(!stopped&&!waiting)recoverRecognition(SpeechRecognizer.ERROR_SPEECH_TIMEOUT)}
 private fun clearTimers(){handler.removeCallbacks(watchdog);handler.removeCallbacks(restartListening);handler.removeCallbacks(recognitionWatchdog)}
 private fun armRecognitionTimeout(delay:Long){handler.removeCallbacks(recognitionWatchdog);handler.postDelayed(recognitionWatchdog,delay)}
 private fun dropRecognizer(){
  recovery.invalidate()
  val old=recognizer;recognizer=null
  try{old?.cancel()}catch(_:Exception){}
  try{old?.destroy()}catch(_:Exception){}
 }
 private fun recoverRecognition(error:Int){
  if(stopped)return
  waiting=true;clearTimers();dropRecognizer()
  val delay=recovery.retryDelay(error,onDeviceRecognizer)
  Log.w("RiseQuestVoice","Recognition recovery code=$error local=$onDeviceRecognizer retryMs=$delay")
  if(delay==VoiceRecognitionRecovery.PERMISSION_REQUIRED){finish("Allow microphone access in Settings, then start voice chat again.");return}
  if(delay==VoiceRecognitionRecovery.LANGUAGE_UNAVAILABLE){finish("Choose an available speech language in your phone settings, then start voice chat again.");return}
  state("starting");handler.postDelayed(restartListening,delay)
 }
 override fun onBind(intent:Intent?)=null
 override fun onCreate(){super.onCreate();instance=this
  (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL,"Voice conversation",NotificationManager.IMPORTANCE_LOW))
  lock=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"RiseQuest:VoiceConversation")
  tts=TextToSpeech(this){status->handler.post{ttsReady=status==TextToSpeech.SUCCESS;if(ttsReady){tts?.language=Locale.getDefault();pendingText?.let{pendingText=null;speak(it)}}else if(pendingText!=null)finish("Device speech is unavailable.")}}
  tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){};override fun onDone(id:String?){handler.post{played()}};@Deprecated("Deprecated in Java") override fun onError(id:String?){handler.post{finish("Audio could not play.")}}})
 }
 private fun notification(state:String):Notification {
  val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  val stop=PendingIntent.getService(this,1,Intent(this,VoiceConversationService::class.java).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  return NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("RiseQuest voice chat").setContentText(state).setContentIntent(open).setOngoing(true).setSilent(true).setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE).addAction(android.R.drawable.ic_media_pause,"Stop listening",stop).build()
 }
 private fun state(value:String){if(stopped)return;(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(ID,notification(when(value){"listening"->"Listening • tap Stop to end";"speaking"->"Speaking • microphone paused";"starting"->"Connecting microphone • tap Stop to end";else->"Preparing reply • microphone paused"}));emit?.invoke("state",value)}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action=="STOP"){finish();return START_NOT_STICKY}
  if(intent?.action!="START"||!requested){stopSelf();return START_NOT_STICKY}
  if(!stopped)return START_NOT_STICKY
  background=intent.getBooleanExtra("background",false);recovery.reset();stopped=false
  try{
   if(Build.VERSION.SDK_INT>=30)startForeground(ID,notification("Starting voice chat"),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)else startForeground(ID,notification("Starting voice chat"))
   focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(focusListener).build()
   if(manager.requestAudioFocus(focus!!)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw IllegalStateException()
   listen()
  }catch(_:Exception){finish("Voice chat could not start. Open RiseQuest and check microphone permissions.")}
  return START_NOT_STICKY
 }
 private fun renewWakeLock(){lock?.let{if(it.isHeld)it.release();it.acquire(240000)}}
 fun pauseForReply(){if(stopped)return;renewWakeLock();waiting=true;clearTimers();dropRecognizer();state("thinking");handler.postDelayed(watchdog,150000)}
 fun listen(){if(stopped)return
  waiting=true;clearTimers();dropRecognizer();player?.release();player=null
  renewWakeLock()
  try{
   if(ContextCompat.checkSelfPermission(this,android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED){recoverRecognition(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS);return}
   if(!SpeechRecognizer.isRecognitionAvailable(this)){finish("Speech recognition is unavailable. Check your phone’s speech service, then start again.");return}
   onDeviceRecognizer=recovery.useOnDevice(Build.VERSION.SDK_INT>=31&&SpeechRecognizer.isOnDeviceRecognitionAvailable(this))
   recognizer=if(onDeviceRecognizer&&Build.VERSION.SDK_INT>=31)SpeechRecognizer.createOnDeviceSpeechRecognizer(this)else SpeechRecognizer.createSpeechRecognizer(this)
   val cycle=recovery.invalidate()
   recognizer!!.setRecognitionListener(object:RecognitionListener by this {
    private fun current()=!stopped&&!waiting&&recovery.isCurrent(cycle)
    override fun onResults(results:Bundle?){if(current())this@VoiceConversationService.onResults(results)}
    override fun onError(error:Int){if(current())this@VoiceConversationService.onError(error)}
    override fun onReadyForSpeech(params:Bundle?){if(current()){state("listening");armRecognitionTimeout(45000)}}
    override fun onBeginningOfSpeech(){if(current())armRecognitionTimeout(60000)}
    override fun onEndOfSpeech(){if(current())armRecognitionTimeout(10000)}
   })
   waiting=false;state("starting");armRecognitionTimeout(45000)
   recognizer!!.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply{putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1);putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false)})
  }catch(_:SecurityException){recoverRecognition(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS)}
   catch(_:Exception){recoverRecognition(SpeechRecognizer.ERROR_CLIENT)}
 }
 fun speak(text:String){if(stopped)return;pauseForReply();state("speaking");handler.removeCallbacks(watchdog);handler.postDelayed(watchdog,180000);if(!ttsReady){pendingText=text;return};tts?.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());tts?.speak(text.take(2500),TextToSpeech.QUEUE_FLUSH,null,"reply")}
 fun play(uri:String){if(stopped)return;pauseForReply();state("speaking")
  try{val file=File(uri.removePrefix("file://")).canonicalFile;check(file.path.startsWith(File(noBackupFilesDir,"alarm-speech").canonicalPath+File.separator));player?.release();player=MediaPlayer().apply{setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());setDataSource(file.path);setOnPreparedListener{it.start()};setOnCompletionListener{played()};setOnErrorListener{_,_,_->finish("Audio could not play.");true};prepareAsync()};handler.removeCallbacks(watchdog);handler.postDelayed(watchdog,180000)}catch(_:Exception){finish("Audio could not play.")}
 }
 private fun played(){if(stopped)return;clearTimers();emit?.invoke("played","");handler.postDelayed(restartListening,450)}
 fun finish(message:String=""){requested=false;if(stopped){stopSelf();return};stopped=true;clearTimers();dropRecognizer();player?.release();player=null;tts?.stop();pendingText=null;if(lock?.isHeld==true)lock?.release();focus?.let{manager.abandonAudioFocusRequest(it)};focus=null;emit?.invoke("stopped",message);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
 override fun onDestroy(){finish();tts?.shutdown();tts=null;instance=null;super.onDestroy()}
 override fun onTaskRemoved(rootIntent:Intent?){finish();super.onTaskRemoved(rootIntent)}
 override fun onResults(results:Bundle?){if(stopped||waiting)return;val text=results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim();if(text.isNullOrBlank()){recoverRecognition(SpeechRecognizer.ERROR_NO_MATCH);return};recovery.succeeded();pauseForReply();emit?.invoke("transcript",text)}
 override fun onError(error:Int){if(stopped||waiting)return;recoverRecognition(error)}
 override fun onReadyForSpeech(params:Bundle?){}
 override fun onBeginningOfSpeech(){}
 override fun onRmsChanged(rmsdB:Float){}
 override fun onBufferReceived(buffer:ByteArray?){}
 override fun onEndOfSpeech(){}
 override fun onPartialResults(partialResults:Bundle?){}
 override fun onEvent(eventType:Int,params:Bundle?){}
}
