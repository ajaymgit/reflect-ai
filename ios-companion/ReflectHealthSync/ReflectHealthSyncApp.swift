import SwiftUI

@main
struct ReflectHealthSyncApp: App {
    // Owns the HealthKit store + sync logic for the whole app lifetime, so
    // background delivery callbacks (which can fire while ContentView isn't
    // on screen) have a stable place to run against.
    @StateObject private var healthKitManager = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthKitManager)
        }
    }
}
