import Foundation

enum APIClientError: Error {
    case missingToken
    case invalidResponse
    case serverError(status: Int)
}

struct APIClient {
    /// Set this to your deployed Cloud Run URL, e.g.
    /// "https://project50-healthkit-xxxxx-uc.a.run.app". Left as a plain
    /// constant rather than a build setting to keep this a one-file change
    /// for a single-user app — revisit if this ever needs per-environment
    /// (dev/prod) builds.
    static let baseURL = URL(string: "https://REPLACE_WITH_YOUR_CLOUD_RUN_URL")!

    /// Uploads one day's metrics. Throws on any non-2xx response so callers
    /// (background task and foreground fallback alike) can distinguish
    /// "sent, backend rejected it" from "never sent."
    static func sync(date: String, metrics: [String: Double]) async throws {
        guard let token = KeychainStore.loadIngestToken(), !token.isEmpty else {
            throw APIClientError.missingToken
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("v1/healthkit-sync"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "date": date,
            "metrics": metrics,
        ])

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            throw APIClientError.serverError(status: http.statusCode)
        }
    }
}
