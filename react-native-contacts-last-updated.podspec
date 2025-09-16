require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-contacts-last-updated"
  s.version      = package["version"]
  s.summary      = package["description"] || "Contacts last updated utilities for React Native"
  s.description  = package["description"]
  s.homepage     = package["homepage"] || "https://github.com/omarsdev/react-native-contacts-last-updated"
  s.license      = package["license"] || "MIT"
  s.author       = package["author"]
  s.platform     = :ios, "12.0"
  s.source       = { :path => "." }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true
  s.swift_version = "5.0"

  s.dependency "React-Core"
end
