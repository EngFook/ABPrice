import SwiftUI

@main
struct MainApp: App {
    @State private var store = SubscriptionManager()
    @State private var quota = UsageQuota()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(quota)
                .task {
                    await store.refreshEntitlements()
                }
        }
    }
}
