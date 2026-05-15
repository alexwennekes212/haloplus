importScripts('shared/constants.js');

const CUSTOM_DOMAINS_KEY = 'huCustomHaloDomains';
const CUSTOM_CONTENT_SCRIPT_ID = 'haloplus-custom-domains';
// HALO_HOST_PATTERN is provided by shared/constants.js

// Cached icon ImageData (color + grey). Computed once, kept until the service
// worker is killed — Chrome can do that any time, so loadIconBitmaps() is
// idempotent and called from each onActivated/onUpdated handler.
let iconCache = null;

chrome.runtime.onInstalled.addListener(() => {
  registerCustomDomainContentScript();
  refreshAllTabIcons();
});

chrome.runtime.onStartup?.addListener(() => {
  registerCustomDomainContentScript();
  refreshAllTabIcons();
});

// When the user grants a host permission via chrome.permissions.request, fire
// the content-script registration here too. The panel-side handler does the
// same on success, but the action popup typically CLOSES the moment Chrome's
// permission prompt appears (focus loss) — so the panel handler often never
// runs. This listener guarantees the registration happens regardless.
chrome.permissions.onAdded?.addListener(() => {
  permissionCache.clear();
  registerCustomDomainContentScript();
  refreshAllTabIcons();
});

chrome.permissions.onRemoved?.addListener(() => {
  // User revoked a permission (chrome://extensions or our own removal flow).
  // Refresh so the icon greys out for any tab whose permission just lapsed.
  permissionCache.clear();
  refreshAllTabIcons();
});

// Update the action icon (color when on a Halo page, grey otherwise) for the
// active tab whenever the user switches tabs or the URL changes.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(tab => updateActionIcon(tabId, tab && tab.url)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // Fire only on URL change or initial load — avoid re-running on every favicon
  // / status / audible event Chrome emits.
  if (info.url || info.status === 'loading' || info.status === 'complete') {
    updateActionIcon(tabId, tab && tab.url);
  }
});

async function loadIconBitmaps() {
  if (iconCache) return iconCache;
  try {
    const [b16, b48] = await Promise.all([
      fetch(chrome.runtime.getURL('icons/icon-16.png')).then(r => r.blob()).then(createImageBitmap),
      fetch(chrome.runtime.getURL('icons/icon-48.png')).then(r => r.blob()).then(createImageBitmap)
    ]);
    const color16 = bitmapToImageData(b16);
    const color48 = bitmapToImageData(b48);
    iconCache = {
      color: { 16: color16, 48: color48 },
      grey:  { 16: applyGreyscale(color16), 48: applyGreyscale(color48) }
    };
  } catch (e) {
    iconCache = null;
  }
  return iconCache;
}

function bitmapToImageData(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function applyGreyscale(imageData) {
  const cloned = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width, imageData.height
  );
  const d = cloned.data;
  for (let i = 0; i < d.length; i += 4) {
    // Luminance-weighted greyscale (Rec.601).
    const grey = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    d[i] = grey;
    d[i + 1] = grey;
    d[i + 2] = grey;
    // Fade alpha slightly to read as "disabled" rather than just monochrome.
    d[i + 3] = Math.round(d[i + 3] * 0.55);
  }
  return cloned;
}

function urlMatchesPattern(url, pattern) {
  // Patterns from huCustomHaloDomains look like "https://halo.example.com/*"
  // (or with a "*." wildcard host). Match scheme + host; path is "/*".
  const m = pattern.match(/^(https?):\/\/([^\/]+)\/.*$/);
  if (!m) return false;
  const [, scheme, host] = m;
  try {
    const u = new URL(url);
    if (u.protocol !== scheme + ':') return false;
    if (host.startsWith('*.')) {
      const suffix = host.slice(2);
      return u.hostname === suffix || u.hostname.endsWith('.' + suffix);
    }
    return u.hostname === host;
  } catch (_) {
    return false;
  }
}

// Cache for chrome.permissions.contains results. Rapid tabs.onUpdated events
// on a single navigation can fire isHaloAllowedUrl 3-5 times — without caching
// each fires an async chrome.permissions.contains for every saved pattern.
// 10s TTL is short enough that user permission changes propagate quickly via
// the existing onAdded/onRemoved listeners, which proactively clear this map.
const permissionCache = new Map();  // pattern → { granted: bool, at: number }
const PERMISSION_CACHE_TTL_MS = 10_000;

async function permissionGranted(pattern) {
  const cached = permissionCache.get(pattern);
  if (cached && Date.now() - cached.at < PERMISSION_CACHE_TTL_MS) {
    return cached.granted;
  }
  const granted = await new Promise(r => chrome.permissions.contains({ origins: [pattern] }, r));
  permissionCache.set(pattern, { granted, at: Date.now() });
  return granted;
}

async function isHaloAllowedUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (HALO_HOST_PATTERN.test(parsed.hostname)) return true;
  } catch (_) {
    return false;
  }
  const data = await storageGet([CUSTOM_DOMAINS_KEY]);
  const matches = Array.isArray(data[CUSTOM_DOMAINS_KEY]) ? data[CUSTOM_DOMAINS_KEY] : [];
  for (const pattern of matches) {
    if (!urlMatchesPattern(url, pattern)) continue;
    // Saved domain only counts as authorized if Chrome ALSO has the
    // permission. Catches the popup-dies + deny case where storage was
    // updated optimistically but the permission grant never landed.
    if (await permissionGranted(pattern)) return true;
  }
  return false;
}

async function updateActionIcon(tabId, url) {
  const cache = await loadIconBitmaps();
  if (!cache) return;
  const allowed = await isHaloAllowedUrl(url);
  try {
    await chrome.action.setIcon({ tabId, imageData: allowed ? cache.color : cache.grey });
    // Hover title explains the icon state — saves a "why is it grey?" support
    // round-trip. Empty/grey state points at the saved-domains config so users
    // know how to enable HaloPlus on a non-standard URL.
    const title = allowed
      ? 'HaloPlus'
      : 'HaloPlus — not active on this page (open a Halo tab or add a custom domain in Settings)';
    await chrome.action.setTitle({ tabId, title });
  } catch (_) {
    // Tab may have been closed between onUpdated firing and us applying.
  }
}

async function refreshAllTabIcons() {
  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
    for (const tab of tabs) {
      if (tab.id != null) updateActionIcon(tab.id, tab.url).catch(() => {});
    }
  } catch (_) {}
}

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function unregisterCustomDomainContentScript() {
  return new Promise(resolve => {
    chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_CONTENT_SCRIPT_ID] }, () => {
      // Chrome reports this on first run before the dynamic script exists.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function registerContentScripts(scripts) {
  return new Promise((resolve, reject) => {
    chrome.scripting.registerContentScripts(scripts, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function registerCustomDomainContentScript() {
  const data = await storageGet([CUSTOM_DOMAINS_KEY]);
  const matches = Array.isArray(data[CUSTOM_DOMAINS_KEY]) ? data[CUSTOM_DOMAINS_KEY] : [];

  await unregisterCustomDomainContentScript();
  if (!matches.length) {
    chrome.storage.local.set({ huCustomDomainLastError: null });
    refreshAllTabIcons();  // user removed last custom domain — re-grey relevant tabs
    return { ok: true, count: 0 };
  }

  try {
    await registerContentScripts([{
      id: CUSTOM_CONTENT_SCRIPT_ID,
      matches,
      js: ['content/content-script.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
    chrome.storage.local.set({ huCustomDomainLastError: null });
    refreshAllTabIcons();  // newly-added domain should light up immediately
    return { ok: true, count: matches.length };
  } catch (error) {
    chrome.storage.local.set({ huCustomDomainLastError: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

async function collectDiagnostics() {
  const data = await storageGet([CUSTOM_DOMAINS_KEY, 'huCustomDomainLastError']);
  const matches = Array.isArray(data[CUSTOM_DOMAINS_KEY]) ? data[CUSTOM_DOMAINS_KEY] : [];

  const permissionResults = await Promise.all(matches.map(match => new Promise(resolve => {
    chrome.permissions.contains({ origins: [match] }, granted => resolve({ match, granted: !!granted }));
  })));

  let registered = [];
  try {
    registered = await new Promise(resolve => {
      chrome.scripting.getRegisteredContentScripts({ ids: [CUSTOM_CONTENT_SCRIPT_ID] }, scripts => {
        void chrome.runtime.lastError;
        resolve(scripts || []);
      });
    });
  } catch (e) {
    registered = [];
  }
  const registeredMatches = (registered[0] && registered[0].matches) || [];

  let activeTab = null;
  let contentScriptReachable = null;
  let activeTabError = null;
  let pageDiagnostics = null;
  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    activeTab = tabs && tabs[0] ? { id: tabs[0].id, url: tabs[0].url || '' } : null;
    if (activeTab && activeTab.id) {
      contentScriptReachable = await new Promise(resolve => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, 1500);
        try {
          chrome.tabs.sendMessage(activeTab.id, { type: 'HU_PING' }, response => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (chrome.runtime.lastError) {
              activeTabError = chrome.runtime.lastError.message || 'no response';
              resolve(false);
              return;
            }
            resolve(!!(response && response.ok));
          });
        } catch (e) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          activeTabError = e.message;
          resolve(false);
        }
      });

      // Pull permission / API access / report status from the content script.
      // Lives behind a separate try so a slow probe doesn't sink the rest.
      if (contentScriptReachable) {
        pageDiagnostics = await new Promise(resolve => {
          let done = false;
          const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 3000);
          try {
            chrome.tabs.sendMessage(activeTab.id, { type: 'HU_GET_PAGE_DIAGNOSTICS' }, response => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              void chrome.runtime.lastError;
              resolve(response && response.ok ? response.data : null);
            });
          } catch (e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
      }
    }
  } catch (e) {
    activeTabError = e.message;
  }

  return {
    extensionVersion: chrome.runtime.getManifest().version,
    savedDomains: matches,
    permissionsPerDomain: permissionResults,
    registeredMatches,
    lastRegistrationError: data.huCustomDomainLastError || null,
    activeTab,
    contentScriptReachable,
    activeTabError,
    page: pageDiagnostics,
    timestamp: new Date().toISOString()
  };
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HU_REGISTER_CUSTOM_DOMAINS') {
    registerCustomDomainContentScript()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'HU_GET_DIAGNOSTICS') {
    collectDiagnostics()
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'HALO_CONTEXT') {
    // Forward page context to the side panel (panel may not be open - suppress the rejection)
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', data: message.data },
      () => void chrome.runtime.lastError
    );
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'HU_OPEN_SETTINGS') {
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/panel.html?view=tab') }, () => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'HU_OPEN_REVIEW') {
    chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/haloplus/ondioamcpkphlebmeocbhjmpdodpmklp/reviews' }, () => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'RUN_HALO_REPORT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No active Halo tab found.' });
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: 'Open a Halo tab and refresh it so HaloPlus can connect to the current session.'
          });
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }

  if (message.type?.startsWith('HU_')) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No active Halo tab found.' });
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: 'Open a Halo tab and refresh it so HaloPlus can connect to the page.'
          });
          return;
        }
        sendResponse(response || { ok: true });
      });
    });
    return true;
  }

  return false;
});
