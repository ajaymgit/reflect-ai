import Foundation
import HealthKit

@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()
    private let store = HKHealthStore()

    private static let connectedKey = "hk_connected"
    static let lastSyncEpochKey = "lastSyncEpoch"

    private init() {}

    func setupObserversIfNeeded() {
        guard UserDefaults.standard.bool(forKey: Self.connectedKey) else { return }
        setupObservers()
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthError.unavailable
        }
        // Write access to sleepAnalysis is new -- SleepSessionRecorder saves
        // its own self-recorded (no-Watch) sleep sessions back into
        // HealthKit, so someone without a Watch still gets real sleep data
        // in Health, not just inside this app.
        try await store.requestAuthorization(toShare: [HKCategoryType(.sleepAnalysis)], read: readTypes)
        UserDefaults.standard.set(true, forKey: Self.connectedKey)
        setupObservers()
    }

    func sync(serverURL: String, syncToken: String) async throws -> Date {
        guard !serverURL.isEmpty, !syncToken.isEmpty else {
            throw HealthError.missingConfig
        }
        let steps = try await fetchSteps()
        let sleep = try await fetchSleepHours()
        let rhr = try await fetchLatestSample(.restingHeartRate, unit: HKUnit(from: "count/min"))
        let hrv = try await fetchLatestSample(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli))

        var payload: [String: Double] = ["steps": steps, "sleepHours": sleep]
        if let rhr { payload["restingHeartRate"] = rhr }
        if let hrv { payload["heartRateVariability"] = hrv }

        try await post(payload: payload, serverURL: serverURL, syncToken: syncToken)
        return Date()
    }

    // MARK: - Private

    private var readTypes: Set<HKObjectType> {
        [
            HKQuantityType(.stepCount),
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN)
        ]
    }

    private func fetchSteps() async throws -> Double {
        let predicate = HKQuery.predicateForSamples(
            withStart: Calendar.current.startOfDay(for: Date()), end: Date()
        )
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: HKQuantityType(.stepCount),
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, stats, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0)
            }
            store.execute(query)
        }
    }

    private func fetchSleepHours() async throws -> Double {
        let predicate = HKQuery.predicateForSamples(
            withStart: Date().addingTimeInterval(-86400), end: Date()
        )
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKCategoryType(.sleepAnalysis),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    1 // HKCategoryValueSleepAnalysis.asleep (deprecated, present in older data)
                ]
                let total = (samples as? [HKCategorySample] ?? [])
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                continuation.resume(returning: total / 3600)
            }
            store.execute(query)
        }
    }

    private func fetchLatestSample(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        let predicate = HKQuery.predicateForSamples(
            withStart: Date().addingTimeInterval(-86400), end: Date()
        )
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKQuantityType(identifier),
                predicate: predicate,
                limit: 1,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let value = (samples as? [HKQuantitySample])?.first?.quantity.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    private func post(payload: [String: Double], serverURL: String, syncToken: String) async throws {
        var base = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.hasSuffix("/") { base = String(base.dropLast()) }
        guard let url = URL(string: "\(base)/api/health-data/sync") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(syncToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(payload)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw HealthError.serverError(code)
        }
    }

    private func setupObservers() {
        let sampleTypes: [HKSampleType] = [
            HKQuantityType(.stepCount),
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN)
        ]
        for sampleType in sampleTypes {
            let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { _, completionHandler, _ in
                completionHandler()
                Task { @MainActor in
                    let url = UserDefaults.standard.string(forKey: "serverURL") ?? ""
                    let token = UserDefaults.standard.string(forKey: "syncToken") ?? ""
                    if let date = try? await HealthKitManager.shared.sync(serverURL: url, syncToken: token) {
                        UserDefaults.standard.set(date.timeIntervalSince1970, forKey: Self.lastSyncEpochKey)
                    }
                }
            }
            store.execute(query)
            // .immediate is the fastest option HealthKit offers -- it tells iOS
            // to wake this app as soon as possible when new data shows up,
            // rather than batching it up to once an hour. iOS still ultimately
            // decides exact timing based on battery/usage, so this is "as
            // close to real-time as the platform allows," not a guarantee.
            store.enableBackgroundDelivery(for: sampleType, frequency: .immediate) { _, _ in }
        }
    }
}

enum HealthError: LocalizedError {
    case unavailable
    case missingConfig
    case serverError(Int)

    var errorDescription: String? {
        switch self {
        case .unavailable: return "HealthKit is not available on this device."
        case .missingConfig: return "Enter a server URL and sync token first."
        case .serverError(let code): return "Server returned \(code)."
        }
    }
}
