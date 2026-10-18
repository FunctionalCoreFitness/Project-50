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
            // The dashboard is the app; the sync screen is a utility tab.
            TabView {
                DashboardView()
                    .tabItem { Label("Dashboard", systemImage: "chart.bar.xaxis") }
                ContentView(health: health)
                    .tabItem { Label("Sync", systemImage: "arrow.triangle.2.circlepath") }
            }
            .preferredColorScheme(.dark)
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
                    Task {
                        _ = await SyncCoordinator.syncPendingDays(health: health)
                        // Reload so the days just uploaded show on the
                        // dashboard instead of the values from before sync.
                        NotificationCenter.default.post(name: .dashboardShouldReload, object: nil)
                    }
                }
            case .background:
                BackgroundSyncManager.scheduleNextRefresh()
            default:
                break
            }
        }
    }
}
