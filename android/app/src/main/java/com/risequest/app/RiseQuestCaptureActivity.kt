package com.risequest.app

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper

// Opening this transparent activity dismisses the notification shade before the
// single user-requested frame is recognized. It never requests a second token.
class RiseQuestCaptureActivity:Activity(){
  override fun onCreate(state:Bundle?){
    super.onCreate(state)
    val session=ReaderCaptureState.session
    finish();overridePendingTransition(0,0)
    Handler(Looper.getMainLooper()).postDelayed({
      if(session.isNotEmpty()&&session==ReaderCaptureState.session&&ReaderCaptureState.active&&System.currentTimeMillis()<ReaderCaptureState.deadline)ReaderCaptureState.requested=true
    },500)
  }
}
