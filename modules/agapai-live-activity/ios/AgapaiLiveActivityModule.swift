import ExpoModulesCore
import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

/// The Darwin notification an App Intent posts (from the widget extension) after
/// it handles an "Okay" / "I already took it" tap, so the app — if running — can
/// react immediately (e.g. refresh the dose log). Cross-process, payload-less;
/// the details are read from the App Group.
private let kActionDarwinName = "tech.agapai.liveactivity.action"

public class AgapaiLiveActivityModule: Module {
  /// Latest push-to-start token (iOS 17.2+), cached for pull-based reads.
  private var pushToStartToken: String?
  /// Live tasks observing token streams, cancelled on module deinit.
  private var observerTasks: [Task<Void, Never>] = []

  public func definition() -> ModuleDefinition {
    Name("AgapaiLiveActivity")

    Events("onAction", "onPushToStartToken", "onActivityPushToken")

    OnCreate {
      self.startPushToStartObserver()
      self.registerDarwinObserver()
    }

    OnDestroy {
      self.observerTasks.forEach { $0.cancel() }
      self.observerTasks.removeAll()
    }

    /// Whether Live Activities can run on this device right now (iOS 16.2+ and
    /// the user hasn't disabled them for the app in Settings).
    Function("isSupported") { () -> Bool in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      #endif
      return false
    }

    /// Persist the server URL + auth token + deviceId into the shared App Group
    /// so the widget's App Intents can call the API even while the app is closed.
    Function("setSharedConfig") { (serverUrl: String, authToken: String, deviceId: String) in
      guard let defaults = UserDefaults(suiteName: AgapAIActivityShared.appGroup) else { return }
      defaults.set(serverUrl, forKey: AgapAIActivityShared.keyServerUrl)
      defaults.set(authToken, forKey: AgapAIActivityShared.keyAuthToken)
      defaults.set(deviceId, forKey: AgapAIActivityShared.keyDeviceId)
    }

    /// Doses the patient confirmed from a Live Activity while the app was closed,
    /// queued in the App Group by the "I already took it" intent. Returns and
    /// clears them so the app can reconcile its local dose log exactly once.
    Function("drainPendingTaken") { () -> [[String: Any]] in
      guard let defaults = UserDefaults(suiteName: AgapAIActivityShared.appGroup),
            let raw = defaults.string(forKey: AgapAIActivityShared.keyPendingTaken),
            let data = raw.data(using: .utf8),
            let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
      else { return [] }
      defaults.removeObject(forKey: AgapAIActivityShared.keyPendingTaken)
      return arr
    }

    /// Return the cached push-to-start token (iOS 17.2+), or nil.
    AsyncFunction("getPushToStartToken") { () -> String? in
      return self.pushToStartToken
    }

    /// Start a medication Live Activity from the foreground (used for immediate,
    /// on-device starts; server APNs push-to-start handles app-closed starts).
    /// Returns the activity id, or throws if unsupported.
    AsyncFunction("startActivity") { (payload: [String: Any]) -> String in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
          throw Exception(name: "not_enabled", description: "Live Activities are disabled for AgapAI.")
        }
        let attributes = AgapAIMedAttributes(
          medicationId: payload["medicationId"] as? String ?? "",
          medicationName: payload["medicationName"] as? String ?? "Medication",
          dosage: payload["dosage"] as? String ?? "",
          scheduledAtISO: payload["scheduledAtISO"] as? String ?? ""
        )
        let state = AgapAIMedAttributes.ContentState(
          phase: payload["phase"] as? String ?? "upcoming",
          acknowledged: false,
          taken: false,
          deadline: Self.deadline(from: payload["deadlineEpoch"])
        )
        let content = ActivityContent(state: state, staleDate: state.deadline.addingTimeInterval(600))
        let activity = try Activity.request(
          attributes: attributes,
          content: content,
          pushType: .token
        )
        self.observeActivityPushToken(activity)
        return activity.id
      }
      #endif
      throw Exception(name: "unsupported", description: "Live Activities require iOS 16.2+.")
    }

    /// Update the running activity for a medication (phase/ack/taken/deadline).
    AsyncFunction("updateActivity") { (payload: [String: Any]) in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        let medId = payload["medicationId"] as? String ?? ""
        guard let activity = Activity<AgapAIMedAttributes>.activities.first(where: { $0.attributes.medicationId == medId }) else { return }
        let state = AgapAIMedAttributes.ContentState(
          phase: payload["phase"] as? String ?? activity.content.state.phase,
          acknowledged: payload["acknowledged"] as? Bool ?? activity.content.state.acknowledged,
          taken: payload["taken"] as? Bool ?? activity.content.state.taken,
          deadline: Self.deadline(from: payload["deadlineEpoch"], fallback: activity.content.state.deadline)
        )
        await activity.update(ActivityContent(state: state, staleDate: state.deadline.addingTimeInterval(600)))
      }
      #endif
    }

    /// End the running activity for a medication (optionally after a final state).
    AsyncFunction("endActivity") { (medicationId: String) in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        for activity in Activity<AgapAIMedAttributes>.activities where activity.attributes.medicationId == medicationId {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
      #endif
    }

    /// Medication ids with a currently-running activity.
    Function("listActive") { () -> [String] in
      #if canImport(ActivityKit)
      if #available(iOS 16.2, *) {
        return Activity<AgapAIMedAttributes>.activities.map { $0.attributes.medicationId }
      }
      #endif
      return []
    }
  }

  // MARK: - Token observers

  private func startPushToStartObserver() {
    #if canImport(ActivityKit)
    if #available(iOS 17.2, *) {
      let task = Task {
        for await tokenData in Activity<AgapAIMedAttributes>.pushToStartTokenUpdates {
          let token = tokenData.map { String(format: "%02x", $0) }.joined()
          self.pushToStartToken = token
          self.sendEvent("onPushToStartToken", ["token": token])
        }
      }
      observerTasks.append(task)
    }
    #endif
  }

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private func observeActivityPushToken(_ activity: Activity<AgapAIMedAttributes>) {
    let medId = activity.attributes.medicationId
    let task = Task {
      for await tokenData in activity.pushTokenUpdates {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        self.sendEvent("onActivityPushToken", ["medicationId": medId, "token": token])
      }
    }
    observerTasks.append(task)
  }
  #endif

  // MARK: - Cross-process action relay

  /// Observe the Darwin notification an App Intent posts so a foregrounded app
  /// reacts to "Okay" / "I already took it" instantly (the durable record is the
  /// App Group queue drained via `drainPendingTaken`).
  private func registerDarwinObserver() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observer, _, _, _ in
        guard let observer = observer else { return }
        let module = Unmanaged<AgapaiLiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
        module.emitLatestAction()
      },
      kActionDarwinName as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func emitLatestAction() {
    guard let defaults = UserDefaults(suiteName: AgapAIActivityShared.appGroup) else { return }
    let action = defaults.string(forKey: "agapai.lastAction") ?? ""
    let medId = defaults.string(forKey: "agapai.lastActionMedId") ?? ""
    sendEvent("onAction", ["action": action, "medicationId": medId])
  }

  // MARK: - Helpers

  private static func deadline(from value: Any?, fallback: Date = Date().addingTimeInterval(300)) -> Date {
    if let epoch = value as? Double { return Date(timeIntervalSince1970: epoch) }
    if let epoch = value as? Int { return Date(timeIntervalSince1970: Double(epoch)) }
    return fallback
  }
}
