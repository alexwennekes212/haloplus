const CUSTOM_DOMAINS_KEY = 'huCustomHaloDomains';
const CUSTOM_CONTENT_SCRIPT_ID = 'haloplus-custom-domains';

chrome.runtime.onInstalled.addListener(() => {
  registerCustomDomainContentScript();
});

chrome.runtime.onStartup?.addListener(() => {
  registerCustomDomainContentScript();
});

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
    return { ok: true, count: matches.length };
  } catch (error) {
    chrome.storage.local.set({ huCustomDomainLastError: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HU_REGISTER_CUSTOM_DOMAINS') {
    registerCustomDomainContentScript()
      .then(result => sendResponse(result))
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
