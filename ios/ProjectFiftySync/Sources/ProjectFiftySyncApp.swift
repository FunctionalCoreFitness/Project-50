import SwiftUI

@main
struct ProjectFiftySyncApp: App {
    @Environment(\.scenePhase) private var scenePhase
    private let health = HealthKitManager()

    init() {
        // Must happen before the app finishes launching per BGTaskScheduler's
        // documented requirement.
        BackgroundSyncManager.registerTask()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(health: health)
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                // The real reliability backstop — see BackgroundSyncManager's
                // doc comment. Runs every time the app comes to the
                // foreground, and catches up every day the background task
                // missed rather than only yesterday.
                if SyncCoordinator.hasUnsyncedDays {
                    Task { await SyncCoordinator.syncPendingDays(health: health) }
                }
            case .background:
                BackgroundSyncManager.scheduleNextRefresh()
            default:
                break
            }
        }
    }
}
