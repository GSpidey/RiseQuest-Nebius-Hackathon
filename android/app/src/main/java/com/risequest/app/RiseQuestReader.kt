package com.risequest.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.media.projection.MediaProjectionManager
import android.os.ParcelFileDescriptor
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object ReaderCaptureState {
  @Volatile var session = ""
  @Volatile var text = ""
  @Volatile var active = false
  @Volatile var requested = false
  @Volatile var deadline = 0L
  fun clear() { session=""; text=""; active=false; requested=false; deadline=0 }
}

class RiseQuestReader(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pending: Promise?=null
  private var capturePending: Promise?=null
  private var requestSession=""
  private val worker=Executors.newSingleThreadExecutor()
  @Volatile private var generation=0
  override fun getName()="RiseQuestReader"
  init {
    context.addActivityEventListener(object:BaseActivityEventListener(){
      override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?){
        if(requestCode==8941){
          val promise=pending?:return;pending=null
          if(resultCode!=Activity.RESULT_OK||data?.data==null){promise.resolve(null);return}
          val version=generation;val uri=data.data!!
          worker.execute {
            val temp=File.createTempFile("reading-",".input",context.cacheDir)
            try {
              context.contentResolver.openInputStream(uri)?.use { input -> temp.outputStream().use { output ->
                val buffer=ByteArray(8192);var total=0
                while(true){val count=input.read(buffer);if(count<0)break;total+=count;require(total<=20*1024*1024){"Choose a document under 20 MB."};output.write(buffer,0,count)}
              }}?:throw Exception("The document could not be opened.")
              val mime=context.contentResolver.getType(uri)?:""
              val value=when {
                mime=="application/pdf" -> readPdf(temp)
                mime.startsWith("image/") -> readImage(temp)
                mime.startsWith("text/") -> temp.inputStream().bufferedReader(Charsets.UTF_8).use { it.readText().take(30000) }
                else -> throw Exception("Choose a PDF, image or plain-text file.")
              }
              if(version!=generation)promise.reject("READER_CANCELLED","Reading cancelled.")
              else promise.resolve(Arguments.createMap().apply { putString("text",value.take(30000)) })
            }catch(e:Exception){promise.reject("READER_DOCUMENT",e.message?:"This document could not be read.")}
            finally{temp.delete()}
          }
        }
        if(requestCode==8942){
          val promise=capturePending?:return;capturePending=null
          if(resultCode!=Activity.RESULT_OK||data==null){requestSession="";promise.reject("READER_PERMISSION","Screen reading was cancelled.");return}
          try {
            val id=requestSession;require(id.isNotEmpty())
            ReaderCaptureState.session=id;ReaderCaptureState.text="";ReaderCaptureState.active=true;ReaderCaptureState.deadline=System.currentTimeMillis()+120000
            ContextCompat.startForegroundService(context,Intent(context,RiseQuestReaderService::class.java).putExtra("permission",data).putExtra("result",resultCode).putExtra("session",id))
            promise.resolve(true)
          }catch(_:Exception){ReaderCaptureState.clear();promise.reject("READER_CAPTURE","Screen reading could not start.")}
        }
      }
    })
    context.addLifecycleEventListener(object:LifecycleEventListener{
      override fun onHostResume(){}
      override fun onHostPause(){} // Cross-app reading is explicitly user-started.
      override fun onHostDestroy(){stopCapture();pending?.reject("READER_CANCELLED","Reading cancelled.");pending=null;worker.shutdownNow()}
    })
  }
  private fun ocr(bitmap:Bitmap):String {
    val recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try{return Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap,0)),15,TimeUnit.SECONDS).text}
    finally{recognizer.close()}
  }
  private fun readImage(file:File):String {
    val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.path,bounds)
    require(bounds.outWidth>0&&bounds.outHeight>0){"This image could not be opened."}
    var sample=1;while(bounds.outWidth.toLong()*bounds.outHeight/(sample.toLong()*sample)>2500000)sample*=2
    val bitmap=BitmapFactory.decodeFile(file.path,BitmapFactory.Options().apply{inSampleSize=sample})?:throw Exception("This image could not be opened.")
    try{return ocr(bitmap)}finally{bitmap.recycle()}
  }
  private fun readPdf(file:File):String {
    ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
      PdfRenderer(descriptor).use { pdf ->
        require(pdf.pageCount<=30){"Choose a PDF with up to 30 pages."}
        val result=StringBuilder()
        for(index in 0 until pdf.pageCount){
          if(Thread.currentThread().isInterrupted)throw Exception("Reading cancelled.")
          pdf.openPage(index).use { page ->
            val scale=1600.0/maxOf(page.width,page.height).coerceAtLeast(1)
            val bitmap=Bitmap.createBitmap((page.width*scale).toInt().coerceAtLeast(1),(page.height*scale).toInt().coerceAtLeast(1),Bitmap.Config.ARGB_8888)
            try{bitmap.eraseColor(Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);result.append(ocr(bitmap)).append("\n\n")}
            finally{bitmap.recycle()}
          }
          if(result.length>=30000)break
        }
        return result.toString().take(30000)
      }
    }
  }
  @ReactMethod fun importDocument(promise:Promise){
    val activity=context.currentActivity
    if(activity==null||pending!=null){promise.reject("READER_BUSY","Open the reader and finish the current import first.");return}
    pending=promise
    try{activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{type="*/*";addCategory(Intent.CATEGORY_OPENABLE);putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/pdf","image/*","text/plain"))},8941)}
    catch(_:Exception){pending=null;promise.reject("READER_PICKER","The document picker could not open.")}
  }
  @ReactMethod fun startCapture(id:String,promise:Promise){
    val activity=context.currentActivity
    if(activity==null||capturePending!=null||ReaderCaptureState.active){promise.reject("READER_BUSY","Finish the current screen reading first.");return}
    if(!id.matches(Regex("[a-zA-Z0-9_-]{8,100}"))){promise.reject("READER_SESSION","Reopen the reader.");return}
    requestSession=id;capturePending=promise
    try{val manager=context.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager;activity.startActivityForResult(manager.createScreenCaptureIntent(),8942)}
    catch(_:Exception){capturePending=null;requestSession="";promise.reject("READER_CAPTURE","Screen reading could not start.")}
  }
  @ReactMethod fun captureStatus(id:String,promise:Promise){
    promise.resolve(Arguments.createMap().apply {
      val same=id==ReaderCaptureState.session
      putBoolean("active",same&&ReaderCaptureState.active&&System.currentTimeMillis()<ReaderCaptureState.deadline)
      putString("text",if(same)ReaderCaptureState.text else "")
    })
  }
  @ReactMethod fun stopCapture(){
    generation++;requestSession="";capturePending?.reject("READER_CANCELLED","Screen reading stopped.");capturePending=null
    ReaderCaptureState.clear();context.stopService(Intent(context,RiseQuestReaderService::class.java))
  }
}
