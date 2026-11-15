import StoreKit
import SwiftUI

/// Apple's built-in subscription screen with our marketing content on top.
/// It shows prices, renewal terms, restore and the legal links that App Review expects.
struct PaywallView: View {
    @Environment(SubscriptionManager.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        SubscriptionStoreView(groupID: AppConfig.subscriptionGroupID) {
            VStack(spacing: 16) {
                Image(systemName: "sparkles")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
                Text("\(AppConfig.appName) Pro")
                    .font(.largeTitle.bold())
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(AppConfig.proBenefits, id: \.self) { benefit in
                        Label(benefit, systemImage: "checkmark.circle.fill")
                    }
                }
            }
            .padding()
        }
        .subscriptionStoreButtonLabel(.multiline)
        .storeButton(.visible, for: .restorePurchases, .cancellation)
        .subscriptionStorePolicyDestination(url: AppConfig.termsOfUseURL, for: .termsOfService)
        .subscriptionStorePolicyDestination(url: AppConfig.privacyPolicyURL, for: .privacyPolicy)
        .onInAppPurchaseCompletion { _, result in
            if await store.handle(result) {
                dismiss()
            }
        }
    }
}
