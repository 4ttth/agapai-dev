import Foundation
import ActivityKit

/// Widget-extension copy of the Live Activity shape.
///
/// IMPORTANT: MUST stay byte-for-byte identical to
/// `modules/agapai-live-activity/ios/AgapAIMedAttributes.swift`. ActivityKit
/// matches attributes by type across the app and this extension; any drift stops
/// updates/pushes from decoding. Change one → change the other.
@available(iOS 16.2, *)
public struct AgapAIMedAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var phase: String
    public var acknowledged: Bool
    public var taken: Bool
    public var deadlineEpoch: Double

    public init(phase: String, acknowledged: Bool, taken: Bool, deadlineEpoch: Double) {
      self.phase = phase
      self.acknowledged = acknowledged
      self.taken = taken
      self.deadlineEpoch = deadlineEpoch
    }

    public var deadline: Date { Date(timeIntervalSince1970: deadlineEpoch) }
  }

  public var medicationId: String
  public var medicationName: String
  public var dosage: String
  public var scheduledAtISO: String

  public init(medicationId: String, medicationName: String, dosage: String, scheduledAtISO: String) {
    self.medicationId = medicationId
    self.medicationName = medicationName
    self.dosage = dosage
    self.scheduledAtISO = scheduledAtISO
  }
}

public enum AgapAIActivityShared {
  public static let appGroup = "group.com.4ttth.agapaihealth"
  public static let keyServerUrl = "agapai.serverUrl"
  public static let keyAuthToken = "agapai.authToken"
  public static let keyDeviceId = "agapai.deviceId"
  public static let keyPendingTaken = "agapai.pendingTaken"
  public static let darwinAction = "tech.agapai.liveactivity.action"
}
