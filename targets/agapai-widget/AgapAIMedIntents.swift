import AppIntents
import ActivityKit
import Foundation

/// Shared helpers for the Live Activity App Intents: locating the running
/// activity, reading the App Group auth config, and posting to the API. App
/// Intents fired from a Live Activity run in the app process when it is running,
/// otherwise in the widget extension — so everything here is self-contained and
/// reads its credentials from the App Group.
@available(iOS 17.0, *)
enum AgapAIIntentSupport {
  static func activity(for medicationId: String) -> Activity<AgapAIMedAttributes>? {
    Activity<AgapAIMedAttributes>.activities.first { $0.attributes.medicationId == medicationId }
  }

  static func sharedDefaults() -> UserDefaults? {
    UserDefaults(suiteName: AgapAIActivityShared.appGroup)
  }

  /// Record the last action + post a Darwin notification so a running app reacts.
  static func relay(action: String, medicationId: String) {
    let defaults = sharedDefaults()
    defaults?.set(action, forKey: "agapai.lastAction")
    defaults?.set(medicationId, forKey: "agapai.lastActionMedId")
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(AgapAIActivityShared.darwinAction as CFString),
      nil, nil, true
    )
  }

  /// Queue a confirmed dose in the App Group so the app reconciles its local
  /// dose log on next launch, even if the network POST below never lands.
  static func enqueuePending(medicationId: String, scheduledAtISO: String) {
    guard let defaults = sharedDefaults() else { return }
    var arr: [[String: Any]] = []
    if let raw = defaults.string(forKey: AgapAIActivityShared.keyPendingTaken),
       let data = raw.data(using: .utf8),
       let existing = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
      arr = existing
    }
    arr.append([
      "medicationId": medicationId,
      "scheduledAtISO": scheduledAtISO,
      "at": Date().timeIntervalSince1970,
    ])
    if let data = try? JSONSerialization.data(withJSONObject: arr),
       let raw = String(data: data, encoding: .utf8) {
      defaults.set(raw, forKey: AgapAIActivityShared.keyPendingTaken)
    }
  }

  /// POST the confirmation to the API using the App Group's stored bearer token.
  static func postTaken(medicationId: String, scheduledAtISO: String) async {
    guard let defaults = sharedDefaults(),
          let base = defaults.string(forKey: AgapAIActivityShared.keyServerUrl),
          let token = defaults.string(forKey: AgapAIActivityShared.keyAuthToken),
          let url = URL(string: base + "/api/live-activity/taken")
    else { return }
    let deviceId = defaults.string(forKey: AgapAIActivityShared.keyDeviceId) ?? ""
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.httpBody = try? JSONSerialization.data(withJSONObject: [
      "medicationId": medicationId,
      "scheduledAt": scheduledAtISO,
      "deviceId": deviceId,
    ])
    req.timeoutInterval = 12
    _ = try? await URLSession.shared.data(for: req)
  }
}

/// "Okay" on the T-5 upcoming nudge → flip the copy to the reassuring reply and
/// keep the activity alive to check back at the dose time.
@available(iOS 17.0, *)
struct AcknowledgeMedIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Okay"

  @Parameter(title: "Medication ID") var medicationId: String

  init() {}
  init(medicationId: String) { self.medicationId = medicationId }

  func perform() async throws -> some IntentResult {
    if let activity = AgapAIIntentSupport.activity(for: medicationId) {
      let s = activity.content.state
      let next = AgapAIMedAttributes.ContentState(
        phase: s.phase, acknowledged: true, taken: s.taken, deadlineEpoch: s.deadlineEpoch
      )
      await activity.update(ActivityContent(state: next, staleDate: s.deadline.addingTimeInterval(600)))
    }
    AgapAIIntentSupport.relay(action: "acknowledge", medicationId: medicationId)
    return .result()
  }
}

/// "I already took it" on the due check-in → mark taken locally + on the server,
/// show a brief confirmation, then dismiss the activity.
@available(iOS 17.0, *)
struct MarkTakenMedIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "I already took it"

  @Parameter(title: "Medication ID") var medicationId: String
  @Parameter(title: "Scheduled At") var scheduledAtISO: String

  init() {}
  init(medicationId: String, scheduledAtISO: String) {
    self.medicationId = medicationId
    self.scheduledAtISO = scheduledAtISO
  }

  func perform() async throws -> some IntentResult {
    AgapAIIntentSupport.enqueuePending(medicationId: medicationId, scheduledAtISO: scheduledAtISO)
    await AgapAIIntentSupport.postTaken(medicationId: medicationId, scheduledAtISO: scheduledAtISO)
    AgapAIIntentSupport.relay(action: "taken", medicationId: medicationId)

    if let activity = AgapAIIntentSupport.activity(for: medicationId) {
      let s = activity.content.state
      let confirmed = AgapAIMedAttributes.ContentState(
        phase: s.phase, acknowledged: s.acknowledged, taken: true, deadlineEpoch: s.deadlineEpoch
      )
      await activity.update(ActivityContent(state: confirmed, staleDate: nil))
      // Leave the confirmation visible briefly, then dismiss.
      try? await Task.sleep(nanoseconds: 3_000_000_000)
      await activity.end(ActivityContent(state: confirmed, staleDate: nil), dismissalPolicy: .immediate)
    }
    return .result()
  }
}
