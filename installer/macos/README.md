# macOS Packaging Plan

The production daemon should ship as a signed, notarized macOS app bundle with a LaunchAgent helper.

## Homebrew Cask

Draft cask shape:

```ruby
cask "soundbridge" do
  version "0.1.0"
  sha256 "<release-sha256>"

  url "https://github.com/<org>/soundbridge/releases/download/v#{version}/SoundBridge-#{version}.dmg"
  name "SoundBridge"
  desc "Local browser-to-native audio plugin bridge"
  homepage "https://github.com/<org>/soundbridge"

  app "SoundBridge.app"

  zap trash: [
    "~/Library/Application Support/SoundBridge",
    "~/Library/Preferences/org.soundbridge.daemon.plist"
  ]
end
```

## Launch Agent

The app should install a per-user LaunchAgent that starts the daemon on login and binds only to loopback. The daemon should expose a menu bar or settings UI for:

- origin allowlist
- pairing requests
- diagnostics
- plugin rescan
- daemon restart

## Notarization

Native plugin hosting interacts with third-party binaries, so releases need a disciplined signing flow:

- sign all executables and helper tools
- notarize the app bundle or DMG
- staple the notarization ticket
- avoid disabling hardened runtime broadly
- document plugin crash reporting without collecting user project data
