import SwiftUI

@main
struct ReflectHealthSyncApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

private struct QRSetupPayload: Decodable {
    let serverURL: String
    let token: String
}

struct ContentView: View {
    @AppStorage("serverURL") private var serverURL = ""
    @AppStorage("syncToken") private var syncToken = ""
    @AppStorage("hk_connected") private var isConnected = false
    @AppStorage("lastSyncEpoch") private var lastSyncEpoch: Double = 0
    @State private var isSyncing = false
    @State private var statusMessage = ""
    @State private var showScanner = false

    private var lastSyncDate: Date? {
        lastSyncEpoch > 0 ? Date(timeIntervalSince1970: lastSyncEpoch) : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                serverSection
                healthSection
                syncSection
            }
            .navigationTitle("ReflectHealthSync")
        }
        .task {
            HealthKitManager.shared.setupObserversIfNeeded()
        }
    }

    private var serverSection: some View {
        Section("Server") {
            TextField("URL (e.g. http://192.168.1.x:5001)", text: $serverURL)
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            SecureField("Sync Token", text: $syncToken)
            Button {
                showScanner = true
            } label: {
                Label("Scan QR Code", systemImage: "qrcode.viewfinder")
            }
        }
        .sheet(isPresented: $showScanner) {
            QRScanSheet(onScan: handleScannedCode)
        }
    }

    private func handleScannedCode(_ code: String) {
        guard let data = code.data(using: .utf8),
              let payload = try? JSONDecoder().decode(QRSetupPayload.self, from: data),
              !payload.serverURL.isEmpty, !payload.token.isEmpty
        else {
            statusMessage = "That QR code doesn't look like a ReflectAI setup code."
            return
        }
        serverURL = payload.serverURL
        syncToken = payload.token
        statusMessage = "Server URL and token filled in. Tap Connect to Health next."
    }

    private var healthSection: some View {
        Section("Health") {
            HStack {
                Image(systemName: isConnected ? "heart.fill" : "heart.slash")
                    .foregroundStyle(isConnected ? .red : .secondary)
                Text(isConnected ? "Health access granted" : "Not connected")
                    .foregroundStyle(isConnected ? .primary : .secondary)
            }
            Button(isConnected ? "Reconnect" : "Connect to Health") {
                Task {
                    do {
                        try await HealthKitManager.shared.requestAuthorization()
                        isConnected = true
                        statusMessage = "Health access granted."
                    } catch {
                        statusMessage = error.localizedDescription
                    }
                }
            }
        }
    }

    private var syncSection: some View {
        Section("Sync") {
            if let lastSync = lastSyncDate {
                LabeledContent("Last Sync") {
                    Text(lastSync, style: .relative)
                }
            }

            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button {
                Task {
                    isSyncing = true
                    statusMessage = "Syncing\u{2026}"
                    do {
                        let date = try await HealthKitManager.shared.sync(serverURL: serverURL, syncToken: syncToken)
                        lastSyncEpoch = date.timeIntervalSince1970
                        statusMessage = "Synced at \(date.formatted(date: .omitted, time: .shortened))."
                    } catch {
                        statusMessage = "Sync failed: \(error.localizedDescription)"
                    }
                    isSyncing = false
                }
            } label: {
                Label(
                    isSyncing ? "Syncing\u{2026}" : "Sync Now",
                    systemImage: "arrow.triangle.2.circlepath"
                )
            }
            .disabled(!isConnected || isSyncing)
        }
    }
}

#Preview {
    ContentView()
}
