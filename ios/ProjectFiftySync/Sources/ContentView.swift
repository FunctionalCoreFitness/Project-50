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
                    Button {
                        Task { await syncNow() }
                    } label: {
                        if isSyncing {
                            ProgressView()
                        } else {
                            Text("Sync Yesterday Now")
                        }
                    }
                    .disabled(isSyncing)
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

    private func syncNow() async {
        isSyncing = true
        defer { isSyncing = false }
        let success = await SyncCoordinator.syncYesterday(health: health)
        lastSyncResult = success ? "Synced." : "Sync failed or no data — check that HealthKit access is granted and the token is saved."
    }
}
