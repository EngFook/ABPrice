import SwiftUI

/// Shows onboarding on first launch, then the home screen.
struct RootView: View {
    @AppStorage("onboarding.completed") private var onboardingCompleted = false
    @Environment(SubscriptionManager.self) private var store
    @State private var showPaywall = false

    var body: some View {
        Group {
            if onboardingCompleted {
                HomeView()
            } else {
                OnboardingView {
                    onboardingCompleted = true
                    if AppConfig.showPaywallAfterOnboarding && !store.isPro {
                        showPaywall = true
                    }
                }
            }
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
    }
}
