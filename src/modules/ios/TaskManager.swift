import Foundation

struct BackgroundTask {
    let taskId: String
    let mode: String
    let interval: Int
    let triggers: [String]
    let scheduledTime: Int?
    var isRunning: Bool = false
    var startedAt: Int64? = nil
}

class TaskManager {
    private var tasks: [String: BackgroundTask] = [:]
    private let lock = NSLock()

    func registerTask(_ task: BackgroundTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        if tasks[task.taskId] != nil {
            return false
        }
        tasks[task.taskId] = task
        return true
    }

    func unregisterTask(taskId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.removeValue(forKey: taskId) != nil
    }

    func getTask(taskId: String) -> BackgroundTask? {
        lock.lock()
        defer { lock.unlock() }

        return tasks[taskId]
    }

    func getAllTasks() -> [BackgroundTask] {
        lock.lock()
        defer { lock.unlock() }

        return Array(tasks.values)
    }

    func getRunningTasks() -> [BackgroundTask] {
        lock.lock()
        defer { lock.unlock() }

        return tasks.values.filter { $0.isRunning }
    }

    func setTaskRunning(taskId: String, running: Bool) {
        lock.lock()
        defer { lock.unlock() }

        if var task = tasks[taskId] {
            task.isRunning = running
            task.startedAt = running ? Int64(Date().timeIntervalSince1970 * 1000) : nil
            tasks[taskId] = task
        }
    }

    func stopAllTasks() {
        lock.lock()
        defer { lock.unlock() }

        for taskId in tasks.keys {
            if var task = tasks[taskId] {
                task.isRunning = false
                task.startedAt = nil
                tasks[taskId] = task
            }
        }
    }

    func hasRunningTasks() -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.values.contains { $0.isRunning }
    }
}
