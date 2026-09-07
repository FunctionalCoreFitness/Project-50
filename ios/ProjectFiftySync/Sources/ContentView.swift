import SwiftUI

/// Deliberately minimal per scope — this is a background sync utility, not a
/// second dashboard. One screen: grant HealthKit access, see last sync
/// status, force a sync for testing.
struct ContentView: View {
    let health: HealthKitManager

    @State private var authorizationRequested = false
    @State private var authorizationError: String?
    @State private var isSyncing = false
    @State private var lastSyncResult: String?
    @State private var ingestTokenInput: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("HealthKit Access") {
                    Button(authorizationRequested ? "Re-request Access" : "Grant HealthKit Access") {
                        Task { await requestAuthorization() }
                    }
                    if let authorizationError {
                        Text(authorizationError).foregroundStyle(.red).font(.footnote)
                    }
                }

                Section("Backend Ingest Token") {
                    SecureField("Paste the ingest token", text: $ingestTokenInput)
                    Button("Save Token to Keychain") {
                        KeychainStore.saveIngestToken(ingestTokenInput)
                        ingestTokenInput = ""
                    }
                    .disabled(ingestTokenInput.isEmpty)
                    Text(KeychainStore.loadIngestToken() == nil ? "No token stored." : "Token stored.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Sync Status") {
                    if let last = SyncCoordinator.lastSuccessfulSyncAt {
                        Text("Last successful sync: \(last.formatted(date: .abbreviated, time: .shortened))")
                    } else {
                        Text("Never synced yet.")
                            .foregroundStyle(.secondary)
                    }
                    // Which day the server actually has is the useful fact.
                    // "Last sync 4:45pm" told us nothing about whether
                    // yesterday had made it.
                    if let day = SyncCoordinator.lastSyncedDay {
                        Text("Uploaded through \(SyncCoordinator.dayString(day)).")
                            .font(.footnote)
                            .foregroundStyle(SyncCoordinator.hasUnsyncedDays ? Color.orange : Color.secondary)
                    }
                    Button {
                        Task { await syncNow(force: false) }
                    } label: {
                        if isSyncing {
                            ProgressView()
                        } else {
                            Text("Sync Now")
                        }
                    }
                    .disabled(isSyncing)

                    Button("Re-sync Last \(SyncCoordinator.backfillWindowDays) Days") {
                        Task { await syncNow(force: true) }
                    }
                    .disabled(isSyncing)
                    Text("Use the re-sync after granting new Health permissions — days already marked done are skipped otherwise.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    if let lastSyncResult {
                        Text(lastSyncResult).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Project 50 Sync")
        }
    }

    private func requestAuthorization() async {
        do {
            try await health.requestAuthorization()
            authorizationRequested = true
            authorizationError = nil
        } catch {
            authorizationError = "Authorization failed: \(error.localizedDescription)"
        }
    }

    private func syncNow(force: Bool) async {
        isSyncing = true
        defer { isSyncing = false }
        let outcome = await SyncCoordinator.syncPendingDays(health: health, force: force)
        lastSyncResult = outcome.summary
    }
}
