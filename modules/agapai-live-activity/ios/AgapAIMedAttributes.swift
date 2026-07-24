import Foundation

#if canImport(ActivityKit)
import ActivityKit

/// The shape of the AgapAI medication Live Activity.
///
/// IMPORTANT: this struct is compiled into BOTH the app (this module) and the
/// widget extension (`targets/agapai-widget/AgapAIMedAttributes.swift`). The two
/// copies MUST stay byte-for-byte identical — ActivityKit matches attributes by
/// type, and any drift will stop updates/pushes from decoding. If you change one,
/// change the other.
@available(iOS 16.2, *)
public struct AgapAIMedAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// "upcoming" — the T-5-minutes nudge; "due" — the exact-dose-time check-in.
    public var phase: String
    /// True once the patient tapped "Okay" on the upcoming nudge. Flips the copy
    /// to "Okay, I'll be waiting here in 5 minutes to check on you."
    public var acknowledged: Bool
    /// True once the dose is marked taken from the activity (from the "I already
    /// took it" button). Drives the confirmation state before the activity ends.
    public var taken: Bool
    /// Countdown target shown as a live timer: the dose time (upcoming phase) or
    /// the end of the 5-minute answer window (due phase).
    public var deadline: Date

    public init(phase: String, acknowledged: Bool, taken: Bool, deadline: Date) {
      self.phase = phase
      self.acknowledged = acknowledged
      self.taken = taken
      self.deadline = deadline
    }
  }

  /// Stable identity of the dose this activity is about (set once at start).
  public var medicationId: String
  public var medicationName: String
  public var dosage: String
  /// ISO-8601 scheduled dose time, echoed to the server on "I already took it".
  public var scheduledAtISO: String

  public init(medicationId: String, medicationName: String, dosage: String, scheduledAtISO: String) {
    self.medicationId = medicationId
    self.medicationName = medicationName
    self.dosage = dosage
    self.scheduledAtISO = scheduledAtISO
  }
}
#endif

/// Shared constants used by both the app and the widget extension.
public enum AgapAIActivityShared {
  /// App Group used to hand the widget's App Intents the server URL + auth token
  /// so "I already took it" can post to the API even while the app is closed.
  /// Must match the App Group added to BOTH targets' entitlements.
  public static let appGroup = "group.com.4ttth.agapaihealth"

  // Keys inside the shared UserDefaults suite.
  public static let keyServerUrl = "agapai.serverUrl"
  public static let keyAuthToken = "agapai.authToken"
  public static let keyDeviceId = "agapai.deviceId"
  /// A JSON array of doses the patient confirmed from a Live Activity while the
  /// app was closed, so the app can reconcile its local dose log on next launch.
  public static let keyPendingTaken = "agapai.pendingTaken"
}
