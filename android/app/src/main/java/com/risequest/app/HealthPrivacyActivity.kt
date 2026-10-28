package com.risequest.app
import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.widget.*
class HealthPrivacyActivity: Activity() {
 override fun onCreate(state:Bundle?) { super.onCreate(state)
  val layout=LinearLayout(this);layout.orientation=LinearLayout.VERTICAL;layout.setPadding(40,60,40,40)
  val title=TextView(this);title.text="Your sleep, your choice";title.textSize=26f;layout.addView(title)
  val text=TextView(this);text.text="RiseQuest reads sleep sessions from Health Connect only after you allow access. You choose a source before importing. Imported sleep times are saved to your RiseQuest account for your sleep history and progress. RiseQuest does not write to Health Connect, read other health types, or use health data for ads. You can revoke access in Health Connect and delete imported records in RiseQuest. Bluetooth pairing does not grant access to health data.";text.textSize=17f;text.setPadding(0,24,0,24);layout.addView(text)
  val button=Button(this);button.text="Read privacy policy";button.setOnClickListener{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://risequest-api.goldenepics.com/legal/privacy")))};layout.addView(button);setContentView(layout)
 }
}
