Pod::Spec.new do |s|
  s.name           = 'AgapaiLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'AgapAI medication Live Activity control bridge (ActivityKit).'
  s.description    = 'Starts, updates, and ends the AgapAI medication Live Activity, exposes the ActivityKit push-to-start / update tokens to JS, and shares auth config with the widget extension via an App Group.'
  s.author         = 'AgapAI'
  s.homepage       = 'https://github.com/4ttth/agapai-dev'
  s.platforms      = { :ios => '16.2' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
