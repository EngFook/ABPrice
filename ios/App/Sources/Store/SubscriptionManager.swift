import Foundation
import Observation
import StoreKit

/// Tracks whether the user has an active subscription, using StoreKit 2.
/// Purchases happen in `PaywallView` (Apple's SubscriptionStoreView).
@MainActor
@Observable
final class SubscriptionManager {
    private(set) var isPro = false

    @ObservationIgnored private var updatesTask: Task<Void, Never>?

    init() {
        // Renewals, refunds, Ask to Buy approvals and purchases made on other devices arrive here.
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                }
                await self?.refreshEntitlements()
            }
        }
    }

    func refreshEntitlements() async {
        var active = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productType == .autoRenewable,
               transaction.revocationDate == nil {
                active = true
            }
        }
        isPro = active
    }

    /// Handles the result of a purchase started from a StoreKit view.
    /// Returns true when the user ends up with an active subscription.
    func handle(_ result: Result<Product.PurchaseResult, Error>) async -> Bool {
        guard case .success(let purchaseResult) = result,
              case .success(let verification) = purchaseResult,
              case .verified(let transaction) = verification else {
            return false
        }
        await transaction.finish()
        await refreshEntitlements()
        return isPro
    }

    func restore() async {
        try? await AppStore.sync()
        await refreshEntitlements()
    }
}
