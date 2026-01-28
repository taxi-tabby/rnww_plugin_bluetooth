import ExpoModulesCore
import UIKit
import BackgroundTasks

public class BackgroundModule: Module {
    private var taskManager = TaskManager()
    private var headlessWebViewManager: HeadlessWebViewManager?
    private var permissionPromise: Promise?
    private var foregroundObserver: NSObjectProtocol?

    public func definition() -> ModuleDefinition {
        Name("CustomBackground")

        Events("onTaskEvent")

        OnCreate {
            self.headlessWebViewManager = HeadlessWebViewManager()
            self.registerBackgroundTasks()
        }

        OnDestroy {
            self.headlessWebViewManager?.destroy()
        }

        // 작업 등록
        AsyncFunction("registerTask") { (params: [String: Any], promise: Promise) in
            guard let taskId = params["taskId"] as? String, !taskId.isEmpty else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            let mode = params["mode"] as? String ?? "persistent"
            let interval = params["interval"] as? Int ?? 0
            let triggers = params["triggers"] as? [String] ?? []
            let scheduledTime = params["scheduledTime"] as? Int

            let task = BackgroundTask(
                taskId: taskId,
                mode: mode,
                interval: interval,
                triggers: triggers,
                scheduledTime: scheduledTime
            )

            let result = self.taskManager.registerTask(task)
            promise.resolve([
                "success": result,
                "taskId": taskId,
                "error": result ? nil : "TASK_ALREADY_EXISTS"
            ])
        }

        // 작업 해제
        AsyncFunction("unregisterTask") { (taskId: String, promise: Promise) in
            let result = self.taskManager.unregisterTask(taskId: taskId)
            promise.resolve([
                "success": result,
                "taskId": taskId,
                "error": result ? nil : "TASK_NOT_FOUND"
            ])
        }

        // 작업 시작
        AsyncFunction("startTask") { (taskId: String, promise: Promise) in
            guard let task = self.taskManager.getTask(taskId: taskId) else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            if task.isRunning {
                promise.resolve(["success": false, "error": "TASK_ALREADY_RUNNING"])
                return
            }

            self.headlessWebViewManager?.initialize()
            self.taskManager.setTaskRunning(taskId: taskId, running: true)

            if task.interval > 0 {
                self.scheduleIntervalTask(taskId: taskId, interval: TimeInterval(task.interval) / 1000.0)
            }

            self.sendEvent("onTaskEvent", [
                "taskId": taskId,
                "type": "started",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])

            promise.resolve(["success": true, "taskId": taskId])
        }

        // 작업 중지
        AsyncFunction("stopTask") { (taskId: String, promise: Promise) in
            guard self.taskManager.getTask(taskId: taskId) != nil else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            self.taskManager.setTaskRunning(taskId: taskId, running: false)

            self.sendEvent("onTaskEvent", [
                "taskId": taskId,
                "type": "stopped",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])

            promise.resolve(["success": true, "taskId": taskId])
        }

        // 모든 작업 중지
        AsyncFunction("stopAllTasks") { (promise: Promise) in
            self.taskManager.stopAllTasks()
            self.headlessWebViewManager?.destroy()
            promise.resolve(["success": true])
        }

        // 알림 업데이트
        AsyncFunction("updateNotification") { (params: [String: Any], promise: Promise) in
            // iOS는 로컬 알림 사용
            promise.resolve(["success": true])
        }

        // 특정 작업 상태 조회
        AsyncFunction("getTaskStatus") { (taskId: String, promise: Promise) in
            guard let task = self.taskManager.getTask(taskId: taskId) else {
                promise.resolve(nil)
                return
            }

            promise.resolve([
                "taskId": task.taskId,
                "isRunning": task.isRunning,
                "mode": task.mode,
                "startedAt": task.startedAt as Any
            ])
        }

        // 전체 작업 상태 조회
        AsyncFunction("getAllTasksStatus") { (promise: Promise) in
            let tasks = self.taskManager.getAllTasks().map { task in
                [
                    "taskId": task.taskId,
                    "isRunning": task.isRunning,
                    "mode": task.mode,
                    "startedAt": task.startedAt as Any
                ]
            }

            promise.resolve([
                "tasks": tasks,
                "isAnyRunning": tasks.contains { ($0["isRunning"] as? Bool) == true }
            ])
        }

        // 권한 확인
        AsyncFunction("checkBackgroundPermission") { (promise: Promise) in
            self.resolvePermissionStatus(promise: promise)
        }

        // 권한 요청
        AsyncFunction("requestBackgroundPermission") { (promise: Promise) in
            // 기존 observer 정리
            if let observer = self.foregroundObserver {
                NotificationCenter.default.removeObserver(observer)
                self.foregroundObserver = nil
            }

            // iOS에서는 직접 권한 요청 불가, 설정으로 안내
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                self.resolvePermissionStatus(promise: promise)
                return
            }

            // 앱이 포그라운드로 돌아올 때 상태 확인
            self.foregroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                // observer 제거
                if let observer = self?.foregroundObserver {
                    NotificationCenter.default.removeObserver(observer)
                    self?.foregroundObserver = nil
                }

                // 약간의 딜레이 후 상태 확인 (시스템 상태 업데이트 대기)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.resolvePermissionStatus(promise: promise)
                }
            }

            // 설정 앱 열기
            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }
    }

    private func resolvePermissionStatus(promise: Promise) {
        let status = UIApplication.shared.backgroundRefreshStatus
        let canRun = status == .available
        let isDenied = status == .denied
        let isRestricted = status == .restricted

        var deniedPermissions: [String] = []
        if isDenied {
            deniedPermissions.append("Background App Refresh (Denied)")
        }
        if isRestricted {
            deniedPermissions.append("Background App Refresh (Restricted)")
        }

        promise.resolve([
            "canRunBackground": canRun,
            "requiredPermissions": canRun ? [] : ["Background App Refresh"],
            "deniedPermissions": deniedPermissions
        ])
    }

    private func registerBackgroundTasks() {
        if #available(iOS 13.0, *) {
            BGTaskScheduler.shared.register(
                forTaskWithIdentifier: "expo.modules.custombackground.refresh",
                using: nil
            ) { task in
                self.handleBackgroundTask(task: task as! BGAppRefreshTask)
            }
        }
    }

    @available(iOS 13.0, *)
    private func handleBackgroundTask(task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // 이벤트 전송
        for runningTask in taskManager.getRunningTasks() {
            sendEvent("onTaskEvent", [
                "taskId": runningTask.taskId,
                "type": "trigger",
                "trigger": "interval",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])
        }

        task.setTaskCompleted(success: true)
        scheduleNextBackgroundTask()
    }

    private func scheduleIntervalTask(taskId: String, interval: TimeInterval) {
        if #available(iOS 13.0, *) {
            scheduleNextBackgroundTask()
        }
    }

    @available(iOS 13.0, *)
    private func scheduleNextBackgroundTask() {
        let request = BGAppRefreshTaskRequest(identifier: "expo.modules.custombackground.refresh")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60)

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background task: \(error)")
        }
    }
}
