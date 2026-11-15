import SwiftUI

/// Asks for permission before any user data goes to a third-party AI service
/// (App Review Guideline 5.1.2(i)). Keep the wording in line with the privacy policy.
struct AIConsentView: View {
    let onAgree: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Image(systemName: "lock.shield")
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text("Before we start")
                .font(.title.bold())
            Text("To create your result, \(AppConfig.appName) sends the photo or text you choose to \(AppConfig.aiProviderName) for processing.")
            Text("We use it only to create your result, and we never sell your data.")
                .foregroundStyle(.secondary)
            Link("Read the Privacy Policy", destination: AppConfig.privacyPolicyURL)
            Spacer()
            Button(action: onAgree) {
                Text("Agree and continue")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button("Not now", role: .cancel, action: onDecline)
                .frame(maxWidth: .infinity)
        }
        .padding(24)
    }
}
