import Foundation
import Combine
import AVFoundation
import CoreMotion
import HealthKit

// Self-recorded sleep tracking -- no Apple Watch required. This is the same
// underlying trick apps like Sleep Cycle and Pillow use: iOS lets an app keep
// running in the background as long as it's actively playing audio, so a
// silent audio loop is what keeps this alive overnight while it samples the
// accelerometer. That's real, sanctioned background execution (the "audio"
// UIBackgroundMode, see equohealth.entitlements/project.pbxproj), not a
// private API or a hack that could get the app rejected.
//
// What this can and can't do, honestly: actigraphy (inferring sleep/wake from
// movement alone) is a real, established technique -- it's what most
// wrist-worn sleep trackers were built on before heart-rate-based staging
// existed -- but it only tells you WHEN you were still versus moving, not
// sleep stages (light/deep/REM). Real stage detection needs heart rate data,
// which requires a Watch either way. This produces one honest number: total
// time asleep for the session, the same thing `sleepHours` has always meant
// everywhere else in this app.
@MainActor
final class SleepSessionRecorder: ObservableObject {
    static let shared = SleepSessionRecorder()

    @Published private(set) var isRecording = false
    @Published private(set) var sessionStart: Date?
    @Published private(set) var lastResult: SleepResult?

    private let motionManager = CMMotionManager()
    private let audioEngine = AVAudioEngine()
    private let audioPlayer = AVAudioPlayerNode()
    private var samples: [(date: Date, magnitude: Double)] = []
    private var safetyTimer: Timer?

    // Auto-stops a forgotten session rather than sampling (and draining the
    // battery) indefinitely -- nobody sleeps longer than this.
    private static let maxSessionHours: TimeInterval = 12 * 3600

    struct SleepResult {
        let start: Date
        let end: Date
        let sleepHours: Double
    }

    private init() {}

    func start() throws {
        guard !isRecording else { return }
        guard motionManager.isAccelerometerAvailable else {
            throw SleepRecorderError.noAccelerometer
        }

        try startSilentAudioKeepAlive()

        samples.removeAll()
        sessionStart = Date()
        isRecording = true

        // 30s cadence -- frequent enough to see the difference between
        // "lying still" and "tossing and turning," infrequent enough not to
        // meaningfully affect battery life over an 8-hour session.
        motionManager.accelerometerUpdateInterval = 30
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let data else { return }
            let a = data.acceleration
            let magnitude = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()
            Task { @MainActor in
                self?.samples.append((Date(), magnitude))
            }
        }

        safetyTimer = Timer.scheduledTimer(withTimeInterval: Self.maxSessionHours, repeats: false) { [weak self] _ in
            Task { @MainActor in
                _ = try? await self?.stopAndSave(writeToHealth: true)
            }
        }
    }

    @discardableResult
    func stopAndSave(writeToHealth: Bool) async throws -> SleepResult {
        guard isRecording, let start = sessionStart else {
            throw SleepRecorderError.notRecording
        }
        let end = Date()

        motionManager.stopAccelerometerUpdates()
        stopSilentAudioKeepAlive()
        safetyTimer?.invalidate()
        safetyTimer = nil
        isRecording = false
        sessionStart = nil

        let stillRanges = Self.detectStillRanges(from: samples, sessionStart: start, sessionEnd: end)
        let sleepSeconds = stillRanges.reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) }
        let sleepHours = Double(round((sleepSeconds / 3600) * 10) / 10)

        let result = SleepResult(start: start, end: end, sleepHours: sleepHours)
        lastResult = result

        if writeToHealth {
            try? await Self.writeToHealthKit(ranges: stillRanges)
        }

        return result
    }

    // MARK: - Sleep/wake heuristic

    // Actigraphy in one paragraph: split the session into 5-minute windows,
    // and call a window "still" (asleep) if the standard deviation of
    // movement magnitude inside it stays under a small threshold -- lying
    // still reads as low-variance near-constant gravity; being awake and
    // moving (even just reaching for a phone or rolling over repeatedly)
    // reads as higher variance.
    private static let windowSize: TimeInterval = 5 * 60
    private static let stillnessThreshold = 0.025
    private static let minRunLength: TimeInterval = 10 * 60

    private static func detectStillRanges(
        from samples: [(date: Date, magnitude: Double)],
        sessionStart: Date,
        sessionEnd: Date
    ) -> [(start: Date, end: Date)] {
        guard samples.count >= 3 else { return [] }

        var windows: [(start: Date, end: Date, isStill: Bool)] = []
        var cursor = sessionStart
        while cursor < sessionEnd {
            let windowEnd = min(cursor.addingTimeInterval(windowSize), sessionEnd)
            let inWindow = samples.filter { $0.date >= cursor && $0.date < windowEnd }.map(\.magnitude)
            let isStill = !inWindow.isEmpty && stdDev(inWindow) < stillnessThreshold
            windows.append((cursor, windowEnd, isStill))
            cursor = windowEnd
        }

        // Collapse consecutive still windows into ranges. A single non-still
        // window ends the current run -- deliberately simple (no
        // gap-tolerance logic to get subtly wrong) since this is already an
        // approximate heuristic, not a medical measurement. Runs shorter
        // than minRunLength are dropped as noise (a single still window
        // surrounded by movement isn't a real rest period).
        var ranges: [(start: Date, end: Date)] = []
        var runStart: Date?
        var runEnd: Date?

        for window in windows {
            if window.isStill {
                if runStart == nil { runStart = window.start }
                runEnd = window.end
            } else if let start = runStart, let end = runEnd {
                if end.timeIntervalSince(start) >= minRunLength {
                    ranges.append((start, end))
                }
                runStart = nil
                runEnd = nil
            }
        }
        if let start = runStart, let end = runEnd, end.timeIntervalSince(start) >= minRunLength {
            ranges.append((start, end))
        }

        return ranges
    }

    private static func stdDev(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let mean = values.reduce(0, +) / Double(values.count)
        let variance = values.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(values.count)
        return variance.squareRoot()
    }

    // MARK: - HealthKit write

    private static func writeToHealthKit(ranges: [(start: Date, end: Date)]) async throws {
        guard HKHealthStore.isHealthDataAvailable(), !ranges.isEmpty else { return }
        let store = HKHealthStore()
        let sleepType = HKCategoryType(.sleepAnalysis)
        let samples = ranges.map { range in
            HKCategorySample(
                type: sleepType,
                value: HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                start: range.start,
                end: range.end,
                metadata: [HKMetadataKeyWasUserEntered: false]
            )
        }
        try await store.save(samples)
    }

    // MARK: - Silent audio keep-alive

    // Plays one second of digital silence on loop -- not actually recording
    // or emitting sound, just enough of an active audio session that iOS
    // treats this as a legitimate background-audio app and doesn't suspend
    // it. Generated in memory (zeroed PCM buffer) rather than bundling a
    // silent audio file, so there's nothing extra to ship.
    private func startSilentAudioKeepAlive() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)

        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1) else {
            throw SleepRecorderError.audioSetupFailed
        }
        audioEngine.attach(audioPlayer)
        audioEngine.connect(audioPlayer, to: audioEngine.mainMixerNode, format: format)
        audioEngine.mainMixerNode.outputVolume = 0.0

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(format.sampleRate)) else {
            throw SleepRecorderError.audioSetupFailed
        }
        buffer.frameLength = buffer.frameCapacity // zeroed on allocation -- true digital silence

        try audioEngine.start()
        audioPlayer.scheduleBuffer(buffer, at: nil, options: .loops)
        audioPlayer.play()
    }

    private func stopSilentAudioKeepAlive() {
        audioPlayer.stop()
        audioEngine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

enum SleepRecorderError: LocalizedError {
    case noAccelerometer
    case notRecording
    case audioSetupFailed

    var errorDescription: String? {
        switch self {
        case .noAccelerometer: return "This device doesn't have an accelerometer available."
        case .notRecording: return "No sleep session is currently running."
        case .audioSetupFailed: return "Couldn't start the background keep-alive audio."
        }
    }
}
