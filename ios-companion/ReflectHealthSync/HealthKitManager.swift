import Foundation
import HealthKit

enum SyncError: Error, LocalizedError {
    case noData
    case invalidURL
    case serverError
    case notAuthorized

    var errorDescription: String? {
        switch self {
        case .noData: return "No Health data available to sync yet."
        case .invalidURL: return "That server URL doesn't look valid."
        case .serverError: return "The server rejected the sync -- check the URL and token in Settings."
        case .notAuthorized: return "Health access hasn't been granted yet."
        }
    }
}

/// Reads step count, sleep, resting heart rate, and heart rate variability
/// from HealthKit and posts them to ReflectAI's /api/health-data/sync
/// endpoint. Read-only -- this app never writes anything back to Health.
@MainActor
final class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []

    @Published var isAuthorized = false
    @Published var lastSyncDate: Date?
    @Published var lastSyncError: String?
    @Published var isSyncing = false

    private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)
    private let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)
    private let restingHRType = HKQuantityType.quantityType(forIdentifier: .restingHeartRate)
    private let hrvType = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)

    private var readTypes: Set<HKObjectType> {
        [stepType, sleepType, restingHRType, hrvType].compactMap { $0 }.reduce(into: Set<HKObjectType>()) { $0.insert($1) }
    }

    private var sampleTypesForBackgroundDelivery: [HKSampleType] {
        [stepType, sleepType, restingHRType, hrvType].compactMap { $0 }
    }

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // MARK: - Authorization

    func requestAuthorization() async throws {
        guard isHealthDataAvailable else {
            throw SyncError.notAuthorized
        }
        try await healthStore.requestAuthorization(toShare: [], read: readTypes)
        // requestAuthorization resolving without throwing only means the
        // prompt was shown -- HealthKit deliberately never reveals whether
        // the user actually granted or denied each type (to avoid leaking
        // which health data someone has). Treated as "authorized" here since
        // there's no reliable way to check per-type status for read access;
        // if they denied everything, subsequent fetches just return nil and
        // sync will report "no data" rather than crash.
        isAuthorized = true
    }

    // MARK: - Fetching

    private func startOfDay(_ date: Date) -> Date {
        Calendar.current.startOfDay(for: date)
    }

    private func endOfDay(_ date: Date) -> Date {
        Calendar.current.date(byAdding: .day, value: 1, to: startOfDay(date)) ?? date
    }

    private func isoDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        return formatter.string(from: date)
    }

    private func fetchSteps(for date: Date) async -> Double? {
        guard let stepType else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay(date), end: endOfDay(date), options: .strictStartDate)
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
                continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: .count()))
            }
            healthStore.execute(query)
        }
    }

    private func fetchSleepHours(for date: Date) async -> Double? {
        guard let sleepType else { return nil }
        // Looks back 18 hours from the start of the day so a night's sleep
        // that started the evening before is still captured for "today".
        let start = Calendar.current.date(byAdding: .hour, value: -18, to: startOfDay(date)) ?? startOfDay(date)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: endOfDay(date), options: .strictStartDate)
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                ]
                let totalSeconds = (samples as? [HKCategorySample] ?? [])
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                continuation.resume(returning: totalSeconds > 0 ? totalSeconds / 3600.0 : nil)
            }
            healthStore.execute(query)
        }
    }

    private func fetchRestingHeartRate(for date: Date) async -> Double? {
        guard let restingHRType else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay(date), end: endOfDay(date), options: .strictStartDate)
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: restingHRType, quantitySamplePredicate: predicate, options: .discreteAverage) { _, result, _ in
                let unit = HKUnit.count().unitDivided(by: .minute())
                continuation.resume(returning: result?.averageQuantity()?.doubleValue(for: unit))
            }
            healthStore.execute(query)
        }
    }

    private func fetchHRV(for date: Date) async -> Double? {
        guard let hrvType else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay(date), end: endOfDay(date), options: .strictStartDate)
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: hrvType, quantitySamplePredicate: predicate, options: .discreteAverage) { _, result, _ in
                continuation.resume(returning: result?.averageQuantity()?.doubleValue(for: .secondUnit(with: .milli)))
            }
            healthStore.execute(query)
        }
    }

    // MARK: - Sync

    /// Fetches today's numbers and POSTs whatever is available to
    /// /api/health-data/sync. Missing fields (e.g. no HRV sensor, or Health
    /// access denied for one specific type) are simply omitted rather than
    /// sent as zero -- the server only computes a stress estimate from
    /// whichever signals are actually present.
    @discardableResult
    func syncNow(serverURL: String, token: String, date: Date = Date()) async -> Result<Void, Error> {
        isSyncing = true
        defer { isSyncing = false }

        async let stepsTask = fetchSteps(for: date)
        async let sleepTask = fetchSleepHours(for: date)
        async let hrTask = fetchRestingHeartRate(for: date)
        async let hrvTask = fetchHRV(for: date)
        let (stepsVal, sleepVal, hrVal, hrvVal) = await (stepsTask, sleepTask, hrTask, hrvTask)

        var payload: [String: Any] = ["date": isoDay(date)]
        if let stepsVal { payload["steps"] = stepsVal }
        if let sleepVal { payload["sleepHours"] = sleepVal }
        if let hrVal { payload["restingHeartRate"] = hrVal }
        if let hrvVal { payload["heartRateVariability"] = hrvVal }

        guard payload.count > 1 else {
            lastSyncError = SyncError.noData.localizedDescription
            return .failure(SyncError.noData)
        }

        let trimmedURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedURL.isEmpty, let url = URL(string: "\(trimmedURL)/api/health-data/sync") else {
            lastSyncError = SyncError.invalidURL.localizedDescription
            return .failure(SyncError.invalidURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                lastSyncError = SyncError.serverError.localizedDescription
                return .failure(SyncError.serverError)
            }
            lastSyncDate = Date()
            lastSyncError = nil
            return .success(())
        } catch {
            lastSyncError = error.localizedDescription
            return .failure(error)
        }
    }

    // MARK: - Background delivery

    /// Registers an HKObserverQuery per data type with hourly background
    /// delivery, so iOS wakes this app when new Health data shows up and it
    /// syncs on its own -- no need to keep the app open. How promptly that
    /// actually fires is controlled by iOS, not this app.
    func enableBackgroundDelivery(serverURL: String, token: String) {
        for type in sampleTypesForBackgroundDelivery {
            healthStore.enableBackgroundDelivery(for: type, frequency: .hourly) { _, error in
                if let error {
                    print("ReflectHealthSync: background delivery setup failed for \(type): \(error)")
                }
            }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, _ in
                Task { @MainActor in
                    _ = await self?.syncNow(serverURL: serverURL, token: token)
                    completionHandler()
                }
            }
            healthStore.execute(query)
            observerQueries.append(query)
        }
    }

    func disableBackgroundDelivery() {
        for query in observerQueries {
            healthStore.stop(query)
        }
        observerQueries.removeAll()
        healthStore.disableAllBackgroundDelivery { _, _ in }
    }
}
