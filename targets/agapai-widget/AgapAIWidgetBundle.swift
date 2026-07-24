import WidgetKit
import SwiftUI

/// Entry point for the AgapAI widget extension. Hosts the medication Live
/// Activity (lock screen + Dynamic Island). Add any home-screen widgets here too.
@main
struct AgapAIWidgetBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.2, *) {
      AgapAIMedLiveActivity()
    }
  }
}
