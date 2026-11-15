import Foundation
import Observation

/// Counts free uses of the core feature on this device.
/// The backend must enforce its own limits too: this counter resets if the app is reinstalled.
@MainActor
@Observable
final class UsageQuota {
    private let storageKey = "usage.freeUsesConsumed"
    private(set) var used: Int

    init() {
        used = UserDefaults.standard.integer(forKey: storageKey)
    }

    var remaining: Int { max(0, AppConfig.freeUses - used) }

    func canUse(isPro: Bool) -> Bool {
        isPro || remaining > 0
    }

    func recordUse(isPro: Bool) {
        guard !isPro else { return }
        used += 1
        UserDefaults.standard.set(used, forKey: storageKey)
    }
}
