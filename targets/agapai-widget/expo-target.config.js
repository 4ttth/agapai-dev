/**
 * apple-targets config for the AgapAI Widget Extension, which hosts the
 * medication Live Activity (lock screen + Dynamic Island). Added to the Xcode
 * project by the `@bacons/apple-targets` config plugin during `expo prebuild`.
 *
 * The App Group must match the one the app writes its auth config into
 * (see modules/agapai-live-activity) so the "I already took it" App Intent can
 * reach the API while the app is closed.
 */
module.exports = {
  type: 'widget',
  name: 'AgapAIWidget',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.4ttth.agapaihealth'],
  },
};
