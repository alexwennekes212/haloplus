# Changelog

## 1.2.1

### Palette
- **Open-count chip is now clickable.** Click the orange `12 open` badge on a ticket-scoped command to drop straight into that command's scope, filtered to just the open tickets (newest first). Equivalent to typing the command and the trailing space, but with `open_only=true` and an explicit `id desc` order applied to the API call. Scope clears as soon as you switch to a different command.
- **Chip drill-down also works on `/cfg` and on individual config sections.** Clicking the `33 ›` chip on the `/cfg` row drills into the section list; clicking the count chip on a section (e.g. `Tickets · 27 ›`) drills into that section's subsections. Same destination as ArrowRight, faster with the mouse.
- **Ticket type rendered as its own pill** in result rows, sitting alongside the status pill. The subtitle now shows just end-user + client, so the ticket type stands out instead of being buried in the dot-separated tail.

### Ticket 360
- **Status and priority pills now show a small caret** to telegraph that they're clickable (status / priority picker). Caret stays attached even after the pill relabels itself on a status change.
- **Priority pill colour now comes from `cache_priority`** so it matches the tenant's actual Halo palette in Settings → Priorities (same treatment the status pill already had). Falls back to the regex-derived class when the cache is empty or the colour isn't a valid hex/rgb.
- **Timeline dot colours now come from `cache_actionoutcome`** (with `cache_outcome` as a secondary fallback). Matches by `outcome_id` first, then case-insensitive outcome name. When no tenant colour is configured, the existing semantic regex (status / email / note / time) still applies. Applied to both the 360 inline timeline and the dedicated Action Timeline.
- **Adjusted time on actions is now surfaced.** Halo's `timetaken_adjusted` field (set by supervisors to override the agent-logged time for billing) wins over the raw `timetaken` whenever it's set. The 360 pill turns indigo with a dotted underline when adjusted differs from raw, and the tooltip shows both values (`Adjusted 30m (raw 45m)`).
- **SLA bars + donut: side-by-side 40/60 split.** Respond takes 40% of the row / arc, Fix takes 60%. Single-SLA tickets get the full width / full arc. The donut keeps an 8% gap between its two slices so the boundary stays visually distinct.
- **Used vs spare on met SLAs.** Closed-and-met SLAs now show how much of the window was consumed — full-colour band for the used portion, 30%-opacity overlay of the same colour for the remaining headroom. A Fix closed at 63% of its window reads as a strong 63% band with a faint 37% tail. Breached and live SLAs still render as a single solid fill.
- **Status icons on SLA bars + donut.** Met-on-time renders a green check (replacing the "Met" text). Breached SLAs (met-late or live past-due) render a red filled-circle X badge followed by the overshoot duration. The donut centre shows the verdict for closed tickets: `✓ All met` or `✗ Fix 30s over`. Plain countdown states (`3h left`, `Closed`) stay as text.
- **Closed-ticket SLA donut shows a verdict.** Instead of arbitrarily surfacing one finished SLA, a closed ticket renders either `✓ All met` (green) or `✗ <name> <overshoot>` (red, worst breach by overshoot duration). Open tickets keep the "most critical active SLA" behaviour.
- **Donut caption moved below the arc.** Long verdicts overlapped the curve. The caption now sits 8px under the donut with the full 140px width to work with. Container height grew from 48px to 72px; the meta-row aligns vertically so neighbouring chips stay centred.

### Fixes
- **Double-click to show field API names** no longer triggers while editing inside Halo forms. The handler now also ignores clicks on `<form>` descendants, native form widgets without a wrapping form (Halo's React app omits it in places), and ARIA `button` / `combobox` / `listbox` / `textbox` / `searchbox` / `checkbox` / `radio` / `option` roles.
- **Logged time now renders correctly in the timeline.** Halo's `actions.timetaken` field is stored as decimal hours, not minutes. The previous code treated it as raw minutes, so a 15-minute log (stored as `0.25`) rounded to `0m` and the pill never rendered. Both the Ticket 360 amber pill and the dedicated Action Timeline (per-row and total) now convert hours → minutes before formatting. The inline "Log time" editor also now POSTs `timetaken: minutes / 60` so newly-logged entries are saved with the right magnitude in Halo. (Older entries written by HaloPlus 1.2.0 stored their minute value in the hours column — check those manually if you used the inline time editor before this fix.)
- **Respond SLA met-vs-breached now reads from `responsedate`.** The actual response timestamp is the source of truth for met-on-time vs met-late — the dashboard compares it to `respondbydate` and shows the icon + overshoot accordingly. `slaresponsestate === 'O'` short-circuits any "completed" fallback so a closed ticket with a late response no longer renders green. Closed-and-met-on-time stays green; closed-and-met-late shows the red cross + overshoot.
- **Sub-minute overshoots now show in seconds.** `formatDurationShort` used to round anything below a minute to "0m". A response 30 seconds late now reads "30s over" rather than "0m over".
- **Halo timestamps now parse as UTC.** Halo's entity APIs return ISO datetimes without a `Z` suffix (e.g. `2026-05-13T18:01:50.347`), which JavaScript interprets as local time per ECMA-262. The result was every date being skewed by the user's timezone offset — CEST agents saw "Opened" times 2h early, SLA percentages drifted, and "open Xd" badges could be off by a day. A new `parseHaloDate()` helper appends `Z` to any Halo datetime missing a timezone indicator so all downstream math (`formatDateTime`, SLA donut, SLA bars, aging badges, average-close, timeline ordering, recent records sort) runs in UTC and renders in the user's local zone.

## 1.2.0

### Non-admin agents can now use HaloPlus
Until 1.2.0, almost every feature funnelled through `/api/Report` (Halo's SQL passthrough endpoint). That endpoint is typically restricted to admins and roles with explicit report-running claims (`Can_Use_DataSources` / `Can_Use_Reports`), which most help-desk agents don't have. The result for non-admins: 403 floods on every keystroke and empty results everywhere. v1.2.0 rewrites the foundation so non-admin agents get a working experience that matches what their Halo role actually allows.

- **Entity-API rewrite for the command palette.** All palette searches (`/t`, `/i`, `/prob`, `/chg`, `/req`, `/hr`, `/fac`, `/dft`, `/mw`, `/mi`, `/prj`, `/c`, `/a`, `/u`, `/asset`, `/kb`, `/inv`, `/q`, `/po`, `/s`, `/team`) now hit Halo's permission-respecting entity endpoints (`/api/tickets`, `/api/client`, `/api/agent`, `/api/users`, `/api/asset`, `/api/KBArticle`, `/api/invoice`, `/api/quotation`, `/api/purchaseorder`, `/api/site`, `/api/team`) instead of `/api/Report`.
- **Ticket 360, Action Timeline, and Inspect Record JSON** migrated to `/api/tickets/{id}` + `/api/actions?ticket_id=` so they work for agents who can view tickets in Halo's UI.
- **Impersonation agent search** now uses `/api/agent?search=` with `/api/agent/{id}` for exact-id lookups. SQL is the fallback only.
- **`/api/Report` probe gates remaining SQL paths.** When the probe returns 403, the open-ended cross-record palette search, Data Viewer, and Schema tabs are skipped/hidden instead of firing guaranteed-failure POSTs every keystroke.
- **Live access-token rotation.** `haloApiRequest` now reads the `access_token` cookie on every call. Halo rotates this token mid-session; the previous code used a cached `localStorage` token and 401'd until refresh.

### Ticket 360 — editable dashboard
Ticket 360 has been rebuilt as a working dashboard. Most ticket fields can be edited inline without leaving the panel; the dashboard auto-refreshes after each change with no re-animation, and the slide-out / slide-in is skipped on in-place refresh so scroll position is preserved.

- **Inline summary edit.** Click the ticket title to edit it in place. Enter saves via `POST /api/tickets`, Escape cancels, paste strips formatting, empty input reverts.
- **Customer picker.** Click the Customer row (whole row, no separate button — profile-link clicks still navigate normally) to open a debounced `/api/users?search=` picker. Picking a user patches `user_id` (plus `client_id` / `site_id` when present) and refreshes the dashboard.
- **Assignee picker.** Click the Assigned-to row to open `/api/agent?count=500&includedetails=true` — cached client-side, results grouped by team with a sticky team header. Filtering matches agent name, email, AND team name. Picking patches both `agent_id` and `team_id` + `team` name so Halo doesn't fall back to the agent's default team.
- **Status picker uses Halo's own scoped endpoint.** `/api/Status?type=ticket&tickettype_id=X&workflow_id=Y&workflow_step=Z` mirrors what the OOTB ticket form requests, so only the statuses the ticket can transition to from its current workflow step appear. Statuses with an empty/missing `used_in_ticket_types` array are hidden. Falls back to `cache_status` if the call fails.
- **Status pill takes its colour from `cache_status.colour`** (sanitised to hex/rgb) so it matches Halo's per-status palette in both themes. The chip re-skins live when the user picks a new status.
- **Drawer header shows the ticket label** (e.g. `[IN-0003112]`) instead of the generic "Ticket 360" — saves space and gives the agent the most useful identifier up front.
- **Quick actions.** Note and Time editors are inline and toggleable (re-clicking the button closes the editor), Flag toggles directly, and a new **Copy link** button copies the ticket URL with a 1.5s "Copied" flash. Native Clipboard API with a `textarea + execCommand('copy')` fallback for non-secure contexts.

### People section
- **Real avatars.** Agent photos come from `/api/agent/{id}?includedetails=true&isagentconfig=true` — either `agentphotodata` (base64 data URI, rendered with zero extra requests) or `agentphotopath` (relative path, resolved to same origin). Customer photos try `ticket.user` first, then `/api/users/{id}`. Falls back to initials on 404. Both endpoints are cached per session.
- **VIP / Key contact badge** uses `vertical-align: middle` for clean baseline alignment, and the light-mode palette is now a bright alerting orange (`#9a3412` on `#ffedd5` with a `#fb923c` border) instead of the previous brown-on-cream that was hard to read. The "Key contact at this client" banner uses the same palette so the two read as a set.

### SLA donut
- A new **half-donut visualisation** sits next to the chip row in the hero. It shows the **most critical** SLA — ranked by worst state class (danger > warn > ok), tiebreaking by highest percent used. Time-remaining (`2h left` / `15m over`) renders inside the bowl in the matching colour. Auto-hides on tickets with no SLA dates set.
- Hovering the donut shows a native tooltip with all SLAs (`Respond: 92% (15m left) / Fix: 67% (2d left)`); the full per-SLA bars still appear in the Workflow & SLA card below.

### Workflow & timeline
- **The active workflow step pulses slowly** (4-second cycle, opacity 100% → 10% → 100%) while the ticket is open and hasn't reached the final stage. Stops on the final stage or once `dateclosed` lands. Respects `prefers-reduced-motion`.
- **Time-logged actions show the duration** as a small amber pill next to the action title in the timeline (e.g. `15m`, `1h 30m`).
- The "Opened" event is now detected by chronologically-earliest timestamp instead of regex-matching the outcome name — custom outcomes containing the word "logged" no longer hijack the slot.

### Custom ticket types
- Tenant-defined ticket types ("Laptop Request", "Peripherals Request", etc.) are now auto-discovered and added to the palette as `/laptop-request`, `/peripherals-request`, etc. Multiple fallbacks ensure they load: SQL → `/api/TicketType?count=200&includedetails=true` → `localStorage.cache_tickettype` → static schema.
- Custom types appear in the **default palette view** and in **text-search results** (typing "laptop" matches `/laptop-request`).
- **Open-ticket counter** appears in the kind chip (e.g. `12 open`) for every ticket-scoped command — both custom types and built-ins like `/t`, `/i`, `/prob`, `/chg`. Counts resolve via name-match against `cache_tickettype`, summed per command. Refreshed once per palette open, cached 5 min.
- **Email tag prefix pre-fetch** — for non-admin agents who can't run SQL, HaloPlus fetches `/api/TicketType/{id}?includedetails=true` per type on first palette open to learn the `email_start_tag_override` (`[SR-`, `[INC-`, etc.) so ticket titles render as `[SR-0003135] Laptop Request - Standard` instead of an auto-generated `[LR-…]` prefix.
- Clicking `/laptop-request` navigates to Halo's "All Ticket Types" view with `selid={typeId}` — the only Halo URL pattern that filters to a single ticket type across areas.
- Server-side ticket-type filter uses Halo's actual parameter `requesttype=` (`tickettype_ids` is silently ignored by Halo). Verified by direct probing.

### Palette UX
- **Entity-API access probe on init**: each entity endpoint is probed once; commands whose endpoint returned 401/403 are greyed out (45% opacity, "No access" chip, tooltip) and sorted to the bottom of the result list.
- **Admin-only commands hidden for non-admins**: `/cfg` (configuration), `/imp` (impersonate), `/xi` (exit impersonation) are filtered out entirely for users whose claims don't permit them, rather than greyed out — they're action commands, not search commands.
- **ArrowRight autocomplete** for slash commands: type `/peri` → ArrowRight → input becomes `/peripherals-request `, ready for a scope search.
- **Loading spinner row** while entity API calls are in flight (typically 1–2s for ticket/KB lookups).
- **Ticket results show a coloured status pill** (e.g. green "Resolved", yellow "On Hold") drawn from Halo's per-status colour in `cache_status`. Pill colour is sanitised to hex/rgb before injection so a malformed cache entry can't break out into other styles.
- **Partial numeric ID search** in scoped ticket commands: `/i 30` now surfaces ticket #3079 (recent-tickets fetch + client-side ID-contains filter + always-attempt exact `/api/tickets/30` lookup as a top hit).
- **Ticket titles use the format `[IN-0003079]`** (2-letter prefix, dash, zero-padded 7-digit ID). Subtitles show ticket type + end-user + client (de-duped).
- **`/i` filters to Incidents only**, `/t` remains an all-tickets catch-all.
- New aliases: `/client`, `/clients`, `/org`, `/orgs`, `/organisation`, `/organisations` (already in 1.1.1).

### KB results
- KB subtitles now include the article **category** (FAQ list / KB category / category_1, etc.) alongside the description snippet.
- `/kb` now hits the correct Halo endpoint `/api/KBArticle` (was `/api/kbentry`, which doesn't exist — kbentry is the underlying SQL table name).

### Side panel & icon
- **Extension icon is greyed out** on non-Halo tabs and lights up on real Halo tenants (built-in `*.halopsa.com`, `*.haloitsm.com`, `*.haloservicedesk.com` patterns and any user-added custom domain with Chrome host permission actually granted). Greyscale is computed once via `OffscreenCanvas` from the bundled PNG and cached for the service-worker lifetime — no extra image assets bundled.
- **Adding/removing a custom domain** in Settings refreshes all open tab icons immediately; no reload needed for the affected tabs to light up.
- **"HaloPlus needs a tab refresh" notice** in the side panel for the case where the active tab is a Halo URL but the content script didn't respond — typical post-CWS-update state on an already-open Halo tab. Includes a one-click Refresh button.
- **`/api/Report` access notice** rewritten in plain language — no longer references the endpoint path or the `Can_Use_DataSources` / `Can_Use_Reports` role codenames.
- **Command palette utility icon** changed to a clean diagonal slash, matching the `/` keystroke that opens it.
- **Ticket 360 utility icon** now uses the same panel-outline shape as the in-page injected button so the visual identity is consistent.

### Diagnostics
- The Settings → Diagnostics card now reports the agent's Halo role (admin flag, impersonation state, total claims, key permissions), the `/api/Report` probe result, per-entity API access for all 10 endpoints, and ticket type loading status. Makes "why isn't this working for me?" a one-click answer.

### Fixes
- **Custom domain save no longer fails on the first attempt.** Chrome's permission prompt steals focus from the side-panel popup and closes it, killing the save handler mid-await. The save now writes to storage before requesting permission, and a service-worker `chrome.permissions.onAdded` listener completes the content-script registration even if the popup died. Explicit denial rolls back the eager save. Saved domains without an active Chrome permission no longer light up the icon — they fall through to the existing "Re-grant access" banner.
- **Halo's public docs site (`haloitsm.com`, etc.) no longer counts as a Halo tenant.** The host pattern now requires at least one subdomain segment, matching what `*.haloitsm.com/*` already required at the manifest level.
- `/q` (quotes) now correctly unwraps the response envelope (Halo's `/api/quotation` returns `{quotes: [...]}`, not `{quotations: [...]}`).
- `/api/agent` and `/api/asset` are accepted both as bare arrays and as named-array envelopes (some Halo versions wrap, others don't).
- Halo's "no value" date sentinel (1900-01-01) is filtered out of Ticket 360 / Timeline so empty fields render blank instead of "Jan 01, 1900".
- Out-of-order `datecleared` (before `dateoccurred`) is treated as unset so the SLA arc and time card stay consistent.
- Agent picker grouping de-duplicates by team id OR name. Halo's `/api/agent` can return the same agent under multiple team records (with one carrying `id: null`); the picker now sorts id-bearing entries first so the dedup keeps the usable copy.
- Sticky team header in the agent picker no longer bleeds — `z-index` + flush-top positioning prevents items from peeking above it.
- Linked records section auto-hides when nothing's linked, instead of rendering an orphan section header.

## 1.1.1

### Fixes
- `/client`, `/clients`, `/org`, `/orgs`, `/organisation`, `/organisations` (and US-spelling variants) now resolve to the customer search. Previously only `/c` worked, so users typing the full word saw no command.
- After upgrading the extension, custom Halo domains saved in Settings were appearing as configured but Chrome had revoked the host permission — silently breaking page detection. The "Halo page not detected" banner now detects this state, names the affected domains, and offers a **Re-grant access** button that re-requests Chrome's permission and re-registers the dynamic content script in one click.
- `chrome.scripting.registerContentScripts` errors used to be swallowed silently when permission was missing. The service worker now records the last registration error to `chrome.storage.local` (`huCustomDomainLastError`) so the panel can surface it.
- Adding a custom Halo domain with a port (`halo.example.com:8080`) used to silently strip the port and save a pattern that never matched. The Settings form now refuses domains with ports and explains that Chrome's permission system covers the host on any port.

### Diagnostics
- Added a **Diagnostics** card to Settings → Help & About. **Run diagnostics** runs a live check of Chrome permission status per saved domain, whether the dynamic content script is registered for each match, the active tab's URL, and whether the content script responds on it. **Copy diagnostics** puts a plain-text summary on the clipboard so users can share their state with support without using DevTools.

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
