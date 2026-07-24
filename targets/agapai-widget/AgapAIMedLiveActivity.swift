import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

private let agapaiBlue = Color(red: 0.043, green: 0.310, blue: 0.620) // #0B4F9E

/// Copy shown for each phase/state of the medication Live Activity.
@available(iOS 16.2, *)
private struct MedCopy {
  let headline: String
  let detail: String
  let showTimer: Bool
  let systemImage: String

  init(_ attrs: AgapAIMedAttributes, _ state: AgapAIMedAttributes.ContentState) {
    let dose = attrs.dosage.isEmpty ? attrs.medicationName : "\(attrs.dosage) \(attrs.medicationName)"
    if state.taken {
      headline = "Marked as taken"
      detail = "Great job — logged in AgapAI."
      showTimer = false
      systemImage = "checkmark.seal.fill"
    } else if state.phase == "upcoming" {
      if state.acknowledged {
        headline = "Okay, I'll be waiting"
        detail = "I'll check on you in 5 minutes to make sure you take \(dose)."
        showTimer = true
        systemImage = "hourglass"
      } else {
        headline = "Medication in 5 minutes"
        detail = "Get ready to take \(dose)."
        showTimer = true
        systemImage = "pills.fill"
      }
    } else { // due
      headline = "Time to take \(attrs.medicationName)"
      detail = "You have 5 minutes to confirm \(dose)."
      showTimer = true
      systemImage = "alarm.fill"
    }
  }
}

/// The action button appropriate to the current state, or nil (taken → none).
@available(iOS 17.0, *)
private struct MedActionButton: View {
  let attrs: AgapAIMedAttributes
  let state: AgapAIMedAttributes.ContentState

  var body: some View {
    if state.taken {
      EmptyView()
    } else if state.phase == "upcoming" {
      if state.acknowledged {
        EmptyView()
      } else {
        Button(intent: AcknowledgeMedIntent(medicationId: attrs.medicationId)) {
          Text("Okay").fontWeight(.semibold)
        }
        .tint(agapaiBlue)
      }
    } else {
      Button(intent: MarkTakenMedIntent(medicationId: attrs.medicationId, scheduledAtISO: attrs.scheduledAtISO)) {
        Text("I already took it").fontWeight(.semibold)
      }
      .tint(agapaiBlue)
    }
  }
}

/// Lock-screen / banner presentation of the Live Activity.
@available(iOS 16.2, *)
private struct LockScreenMedView: View {
  let context: ActivityViewContext<AgapAIMedAttributes>

  var body: some View {
    let copy = MedCopy(context.attributes, context.state)
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: copy.systemImage)
        .font(.title2)
        .foregroundStyle(agapaiBlue)
        .frame(width: 34)
      VStack(alignment: .leading, spacing: 4) {
        Text(copy.headline).font(.headline)
        Text(copy.detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        HStack {
          if copy.showTimer {
            Text(timerInterval: Date()...context.state.deadline, countsDown: true)
              .font(.system(.title3, design: .rounded)).monospacedDigit()
              .foregroundStyle(agapaiBlue)
          }
          Spacer()
          if #available(iOS 17.0, *) {
            MedActionButton(attrs: context.attributes, state: context.state)
          }
        }
        .padding(.top, 2)
      }
    }
    .padding(14)
    .activityBackgroundTint(Color(.systemBackground))
  }
}

@available(iOS 16.2, *)
struct AgapAIMedLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AgapAIMedAttributes.self) { context in
      LockScreenMedView(context: context)
    } dynamicIsland: { context in
      let copy = MedCopy(context.attributes, context.state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.attributes.medicationName, systemImage: copy.systemImage)
            .foregroundStyle(agapaiBlue).font(.caption).labelStyle(.iconOnly)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if copy.showTimer {
            Text(timerInterval: Date()...context.state.deadline, countsDown: true)
              .font(.system(.title3, design: .rounded)).monospacedDigit()
              .frame(width: 60).foregroundStyle(agapaiBlue)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          Text(copy.headline).font(.subheadline).fontWeight(.semibold).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if #available(iOS 17.0, *) {
            MedActionButton(attrs: context.attributes, state: context.state)
          } else {
            Text(copy.detail).font(.caption).foregroundStyle(.secondary)
          }
        }
      } compactLeading: {
        Image(systemName: copy.systemImage).foregroundStyle(agapaiBlue)
      } compactTrailing: {
        if copy.showTimer {
          Text(timerInterval: Date()...context.state.deadline, countsDown: true)
            .monospacedDigit().frame(width: 44).foregroundStyle(agapaiBlue)
        } else {
          Image(systemName: "checkmark").foregroundStyle(agapaiBlue)
        }
      } minimal: {
        Image(systemName: copy.systemImage).foregroundStyle(agapaiBlue)
      }
      .keylineTint(agapaiBlue)
    }
  }
}
