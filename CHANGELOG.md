# Changelog

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
