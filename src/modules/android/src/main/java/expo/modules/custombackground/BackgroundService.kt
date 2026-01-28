package expo.modules.custombackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

class BackgroundService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val intervalRunnables = mutableMapOf<String, Runnable>()
    private var headlessWebViewManager: HeadlessWebViewManager? = null

    companion object {
        private const val TAG = "BackgroundService"
        private const val CHANNEL_ID = "background_service_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START_TASK = "START_TASK"
        const val ACTION_STOP_TASK = "STOP_TASK"
        const val ACTION_STOP_ALL = "STOP_ALL"
        const val ACTION_UPDATE_NOTIFICATION = "UPDATE_NOTIFICATION"

        const val EXTRA_TASK_ID = "task_id"
        const val EXTRA_NOTIFICATION_TITLE = "notification_title"
        const val EXTRA_NOTIFICATION_BODY = "notification_body"
    }

    private var notificationTitle = "백그라운드 실행 중"
    private var notificationBody = "앱이 백그라운드에서 작업을 실행하고 있습니다."

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        headlessWebViewManager = HeadlessWebViewManager(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TASK -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID)
                if (taskId != null) {
                    startTask(taskId)
                }
            }
            ACTION_STOP_TASK -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID)
                if (taskId != null) {
                    stopTask(taskId)
                }
            }
            ACTION_STOP_ALL -> {
                stopAllTasks()
            }
            ACTION_UPDATE_NOTIFICATION -> {
                intent.getStringExtra(EXTRA_NOTIFICATION_TITLE)?.let { notificationTitle = it }
                intent.getStringExtra(EXTRA_NOTIFICATION_BODY)?.let { notificationBody = it }
                updateNotification()
            }
        }

        return START_STICKY
    }

    private fun startTask(taskId: String) {
        Log.d(TAG, "Starting task: $taskId")

        // Foreground Service로 전환
        startForeground(NOTIFICATION_ID, createNotification())

        // Headless WebView 초기화
        headlessWebViewManager?.initialize()

        // 간격 기반 트리거 설정
        val module = BackgroundModule.getInstance()
        val task = module?.let { /* taskManager에서 task 조회 */ }

        // 기본 간격 트리거 (테스트용)
        setupIntervalTrigger(taskId, 60000) // 1분 간격
    }

    private fun stopTask(taskId: String) {
        Log.d(TAG, "Stopping task: $taskId")

        // 간격 트리거 제거
        intervalRunnables[taskId]?.let { runnable ->
            handler.removeCallbacks(runnable)
            intervalRunnables.remove(taskId)
        }

        // 실행 중인 작업이 없으면 서비스 종료
        if (intervalRunnables.isEmpty()) {
            stopSelf()
        }
    }

    private fun stopAllTasks() {
        Log.d(TAG, "Stopping all tasks")

        intervalRunnables.forEach { (_, runnable) ->
            handler.removeCallbacks(runnable)
        }
        intervalRunnables.clear()

        headlessWebViewManager?.destroy()
        stopSelf()
    }

    private fun setupIntervalTrigger(taskId: String, interval: Long) {
        if (interval <= 0) return

        val runnable = object : Runnable {
            override fun run() {
                Log.d(TAG, "Interval trigger for task: $taskId")

                // 이벤트 전송
                BackgroundModule.getInstance()?.emitTaskEvent(taskId, "trigger", "interval")

                // 다음 실행 예약
                handler.postDelayed(this, interval)
            }
        }

        intervalRunnables[taskId] = runnable
        handler.postDelayed(runnable, interval)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "백그라운드 작업 실행 알림"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
            PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(notificationTitle)
            .setContentText(notificationBody)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        headlessWebViewManager?.destroy()
        intervalRunnables.forEach { (_, runnable) ->
            handler.removeCallbacks(runnable)
        }
        intervalRunnables.clear()
    }
}
