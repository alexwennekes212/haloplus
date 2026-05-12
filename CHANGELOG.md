# Changelog

## 1.1.1

### Fixes
- `/client`, `/clients`, `/org`, `/orgs`, `/organisation`, `/organisations` (and US-spelling variants) now resolve to the customer search. Previously only `/c` worked, so users typing the full word saw no command.
- After upgrading the extension, custom Halo domains saved in Settings were appearing as configured but Chrome had revoked the host permission — silently breaking page detection. The "Halo page not detected" banner now detects this state, names the affected domains, and offers a **Re-grant access** button that re-requests Chrome's permission and re-registers the dynamic content script in one click.
- `chrome.scripting.registerContentScripts` errors used to be swallowed silently when permission was missing. The service worker now records the last registration error to `chrome.storage.local` (`huCustomDomainLastError`) so the panel can surface it.
- Adding a custom Halo domain with a port (`halo.example.com:8080`) used to silently strip the port and save a pattern that never matched. The Settings form now refuses domains with ports and explains that Chrome's permission system covers the host on any port.

## 1.1.0

### Preferences
- Added a master **Enable Ticket 360** toggle. Disabling it hides the Ticket 360 button, stops auto-open, and hides the related sub-options.
- Changed Ticket 360 auto-open default to **on** and "Hide Halo sidebars" default to **off**.
- Added a **Double-click to show field API names** preference (default on) that gates the page-wide double-click handler.
- Added a GitHub link to the About card in Settings.

### Configuration palette (`/cfg`)
- `/cfg` (and `/config`) is now a scoped command: shows all Halo configuration sections, filters as you type, supports deep links like `/cfg tickets tickettype` → `/config/tickets/tickettype`.
- **Right Arrow** on a highlighted result drills into that section or activates a deep-link result.
- Sections with available subsections show an orange count badge so it's obvious which ones are drillable.
- Subsections are learned dynamically: a one-time iframe-based sweep on first install builds the cache, and every visit to `/config/{section}` refreshes that section's subsections in the background.
- A loading pill in the bottom-right of the palette indicates when discovery is running (`Indexing Tickets (6/33)` during the sweep, `Indexing Tickets…` for single-section backfills).
- Right Arrow on the top-level `/cfg` entry (e.g. when typed via `/c`) drills into the config sections list.

### Email-template variable picker
- Type `$` in any Halo email-template body, subject input, or Froala link/image dialog input to open a searchable picker of all 828 Halo template variables.
- Typing after the `$` filters by name or description; ↑ ↓ navigate, Enter / Tab insert, Esc dismiss.
- Category dropdown lets you narrow by entity (Ticket, Agent, Action, Invoices, Custom fields, etc.). Resets to All on each open.
- Buttons (variables that render as clickable buttons in Halo emails — `{$AGENTEMAIL}`, `{$LINKTOWEBAPP}`, etc.) are tagged in the picker and inserted with the correct `{$NAME}` syntax.
- On first use on an email-template page, HaloPlus queries Halo's schema for `CF*` columns on `faults` / `area` / `users` / `device` / `site` / `uname` and adds tenant-specific custom fields to the picker (cached for 7 days).
- Picker survives Froala's input quirks via an 80ms poll loop on the active field, so filtering stays in sync even when Froala swallows native input events.

### Palette UX polish
- Added a polite review prompt: after 5 days of palette use the user sees a one-time banner inviting a Chrome Web Store review (with snooze and dismiss). Hides the toolbar while the banner is up to avoid overlap.
- **Up Arrow** at the top of the result list now recalls the previous typed command (shell-style history). Repeated presses walk further back through history (stored in `chrome.storage.local`).
- Mouse hover no longer hijacks keyboard navigation — moving the cursor over a row used to snap the selection back; now `mousemove` is required so arrow keys win when the cursor is stationary.

### Fixes
- `/config/tickets/tickettype?id=1` no longer triggers Ticket 360 auto-open. The page-classification check now puts `/config` ahead of `/ticket` so configuration pages with "ticket" in the path don't pose as tickets.
- Variable picker popup uses `z-index: 2147483647` + `isolation: isolate` and attaches to `document.documentElement`, so Froala's link / image dialogs can't render on top of it.
- Variable picker docks alongside the Froala popup (right, left, or below) instead of overlapping the popup's other inputs.
- Removed the inline view-detection script from `panel.html` (it was unused; this kills the related CSP warning for anyone still running a cached copy).
- Dark-mode hover state on the orange "Leave a review" button stays orange instead of falling back to the generic dark hover.

## 1.0.3

- Hardened palette navigation against `javascript:` and other non-http(s) schemes in saved custom commands.
- Validated user-entered URLs in the custom commands form (only paths and http(s) URLs accepted).
- Escaped table, column, and meta-tag values in the side panel where dynamic data was rendered into HTML.
- Tightened recent-records drawer navigation to reject non-http(s) URLs.
- Fixed `/s` scoped site search to use the actual `SSitenum` / `SArea` columns.
- Combined `/c` and `/u` into a single customer search that returns both organisations and end-users.
- Scoped `/hr` and `/fac` by the ticket `Sectio_` field so they catch all HR / Facilities tickets regardless of underlying request type.
- Cleaned up the `/asset` and `/kb` entity definitions to stop referencing columns that aren't always present.
- Added a hover-revealed palette toolbar (top-right of the palette) with:
    - Placement chooser (top-left / center / top-right; center is wider, side variants are narrower).
    - Light/dark theme toggle.
    - Font size + / - controls.
    - Shortcut to open the HaloPlus settings page.
- Palette placement and font scale are now persisted in `chrome.storage.local` and stay in sync across open Halo tabs.

## 1.0.2

- Initial public source release.
- Added custom Halo domain support through optional host permissions.
- Added settings for saving custom Halo URLs or hostnames.
- Removed the Halo lookup builder tools.
- Limited Ticket 360 and Action Timeline to active ticket pages.
- Improved Ticket 360 sidebar hiding on slow-loading ticket pages.
- Added source-available project documentation and contribution guidelines.
- Added `homepage_url` metadata.
- Added the Monaco bridge to extension web-accessible resources.
