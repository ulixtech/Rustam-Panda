/**
 * Meta AdSpy Pro - GraphQL Interceptor
 * Injected into the MAIN world to hook window.fetch and XMLHttpRequest.
 * Captures all internal GraphQL network payloads containing deep ad structures.
 */
(function() {
  if (window.__ADSPY_INTERCEPTOR_INITIALIZED__) return;
  window.__ADSPY_INTERCEPTOR_INITIALIZED__ = true;

  console.log('[Meta AdSpy Pro] Network interceptor activated in main world.');

  function dispatchInterceptedData(source, rawData) {
    if (!rawData) return;
    try {
      let json = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      window.postMessage({
        type: 'ADSPY_RAW_GRAPHQL',
        source: source,
        payload: json,
        timestamp: Date.now()
      }, '*');
    } catch (e) {
      // If rawData contains multiple newline-delimited JSONs (batch GraphQL responses)
      if (typeof rawData === 'string' && rawData.includes('\n')) {
        const lines = rawData.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              window.postMessage({
                type: 'ADSPY_RAW_GRAPHQL',
                source: source,
                payload: parsed,
                timestamp: Date.now()
              }, '*');
            } catch (err) {}
          }
        }
      }
    }
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (url.includes('/api/graphql') || url.includes('/graphql')) {
        const clone = response.clone();
        clone.text().then(text => {
          if (text.includes('ad_archive_id') || text.includes('ad_library') || text.includes('snapshot') || text.includes('publisher_platform')) {
            dispatchInterceptedData('fetch', text);
          }
        }).catch(() => {});
      }
    } catch (e) {
      // Silently pass through
    }
    return response;
  };

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._adspy_url = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      try {
        const url = this._adspy_url || '';
        if (typeof url === 'string' && (url.includes('/api/graphql') || url.includes('/graphql'))) {
          const text = this.responseText;
          if (text && (text.includes('ad_archive_id') || text.includes('ad_library') || text.includes('snapshot') || text.includes('publisher_platform'))) {
            dispatchInterceptedData('xhr', text);
          }
        }
      } catch (e) {}
    });
    return originalXhrSend.apply(this, arguments);
  };

  // 3. Scan existing page scripts for embedded Relay data or initial state
  function scanPageScripts() {
    try {
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const content = script.textContent || '';
        if (content.includes('ad_archive_id') && content.includes('snapshot')) {
          // Look for JSON-like chunks
          const matches = content.match(/\{"ad_archive_id":.+?\}(?=\);|,)/g);
          if (matches) {
            matches.forEach(match => dispatchInterceptedData('script_tag', match));
          }
        }
      });
    } catch (e) {}
  }

  // Scan once DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanPageScripts);
  } else {
    scanPageScripts();
  }
})();
