import StoreKit
import SwiftUI

/// Main screen. The flow is shared by every app: consent, then free quota, then paywall, then the feature.
/// Only `FeatureEngine` and the copy in `AppConfig` change per app.
struct HomeView: View {
    private enum ActiveSheet: Identifiable {
        case consent, paywall, settings
        var id: Self { self }
    }

    @Environment(SubscriptionManager.self) private var store
    @Environment(UsageQuota.self) private var quota
    @Environment(\.requestReview) private var requestReview
    @AppStorage("consent.ai.accepted") private var consentAccepted = false

    @State private var activeSheet: ActiveSheet?
    @State private var startAfterSheetCloses = false
    @State private var isWorking = false
    @State private var result: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: AppConfig.homeSystemImage)
                    .font(.system(size: 80))
                    .foregroundStyle(.tint)
                Text(AppConfig.homeHeadline)
                    .font(.title.bold())
                    .multilineTextAlignment(.center)
                if let result {
                    Text(result)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                Spacer()
                Button(action: start) {
                    Group {
                        if isWorking {
                            ProgressView()
                        } else {
                            Text(AppConfig.primaryActionTitle)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isWorking)
                if !store.isPro {
                    Text("\(quota.remaining) free tries left")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        activeSheet = .settings
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
            }
        }
        .sheet(item: $activeSheet, onDismiss: sheetClosed) { sheet in
            switch sheet {
            case .consent:
                AIConsentView(
                    onAgree: {
                        consentAccepted = true
                        startAfterSheetCloses = true
                        activeSheet = nil
                    },
                    onDecline: { activeSheet = nil }
                )
            case .paywall:
                PaywallView()
            case .settings:
                NavigationStack { SettingsView() }
            }
        }
    }

    private func sheetClosed() {
        if startAfterSheetCloses {
            startAfterSheetCloses = false
            start()
        }
    }

    private func start() {
        guard consentAccepted else {
            activeSheet = .consent
            return
        }
        guard quota.canUse(isPro: store.isPro) else {
            activeSheet = .paywall
            return
        }
        Task {
            isWorking = true
            defer { isWorking = false }
            do {
                result = try await FeatureEngine.run()
                quota.recordUse(isPro: store.isPro)
                if ReviewPrompter.recordSuccess() {
                    requestReview()
                }
            } catch {
                result = "Something went wrong. Please try again."
            }
        }
    }
}
