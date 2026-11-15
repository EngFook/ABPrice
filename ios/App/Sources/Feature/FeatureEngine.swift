import Foundation

/// The chosen app's core feature goes here, for example sending a photo to the backend
/// and returning the AI result. This placeholder lets the whole flow run end to end.
enum FeatureEngine {
    static func run() async throws -> String {
        try await Task.sleep(for: .seconds(1))
        return "The result of the app's main feature will appear here."
    }
}
