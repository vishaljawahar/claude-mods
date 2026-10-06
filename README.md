# claude-mods

Personal Claude Code mods, installable as a plugin marketplace.

## context-band

A colourful band above the prompt box showing:

- the model in use
- context window fill, as a green → yellow → red gradient bar with tokens used / window size
- the last response's tokens: input ↑, output ↓, cache read ⟲, cache write ✎
- session cost in USD (same total as `/cost`)
- 5-hour and 7-day rate-limit usage (subscription accounts)

**Details** expands a `/context`-style breakdown per category, free space, the
auto-compact threshold and rate-limit reset times. **Hide** hides the band.

Commands:

- `/context-band` toggles the band
- `/context-band status` prints diagnostics (surfaces, hidden state, last measurement)

### Install

In a Claude Code **terminal** session:

```
/plugin install context-band --marketplace vishaljawahar/claude-mods
```

Answer `y` to add the marketplace, then pick the **user** scope so it loads in
every session. It also draws in local sessions of the desktop app's Code tab.
Cloud sessions viewed on claude.ai or the mobile app don't draw it.

To try it without installing:

```
claude --plugin-dir ./context-band
```
