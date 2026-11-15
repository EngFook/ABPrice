import StoreKit
import SwiftUI

struct SettingsView: View {
    @Environment(SubscriptionManager.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var showManageSubscriptions = false
    @State private var showPaywall = false
    @State private var isRestoring = false

    var body: some View {
        Form {
            Section("Subscription") {
                if store.isPro {
                    Label("\(AppConfig.appName) Pro is active", systemImage: "checkmark.seal.fill")
                    Button("Manage subscription") { showManageSubscriptions = true }
                } else {
                    Button("Upgrade to Pro") { showPaywall = true }
                }
                Button(isRestoring ? "Restoring…" : "Restore purchases") {
                    Task {
                        isRestoring = true
                        await store.restore()
                        isRestoring = false
                    }
                }
                .disabled(isRestoring)
            }

            Section("Support") {
                if let reviewURL = AppConfig.writeReviewURL {
                    Link("Rate \(AppConfig.appName)", destination: reviewURL)
                }
                Link("Contact support", destination: AppConfig.supportURL)
            }

            Section("Legal") {
                Link("Privacy Policy", destination: AppConfig.privacyPolicyURL)
                Link("Terms of Use", destination: AppConfig.termsOfUseURL)
            }

            Section {
                Text("Version \(Bundle.main.appVersion)")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
        .manageSubscriptionsSheet(isPresented: $showManageSubscriptions)
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
    }
}
