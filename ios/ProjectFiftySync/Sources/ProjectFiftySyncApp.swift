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
        // `initial: true` matters more than it looks. Without it this fires
        // only on a *change* of phase, and a cold launch sets .active as the
        // initial value rather than changing to it — so opening the app from
        // scratch synced nothing, and only backgrounding it and returning did.
        // That is the common case: tap the icon, glance, close.
        .onChange(of: scenePhase, initial: true) { _, newPhase in
            switch newPhase {
            case .active:
                // The real reliability backstop — see BackgroundSyncManager's
                // doc comment. Runs on launch and every return to the
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
