package expo.modules.custombackground

import java.util.concurrent.ConcurrentHashMap

data class BackgroundTask(
    val taskId: String,
    val mode: String,
    val interval: Long,
    val triggers: List<String>,
    val scheduledTime: Long?,
    var isRunning: Boolean = false,
    var startedAt: Long? = null
)

class TaskManager {
    private val tasks = ConcurrentHashMap<String, BackgroundTask>()

    fun registerTask(task: BackgroundTask): Boolean {
        if (tasks.containsKey(task.taskId)) {
            return false
        }
        tasks[task.taskId] = task
        return true
    }

    fun unregisterTask(taskId: String): Boolean {
        return tasks.remove(taskId) != null
    }

    fun getTask(taskId: String): BackgroundTask? {
        return tasks[taskId]
    }

    fun getAllTasks(): List<BackgroundTask> {
        return tasks.values.toList()
    }

    fun getRunningTasks(): List<BackgroundTask> {
        return tasks.values.filter { it.isRunning }
    }

    fun setTaskRunning(taskId: String, running: Boolean) {
        tasks[taskId]?.let { task ->
            tasks[taskId] = task.copy(
                isRunning = running,
                startedAt = if (running) System.currentTimeMillis() else null
            )
        }
    }

    fun stopAllTasks() {
        tasks.keys.forEach { taskId ->
            setTaskRunning(taskId, false)
        }
    }

    fun hasRunningTasks(): Boolean {
        return tasks.values.any { it.isRunning }
    }
}
