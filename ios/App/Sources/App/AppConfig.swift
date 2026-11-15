import Foundation

/// Everything that changes from one app to the next lives here.
/// The rest of the foundation (onboarding, paywall, subscriptions, consent, settings) is shared.
enum AppConfig {
    // MARK: Identity

    static let appName = "AppName"

    /// Numeric App Store ID from App Store Connect. Leave empty until the app record exists.
    static let appStoreID = ""

    // MARK: Subscriptions

    /// Subscription group ID from App Store Connect (or from the local StoreKit configuration file).
    static let subscriptionGroupID = "REPLACE_WITH_GROUP_ID"

    /// Shown on the paywall. Keep every claim accurate (App Review Guideline 3.1.2).
    static let proBenefits = [
        "Full access to every feature",
        "Faster results",
        "New features as they ship",
    ]

    /// How many times a free user can use the core feature before the paywall appears.
    static let freeUses = 3

    /// Show the paywall once, right after onboarding.
    static let showPaywallAfterOnboarding = true

    // MARK: Onboarding and home copy

    static let onboardingPages: [OnboardingPage] = [
        OnboardingPage(
            systemImage: "sparkles",
            title: "Welcome",
            message: "Say in one sentence what problem this app solves."
        ),
        OnboardingPage(
            systemImage: "camera.viewfinder",
            title: "How it works",
            message: "Show the one action the user takes."
        ),
        OnboardingPage(
            systemImage: "checkmark.seal",
            title: "What you get",
            message: "Describe the result they get in seconds."
        ),
    ]

    static let homeSystemImage = "sparkles"
    static let homeHeadline = "One tap to get your result"
    static let primaryActionTitle = "Try it"

    // MARK: Links

    static let privacyPolicyURL = URL(string: "https://example.com/privacy")!

    /// Apple's standard EULA. Replace if the app ships its own terms.
    static let termsOfUseURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!

    static let supportURL = URL(string: "mailto:support@example.com")!

    static var writeReviewURL: URL? {
        appStoreID.isEmpty ? nil : URL(string: "https://apps.apple.com/app/id\(appStoreID)?action=write-review")
    }

    // MARK: AI disclosure (App Review Guideline 5.1.2(i))

    /// Name the third-party AI provider that receives user data, e.g. "OpenAI".
    static let aiProviderName = "a third-party AI service"
}
