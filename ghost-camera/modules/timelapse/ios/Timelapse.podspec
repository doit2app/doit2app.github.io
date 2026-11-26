Pod::Spec.new do |s|
  s.name           = 'Timelapse'
  s.version        = '1.0.0'
  s.summary        = '사진 여러 장을 타임랩스 MP4로 만든다'
  s.description    = '사진 여러 장을 타임랩스 MP4로 만든다 (날짜 글자, 워터마크)'
  s.license        = 'UNLICENSED'
  s.author         = 'DoIt2'
  s.homepage       = 'https://doit2app.github.io'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
