const {
  withInfoPlist,
  withEntitlementsPlist,
} = require('@expo/config-plugins');

const APP_GROUP = 'group.com.4ttth.agapaihealth';

/**
 * App-level wiring for the AgapAI medication Live Activity. The widget extension
 * itself is added by @bacons/apple-targets (see targets/agapai-widget); this
 * plugin configures the MAIN app target so it can host and push Live Activities:
 *
 *  - NSSupportsLiveActivities (+ frequent updates) so ActivityKit is available,
 *  - the push entitlement (aps-environment) so the server can push-to-start /
 *    update activities over APNs when the app is closed,
 *  - the App Group shared with the widget so the "I already took it" App Intent
 *    can read the API base URL + auth token and call the server.
 *
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withAgapaiLiveActivity(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return cfg;
  });

  config = withEntitlementsPlist(config, (cfg) => {
    // Push (APNs) — required for ActivityKit push-to-start and updates.
    if (!cfg.modResults['aps-environment']) {
      cfg.modResults['aps-environment'] = 'development';
    }
    // App Group shared with the widget extension.
    const groups = new Set(cfg.modResults['com.apple.security.application-groups'] || []);
    groups.add(APP_GROUP);
    cfg.modResults['com.apple.security.application-groups'] = Array.from(groups);
    return cfg;
  });

  return config;
}

module.exports = withAgapaiLiveActivity;
