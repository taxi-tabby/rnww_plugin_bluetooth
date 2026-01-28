package expo.modules.custombackground

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BackgroundModule : Module() {
    private val taskManager = TaskManager()
    private var permissionPromise: Promise? = null
    private var isWaitingForPermission = false

    companion object {
        private const val TAG = "BackgroundModule"

        // 싱글톤 인스턴스 (Service에서 접근용)
        @Volatile
        private var instance: BackgroundModule? = null

        fun getInstance(): BackgroundModule? = instance
    }

    override fun definition() = ModuleDefinition {
        Name("CustomBackground")

        Events("onTaskEvent")

        OnCreate {
            Log.d(TAG, "Background module created")
            instance = this@BackgroundModule
        }

        OnDestroy {
            Log.d(TAG, "Background module destroyed")
            instance = null
        }

        OnActivityEntersForeground {
            // 권한 요청 후 앱이 포그라운드로 돌아왔을 때
            if (isWaitingForPermission && permissionPromise != null) {
                isWaitingForPermission = false
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    resolvePermissionStatus(permissionPromise!!)
                    permissionPromise = null
                }, 500) // 시스템 상태 업데이트 대기
            }
        }

        // 작업 등록
        AsyncFunction("registerTask") { params: Map<String, Any?>, promise: Promise ->
            try {
                val taskId = params["taskId"] as? String
                if (taskId.isNullOrEmpty()) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                val mode = params["mode"] as? String ?: "persistent"
                val interval = (params["interval"] as? Number)?.toLong() ?: 0L
                @Suppress("UNCHECKED_CAST")
                val triggers = (params["triggers"] as? List<String>) ?: emptyList()
                val scheduledTime = (params["scheduledTime"] as? Number)?.toLong()

                val task = BackgroundTask(
                    taskId = taskId,
                    mode = mode,
                    interval = interval,
                    triggers = triggers,
                    scheduledTime = scheduledTime
                )

                val result = taskManager.registerTask(task)
                promise.resolve(mapOf(
                    "success" to result,
                    "taskId" to taskId,
                    "error" to if (!result) "TASK_ALREADY_EXISTS" else null
                ))
            } catch (e: Exception) {
                Log.e(TAG, "registerTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 해제
        AsyncFunction("unregisterTask") { taskId: String, promise: Promise ->
            try {
                val result = taskManager.unregisterTask(taskId)
                promise.resolve(mapOf(
                    "success" to result,
                    "taskId" to taskId,
                    "error" to if (!result) "TASK_NOT_FOUND" else null
                ))
            } catch (e: Exception) {
                Log.e(TAG, "unregisterTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 시작
        AsyncFunction("startTask") { taskId: String, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                if (task.isRunning) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_ALREADY_RUNNING"))
                    return@AsyncFunction
                }

                // Foreground Service 시작
                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_START_TASK
                    putExtra(BackgroundService.EXTRA_TASK_ID, taskId)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }

                taskManager.setTaskRunning(taskId, true)

                // 이벤트 전송
                sendEvent("onTaskEvent", mapOf(
                    "taskId" to taskId,
                    "type" to "started",
                    "timestamp" to System.currentTimeMillis()
                ))

                promise.resolve(mapOf("success" to true, "taskId" to taskId))
            } catch (e: Exception) {
                Log.e(TAG, "startTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 중지
        AsyncFunction("stopTask") { taskId: String, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_STOP_TASK
                    putExtra(BackgroundService.EXTRA_TASK_ID, taskId)
                }
                context.startService(serviceIntent)

                taskManager.setTaskRunning(taskId, false)

                sendEvent("onTaskEvent", mapOf(
                    "taskId" to taskId,
                    "type" to "stopped",
                    "timestamp" to System.currentTimeMillis()
                ))

                promise.resolve(mapOf("success" to true, "taskId" to taskId))
            } catch (e: Exception) {
                Log.e(TAG, "stopTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 모든 작업 중지
        AsyncFunction("stopAllTasks") { promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_STOP_ALL
                }
                context.startService(serviceIntent)

                taskManager.stopAllTasks()

                promise.resolve(mapOf("success" to true))
            } catch (e: Exception) {
                Log.e(TAG, "stopAllTasks error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 알림 업데이트
        AsyncFunction("updateNotification") { params: Map<String, Any?>, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "Context not available"))
                    return@AsyncFunction
                }

                val title = params["title"] as? String ?: ""
                val body = params["body"] as? String ?: ""
                val taskId = params["taskId"] as? String

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_UPDATE_NOTIFICATION
                    putExtra(BackgroundService.EXTRA_NOTIFICATION_TITLE, title)
                    putExtra(BackgroundService.EXTRA_NOTIFICATION_BODY, body)
                    taskId?.let { putExtra(BackgroundService.EXTRA_TASK_ID, it) }
                }
                context.startService(serviceIntent)

                promise.resolve(mapOf("success" to true))
            } catch (e: Exception) {
                Log.e(TAG, "updateNotification error", e)
                promise.resolve(mapOf("success" to false, "error" to e.message))
            }
        }

        // 특정 작업 상태 조회
        AsyncFunction("getTaskStatus") { taskId: String, promise: Promise ->
            try {
                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(null)
                    return@AsyncFunction
                }

                promise.resolve(mapOf(
                    "taskId" to task.taskId,
                    "isRunning" to task.isRunning,
                    "mode" to task.mode,
                    "startedAt" to task.startedAt
                ))
            } catch (e: Exception) {
                Log.e(TAG, "getTaskStatus error", e)
                promise.resolve(null)
            }
        }

        // 전체 작업 상태 조회
        AsyncFunction("getAllTasksStatus") { promise: Promise ->
            try {
                val tasks = taskManager.getAllTasks().map { task ->
                    mapOf(
                        "taskId" to task.taskId,
                        "isRunning" to task.isRunning,
                        "mode" to task.mode,
                        "startedAt" to task.startedAt
                    )
                }

                promise.resolve(mapOf(
                    "tasks" to tasks,
                    "isAnyRunning" to tasks.any { (it["isRunning"] as? Boolean) == true }
                ))
            } catch (e: Exception) {
                Log.e(TAG, "getAllTasksStatus error", e)
                promise.resolve(mapOf("tasks" to emptyList<Any>(), "isAnyRunning" to false))
            }
        }

        // 권한 확인
        AsyncFunction("checkBackgroundPermission") { promise: Promise ->
            resolvePermissionStatus(promise)
        }

        // 권한 요청
        AsyncFunction("requestBackgroundPermission") { promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf(
                        "canRunBackground" to false,
                        "requiredPermissions" to emptyList<String>()
                    ))
                    return@AsyncFunction
                }

                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                if (powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                    // 이미 권한이 있으면 바로 반환
                    resolvePermissionStatus(promise)
                    return@AsyncFunction
                }

                // 권한이 없으면 설정 화면 열고 포그라운드 복귀 대기
                permissionPromise = promise
                isWaitingForPermission = true

                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                // 포그라운드 복귀 시 OnActivityEntersForeground에서 처리됨
            } catch (e: Exception) {
                Log.e(TAG, "requestBackgroundPermission error", e)
                isWaitingForPermission = false
                permissionPromise = null
                promise.resolve(mapOf(
                    "canRunBackground" to false,
                    "requiredPermissions" to emptyList<String>()
                ))
            }
        }
    }

    private fun resolvePermissionStatus(promise: Promise) {
        try {
            val context = appContext.reactContext ?: run {
                promise.resolve(mapOf(
                    "canRunBackground" to false,
                    "requiredPermissions" to emptyList<String>()
                ))
                return
            }

            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isIgnoringBatteryOptimizations = powerManager.isIgnoringBatteryOptimizations(context.packageName)

            val deniedPermissions = if (!isIgnoringBatteryOptimizations) {
                listOf("REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
            } else {
                emptyList()
            }

            promise.resolve(mapOf(
                "canRunBackground" to true,
                "batteryOptimizationExempt" to isIgnoringBatteryOptimizations,
                "requiredPermissions" to if (!isIgnoringBatteryOptimizations) {
                    listOf("REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
                } else {
                    emptyList()
                },
                "deniedPermissions" to deniedPermissions
            ))
        } catch (e: Exception) {
            Log.e(TAG, "resolvePermissionStatus error", e)
            promise.resolve(mapOf(
                "canRunBackground" to false,
                "requiredPermissions" to emptyList<String>()
            ))
        }
    }

    // Service에서 호출하는 이벤트 전송 메서드
    fun emitTaskEvent(taskId: String, type: String, trigger: String? = null, error: String? = null) {
        val event = mutableMapOf<String, Any?>(
            "taskId" to taskId,
            "type" to type,
            "timestamp" to System.currentTimeMillis()
        )
        trigger?.let { event["trigger"] = it }
        error?.let { event["error"] = it }

        sendEvent("onTaskEvent", event)
    }
}
