document.addEventListener('DOMContentLoaded', async () => {
  const btnOpenLib = document.getElementById('btn-open-library');
  const btnToggleAuto = document.getElementById('btn-toggle-autoscroll');
  const btnToggleStudio = document.getElementById('btn-toggle-studio');
  const liveCountEl = document.getElementById('popup-live-count');

  let currentTabId = null;
  let isAutoScrolling = false;

  // Query active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      // Request status from content script
      chrome.tabs.sendMessage(currentTabId, { action: 'GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          if (liveCountEl) liveCountEl.textContent = 'Tab not on Ads Library';
          if (btnToggleAuto) btnToggleAuto.disabled = true;
          if (btnToggleStudio) btnToggleStudio.disabled = true;
          return;
        }

        if (liveCountEl) liveCountEl.textContent = `${response.totalAds} Ads`;
        isAutoScrolling = response.isAutoScrolling;
        updateAutoBtnState();
      });
    }
  } catch (e) {}

  function updateAutoBtnState() {
    if (!btnToggleAuto) return;
    const txtSpan = document.getElementById('btn-autoscroll-text');
    if (isAutoScrolling) {
      if (txtSpan) txtSpan.textContent = 'Stop Auto-Scroll';
      btnToggleAuto.classList.add('popup-btn-autoscroll-active');
    } else {
      if (txtSpan) txtSpan.textContent = 'Auto-Scroll';
      btnToggleAuto.classList.remove('popup-btn-autoscroll-active');
    }
  }

  // Toggle Auto-Scroll
  if (btnToggleAuto) {
    btnToggleAuto.addEventListener('click', () => {
      if (!currentTabId) return;
      if (isAutoScrolling) {
        chrome.tabs.sendMessage(currentTabId, { action: 'STOP_AUTO_SCROLL' }, () => {
          if (chrome.runtime.lastError) return;
          isAutoScrolling = false;
          updateAutoBtnState();
        });
      } else {
        chrome.tabs.sendMessage(currentTabId, { action: 'START_AUTO_SCROLL' }, () => {
          if (chrome.runtime.lastError) return;
          isAutoScrolling = true;
          updateAutoBtnState();
        });
      }
    });
  }

  // Toggle Studio Drawer on page
  if (btnToggleStudio) {
    btnToggleStudio.addEventListener('click', () => {
      if (!currentTabId) return;
      chrome.tabs.sendMessage(currentTabId, { action: 'TOGGLE_STUDIO' }, () => {
        if (chrome.runtime.lastError) return;
      });
      window.close(); // Close popup so user sees the drawer
    });
  }

  // Open Ads Library
  if (btnOpenLib) {
    btnOpenLib.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL'
      });
    });
  }

  // --- OPENROUTER API KEY PERSISTENCE ---
  const inputApiKey = document.getElementById('popup-input-apikey');
  const btnSaveKey = document.getElementById('popup-btn-save-key');
  const btnToggleKey = document.getElementById('popup-btn-toggle-key');
  const apiStatusBadge = document.getElementById('popup-api-status');

  function updateApiStatus(key) {
    if (!apiStatusBadge) return;
    if (key && key.trim().length > 0) {
      apiStatusBadge.textContent = 'Connected';
      apiStatusBadge.className = 'popup-api-badge connected';
    } else {
      apiStatusBadge.textContent = 'Not Set';
      apiStatusBadge.className = 'popup-api-badge not-set';
    }
  }

  // Load API key from chrome.storage (sync -> local fallback)
  try {
    if (chrome.storage) {
      chrome.storage.sync.get(['rustam_openrouter_key'], (syncRes) => {
        let key = syncRes?.rustam_openrouter_key;
        if (!key && chrome.storage.local) {
          chrome.storage.local.get(['rustam_openrouter_key'], (localRes) => {
            key = localRes?.rustam_openrouter_key || '';
            if (inputApiKey) inputApiKey.value = key;
            updateApiStatus(key);
          });
        } else {
          if (inputApiKey) inputApiKey.value = key || '';
          updateApiStatus(key);
        }
      });
    }
  } catch (e) {}

  // Toggle API key visibility (password vs text)
  if (btnToggleKey && inputApiKey) {
    btnToggleKey.addEventListener('click', () => {
      if (inputApiKey.type === 'password') {
        inputApiKey.type = 'text';
      } else {
        inputApiKey.type = 'password';
      }
    });
  }

  // Save API key permanently
  if (btnSaveKey && inputApiKey) {
    btnSaveKey.addEventListener('click', () => {
      const keyVal = inputApiKey.value.trim();

      try {
        if (chrome.storage) {
          if (chrome.storage.sync) {
            chrome.storage.sync.set({ rustam_openrouter_key: keyVal }, () => {});
          }
          if (chrome.storage.local) {
            chrome.storage.local.set({ rustam_openrouter_key: keyVal }, () => {});
          }
        }
      } catch (e) {}

      // Broadcast to all active tabs
      try {
        chrome.tabs.query({}, (tabs) => {
          (tabs || []).forEach(tab => {
            if (tab && tab.id) {
              chrome.tabs.sendMessage(tab.id, { action: 'UPDATE_API_KEY', apiKey: keyVal }, () => {
                if (chrome.runtime.lastError) {} // Ignore tabs without content script
              });
            }
          });
        });
      } catch (e) {}

      updateApiStatus(keyVal);
      btnSaveKey.textContent = 'Saved! ✓';
      btnSaveKey.classList.add('saved');
      setTimeout(() => {
        if (btnSaveKey) {
          btnSaveKey.textContent = 'Save';
          btnSaveKey.classList.remove('saved');
        }
      }, 1600);
    });
  }
});
