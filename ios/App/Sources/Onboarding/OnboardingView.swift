import SwiftUI

struct OnboardingPage {
    let systemImage: String
    let title: String
    let message: String
}

struct OnboardingView: View {
    private let onFinish: () -> Void
    private let pages = AppConfig.onboardingPages
    @State private var index = 0

    init(onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
    }

    private var isLastPage: Bool { index >= pages.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $index) {
                ForEach(Array(pages.enumerated()), id: \.offset) { offset, page in
                    VStack(spacing: 24) {
                        Image(systemName: page.systemImage)
                            .font(.system(size: 72))
                            .foregroundStyle(.tint)
                        Text(page.title)
                            .font(.largeTitle.bold())
                            .multilineTextAlignment(.center)
                        Text(page.message)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(32)
                    .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            Button {
                if isLastPage {
                    onFinish()
                } else {
                    withAnimation { index += 1 }
                }
            } label: {
                Text(isLastPage ? "Get started" : "Continue")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)
        }
    }
}
