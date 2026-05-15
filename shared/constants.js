// Constants shared between the service worker and the side panel. Content
// script doesn't currently need these, so it inlines its own values.
//
// Requires at least one subdomain segment. The bare apex (haloitsm.com, etc.)
// is Halo's public docs / marketing site — not a real tenant instance.
var HALO_HOST_PATTERN = /\.(halopsa\.com|haloitsm\.com|haloservicedesk\.com)$/i;
