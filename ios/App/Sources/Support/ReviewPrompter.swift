import Foundation

/// Decides when to ask for an App Store rating: right after a successful result,
/// on the 2nd and 10th success. iOS still limits how often the prompt actually appears.
enum ReviewPrompter {
    private static let storageKey = "review.successCount"

    static func recordSuccess() -> Bool {
        let count = UserDefaults.standard.integer(forKey: storageKey) + 1
        UserDefaults.standard.set(count, forKey: storageKey)
        return count == 2 || count == 10
    }
}
