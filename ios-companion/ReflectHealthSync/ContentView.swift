import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var healthKitManager: HealthKitManager

    // Persisted locally on the phone via UserDefaults. The sync token is a
    // long-lived credential scoped only to POST /api/health-data/sync (see
    // requireHealthSyncToken on the server) -- it can't log in to the app or
    // read journal entries, so storing it in plain UserDefaults here is a
    // reasonable trade-off for a small personal-use companion app.
    @AppStorage("reflect.serverURL") private var serverURL: String = ""
    @AppStorage("reflect.syncToken") private var syncToken: String = ""
    @AppStorage("reflect.backgroundEnabled") private var backgroundEnabled: Bool = false

    @State private var isConnecting = false
    @State private var connectionError: String?

    private var isConfigured: Bool {
        !serverURL.trimmingCharacters(in: .whitespaces).isEmpty && !syncToken.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("ReflectHealthSync reads step count, sleep, resting heart rate, and heart rate variability from Apple Health and sends them to your ReflectAI journal. It never writes anything back to Health.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Connection") {
                    TextField("Server URL (e.g. http://192.168.1.20:5001)", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Sync token", text: $syncToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Get your token from ReflectAI's Settings page, under Integrations > Apple Health > Generate sync token.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Status") {
                    LabeledContent("Health access") {
                        Text(healthKitManager.isAuthorized ? "Granted" : "Not connected")
                            .foregroundStyle(healthKitManager.isAuthorized ? .green : .secondary)
                    }
                    LabeledContent("Background sync") {
                        Text(backgroundEnabled ? "On" : "Off")
                            .foregroundStyle(backgroundEnabled ? .green : .secondary)
                    }
                    if let lastSync = healthKitManager.lastSyncDate {
                        LabeledContent("Last synced") {
                            Text(lastSync, style: .relative)
                        }
                    }
                    if let error = healthKitManager.lastSyncError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                    if let connectionError {
                        Text(connectionError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        connect()
                    } label: {
                        if isConnecting {
                            ProgressView()
                        } else {
                            Text(healthKitManager.isAuthorized ? "Reconnect" : "Connect")
                        }
                    }
                    .disabled(!isConfigured || isConnecting)

                    Button("Sync Now") {
                        Task {
                            await healthKitManager.syncNow(serverURL: serverURL, token: syncToken)
                        }
                    }
                    .disabled(!isConfigured || !healthKitManager.isAuthorized || healthKitManager.isSyncing)
                }
            }
            .navigationTitle("ReflectHealthSync")
        }
    }

    private func connect() {
        connectionError = nil
        isConnecting = true
        Task {
            do {
                try await healthKitManager.requestAuthorization()
                healthKitManager.enableBackgroundDelivery(serverURL: serverURL, token: syncToken)
                backgroundEnabled = true
                await healthKitManager.syncNow(serverURL: serverURL, token: syncToken)
            } catch {
                connectionError = error.localizedDescription
            }
            isConnecting = false
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(HealthKitManager())
}
