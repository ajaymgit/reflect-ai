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
    @StateObject private var sleepRecorder = SleepSessionRecorder.shared
    @State private var sleepStatusMessage = ""
    @State private var stoppingSleep = false

    private var lastSyncDate: Date? {
        lastSyncEpoch > 0 ? Date(timeIntervalSince1970: lastSyncEpoch) : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                serverSection
                healthSection
                sleepSection
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

    // No Apple Watch required -- see SleepSessionRecorder.swift. Tap Start
    // before bed, leave the phone charging nearby, tap Stop when you wake
    // (or it auto-stops on its own after 12h as a safety net). It plays a
    // silent audio loop to stay alive in the background and samples the
    // accelerometer to work out how much of that time you were actually
    // still versus moving.
    private var sleepSection: some View {
        Section {
            if sleepRecorder.isRecording, let start = sleepRecorder.sessionStart {
                HStack {
                    Image(systemName: "moon.zzz.fill").foregroundStyle(.indigo)
                    VStack(alignment: .leading) {
                        Text("Recording sleep")
                        Text("Started \(start.formatted(date: .omitted, time: .shortened))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Button(role: .destructive) {
                    Task {
                        stoppingSleep = true
                        sleepStatusMessage = "Saving..."
                        do {
                            let result = try await sleepRecorder.stopAndSave(writeToHealth: true)
                            sleepStatusMessage = "Recorded \(String(format: "%.1f", result.sleepHours))h asleep."
                            // Push the fresh number to the server right away
                            // rather than waiting on background delivery to
                            // notice the HealthKit write.
                            if let date = try? await HealthKitManager.shared.sync(serverURL: serverURL, syncToken: syncToken) {
                                lastSyncEpoch = date.timeIntervalSince1970
                                sleepStatusMessage += " Synced."
                            }
                        } catch {
                            sleepStatusMessage = "Couldn't save: \(error.localizedDescription)"
                        }
                        stoppingSleep = false
                    }
                } label: {
                    Label(stoppingSleep ? "Saving..." : "Stop & Save", systemImage: "stop.circle")
                }
                .disabled(stoppingSleep)
            } else {
                Button {
                    do {
                        try sleepRecorder.start()
                        sleepStatusMessage = ""
                    } catch {
                        sleepStatusMessage = error.localizedDescription
                    }
                } label: {
                    Label("Start Sleep Tracking", systemImage: "moon.zzz")
                }
                .disabled(!isConnected)
                if let last = sleepRecorder.lastResult {
                    Text("Last night: \(String(format: "%.1f", last.sleepHours))h asleep")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if !sleepStatusMessage.isEmpty {
                Text(sleepStatusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Sleep (no Apple Watch needed)")
        } footer: {
            Text("Keep the phone charging near your bed overnight with this running. Uses your accelerometer to estimate time asleep -- less precise than a Watch, but real data instead of none.")
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
