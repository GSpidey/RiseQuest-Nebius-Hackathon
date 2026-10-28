package com.risequest.app

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.time.Instant
import java.time.temporal.ChronoUnit

class RiseQuestHealthDevices(private val context: ReactApplicationContext): ReactContextBaseJavaModule(context), ActivityEventListener {
 private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
 private val handler = Handler(Looper.getMainLooper())
 private var scan: ScanCallback? = null
 private var scanPromise: Promise? = null
 private var permissionPromise: Promise? = null
 private val permissions = setOf(HealthPermission.getReadPermission(SleepSessionRecord::class))
 private val permissionContract = PermissionController.createRequestPermissionResultContract()
 init { context.addActivityEventListener(this) }
 override fun getName() = "RiseQuestHealthDevices"
 private fun adapter() = (context.getSystemService(android.content.Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
 private fun canScan(): Boolean = if(Build.VERSION.SDK_INT >= 31) context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED else context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
 @ReactMethod fun scanDevices(promise: Promise) {
  if (!canScan()) { promise.reject("PERMISSION", "Allow Nearby devices to search for your watch."); return }
  if(scanPromise != null) { promise.reject("BUSY", "A search is already running."); return }
  try {
   val bluetooth = adapter()
   if(bluetooth == null || !bluetooth.isEnabled) { promise.reject("BLUETOOTH_OFF", "Turn on Bluetooth in Settings, then search again."); return }
   val found = linkedMapOf<String, WritableMap>()
   fun add(device: android.bluetooth.BluetoothDevice, rssi: Int?) {
    val map = Arguments.createMap(); map.putString("id",device.address); map.putString("name",device.name ?: "Nearby Bluetooth device")
    map.putBoolean("paired",device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED)
    if(rssi != null)map.putInt("rssi",rssi)
    found[device.address] = map
   }
   bluetooth.bondedDevices.forEach { add(it,null) }
   val scanner = bluetooth.bluetoothLeScanner
   if(scanner == null) { promise.reject("UNAVAILABLE", "Bluetooth scanning is unavailable."); return }
   val callback = object: ScanCallback() {
    override fun onScanResult(type: Int, result: ScanResult) { try { add(result.device,result.rssi) } catch(_:SecurityException) {} }
    override fun onScanFailed(code: Int) { finishScan(); promise.reject("SCAN_FAILED", "Search could not start. Check Bluetooth and try again.") }
   }
   scan = callback; scanPromise = promise; scanner.startScan(callback)
   handler.postDelayed({ if(scan === callback) { val result=Arguments.createArray(); found.values.forEach { result.pushMap(it) }; finishScan(); promise.resolve(result) } },10000)
  } catch(e:Exception) { finishScan(); promise.reject("SCAN_FAILED", "Could not search. Check Bluetooth permissions.",e) }
 }
 private fun finishScan() { try { scan?.let { adapter()?.bluetoothLeScanner?.stopScan(it) } } catch(_:Exception) {}; scan=null; scanPromise=null }
 @ReactMethod fun cancelScan() { val promise=scanPromise; finishScan(); promise?.reject("CANCELLED","Search cancelled") }
 @ReactMethod fun pairDevice(address: String, promise: Promise) {
  try { val device=adapter()?.getRemoteDevice(address) ?: throw IllegalStateException()
   if(device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED) promise.resolve("paired")
   else if(device.createBond())promise.resolve("requested") else promise.reject("PAIR_FAILED","Use your watch's companion app to pair this device.")
  } catch(e:Exception) { promise.reject("PAIR_FAILED","Pair this device in Bluetooth Settings or its companion app.",e) }
 }
 @ReactMethod fun openSettings(promise:Promise) { try { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));promise.resolve(true) } catch(e:Exception){promise.reject("SETTINGS","Could not open Bluetooth Settings",e)} }
 @ReactMethod fun healthStatus(promise:Promise) { scope.launch { try {
  val status=HealthConnectClient.getSdkStatus(context); val map=Arguments.createMap()
  map.putString("status",when(status){HealthConnectClient.SDK_AVAILABLE->"available";HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED->"install";else->"unavailable"})
  map.putBoolean("granted",status==HealthConnectClient.SDK_AVAILABLE && HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().containsAll(permissions));promise.resolve(map)
 }catch(e:Exception){promise.reject("HEALTH_STATUS","Could not check Health Connect",e)} } }
 @ReactMethod fun requestSleepPermission(promise:Promise) { scope.launch { try {
  if(permissionPromise!=null){promise.reject("BUSY","Permission request is already open");return@launch}
  val activity=context.currentActivity ?: throw IllegalStateException("Open RiseQuest and try again")
  if(HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().containsAll(permissions)){promise.resolve(true);return@launch}
  permissionPromise=promise;activity.startActivityForResult(permissionContract.createIntent(context,permissions),6314)
 }catch(e:Exception){permissionPromise=null;promise.reject("HEALTH_PERMISSION","Could not open sleep permissions. Install or update Health Connect.",e)} } }
 override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?) { if(requestCode==6314){permissionPromise?.resolve(permissionContract.parseResult(resultCode,data).containsAll(permissions));permissionPromise=null} }
 override fun onNewIntent(intent:Intent) {}
 @ReactMethod fun readSleep(promise:Promise) { scope.launch { try {
  val client=HealthConnectClient.getOrCreate(context)
  if(!client.permissionController.getGrantedPermissions().containsAll(permissions)){promise.reject("HEALTH_PERMISSION","Sleep permission is required. Connect again to allow access.");return@launch}
  val result=Arguments.createArray();var page:String?=null;var pages=0
  do {
   val response=client.readRecords(ReadRecordsRequest(SleepSessionRecord::class,timeRangeFilter=TimeRangeFilter.between(Instant.now().minus(30,ChronoUnit.DAYS),Instant.now()),pageSize=500,pageToken=page))
   response.records.forEach { record -> val map=Arguments.createMap();val source=record.metadata.dataOrigin.packageName
    val label=try { context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(source,0)).toString() }catch(_:Exception){source}
    map.putString("id",record.metadata.id);map.putString("source",source);map.putString("sourceName",label);map.putString("bedtimeAt",record.startTime.toString());map.putString("wakeAt",record.endTime.toString());result.pushMap(map)
   }; page=response.pageToken;pages++
  }while(page!=null && pages<10)
  promise.resolve(result)
 }catch(e:Exception){promise.reject("READ_SLEEP","Sleep data could not be read. Check Health Connect permissions and try again.",e)} } }
 @ReactMethod fun openHealth(promise:Promise){try { val intent=if(HealthConnectClient.getSdkStatus(context)==HealthConnectClient.SDK_AVAILABLE)HealthConnectClient.getHealthConnectManageDataIntent(context) else Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")); context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));promise.resolve(true) }catch(e:Exception){promise.reject("HEALTH_SETTINGS","Open Health Connect from Android Settings.",e)} }
 override fun invalidate(){cancelScan();permissionPromise?.reject("CANCELLED","Screen closed");permissionPromise=null;scope.cancel();context.removeActivityEventListener(this);super.invalidate()}
}
