package expo.modules.custombackground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed - checking for tasks to restart")

            // TODO: SharedPreferences에서 재시작 필요한 task 확인
            // WorkManager를 통해 재시작 예약
        }
    }
}
