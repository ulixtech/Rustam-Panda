/**
 * Rustam Panda - Content Script
 * Developed by @abbyisonline
 * Features:
 * - Meta Ads Library GraphQL interceptor
 * - Automated smooth pagination with anti-bot pacing
 * - Campaign -> AdSet -> Ad folder tree hierarchy
 * - AI Competitor Intelligence Analyzer with OpenRouter integration & Model Selection
 * - System Prompt customization & Strategy Presets
 * - Moody white-base theme with dark mode option
 */

(function () {
  if (window.__ADSPY_CONTENT_INITIALIZED__) return;
  window.__ADSPY_CONTENT_INITIALIZED__ = true;

  console.log('[Rustam Panda] Initialized on Meta Ads Library. Developed by @abbyisonline.');

  // State store
  const capturedAds = new Map(); // key: ad_archive_id -> normalized ad object
  let activeTab = 'all'; // 'all', 'evergreen', 'dynamic', 'video', 'image'
  let viewMode = 'cards'; // 'cards', 'tree', or 'ai'
  let searchQuery = '';
  let sortBy = 'longest'; // 'longest', 'newest', 'variants'
  let isPanelOpen = false;
  let currentTheme = localStorage.getItem('adspy_theme') || 'light'; // Default to moody white base
  const PANDA_IMG_URL = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icons/panda.jpg') : '';

  // Auto-Scroll & Pagination Collector state
  let isAutoScrolling = false;
  let autoScrollTimer = null;
  let autoScrollTargetLimit = 0; // 0 = unlimited / all
  let consecutiveNoNewAdsCount = 0;
  let lastCapturedCount = 0;

  // --- AI INTELLIGENCE & OPENROUTER STATE ---
  let openRouterApiKey = '';
  try { openRouterApiKey = localStorage.getItem('rustam_openrouter_key') || ''; } catch(e){}
  let selectedAiModel = 'anthropic/claude-3.5-sonnet';
  try { selectedAiModel = localStorage.getItem('rustam_ai_model') || 'anthropic/claude-3.5-sonnet'; } catch(e){}
  let customAiModel = '';
  try { customAiModel = localStorage.getItem('rustam_custom_model') || ''; } catch(e){}
  let isAiAnalyzing = false;
  let lastAiAnalysisReport = '';
  try { lastAiAnalysisReport = localStorage.getItem('rustam_last_analysis') || ''; } catch(e){}
  let aiAnalysisScope = 'all'; // 'all', 'evergreen', 'filtered', or specific ad_id
  let singleTargetAdId = null;

  // Load permanent API key and AI settings from Chrome Extension Storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (chrome.storage.sync) {
      chrome.storage.sync.get(['rustam_openrouter_key', 'rustam_custom_model', 'rustam_ai_model', 'rustam_custom_prompt'], (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.rustam_openrouter_key) {
          openRouterApiKey = res.rustam_openrouter_key;
          try { localStorage.setItem('rustam_openrouter_key', openRouterApiKey); } catch(e){}
        }
        if (res.rustam_custom_model) customAiModel = res.rustam_custom_model;
        if (res.rustam_ai_model) selectedAiModel = res.rustam_ai_model;
        if (res.rustam_custom_prompt) customSystemPrompt = res.rustam_custom_prompt;
      });
    }
    if (chrome.storage.local) {
      chrome.storage.local.get(['rustam_openrouter_key', 'rustam_custom_model', 'rustam_ai_model', 'rustam_custom_prompt'], (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.rustam_openrouter_key && !openRouterApiKey) {
          openRouterApiKey = res.rustam_openrouter_key;
          try { localStorage.setItem('rustam_openrouter_key', openRouterApiKey); } catch(e){}
        }
        if (res.rustam_custom_model && !customAiModel) customAiModel = res.rustam_custom_model;
        if (res.rustam_ai_model && !selectedAiModel) selectedAiModel = res.rustam_ai_model;
        if (res.rustam_custom_prompt && !customSystemPrompt) customSystemPrompt = res.rustam_custom_prompt;
      });
    }
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.rustam_openrouter_key) {
          openRouterApiKey = changes.rustam_openrouter_key.newValue || '';
          try { localStorage.setItem('rustam_openrouter_key', openRouterApiKey); } catch(e){}
        }
        if (changes.rustam_custom_model) {
          customAiModel = changes.rustam_custom_model.newValue || '';
        }
        if (changes.rustam_ai_model) {
          selectedAiModel = changes.rustam_ai_model.newValue || selectedAiModel;
          populateModelSelector();
        }
      });
    }
  }

  let openRouterModelsList = [];
  let isFetchingModels = false;
  try {
    const cachedModels = localStorage.getItem('rustam_cached_models');
    if (cachedModels) {
      const parsed = JSON.parse(cachedModels);
      if (Array.isArray(parsed) && parsed.length > 0) {
        openRouterModelsList = parsed;
      }
    }
  } catch (e) {
    openRouterModelsList = [];
  }

  const TOP_RECOMMENDED_MODELS = [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Recommended)' },
    { id: 'openai/gpt-4o', name: 'GPT-4o (Flagship)' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Super Fast)' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (Top Value)' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Deep Reasoning)' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    { id: 'mistralai/mistral-large-2411', name: 'Mistral Large' }
  ];

  function updateFetchModelBtnUI(isFetching) {
    const btn = document.getElementById('adspy-btn-fetch-models');
    if (!btn) return;
    if (isFetching) {
      btn.classList.add('adspy-fetching');
      btn.innerHTML = `${lucide('refresh-cw', '', 11)} <span>Fetching...</span>`;
      btn.disabled = true;
    } else {
      btn.classList.remove('adspy-fetching');
      const count = openRouterModelsList.length > 0 ? ` (${openRouterModelsList.length})` : '';
      btn.innerHTML = `${lucide('refresh-cw', '', 11)} <span>Fetch Models${count}</span>`;
      btn.disabled = false;
    }
  }

  function populateModelSelector() {
    const select = document.getElementById('adspy-select-model');
    if (!select) return;

    const currentVal = selectedAiModel || 'anthropic/claude-3.5-sonnet';
    const recIds = new Set(TOP_RECOMMENDED_MODELS.map(m => m.id));

    let html = '';
    html += '<optgroup label="⭐ Top Recommended">';
    TOP_RECOMMENDED_MODELS.forEach(m => {
      const isSel = (currentVal === m.id) ? 'selected' : '';
      html += `<option value="${escapeHtml(m.id)}" ${isSel}>${escapeHtml(m.name)}</option>`;
    });
    html += '</optgroup>';

    if (Array.isArray(openRouterModelsList) && openRouterModelsList.length > 0) {
      const liveModels = openRouterModelsList.filter(m => m && m.id && !recIds.has(m.id));
      html += `<optgroup label="🌐 Live OpenRouter Models (${openRouterModelsList.length} total)">`;
      liveModels.forEach(m => {
        const isSel = (currentVal === m.id) ? 'selected' : '';
        const displayName = m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id;
        html += `<option value="${escapeHtml(m.id)}" ${isSel}>${escapeHtml(displayName)}</option>`;
      });
      html += '</optgroup>';
    }

    html += '<optgroup label="⚙️ Custom">';
    const customSel = (currentVal === 'custom') ? 'selected' : '';
    html += `<option value="custom" ${customSel}>Custom Model Slug...</option>`;
    html += '</optgroup>';

    select.innerHTML = html;

    let found = false;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value === currentVal) {
        found = true;
        break;
      }
    }
    if (!found && currentVal && currentVal !== 'custom') {
      const opt = document.createElement('option');
      opt.value = currentVal;
      opt.textContent = `${currentVal} (Selected)`;
      opt.selected = true;
      select.insertBefore(opt, select.firstChild);
    }

    select.value = currentVal;
  }

  async function fetchOpenRouterModels(force = false) {
    if (isFetchingModels) return;
    if (!force && openRouterModelsList && openRouterModelsList.length > 0) {
      populateModelSelector();
      updateFetchModelBtnUI(false);
      return;
    }

    isFetchingModels = true;
    updateFetchModelBtnUI(true);

    try {
      const headers = {
        'HTTP-Referer': 'https://facebook.com/ads/library',
        'X-Title': 'Rustam Panda'
      };
      if (openRouterApiKey && openRouterApiKey.trim()) {
        headers['Authorization'] = `Bearer ${openRouterApiKey.trim()}`;
      }

      const res = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch models`);
      }

      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        openRouterModelsList = json.data.map(m => ({
          id: m.id,
          name: m.name || m.id,
          context_length: m.context_length || 0
        })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        try {
          localStorage.setItem('rustam_cached_models', JSON.stringify(openRouterModelsList));
        } catch (e) {}

        populateModelSelector();
        showNotification(`Fetched ${openRouterModelsList.length} models from OpenRouter!`, 'success');
      } else {
        throw new Error('No models returned from OpenRouter');
      }
    } catch (err) {
      console.warn('[Rustam Panda] OpenRouter models fetch failed:', err);
      if (force) {
        showNotification(`Could not fetch models: ${err.message}`, 'warning');
      }
    } finally {
      isFetchingModels = false;
      updateFetchModelBtnUI(false);
    }
  }

  const DEFAULT_SYSTEM_PROMPTS = {
    strategy: `You are Rustam Panda AI, an elite media buyer, competitive intelligence analyst, and direct-response advertising strategist.
Analyze the provided competitor ads data from Meta Ads Library.
Generate a comprehensive, actionable, and executive-level Competitor Intelligence Dossier.
Structure your report clearly with the following sections:
1. 🎯 EXECUTIVE SUMMARY & CORE POSITIONING: What are they selling, what is their primary value proposition, and how aggressively are they scaling?
2. 👥 TARGET AUDIENCE PERSONAS & PAIN POINTS: Identify their primary customer avatars, acute pain points exploited, and emotional triggers used.
3. 🎣 WINNING HOOKS & ANGLES: Analyze their top hooks, opening angles, and psychological frameworks.
4. 🧱 FUNNEL & OFFER TEARDOWN: Analyze their Call-To-Actions, landing page destinations, UTM parameters, and conversion strategy.
5. ⚔️ COUNTER-ATTACK STRATEGY & 3 WINNING AD SCRIPTS: Provide 3 concrete, battle-tested counter-ad concepts (Hook, Copy, Creative direction) that an advertiser can run to beat this competitor in the Meta ad auction.`,

    copywriting: `You are Rustam Panda AI, a master direct-response copywriter.
Analyze the competitor's ad copy, headlines, and calls to action.
Break down:
1. 💡 PSYCHOLOGICAL TRIGGERS: Urgency, social proof, curiosity, transformation, and status.
2. ✍️ HEADLINE & HOOK FORMULAS: Deconstruct their top-performing hook structures into reusable formulas.
3. 🎯 OFFER ARCHITECTURE: Guarantees, bonuses, pricing psychology, and risk reversal.
4. 📝 3 PLUG-AND-PLAY COPY TEMPLATES: Create 3 high-converting ad copy templates inspired by this competitor's proven winners.`,

    evergreen: `You are Rustam Panda AI, a performance marketing expert specializing in scale and ad fatigue.
Analyze the competitor's longest-running (Evergreen) ads.
Break down:
1. 🔥 THE SCALING ENGINE: Why have these specific ads run for weeks/months without fatiguing?
2. 🎨 CREATIVE FORMATS: Video vs Image vs Carousel distribution and visual hook mechanics.
3. 🛡️ AD FATIGUE RESISTANCE: How they vary copy/creative to maintain high ROAS.
4. 🚀 ACTION PLAN: Exactly how to produce a winning creative asset that achieves similar evergreen lifespan.`,

    single: `You are Rustam Panda AI. Analyze this specific Meta ad creative in forensic detail.
Break down:
1. 🎣 THE HOOK: Why this hook grabs attention in the feed (psychological trigger).
2. 📖 CORE MESSAGE & PAIN POINTS: The narrative, mechanism of action, and customer objection addressed.
3. 🎯 CTA & DESTINATION: How the ad primes the user for the landing page.
4. 🚀 2 VARIANT HOOKS: Suggest 2 alternative high-converting hooks for this exact concept.`
  };

  let selectedSystemPromptKey = localStorage.getItem('rustam_prompt_key') || 'strategy';
  let customSystemPrompt = localStorage.getItem('rustam_custom_prompt') || DEFAULT_SYSTEM_PROMPTS[selectedSystemPromptKey];

  // --- LUCIDE SVG ICONS SYSTEM ---
  function lucide(name, className = '', size = 16) {
    const icons = {
      'sparkles': `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>`,
      'folder': `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`,
      'folder-open': `<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>`,
      'sun': `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
      'moon': `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
      'download': `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
      'copy': `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
      'check': `<polyline points="20 6 9 17 4 12"/>`,
      'play': `<polygon points="6 3 20 12 6 21 6 3"/>`,
      'square': `<rect width="18" height="18" x="3" y="3" rx="2"/>`,
      'search': `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
      'filter': `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`,
      'layers': `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
      'flame': `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
      'external-link': `<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,
      'x': `<path d="M18 6 6 18"/><path d="M6 6l12 12"/>`,
      'chevron-right': `<path d="m9 18 6-6-6-6"/>`,
      'chevron-down': `<path d="m6 9 6 6 6-6"/>`,
      'calendar': `<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>`,
      'video': `<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>`,
      'image': `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`,
      'target': `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
      'link': `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
      'grid': `<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>`,
      'brain': `<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>`,
      'settings': `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
      'refresh-cw': `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>`,
      'zap': `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
      'file-text': `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>`,
      'printer': `<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect width="12" height="8" x="6" y="14"></rect>`,
      'key': `<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>`
    };

    const path = icons[name] || icons['sparkles'];
    return `<svg class="lucide lucide-${name} ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  // URL Helper to unmask Facebook redirect URLs (e.g., https://l.facebook.com/l.php?u=...)
  function unmaskUrl(url) {
    if (!url) return '';
    try {
      if (url.includes('facebook.com/l.php')) {
        const parsed = new URL(url);
        const target = parsed.searchParams.get('u');
        if (target) {
          return decodeURIComponent(target);
        }
      }
    } catch (e) {}
    return url;
  }

  // Parse UTM parameters and funnel tracking tags from URL
  function extractTrackingParams(rawUrl) {
    const cleanUrl = unmaskUrl(rawUrl);
    if (!cleanUrl) return { cleanUrl: '', fullUrl: '', domain: '', params: {} };
    try {
      const urlObj = new URL(cleanUrl);
      const params = {};
      const utmKeys = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'campaign_id', 'adset_id', 'ad_id', 'pixel_id',
        'campaign', 'adset', 'ad'
      ];
      
      urlObj.searchParams.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (utmKeys.includes(lowerKey) || lowerKey.startsWith('utm_')) {
          params[key] = value;
        }
      });

      return {
        cleanUrl: cleanUrl.split('?')[0],
        fullUrl: cleanUrl,
        domain: urlObj.hostname.replace(/^www\./, ''),
        params: params
      };
    } catch (e) {
      return { cleanUrl: cleanUrl, fullUrl: cleanUrl, domain: '', params: {} };
    }
  }

  // Normalize timestamp to readable format and days active
  function calculateLifespan(startTimestamp, endTimestamp) {
    if (!startTimestamp) return { startDate: 'Unknown', daysRunning: 0, isEvergreen: false };
    const startMs = startTimestamp > 100000000000 ? startTimestamp : startTimestamp * 1000;
    const startDate = new Date(startMs);
    const now = Date.now();
    const diffTime = Math.max(0, now - startMs);
    const daysRunning = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return {
      startDate: startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      startTime: startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      daysRunning: daysRunning,
      isEvergreen: daysRunning >= 21
    };
  }

  // Recursive search for ad objects inside GraphQL JSON tree
  function findAdNodes(node, results = []) {
    if (!node || typeof node !== 'object') return results;

    if (node.ad_archive_id || (node.snapshot && (node.snapshot.body || node.snapshot.link_url || node.snapshot.images))) {
      results.push(node);
      return results;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        findAdNodes(item, results);
      }
    } else {
      for (const key of Object.keys(node)) {
        findAdNodes(node[key], results);
      }
    }
    return results;
  }

  // Normalize ad node into standard structure
  function normalizeAd(raw) {
    const archiveId = String(raw.ad_archive_id || raw.archive_id || raw.id || `ad_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
    const snapshot = raw.snapshot || {};

    // Ad Copy / Primary Text
    let bodyText = '';
    if (typeof snapshot.body === 'string') {
      bodyText = snapshot.body;
    } else if (snapshot.body && snapshot.body.markup && snapshot.body.markup.__html) {
      try {
        const doc = new DOMParser().parseFromString(snapshot.body.markup.__html, 'text/html');
        bodyText = (doc && doc.body) ? (doc.body.textContent || doc.body.innerText || '') : '';
      } catch (e) {
        bodyText = String(snapshot.body.markup.__html).replace(/<[^>]*>?/gm, '');
      }
    } else if (snapshot.body && typeof snapshot.body.text === 'string') {
      bodyText = snapshot.body.text;
    }

    // Headline & Link Info
    const headline = snapshot.title || snapshot.headline || '';
    const caption = snapshot.caption || snapshot.display_url || '';
    const linkDescription = snapshot.link_description || '';
    const ctaText = snapshot.cta_text || snapshot.cta_title || snapshot.call_to_action_title || '';
    const ctaType = snapshot.cta_type || '';

    // Destination URL & UTM Tracking Breakdown
    const rawLinkUrl = snapshot.link_url || snapshot.link || '';
    const trackingInfo = extractTrackingParams(rawLinkUrl);

    // Media: Images
    const images = [];
    if (Array.isArray(snapshot.images)) {
      snapshot.images.forEach(img => {
        const url = img.original_image_url || img.resized_image_url || (typeof img === 'string' ? img : '');
        if (url && !images.includes(url)) images.push(url);
      });
    }

    // Media: Videos
    const videos = [];
    if (Array.isArray(snapshot.videos)) {
      snapshot.videos.forEach(vid => {
        const hd = vid.video_hd_url || vid.hd_url || '';
        const sd = vid.video_sd_url || vid.sd_url || '';
        const preview = vid.video_preview_image_url || vid.preview_url || '';
        if (hd || sd) {
          videos.push({
            hdUrl: hd,
            sdUrl: sd,
            preview: preview,
            downloadUrl: hd || sd
          });
        }
      });
    }

    // Carousel Cards
    const cards = [];
    if (Array.isArray(snapshot.cards)) {
      snapshot.cards.forEach(card => {
        const cardTrack = extractTrackingParams(card.link_url || '');
        cards.push({
          title: card.title || '',
          body: card.body || '',
          linkUrl: cardTrack.fullUrl,
          cleanUrl: cardTrack.cleanUrl,
          imageUrl: card.image_url || card.original_image_url || '',
          videoUrl: card.video_hd_url || card.video_sd_url || ''
        });
      });
    }

    // Platforms
    let platforms = raw.publisher_platform || raw.publisher_platforms || [];
    if (!Array.isArray(platforms)) platforms = [platforms].filter(Boolean);
    if (platforms.length === 0 && raw.platforms) platforms = raw.platforms;

    // Timestamps and Active duration
    const startTimestamp = raw.start_date || raw.creation_time || snapshot.creation_time;
    const endTimestamp = raw.end_date || raw.stop_time;
    const lifespan = calculateLifespan(startTimestamp, endTimestamp);

    // Dynamic Creative Variations (Collation)
    const collationCount = raw.collation_count || (raw.collated_results ? raw.collated_results.length : 1);
    const collationId = raw.collation_id || null;

    // EU Transparency & Demographic Targeting
    const euTransparency = raw.eu_transparency || {};
    const demographicTargeting = {
      ages: euTransparency.target_ages || raw.target_ages || null,
      gender: euTransparency.target_gender || raw.target_gender || null,
      locations: euTransparency.target_locations || raw.target_locations || null,
      reach: euTransparency.eu_total_reach || null,
      beneficiary: euTransparency.beneficiary_name || raw.beneficiary_name || null,
      payer: euTransparency.payer_name || raw.payer_name || null
    };

    // Page Info
    const pageId = raw.page_id || snapshot.page_id || raw.page_info?.id || '';
    const pageName = raw.page_name || snapshot.page_name || raw.page_info?.name || 'Meta Advertiser';
    const pageProfilePic = snapshot.page_profile_picture_url || raw.page_profile_picture_url || '';

    // Campaign & AdSet Folder Mapping
    const p = trackingInfo.params;
    const campaignName = p.utm_campaign || p.campaign || p.campaign_id || (pageName ? `${pageName} Campaign` : 'Core Marketing Campaign');
    const adsetName = p.utm_content || p.adset || p.adset_id || p.utm_term || (collationId ? `Variant Set #${collationId}` : 'Target Audience Set');

    return {
      id: archiveId,
      pageId,
      pageName,
      pageProfilePic,
      bodyText,
      headline,
      caption,
      linkDescription,
      ctaText,
      ctaType,
      trackingInfo,
      images,
      videos,
      cards,
      platforms,
      lifespan,
      collationCount,
      collationId,
      demographicTargeting,
      campaignName,
      adsetName,
      isActive: raw.is_active !== undefined ? raw.is_active : true,
      spend: raw.spend || null,
      impressions: raw.impressions_with_index || raw.impressions || null
    };
  }

  // Handle incoming GraphQL intercepted messages
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ADSPY_RAW_GRAPHQL') {
      const payload = event.data.payload;
      const adNodes = findAdNodes(payload);
      let newCount = 0;
      
      adNodes.forEach(node => {
        const normalized = normalizeAd(node);
        if (normalized.id && !capturedAds.has(normalized.id)) {
          capturedAds.set(normalized.id, normalized);
          newCount++;
        }
      });

      if (newCount > 0) {
        updateBadgeCounter();
        if (viewMode !== 'ai') {
          renderView();
        }
      }
    }
  });

  // --- UI CREATION ---
  function injectOverlayUI() {
    if (document.getElementById('adspy-root')) return;

    const root = document.createElement('div');
    root.id = 'adspy-root';
    root.className = `adspy-theme-${currentTheme}`;

    root.innerHTML = `
      <!-- Floating Pill Launcher -->
      <div id="adspy-pill" class="adspy-pill" title="Click to open Rustam Panda">
        <div class="adspy-pill-avatar">
          <img src="${PANDA_IMG_URL}" alt="Rustam Panda" class="adspy-panda-avatar" />
        </div>
        <div class="adspy-pill-text">
          <span class="adspy-pill-title">Rustam Panda</span>
          <span id="adspy-pill-count" class="adspy-pill-count">0 Ads</span>
        </div>
        <div class="adspy-pulse"></div>
      </div>

      <!-- Moody Dark & Blur Screen Backdrop -->
      <div id="adspy-backdrop" class="adspy-backdrop adspy-hidden" title="Click outside to close"></div>

      <!-- Main Studio Panel -->
      <div id="adspy-panel" class="adspy-panel adspy-hidden">
        <!-- Header -->
        <div class="adspy-header">
          <div class="adspy-brand">
            <div class="adspy-logo">
              <img src="${PANDA_IMG_URL}" alt="Rustam Panda" class="adspy-header-panda-img" />
            </div>
            <div>
              <div class="adspy-title">Rustam Panda</div>
              <div class="adspy-subtitle">developed by <span class="adspy-author">@abbyisonline</span></div>
            </div>
          </div>

          <div class="adspy-header-actions">
            <!-- AI Intelligence Analyzer Trigger -->
            <button id="adspy-btn-header-ai" class="adspy-btn adspy-btn-secondary" title="AI Competitor Intelligence Analyzer">
              ${lucide('brain', '', 14)}
              AI Intelligence
            </button>

            <!-- Theme Toggle (Light / Dark) -->
            <button id="adspy-btn-theme" class="adspy-btn adspy-btn-secondary" title="Switch Theme (Light/Dark)">
              ${currentTheme === 'dark' ? lucide('sun', '', 14) : lucide('moon', '', 14)}
              <span id="adspy-theme-text">${currentTheme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            <!-- Export Folder Tree JSON -->
            <button id="adspy-btn-export-tree" class="adspy-btn adspy-btn-secondary" title="Export Folder Hierarchy (Campaign -> AdSet -> Ads)">
              ${lucide('folder', '', 14)}
              Folder JSON
            </button>

            <!-- Export CSV -->
            <button id="adspy-btn-export-csv" class="adspy-btn adspy-btn-secondary" title="Export CSV for Excel / Sheets">
              ${lucide('download', '', 14)}
              CSV
            </button>

            <button id="adspy-btn-close" class="adspy-btn-icon" title="Close Panel">
              ${lucide('x', '', 16)}
            </button>
          </div>
        </div>

        <!-- Metric Counter Bar -->
        <div class="adspy-stats-bar">
          <div class="adspy-stat-item">
            <div class="adspy-stat-value" id="adspy-stat-total">0</div>
            <div class="adspy-stat-label">Total Ads</div>
          </div>
          <div class="adspy-stat-item">
            <div class="adspy-stat-value" id="adspy-stat-campaigns">0</div>
            <div class="adspy-stat-label">Campaign Folders</div>
          </div>
          <div class="adspy-stat-item">
            <div class="adspy-stat-value" id="adspy-stat-evergreen">0</div>
            <div class="adspy-stat-label">Evergreen Winners (>21d)</div>
          </div>
          <div class="adspy-stat-item">
            <div class="adspy-stat-value" id="adspy-stat-dynamic">0</div>
            <div class="adspy-stat-label">Multi-Variants</div>
          </div>
        </div>

        <!-- Toolbar & Pagination Control -->
        <div class="adspy-toolbar">
          <!-- Auto-Scroll / Pagination Section -->
          <div class="adspy-autoscroll-bar">
            <div class="adspy-autoscroll-controls">
              <button id="adspy-btn-autoscroll" class="adspy-btn adspy-btn-autoscroll" title="Automatically paginate through all ads">
                <span id="adspy-autoscroll-icon">${lucide('play', '', 13)}</span>
                <span id="adspy-btn-autoscroll-text">Auto-Scroll &amp; Collect</span>
              </button>
              <div class="adspy-limit-box">
                <label for="adspy-select-limit">Target:</label>
                <select id="adspy-select-limit" class="adspy-select">
                  <option value="0">All Ads</option>
                  <option value="25">25 Ads</option>
                  <option value="50">50 Ads</option>
                  <option value="100">100 Ads</option>
                  <option value="200">200 Ads</option>
                </select>
              </div>
            </div>

            <div id="adspy-autoscroll-status" class="adspy-autoscroll-status adspy-hidden">
              <span class="adspy-spinner"></span>
              <span id="adspy-autoscroll-text">Auto-collecting ads...</span>
            </div>

            <!-- View Switcher: Card Grid vs Folder Tree vs AI -->
            <div class="adspy-view-toggle">
              <button class="adspy-view-btn active" id="adspy-btn-view-cards" title="Cards Grid View">
                ${lucide('grid', '', 13)} Cards
              </button>
              <button class="adspy-view-btn" id="adspy-btn-view-tree" title="Campaign -> AdSet -> Ad Folder Tree View">
                ${lucide('folder', '', 13)} Folders
              </button>
              <button class="adspy-view-btn" id="adspy-btn-view-ai" title="AI Competitor Intelligence Analyzer">
                ${lucide('brain', '', 13)} AI Insights
              </button>
            </div>
          </div>

          <!-- Search & Filters -->
          <div class="adspy-filter-row" id="adspy-filter-row">
            <div class="adspy-search-wrapper">
              <span class="adspy-search-icon">${lucide('search', '', 14)}</span>
              <input type="text" id="adspy-search-input" placeholder="Search copy, headlines, UTM campaigns, domains..." />
            </div>

            <div class="adspy-sort-wrapper">
              <span class="adspy-sort-label">Sort:</span>
              <select id="adspy-select-sort" class="adspy-select">
                <option value="longest">Longest Running (Evergreen)</option>
                <option value="newest">Newest First</option>
                <option value="variants">Most Variants</option>
              </select>
            </div>
          </div>

          <!-- Filter Pills -->
          <div class="adspy-tabs" id="adspy-tabs-row">
            <button class="adspy-tab active" data-tab="all">All Ads</button>
            <button class="adspy-tab" data-tab="evergreen">${lucide('flame', '', 12)} Evergreen (>21d)</button>
            <button class="adspy-tab" data-tab="dynamic">${lucide('layers', '', 12)} Dynamic Variants</button>
            <button class="adspy-tab" data-tab="video">${lucide('video', '', 12)} Videos</button>
            <button class="adspy-tab" data-tab="image">${lucide('image', '', 12)} Images</button>
          </div>
        </div>

        <!-- Dynamic Feed Content Container -->
        <div id="adspy-content-view" class="adspy-content-view">
          <!-- Populated by renderView() -->
        </div>
      </div>

      <!-- AI Settings Modal Container -->
      <div id="adspy-modal-container"></div>
    `;

    document.body.appendChild(root);

    // Event listeners
    const pillBtn = document.getElementById('adspy-pill');
    if (pillBtn) pillBtn.addEventListener('click', togglePanel);

    const closeBtn = document.getElementById('adspy-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);

    const backdropEl = document.getElementById('adspy-backdrop');
    if (backdropEl) backdropEl.addEventListener('click', togglePanel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isPanelOpen) {
        togglePanel();
      }
    });

    // Theme Toggle
    const themeBtn = document.getElementById('adspy-btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Exports
    const exportTreeBtn = document.getElementById('adspy-btn-export-tree');
    if (exportTreeBtn) exportTreeBtn.addEventListener('click', exportFolderTreeJSON);

    const exportCsvBtn = document.getElementById('adspy-btn-export-csv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);

    // View Switchers
    const btnCards = document.getElementById('adspy-btn-view-cards');
    const btnTree = document.getElementById('adspy-btn-view-tree');
    const btnAi = document.getElementById('adspy-btn-view-ai');
    const btnHeaderAi = document.getElementById('adspy-btn-header-ai');

    function setActiveView(mode) {
      viewMode = mode;
      [btnCards, btnTree, btnAi].forEach(b => {
        if (b) b.classList.remove('active');
      });
      const filterRow = document.getElementById('adspy-filter-row');
      const tabsRow = document.getElementById('adspy-tabs-row');

      if (mode === 'cards') {
        if (btnCards) btnCards.classList.add('active');
        if (filterRow) filterRow.style.display = 'flex';
        if (tabsRow) tabsRow.style.display = 'flex';
      } else if (mode === 'tree') {
        if (btnTree) btnTree.classList.add('active');
        if (filterRow) filterRow.style.display = 'flex';
        if (tabsRow) tabsRow.style.display = 'flex';
      } else if (mode === 'ai') {
        if (btnAi) btnAi.classList.add('active');
        if (filterRow) filterRow.style.display = 'none';
        if (tabsRow) tabsRow.style.display = 'none';
      }
      renderView();
    }

    if (btnCards) btnCards.addEventListener('click', () => setActiveView('cards'));
    if (btnTree) btnTree.addEventListener('click', () => setActiveView('tree'));
    if (btnAi) btnAi.addEventListener('click', () => setActiveView('ai'));
    if (btnHeaderAi) btnHeaderAi.addEventListener('click', () => setActiveView('ai'));

    // Auto-Scroll listeners
    const autoScrollBtn = document.getElementById('adspy-btn-autoscroll');
    const limitSelect = document.getElementById('adspy-select-limit');

    if (limitSelect) {
      limitSelect.addEventListener('change', (e) => {
        autoScrollTargetLimit = parseInt(e.target.value, 10) || 0;
      });
    }

    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => {
        if (isAutoScrolling) {
          stopAutoScroll('Paused by user');
        } else {
          startAutoScroll();
        }
      });
    }

    // Search and Sort
    const searchInput = document.getElementById('adspy-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderView();
      });
    }

    const sortSelect = document.getElementById('adspy-select-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderView();
      });
    }

    // Tabs
    const tabs = (root && root.querySelectorAll) ? root.querySelectorAll('.adspy-tab') : [];
    tabs.forEach(tab => {
      if (tab) {
        tab.addEventListener('click', () => {
          tabs.forEach(t => { if (t) t.classList.remove('active'); });
          tab.classList.add('active');
          activeTab = tab.getAttribute('data-tab');
          renderView();
        });
      }
    });
  }

  // Toggle Theme (White / Dark mode)
  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('adspy_theme', currentTheme);
    } catch (e) {}

    const root = document.getElementById('adspy-root');
    if (root) {
      root.className = `adspy-theme-${currentTheme}`;
    }
    const themeBtn = document.getElementById('adspy-btn-theme');
    if (themeBtn) {
      themeBtn.innerHTML = `
        ${currentTheme === 'dark' ? lucide('sun', '', 14) : lucide('moon', '', 14)}
        <span id="adspy-theme-text">${currentTheme === 'dark' ? 'Light' : 'Dark'}</span>
      `;
    }
  }

  // --- AUTOMATED PAGINATION & SCROLL ENGINE ---
  function startAutoScroll() {
    if (isAutoScrolling) return;
    isAutoScrolling = true;
    consecutiveNoNewAdsCount = 0;
    lastCapturedCount = capturedAds.size;

    const btn = document.getElementById('adspy-btn-autoscroll');
    const btnText = document.getElementById('adspy-btn-autoscroll-text');
    const iconSpan = document.getElementById('adspy-autoscroll-icon');
    const statusBox = document.getElementById('adspy-autoscroll-status');
    const statusText = document.getElementById('adspy-autoscroll-text');
    const pill = document.getElementById('adspy-pill');

    if (btn) {
      btn.classList.add('adspy-btn-autoscroll-active');
      if (btnText) btnText.textContent = 'Stop Auto-Scroll';
      if (iconSpan) iconSpan.innerHTML = lucide('square', '', 13);
    }
    if (statusBox) statusBox.classList.remove('adspy-hidden');
    if (statusText) statusText.textContent = `Auto-collecting (0 / ${autoScrollTargetLimit > 0 ? autoScrollTargetLimit : '∞'})...`;
    if (pill) pill.classList.add('adspy-pill-scrolling');

    console.log('[Rustam Panda] Auto-scroll pagination loop active.');
    stepAutoScroll();
  }

  function stopAutoScroll(reason = '') {
    if (!isAutoScrolling) return;
    isAutoScrolling = false;
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }

    const btn = document.getElementById('adspy-btn-autoscroll');
    const btnText = document.getElementById('adspy-btn-autoscroll-text');
    const iconSpan = document.getElementById('adspy-autoscroll-icon');
    const statusBox = document.getElementById('adspy-autoscroll-status');
    const statusText = document.getElementById('adspy-autoscroll-text');
    const pill = document.getElementById('adspy-pill');

    if (btn) {
      btn.classList.remove('adspy-btn-autoscroll-active');
      if (btnText) btnText.textContent = 'Auto-Scroll & Collect';
      if (iconSpan) iconSpan.innerHTML = lucide('play', '', 13);
    }
    if (pill) pill.classList.remove('adspy-pill-scrolling');

    if (reason && statusText) {
      statusText.textContent = reason;
      setTimeout(() => {
        if (!isAutoScrolling && statusBox) statusBox.classList.add('adspy-hidden');
      }, 3500);
    } else if (statusBox) {
      statusBox.classList.add('adspy-hidden');
    }
  }

  function stepAutoScroll() {
    if (!isAutoScrolling) return;

    if (autoScrollTargetLimit > 0 && capturedAds.size >= autoScrollTargetLimit) {
      stopAutoScroll(`Target reached: ${autoScrollTargetLimit} ads!`);
      return;
    }

    const statusText = document.getElementById('adspy-autoscroll-text');
    if (statusText) {
      const targetStr = autoScrollTargetLimit > 0 ? autoScrollTargetLimit : 'All';
      statusText.textContent = `Auto-collecting: ${capturedAds.size} / ${targetStr} ads`;
    }

    if (capturedAds.size > lastCapturedCount) {
      consecutiveNoNewAdsCount = 0;
      lastCapturedCount = capturedAds.size;
    } else {
      consecutiveNoNewAdsCount++;
    }

    if (consecutiveNoNewAdsCount >= 4) {
      const candidates = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"]'));
      let clickedButton = false;

      for (const el of candidates) {
        // Never click elements within our own extension overlay
        if (el.closest && el.closest('#adspy-root')) continue;
        const txt = (el.textContent || '').trim().toLowerCase();
        // Specifically match feed-level pagination buttons, never ad copy 'see more' accordions
        const isPaginationBtn = (txt.includes('more results') || txt === 'retry' || txt === 'load more' || txt.includes('reload results'));
        if (isPaginationBtn && el.offsetParent !== null) {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              try { el.click(); } catch (err) {}
            }, 400);
            clickedButton = true;
            consecutiveNoNewAdsCount = 1;
            break;
          } catch (err) {}
        }
      }

      if (!clickedButton && consecutiveNoNewAdsCount >= 7) {
        stopAutoScroll(`Finished! Reached end of ads (${capturedAds.size} total captured).`);
        return;
      }
    }

    const scrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.scrollY + window.innerHeight
    );

    window.scrollTo({
      top: scrollHeight,
      behavior: 'smooth'
    });

    window.dispatchEvent(new Event('scroll', { bubbles: true }));
    document.dispatchEvent(new Event('scroll', { bubbles: true }));

    const delay = Math.floor(Math.random() * 600) + 1400;
    autoScrollTimer = setTimeout(stepAutoScroll, delay);
  }

  // Handle messages from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        if (request.action === 'GET_STATUS') {
          sendResponse({
            totalAds: capturedAds.size,
            isAutoScrolling: isAutoScrolling
          });
        } else if (request.action === 'START_AUTO_SCROLL') {
          if (request.limit !== undefined) autoScrollTargetLimit = request.limit;
          startAutoScroll();
          sendResponse({ success: true });
        } else if (request.action === 'STOP_AUTO_SCROLL') {
          stopAutoScroll('Paused from popup');
          sendResponse({ success: true });
        } else if (request.action === 'TOGGLE_STUDIO') {
          togglePanel();
          sendResponse({ isPanelOpen: isPanelOpen });
        } else if (request.action === 'UPDATE_API_KEY') {
          openRouterApiKey = request.apiKey || '';
          try { localStorage.setItem('rustam_openrouter_key', openRouterApiKey); } catch(e){}
          sendResponse({ success: true });
        }
      } catch (err) {
        console.warn('[Rustam Panda] onMessage error:', err);
        sendResponse({ error: err.message });
      }
      return true;
    });
  }

  function togglePanel() {
    let panel = document.getElementById('adspy-panel');
    let backdrop = document.getElementById('adspy-backdrop');
    if (!panel || !backdrop) {
      injectOverlayUI();
      panel = document.getElementById('adspy-panel');
      backdrop = document.getElementById('adspy-backdrop');
    }
    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      if (panel) panel.classList.remove('adspy-hidden');
      if (backdrop) backdrop.classList.remove('adspy-hidden');
      renderView();
    } else {
      if (panel) panel.classList.add('adspy-hidden');
      if (backdrop) backdrop.classList.add('adspy-hidden');
    }
  }

  function updateBadgeCounter() {
    const total = capturedAds.size;
    const pillCount = document.getElementById('adspy-pill-count');
    if (pillCount) pillCount.textContent = `${total} Ad${total === 1 ? '' : 's'}`;

    let evergreenCount = 0;
    let dynamicCount = 0;
    const campaigns = new Set();

    capturedAds.forEach(ad => {
      if (ad.lifespan.isEvergreen) evergreenCount++;
      if (ad.collationCount > 1) dynamicCount++;
      campaigns.add(ad.campaignName);
    });

    const elTotal = document.getElementById('adspy-stat-total');
    const elCampaigns = document.getElementById('adspy-stat-campaigns');
    const elEvergreen = document.getElementById('adspy-stat-evergreen');
    const elDynamic = document.getElementById('adspy-stat-dynamic');

    if (elTotal) elTotal.textContent = total;
    if (elCampaigns) elCampaigns.textContent = campaigns.size;
    if (elEvergreen) elEvergreen.textContent = evergreenCount;
    if (elDynamic) elDynamic.textContent = dynamicCount;
  }

  // Filter & sort ads
  function getFilteredAds() {
    let ads = Array.from(capturedAds.values());

    if (activeTab === 'evergreen') {
      ads = ads.filter(a => a.lifespan.isEvergreen);
    } else if (activeTab === 'dynamic') {
      ads = ads.filter(a => a.collationCount > 1);
    } else if (activeTab === 'video') {
      ads = ads.filter(a => a.videos.length > 0);
    } else if (activeTab === 'image') {
      ads = ads.filter(a => a.images.length > 0);
    }

    if (searchQuery) {
      ads = ads.filter(ad => {
        const text = `${ad.headline} ${ad.bodyText} ${ad.pageName} ${ad.id} ${ad.campaignName} ${ad.adsetName} ${ad.trackingInfo.domain} ${ad.trackingInfo.cleanUrl} ${JSON.stringify(ad.trackingInfo.params)}`.toLowerCase();
        return text.includes(searchQuery);
      });
    }

    if (sortBy === 'longest') {
      ads.sort((a, b) => b.lifespan.daysRunning - a.lifespan.daysRunning);
    } else if (sortBy === 'newest') {
      ads.sort((a, b) => (b.rawGraphQL?.start_date || 0) - (a.rawGraphQL?.start_date || 0));
    } else if (sortBy === 'variants') {
      ads.sort((a, b) => b.collationCount - a.collationCount);
    }

    return ads;
  }

  // Render main view (Cards, Folder Tree, or AI Analyzer)
  function renderView() {
    let container = document.getElementById('adspy-content-view');
    if (!container) {
      injectOverlayUI();
      container = document.getElementById('adspy-content-view');
    }
    if (!container) return;

    try {
      if (viewMode === 'ai') {
        renderAiView(container);
        return;
      }

      const filtered = getFilteredAds();

      if (filtered.length === 0) {
        if (capturedAds.size === 0) {
          container.innerHTML = `
            <div class="adspy-empty-state">
              <div class="adspy-empty-avatar">
                <img src="${PANDA_IMG_URL}" class="adspy-empty-panda-img" alt="Rustam Panda" />
              </div>
              <div class="adspy-empty-title">Rustam Panda is on the hunt...</div>
              <div class="adspy-empty-desc">Scroll down or click <strong>Auto-Scroll &amp; Collect</strong>. Rustam Panda will extract every ad creative, unmasked funnel, and campaign hierarchy.</div>
              <div class="adspy-empty-author">developed by @abbyisonline</div>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="adspy-empty-state">
              <div class="adspy-empty-icon">${lucide('search', '', 36)}</div>
              <div class="adspy-empty-title">No Ads Match Filter</div>
              <div class="adspy-empty-desc">Try clearing your search query or switching to "All Ads".</div>
            </div>
          `;
        }
        return;
      }

      if (viewMode === 'tree') {
        renderFolderTreeView(container, filtered);
      } else {
        renderCardsView(container, filtered);
      }

      attachActionListeners(container);
    } catch (err) {
      console.error('[Rustam Panda] renderView error:', err);
    }
  }

  // --- CARDS VIEW ---
  function renderCardsView(container, ads) {
    if (!container) {
      container = document.getElementById('adspy-content-view');
    }
    if (!container) return;
    const safeAds = (ads || []).filter(Boolean);
    container.innerHTML = `
      <div class="adspy-cards-container">
        ${safeAds.map(ad => buildAdCardHtml(ad)).join('')}
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Full Markdown to HTML parser with Tables, Divider lines, Lists, Code blocks, and Section headings
  function renderMarkdownToHtml(markdown) {
    if (!markdown) return '';

    function parseInline(text) {
      if (!text) return '';
      let s = escapeHtml(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_]+?)_/g, '<em>$1</em>');
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return s;
    }

    function isTableRow(line) {
      if (!line) return false;
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return false;
      if (trimmed.startsWith('#')) return false;
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return false;
      return true;
    }

    function parseTableCells(row) {
      let trimmed = row.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(c => c.trim());
    }

    function isTableSeparator(row) {
      if (!row || !row.includes('|')) return false;
      const cells = parseTableCells(row);
      if (cells.length === 0) return false;
      return cells.every(c => /^:?-{1,}:?$/.test(c.trim()));
    }

    function getAlignment(sepCell) {
      const trimmed = sepCell.trim();
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    }

    const lines = markdown.split(/\r?\n/);
    const output = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Empty line
      if (!trimmed) {
        i++;
        continue;
      }

      // 2. Horizontal Rule (---, ***, ___)
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        output.push('<hr class="adspy-report-hr" />');
        i++;
        continue;
      }

      // 3. Fenced Code Block
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        output.push(`<div class="adspy-code-block-wrapper"><pre class="adspy-code-block"><code class="language-${escapeHtml(lang)}">${escapeHtml(codeLines.join('\n'))}</code></pre></div>`);
        continue;
      }

      // 4. Headings (# to ######)
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = parseInline(headingMatch[2]);
        output.push(`<h${level}>${title}</h${level}>`);
        i++;
        continue;
      }

      // 5. Standalone Numbered Section Headings like "2. 👥 Title" or "1. **Title**"
      const isStandaloneSectionHeading = /^\d+\.\s+[\u{1F300}-\u{1F9FF}]/u.test(trimmed) || 
        (/^\d+\.\s+\*\*[^*]+\*\*/.test(trimmed) && (!lines[i + 1] || !/^\d+\./.test(lines[i + 1].trim())));
      if (isStandaloneSectionHeading) {
        const title = parseInline(trimmed.replace(/^\d+\.\s+/, ''));
        const numMatch = trimmed.match(/^(\d+\.)/);
        const prefix = numMatch ? numMatch[1] : '';
        output.push(`<h3><span class="adspy-section-num">${prefix}</span> ${title}</h3>`);
        i++;
        continue;
      }

      // 6. Markdown Table
      if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const headerCells = parseTableCells(trimmed);
        const sepCells = parseTableCells(lines[i + 1]);
        const alignments = sepCells.map(c => getAlignment(c));

        i += 2; // skip header & separator
        const bodyRows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          if (isTableSeparator(lines[i])) {
            i++;
            continue;
          }
          bodyRows.push(parseTableCells(lines[i]));
          i++;
        }

        let tableHtml = '<div class="adspy-table-wrapper"><table class="adspy-report-table"><thead><tr>';
        headerCells.forEach((th, idx) => {
          const align = alignments[idx] || 'left';
          tableHtml += `<th style="text-align: ${align}">${parseInline(th)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        bodyRows.forEach((row, rIdx) => {
          tableHtml += `<tr class="${rIdx % 2 === 1 ? 'adspy-tr-stripe' : ''}">`;
          row.forEach((td, idx) => {
            const align = alignments[idx] || 'left';
            tableHtml += `<td style="text-align: ${align}">${parseInline(td)}</td>`;
          });
          for (let c = row.length; c < headerCells.length; c++) {
            tableHtml += '<td></td>';
          }
          tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        output.push(tableHtml);
        continue;
      }

      // 7. Blockquote
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        output.push(`<blockquote>${quoteLines.map(l => parseInline(l)).join('<br />')}</blockquote>`);
        continue;
      }

      // 8. Unordered List (- or *)
      if (/^[\-\*]\s+/.test(trimmed)) {
        let listHtml = '<ul>';
        while (i < lines.length && /^[\-\*]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[\-\*]\s+/, '');
          listHtml += `<li>${parseInline(itemText)}</li>`;
          i++;
        }
        listHtml += '</ul>';
        output.push(listHtml);
        continue;
      }

      // 9. Ordered List (1. 2. 3.)
      if (/^\d+\.\s+/.test(trimmed)) {
        let listHtml = '<ol>';
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
          listHtml += `<li>${parseInline(itemText)}</li>`;
          i++;
        }
        listHtml += '</ol>';
        output.push(listHtml);
        continue;
      }

      // 10. Regular Paragraph
      const paraLines = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (!cur) break;
        if (/^(\-{3,}|\*{3,}|_{3,})$/.test(cur)) break;
        if (cur.startsWith('```')) break;
        if (/^#{1,6}\s+/.test(cur)) break;
        if (isTableRow(cur) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
        if (cur.startsWith('>')) break;
        if (/^[\-\*]\s+/.test(cur)) break;
        if (/^\d+\.\s+/.test(cur)) break;
        paraLines.push(cur);
        i++;
      }
      if (paraLines.length > 0) {
        output.push(`<p>${paraLines.map(l => parseInline(l)).join('<br />')}</p>`);
      }
    }

    return `<div class="adspy-report-content">${output.join('\n')}</div>`;
  }

  function buildAdCardHtml(ad) {
    if (!ad) return '';

    let mediaHtml = '';
    const videos = Array.isArray(ad.videos) ? ad.videos : [];
    const images = Array.isArray(ad.images) ? ad.images : [];
    const cards = Array.isArray(ad.cards) ? ad.cards : [];
    const platforms = Array.isArray(ad.platforms) ? ad.platforms : [];
    const lifespan = ad.lifespan || { isEvergreen: false, daysRunning: 0 };
    const trackingInfo = ad.trackingInfo || { params: {}, cleanUrl: '', fullUrl: '', domain: '' };
    const params = trackingInfo.params || {};

    if (videos.length > 0) {
      const vid = videos[0] || {};
      mediaHtml = `
        <div class="adspy-media-box">
          <video controls poster="${escapeHtml(vid.preview || '')}" class="adspy-preview-video">
            <source src="${escapeHtml(vid.hdUrl || vid.sdUrl || '')}" type="video/mp4">
          </video>
          <a href="${escapeHtml(vid.downloadUrl || '')}" target="_blank" download="ad_${ad.id}.mp4" class="adspy-btn-media-dl">
            ${lucide('download', '', 12)} Download HD MP4
          </a>
        </div>
      `;
    } else if (images.length > 0) {
      const img = images[0] || '';
      mediaHtml = `
        <div class="adspy-media-box">
          <img src="${escapeHtml(img)}" class="adspy-preview-img" alt="Creative" />
          <a href="${escapeHtml(img)}" target="_blank" download="ad_${ad.id}.jpg" class="adspy-btn-media-dl">
            ${lucide('download', '', 12)} High-Res Image
          </a>
        </div>
      `;
    } else if (cards.length > 0) {
      mediaHtml = `
        <div class="adspy-media-box">
          <div class="adspy-carousel-badge">${lucide('layers', '', 12)} Carousel (${cards.length} Cards)</div>
          <div class="adspy-carousel-strip">
            ${cards.slice(0, 3).map(c => `
              <div class="adspy-carousel-thumb">
                ${c && c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" />` : ''}
                <div class="adspy-thumb-label">${escapeHtml((c && c.title) || 'Card')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const platformBadges = platforms.map(p => {
      const name = String(p).toLowerCase();
      let label = 'Meta';
      if (name.includes('facebook')) label = 'FB';
      else if (name.includes('instagram')) label = 'IG';
      else if (name.includes('audience')) label = 'Audience';
      else if (name.includes('messenger')) label = 'Messenger';
      return `<span class="adspy-badge adspy-badge-platform">${label}</span>`;
    }).join(' ');

    const lifespanBadge = lifespan.isEvergreen
      ? `<span class="adspy-badge adspy-badge-evergreen">${lucide('flame', '', 12)} ${lifespan.daysRunning}d Evergreen</span>`
      : `<span class="adspy-badge adspy-badge-neutral">${lucide('calendar', '', 12)} ${lifespan.daysRunning}d Active</span>`;

    const variationBadge = (ad.collationCount || 1) > 1
      ? `<span class="adspy-badge adspy-badge-dynamic">${lucide('layers', '', 12)} ${ad.collationCount} Variants</span>`
      : '';

    const hierarchyBreadcrumb = `
      <div class="adspy-breadcrumb">
        <span class="adspy-bc-folder">${lucide('folder', '', 12)} <strong>Campaign:</strong> ${escapeHtml(ad.campaignName || 'Campaign')}</span>
        <span class="adspy-bc-sep">/</span>
        <span class="adspy-bc-adset"><strong>AdSet:</strong> ${escapeHtml(ad.adsetName || 'AdSet')}</span>
      </div>
    `;

    const hasUtms = Object.keys(params).length > 0;
    let utmHtml = '';
    if (hasUtms) {
      utmHtml = `
        <div class="adspy-utm-section">
          <div class="adspy-section-title">${lucide('target', '', 12)} Decoded Campaign &amp; Funnel UTMs</div>
          <div class="adspy-utm-tags">
            ${Object.entries(params).map(([k, v]) => `
              <div class="adspy-utm-tag">
                <span class="adspy-utm-key">${escapeHtml(k)}:</span>
                <span class="adspy-utm-val">${escapeHtml(v)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="adspy-card" id="adspy-card-${ad.id}">
        ${hierarchyBreadcrumb}

        <div class="adspy-card-header">
          <div class="adspy-card-advertiser">
            ${ad.pageProfilePic ? `<img src="${escapeHtml(ad.pageProfilePic)}" class="adspy-page-avatar" />` : '<div class="adspy-page-avatar-placeholder">🏢</div>'}
            <div>
              <div class="adspy-page-name">${escapeHtml(ad.pageName || 'Advertiser')}</div>
              <div class="adspy-ad-id">ID: <code>${ad.id}</code></div>
            </div>
          </div>
          <div class="adspy-badges-row">
            ${lifespanBadge}
            ${variationBadge}
            ${platformBadges}
            <button class="adspy-btn-tiny adspy-analyze-single-btn" data-id="${ad.id}" title="Run AI Deep Dive on this specific ad">
              ${lucide('brain', '', 11)} AI Teardown
            </button>
          </div>
        </div>

        <div class="adspy-card-grid">
          <div class="adspy-card-media-col">
            ${mediaHtml}
          </div>

          <div class="adspy-card-content-col">
            <div class="adspy-copy-box">
              <div class="adspy-copy-header">
                <span class="adspy-section-title">Primary Copy</span>
                <button class="adspy-btn-tiny adspy-copy-btn" data-copy="${escapeHtml(ad.bodyText || '')}">
                  ${lucide('copy', '', 11)} Copy
                </button>
              </div>
              <div class="adspy-copy-text">${escapeHtml(ad.bodyText || '(No primary body text detected)')}</div>
            </div>

            <div class="adspy-headline-box">
              <div class="adspy-headline-info">
                <div class="adspy-headline-title">${escapeHtml(ad.headline || ad.caption || 'No Headline')}</div>
                ${ad.linkDescription ? `<div class="adspy-link-desc">${escapeHtml(ad.linkDescription)}</div>` : ''}
              </div>
              ${ad.ctaText ? `<div class="adspy-cta-badge">${escapeHtml(ad.ctaText)}</div>` : ''}
            </div>

            <div class="adspy-destination-row">
              <div class="adspy-dest-label">${lucide('link', '', 12)} Landing Page:</div>
              <a href="${escapeHtml(trackingInfo.fullUrl || '#')}" target="_blank" class="adspy-dest-link">
                ${escapeHtml(trackingInfo.domain || trackingInfo.cleanUrl || 'Direct Link')}
                ${lucide('external-link', '', 11)}
              </a>
              <button class="adspy-btn-tiny adspy-copy-btn" data-copy="${escapeHtml(trackingInfo.fullUrl || '')}">
                ${lucide('copy', '', 11)} Full URL
              </button>
            </div>

            ${utmHtml}
          </div>
        </div>
      </div>
    `;
  }

  // --- CAMPAIGN -> ADSET -> AD FOLDER TREE VIEW ---
  function buildCampaignTree(ads) {
    const tree = {};

    ads.forEach(ad => {
      const camp = ad.campaignName || 'General Campaign';
      const adset = ad.adsetName || 'General AdSet';

      if (!tree[camp]) tree[camp] = {};
      if (!tree[camp][adset]) tree[camp][adset] = [];
      tree[camp][adset].push(ad);
    });

    return tree;
  }

  function renderFolderTreeView(container, ads) {
    if (!container) {
      container = document.getElementById('adspy-content-view');
    }
    if (!container) return;

    const safeAds = (ads || []).filter(Boolean);
    const tree = buildCampaignTree(safeAds);
    const campaignNames = Object.keys(tree);

    let html = `
      <div class="adspy-tree-container">
        <div class="adspy-tree-header">
          <div class="adspy-tree-intro">
            <span class="adspy-tree-title">${lucide('folder', '', 16)} Complete Campaign Hierarchy</span>
            <span class="adspy-tree-desc">Extracted from Meta UTM funnel parameters and dynamic creative collation groups</span>
          </div>
          <button id="adspy-btn-expand-all" class="adspy-btn adspy-btn-secondary">
            Toggle All Folders
          </button>
        </div>

        <div class="adspy-tree-nodes">
    `;

    campaignNames.forEach((campName, campIndex) => {
      const adsets = tree[campName] || {};
      const adsetNames = Object.keys(adsets);
      let totalAdsInCampaign = 0;
      adsetNames.forEach(as => { totalAdsInCampaign += (adsets[as] || []).length; });

      html += `
        <div class="adspy-tree-folder adspy-tree-campaign" data-campaign-id="${campIndex}">
          <div class="adspy-folder-header adspy-camp-header">
            <div class="adspy-folder-title">
              <span class="adspy-folder-arrow">${lucide('chevron-down', '', 14)}</span>
              <span class="adspy-folder-icon">${lucide('folder', '', 16)}</span>
              <span class="adspy-folder-name"><strong>Campaign:</strong> ${escapeHtml(campName)}</span>
            </div>
            <div class="adspy-folder-meta">
              <span class="adspy-count-pill">${adsetNames.length} AdSets</span>
              <span class="adspy-count-pill">${totalAdsInCampaign} Ads</span>
            </div>
          </div>

          <div class="adspy-folder-children adspy-camp-children">
      `;

      adsetNames.forEach((adsetName, asIndex) => {
        const adList = (adsets[adsetName] || []).filter(Boolean);

        html += `
          <div class="adspy-tree-folder adspy-tree-adset" data-adset-id="${campIndex}_${asIndex}">
            <div class="adspy-folder-header adspy-adset-header">
              <div class="adspy-folder-title">
                <span class="adspy-folder-arrow">${lucide('chevron-down', '', 14)}</span>
                <span class="adspy-folder-icon">${lucide('folder-open', '', 15)}</span>
                <span class="adspy-folder-name"><strong>AdSet / Angle:</strong> ${escapeHtml(adsetName)}</span>
              </div>
              <div class="adspy-folder-meta">
                <span class="adspy-count-pill">${adList.length} Creatives</span>
              </div>
            </div>

            <div class="adspy-folder-children adspy-adset-children">
              <div class="adspy-tree-ads-grid">
                ${adList.map(ad => {
                  const vids = Array.isArray(ad.videos) ? ad.videos : [];
                  const imgs = Array.isArray(ad.images) ? ad.images : [];
                  const lifespan = ad.lifespan || { daysRunning: 0 };
                  const tracking = ad.trackingInfo || { fullUrl: '' };
                  return `
                  <div class="adspy-tree-ad-item">
                    <div class="adspy-tree-ad-thumb">
                      ${vids.length > 0 && vids[0]
                        ? `<video src="${escapeHtml(vids[0].downloadUrl || '')}"></video><span class="adspy-thumb-tag">${lucide('video', '', 10)} MP4</span>`
                        : (imgs.length > 0 && imgs[0] ? `<img src="${escapeHtml(imgs[0])}" />` : '<div class="adspy-thumb-empty">📄</div>')
                      }
                    </div>
                    <div class="adspy-tree-ad-details">
                      <div class="adspy-tree-ad-headline">${escapeHtml(ad.headline || 'No Headline')}</div>
                      <div class="adspy-tree-ad-copy">${escapeHtml(ad.bodyText ? ad.bodyText.substring(0, 90) + '...' : '')}</div>
                      <div class="adspy-tree-ad-footer">
                        <span class="adspy-tree-ad-dur">${lucide('calendar', '', 11)} ${lifespan.daysRunning}d</span>
                        ${ad.ctaText ? `<span class="adspy-tree-ad-cta">${escapeHtml(ad.ctaText)}</span>` : ''}
                        <button class="adspy-btn-tiny adspy-copy-btn" data-copy="${escapeHtml(tracking.fullUrl || '')}">
                          ${lucide('copy', '', 11)} Link
                        </button>
                      </div>
                    </div>
                  </div>
                `;}).join('')}
              </div>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.adspy-folder-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = header ? header.closest('.adspy-tree-folder') : null;
        if (!folder) return;
        const children = folder.querySelector(':scope > .adspy-folder-children') || folder.querySelector('.adspy-folder-children');
        const arrow = header.querySelector('.adspy-folder-arrow');
        if (children) {
          children.classList.toggle('adspy-collapsed');
          if (arrow) {
            arrow.innerHTML = children.classList.contains('adspy-collapsed')
              ? lucide('chevron-right', '', 14)
              : lucide('chevron-down', '', 14);
          }
        }
      });
    });

    const expandBtn = container.querySelector('#adspy-btn-expand-all');
    if (expandBtn) {
      let allExpanded = true;
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        allExpanded = !allExpanded;
        container.querySelectorAll('.adspy-folder-children').forEach(c => {
          if (c) {
            if (allExpanded) c.classList.remove('adspy-collapsed');
            else c.classList.add('adspy-collapsed');
          }
        });
        container.querySelectorAll('.adspy-folder-arrow').forEach(a => {
          if (a) {
            a.innerHTML = allExpanded ? lucide('chevron-down', '', 14) : lucide('chevron-right', '', 14);
          }
        });
      });
    }
  }

  // --- AI COMPETITOR INTELLIGENCE ANALYZER VIEW ---
  function renderAiView(container) {
    if (!container) {
      container = document.getElementById('adspy-content-view');
    }
    if (!container) return;

    const totalCaptured = capturedAds.size;
    const effectiveModel = selectedAiModel === 'custom' ? (customAiModel || 'custom-model') : selectedAiModel;

    let bodyContent = '';

    if (isAiAnalyzing) {
      bodyContent = `
        <div class="adspy-ai-loading">
          <div class="adspy-ai-loading-avatar">
            <img src="${PANDA_IMG_URL}" alt="Rustam Panda" />
          </div>
          <div class="adspy-ai-loading-title">Rustam Panda is analyzing competitor ads...</div>
          <div class="adspy-ai-loading-step">
            ${lucide('sparkles', '', 14)} Querying ${escapeHtml(effectiveModel)} via OpenRouter...
          </div>
        </div>
      `;
    } else if (lastAiAnalysisReport) {
      bodyContent = `
        <div class="adspy-ai-report-card">
          <div class="adspy-ai-report-header">
            <div class="adspy-ai-report-meta">
              <span class="adspy-ai-model-badge">${lucide('brain', '', 12)} ${escapeHtml(effectiveModel)}</span>
              <span class="adspy-ai-timestamp">Competitor Intelligence Dossier</span>
            </div>
            <div class="adspy-ai-report-actions">
              <button id="adspy-btn-pdf-report" class="adspy-btn adspy-btn-pdf" title="Generate &amp; Download PDF Dossier">
                ${lucide('printer', '', 13)} Export as PDF
              </button>
              <button id="adspy-btn-copy-report" class="adspy-btn adspy-btn-secondary" title="Copy Markdown Report">
                ${lucide('copy', '', 13)} Copy MD
              </button>
              <button id="adspy-btn-dl-report" class="adspy-btn adspy-btn-secondary" title="Download Report as .md">
                ${lucide('download', '', 13)} Download MD
              </button>
            </div>
          </div>
          <div class="adspy-ai-report-body">
            ${renderMarkdownToHtml(lastAiAnalysisReport)}
          </div>
        </div>
      `;
    } else {
      bodyContent = `
        <div class="adspy-empty-state">
          <div class="adspy-empty-avatar">
            <img src="${PANDA_IMG_URL}" class="adspy-empty-panda-img" alt="Rustam Panda" />
          </div>
          <div class="adspy-empty-title">Ready for AI Competitor Intelligence</div>
          <div class="adspy-empty-desc">
            Rustam Panda will dissect all ${totalCaptured} captured ads, uncover their hidden customer personas, analyze winning hooks, and generate ready-to-run counter-ads using OpenRouter AI.
          </div>
          <button id="adspy-btn-run-first-ai" class="adspy-btn-run-ai" style="margin-top: 14px;">
            ${lucide('sparkles', '', 14)} Run AI Analysis Now
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="adspy-ai-container">
        <!-- AI Toolbar -->
        <div class="adspy-ai-toolbar">
          <div class="adspy-ai-toolbar-top">
            <div class="adspy-ai-title-block">
              <div class="adspy-ai-icon-badge">${lucide('brain', '', 18)}</div>
              <div>
                <div class="adspy-ai-title">AI Competitor Intelligence &amp; Counter-Strategy</div>
                <div class="adspy-ai-desc">Powered by OpenRouter &bull; Deep Hook, Persona, and Funnel Teardowns</div>
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <button id="adspy-btn-ai-settings" class="adspy-btn adspy-btn-secondary" title="Configure OpenRouter API Key & System Prompt">
                ${lucide('settings', '', 13)} API &amp; Prompts
              </button>
              <button id="adspy-btn-trigger-ai" class="adspy-btn-run-ai" ${totalCaptured === 0 ? 'disabled' : ''}>
                ${lucide('zap', '', 13)} Run AI Analysis
              </button>
            </div>
          </div>

          <!-- Configs Row -->
          <div class="adspy-ai-configs-row">
            <div class="adspy-ai-config-group adspy-ai-model-group">
              <label for="adspy-select-model">Model:</label>
              <select id="adspy-select-model" class="adspy-select adspy-select-model">
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (Recommended)</option>
              </select>
              <button id="adspy-btn-fetch-models" class="adspy-btn-fetch-models" type="button" title="Fetch &amp; Refresh live models from OpenRouter">
                ${lucide('refresh-cw', '', 11)} <span>Fetch Models${openRouterModelsList.length > 0 ? ` (${openRouterModelsList.length})` : ''}</span>
              </button>
            </div>

            <div class="adspy-ai-config-group">
              <label for="adspy-select-prompt">Analysis Framework:</label>
              <select id="adspy-select-prompt" class="adspy-select">
                <option value="strategy" ${selectedSystemPromptKey === 'strategy' ? 'selected' : ''}>🎯 Full Strategy &amp; Counter-Plan</option>
                <option value="copywriting" ${selectedSystemPromptKey === 'copywriting' ? 'selected' : ''}>✍️ Copywriting &amp; Hook Matrix</option>
                <option value="evergreen" ${selectedSystemPromptKey === 'evergreen' ? 'selected' : ''}>🏆 Evergreen Scaling Blueprint</option>
                <option value="custom" ${selectedSystemPromptKey === 'custom' ? 'selected' : ''}>⚙️ Custom System Prompt...</option>
              </select>
            </div>

            <div class="adspy-ai-config-group">
              <label for="adspy-select-scope">Scope:</label>
              <select id="adspy-select-scope" class="adspy-select">
                <option value="all" ${aiAnalysisScope === 'all' ? 'selected' : ''}>All Captured Ads (${totalCaptured})</option>
                <option value="evergreen" ${aiAnalysisScope === 'evergreen' ? 'selected' : ''}>Evergreen Winners Only</option>
                <option value="filtered" ${aiAnalysisScope === 'filtered' ? 'selected' : ''}>Current Filtered Set</option>
              </select>
            </div>
          </div>
        </div>

        <!-- AI Output Box -->
        <div id="adspy-ai-output-area">
          ${bodyContent}
        </div>
      </div>
    `;

    // Populate dynamic OpenRouter models in select
    populateModelSelector();

    // Attach AI Event Listeners
    const btnTrigger = container.querySelector('#adspy-btn-trigger-ai');
    const btnFirst = container.querySelector('#adspy-btn-run-first-ai');
    const btnSettings = container.querySelector('#adspy-btn-ai-settings');
    const btnFetchModels = container.querySelector('#adspy-btn-fetch-models');
    const selectModel = container.querySelector('#adspy-select-model');
    const selectPrompt = container.querySelector('#adspy-select-prompt');
    const selectScope = container.querySelector('#adspy-select-scope');
    const btnPdfReport = container.querySelector('#adspy-btn-pdf-report');
    const btnCopyReport = container.querySelector('#adspy-btn-copy-report');
    const btnDlReport = container.querySelector('#adspy-btn-dl-report');

    if (btnTrigger) btnTrigger.addEventListener('click', () => runAiAnalysis());
    if (btnFirst) btnFirst.addEventListener('click', () => runAiAnalysis());
    if (btnSettings) btnSettings.addEventListener('click', () => openAiSettingsModal());

    if (btnFetchModels) {
      btnFetchModels.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetchOpenRouterModels(true);
      });
    }

    // Auto-fetch OpenRouter models in background if cache is empty
    if (!openRouterModelsList || openRouterModelsList.length === 0) {
      fetchOpenRouterModels(false);
    }

    if (selectModel) {
      selectModel.addEventListener('change', (e) => {
        selectedAiModel = e.target.value;
        localStorage.setItem('rustam_ai_model', selectedAiModel);
        if (selectedAiModel === 'custom' && !customAiModel) {
          openAiSettingsModal();
        }
      });
    }

    if (selectPrompt) {
      selectPrompt.addEventListener('change', (e) => {
        selectedSystemPromptKey = e.target.value;
        localStorage.setItem('rustam_prompt_key', selectedSystemPromptKey);
        if (selectedSystemPromptKey !== 'custom') {
          customSystemPrompt = DEFAULT_SYSTEM_PROMPTS[selectedSystemPromptKey];
          localStorage.setItem('rustam_custom_prompt', customSystemPrompt);
        } else {
          openAiSettingsModal();
        }
      });
    }

    if (selectScope) {
      selectScope.addEventListener('change', (e) => {
        aiAnalysisScope = e.target.value;
        singleTargetAdId = null;
      });
    }

    if (btnPdfReport) {
      btnPdfReport.addEventListener('click', () => {
        generateReportPdf();
      });
    }

    if (btnCopyReport) {
      btnCopyReport.addEventListener('click', () => {
        if (!lastAiAnalysisReport) return;
        const currentBtn = document.getElementById('adspy-btn-copy-report') || btnCopyReport;
        const originalHtml = currentBtn ? currentBtn.innerHTML : '';
        navigator.clipboard.writeText(lastAiAnalysisReport).then(() => {
          const liveBtn = document.getElementById('adspy-btn-copy-report') || currentBtn;
          if (liveBtn) {
            liveBtn.innerHTML = `${lucide('check', '', 13)} Copied!`;
            setTimeout(() => {
              const resetBtn = document.getElementById('adspy-btn-copy-report') || liveBtn;
              if (resetBtn) {
                resetBtn.innerHTML = originalHtml || `${lucide('copy', '', 13)} Copy MD`;
              }
            }, 1800);
          }
        }).catch(() => {
          showNotification('Could not copy report to clipboard.', 'warning');
        });
      });
    }

    if (btnDlReport) {
      btnDlReport.addEventListener('click', () => {
        const blob = new Blob([lastAiAnalysisReport], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rustam_panda_ai_report_${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  // Toast Notification System
  function showNotification(msg, type = 'info') {
    let toast = document.getElementById('adspy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'adspy-toast';
      toast.className = 'adspy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `adspy-toast adspy-toast-${type} show`;
    setTimeout(() => {
      if (toast) toast.classList.remove('show');
    }, 2800);
  }

  // Generate & Download PDF Dossier via Dedicated Report Viewer
  function generateReportPdf() {
    if (!lastAiAnalysisReport) {
      showNotification('No report available yet. Run AI Analysis first!', 'warning');
      return;
    }

    const effectiveModel = selectedAiModel === 'custom' ? (customAiModel || 'custom-model') : selectedAiModel;
    const reportData = {
      markdown: lastAiAnalysisReport,
      model: effectiveModel,
      totalAds: capturedAds.size,
      date: new Date().toLocaleString(),
      url: window.location.href,
      pageName: document.title || 'Meta Ads Library',
      timestamp: Date.now()
    };

    showNotification('Opening PDF Dossier & Print Generator...', 'success');

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ rustam_active_report: reportData }, () => {
          const reportUrl = chrome.runtime.getURL('report.html');
          window.open(reportUrl, '_blank');
        });
      } else {
        localStorage.setItem('rustam_active_report', JSON.stringify(reportData));
        const reportUrl = chrome.runtime.getURL('report.html');
        window.open(reportUrl, '_blank');
      }
    } catch (e) {
      localStorage.setItem('rustam_active_report', JSON.stringify(reportData));
      const reportUrl = chrome.runtime.getURL('report.html');
      window.open(reportUrl, '_blank');
    }
  }

  // OpenRouter Settings Modal
  function openAiSettingsModal() {
    let modalContainer = document.getElementById('adspy-modal-container');
    if (!modalContainer) {
      injectOverlayUI();
      modalContainer = document.getElementById('adspy-modal-container');
    }
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="adspy-modal-backdrop" id="adspy-modal-backdrop">
        <div class="adspy-modal-content">
          <div class="adspy-modal-header">
            <div class="adspy-modal-title">
              ${lucide('brain', '', 18)} OpenRouter &amp; AI Intelligence Settings
            </div>
            <button id="adspy-btn-modal-close" class="adspy-btn-icon">
              ${lucide('x', '', 14)}
            </button>
          </div>

          <div class="adspy-modal-body">
            <div class="adspy-input-group">
              <div class="adspy-input-label">
                <span>OpenRouter API Key:</span>
                <a href="https://openrouter.ai/keys" target="_blank">Get API Key &rarr;</a>
              </div>
              <input type="password" id="adspy-input-api-key" class="adspy-text-input" placeholder="sk-or-v1-..." value="${escapeHtml(openRouterApiKey)}" />
              <span style="font-size: 10.5px; color: var(--adspy-text-muted);">
                Your key is saved permanently in Chrome Extension storage across all tabs &amp; browser sessions.
              </span>
            </div>

            <div class="adspy-input-group">
              <div class="adspy-input-label">
                <span>Custom Model Slug (Optional):</span>
                <a href="https://openrouter.ai/models" target="_blank">Browse Models &rarr;</a>
              </div>
              <input type="text" id="adspy-input-custom-model" class="adspy-text-input" placeholder="e.g. anthropic/claude-3.5-sonnet:beta" value="${escapeHtml(customAiModel)}" />
            </div>

            <div class="adspy-input-group">
              <div class="adspy-input-label">
                <span>System Prompt &amp; Analysis Instructions:</span>
              </div>
              <textarea id="adspy-textarea-system-prompt" class="adspy-textarea">${escapeHtml(customSystemPrompt || DEFAULT_SYSTEM_PROMPTS.strategy)}</textarea>
            </div>
          </div>

          <div class="adspy-modal-footer">
            <button id="adspy-btn-modal-cancel" class="adspy-btn adspy-btn-secondary">Cancel</button>
            <button id="adspy-btn-modal-save" class="adspy-btn-run-ai">Save AI Settings</button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = document.getElementById('adspy-btn-modal-close');
    const cancelBtn = document.getElementById('adspy-btn-modal-cancel');
    const saveBtn = document.getElementById('adspy-btn-modal-save');
    const backdropEl = document.getElementById('adspy-modal-backdrop');

    if (closeBtn) closeBtn.addEventListener('click', closeAiSettingsModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAiSettingsModal);
    if (backdropEl) {
      backdropEl.addEventListener('click', (e) => {
        if (e.target.id === 'adspy-modal-backdrop') closeAiSettingsModal();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const apiKeyInput = document.getElementById('adspy-input-api-key');
        const customModelInput = document.getElementById('adspy-input-custom-model');
        const promptInput = document.getElementById('adspy-textarea-system-prompt');

        const apiKeyVal = apiKeyInput ? apiKeyInput.value.trim() : '';
        const customModelVal = customModelInput ? customModelInput.value.trim() : '';
        const promptVal = promptInput ? promptInput.value.trim() : '';

        openRouterApiKey = apiKeyVal;
        customAiModel = customModelVal;
        customSystemPrompt = promptVal;

        try { localStorage.setItem('rustam_openrouter_key', openRouterApiKey); } catch(e){}
        try { localStorage.setItem('rustam_custom_model', customAiModel); } catch(e){}
        try { localStorage.setItem('rustam_custom_prompt', customSystemPrompt); } catch(e){}

        if (typeof chrome !== 'undefined' && chrome.storage) {
          const toSave = {
            rustam_openrouter_key: openRouterApiKey,
            rustam_custom_model: customAiModel,
            rustam_custom_prompt: customSystemPrompt
          };
          if (chrome.storage.sync) chrome.storage.sync.set(toSave, () => {});
          if (chrome.storage.local) chrome.storage.local.set(toSave, () => {});
        }

        showNotification('OpenRouter settings saved permanently!', 'success');
        closeAiSettingsModal();
        if (viewMode === 'ai') renderView();
      });
    }
  }

  function closeAiSettingsModal() {
    const modalContainer = document.getElementById('adspy-modal-container');
    if (modalContainer) modalContainer.innerHTML = '';
  }

  // Execute AI Analysis via OpenRouter
  async function runAiAnalysis(singleAdId = null) {
    try {
      if (!openRouterApiKey) {
        openAiSettingsModal();
        return;
      }

      if (capturedAds.size === 0) {
        showNotification('No ads captured yet! Scroll down to capture ads first.', 'warning');
        return;
      }

      isAiAnalyzing = true;
      viewMode = 'ai';
      try {
        renderView();
      } catch (e) {}

      // 1. Gather target ads
      let adsToAnalyze = [];
      if (singleAdId && capturedAds.has(singleAdId)) {
        adsToAnalyze = [capturedAds.get(singleAdId)];
      } else if (aiAnalysisScope === 'evergreen') {
        adsToAnalyze = Array.from(capturedAds.values()).filter(a => a && a.lifespan && a.lifespan.isEvergreen);
        if (adsToAnalyze.length === 0) adsToAnalyze = Array.from(capturedAds.values()).slice(0, 15);
      } else if (aiAnalysisScope === 'filtered') {
        adsToAnalyze = getFilteredAds();
      } else {
        adsToAnalyze = Array.from(capturedAds.values());
      }

      // Compact representation to maximize token utility (top 25 representative ads)
      const sampleAds = adsToAnalyze.slice(0, 25).map(ad => ({
        ad_id: ad.id,
        headline: ad.headline,
        primary_copy: ad.bodyText ? ad.bodyText.substring(0, 300) : '',
        cta: ad.ctaText,
        days_running: ad.lifespan?.daysRunning || 0,
        is_evergreen: !!ad.lifespan?.isEvergreen,
        dynamic_variants: ad.collationCount || 1,
        destination_url: ad.trackingInfo?.cleanUrl || '',
        utm_campaign: ad.trackingInfo?.params?.utm_campaign || ad.campaignName,
        utm_content: ad.trackingInfo?.params?.utm_content || ad.adsetName,
        format: (ad.videos && ad.videos.length > 0) ? 'VIDEO' : ((ad.cards && ad.cards.length > 0) ? 'CAROUSEL' : 'IMAGE')
      }));

      const pageName = adsToAnalyze[0]?.pageName || 'Competitor Advertiser';
      const promptToUse = singleAdId ? DEFAULT_SYSTEM_PROMPTS.single : (customSystemPrompt || DEFAULT_SYSTEM_PROMPTS.strategy);
      const effectiveModel = selectedAiModel === 'custom' ? (customAiModel || 'anthropic/claude-3.5-sonnet') : selectedAiModel;

      const userMessage = `
Analyze the following advertising data for advertiser: "${pageName}".
Total Captured Ads: ${adsToAnalyze.length}
Sample Data of Representative Ads:
${JSON.stringify(sampleAds, null, 2)}
      `.trim();

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey.trim()}`,
          'HTTP-Referer': 'https://facebook.com/ads/library',
          'X-Title': 'Rustam Panda'
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: promptToUse },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: Failed to communicate with OpenRouter.`);
      }

      const data = await response.json();
      const report = data.choices?.[0]?.message?.content || 'No response generated.';

      lastAiAnalysisReport = report;
      localStorage.setItem('rustam_last_analysis', lastAiAnalysisReport);
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            rustam_active_report: {
              markdown: report,
              model: effectiveModel,
              totalAds: capturedAds.size,
              date: new Date().toLocaleString(),
              url: window.location.href,
              pageName: document.title || 'Meta Ads Library',
              timestamp: Date.now()
            }
          });
        }
      } catch (e) {}

    } catch (err) {
      console.error('[Rustam Panda AI Error]', err);
      lastAiAnalysisReport = `### ⚠️ AI Analysis Error\n\n**Message:** ${err.message}\n\nPlease verify your OpenRouter API key and model selection in the **API & Prompts** settings.`;
    } finally {
      isAiAnalyzing = false;
      try {
        renderView();
      } catch (err) {}
    }
  }

  // Attach generic copy and single ad analyze listeners
  function attachActionListeners(container) {
    if (!container) return;

    container.querySelectorAll('.adspy-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetBtn = e.currentTarget || btn;
        if (!targetBtn) return;
        const textToCopy = targetBtn.getAttribute('data-copy') || '';
        if (!textToCopy) return;

        const originalHtml = targetBtn.innerHTML || '';

        navigator.clipboard.writeText(textToCopy).then(() => {
          if (targetBtn && targetBtn.isConnected) {
            targetBtn.innerHTML = `${lucide('check', '', 11)} Copied`;
            setTimeout(() => {
              if (targetBtn && targetBtn.isConnected) {
                targetBtn.innerHTML = originalHtml;
              }
            }, 1600);
          }
        }).catch(() => {
          try {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (targetBtn && targetBtn.isConnected) {
              targetBtn.innerHTML = `${lucide('check', '', 11)} Copied`;
              setTimeout(() => {
                if (targetBtn && targetBtn.isConnected) {
                  targetBtn.innerHTML = originalHtml;
                }
              }, 1600);
            }
          } catch (err) {}
        });
      });
    });

    container.querySelectorAll('.adspy-analyze-single-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const adId = e.currentTarget.getAttribute('data-id');
        singleTargetAdId = adId;
        aiAnalysisScope = 'single';
        viewMode = 'ai';
        const btnAi = document.getElementById('adspy-btn-view-ai');
        const btnCards = document.getElementById('adspy-btn-view-cards');
        const btnTree = document.getElementById('adspy-btn-view-tree');
        if (btnAi && btnCards && btnTree) {
          [btnCards, btnTree].forEach(b => b.classList.remove('active'));
          btnAi.classList.add('active');
        }
        runAiAnalysis(adId);
      });
    });
  }

  // --- EXPORTS ---
  function exportFolderTreeJSON() {
    const ads = Array.from(capturedAds.values());
    const tree = buildCampaignTree(ads);

    const exportData = {
      exported_at: new Date().toISOString(),
      tool: 'Rustam Panda by @abbyisonline',
      advertiser_page: ads[0]?.pageName || 'Meta Advertiser',
      total_captured_ads: ads.length,
      hierarchy: {}
    };

    Object.keys(tree).forEach(camp => {
      exportData.hierarchy[camp] = {};
      Object.keys(tree[camp]).forEach(adset => {
        exportData.hierarchy[camp][adset] = tree[camp][adset].map(ad => ({
          ad_id: ad.id,
          headline: ad.headline,
          primary_copy: ad.bodyText,
          cta: ad.ctaText,
          days_running: ad.lifespan.daysRunning,
          start_date: ad.lifespan.startDate,
          is_evergreen: ad.lifespan.isEvergreen,
          clean_destination_url: ad.trackingInfo.cleanUrl,
          full_destination_url: ad.trackingInfo.fullUrl,
          utm_parameters: ad.trackingInfo.params,
          media_images: ad.images,
          media_videos: ad.videos.map(v => v.downloadUrl)
        }));
      });
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rustam_panda_hierarchy_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const headers = [
      'Campaign Folder',
      'AdSet Folder',
      'Ad ID',
      'Page Name',
      'Start Date',
      'Days Running',
      'Is Evergreen (>21d)',
      'Dynamic Variants',
      'CTA Button',
      'Clean Destination URL',
      'UTM Campaign',
      'UTM Source',
      'UTM Medium',
      'UTM Content',
      'UTM Term',
      'Primary Ad Copy',
      'Headline',
      'Image URL',
      'Video URL'
    ];

    const rows = Array.from(capturedAds.values()).map(ad => {
      const p = ad.trackingInfo.params;
      return [
        `"${(ad.campaignName || '').replace(/"/g, '""')}"`,
        `"${(ad.adsetName || '').replace(/"/g, '""')}"`,
        `"${(ad.id || '').replace(/"/g, '""')}"`,
        `"${(ad.pageName || '').replace(/"/g, '""')}"`,
        `"${ad.lifespan.startDate}"`,
        ad.lifespan.daysRunning,
        ad.lifespan.isEvergreen ? 'YES' : 'NO',
        ad.collationCount,
        `"${(ad.ctaText || '').replace(/"/g, '""')}"`,
        `"${(ad.trackingInfo.cleanUrl || '').replace(/"/g, '""')}"`,
        `"${(p.utm_campaign || '').replace(/"/g, '""')}"`,
        `"${(p.utm_source || '').replace(/"/g, '""')}"`,
        `"${(p.utm_medium || '').replace(/"/g, '""')}"`,
        `"${(p.utm_content || '').replace(/"/g, '""')}"`,
        `"${(p.utm_term || '').replace(/"/g, '""')}"`,
        `"${(ad.bodyText || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        `"${(ad.headline || '').replace(/"/g, '""')}"`,
        `"${(ad.images[0] || '').replace(/"/g, '""')}"`,
        `"${(ad.videos[0]?.downloadUrl || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rustam_panda_ads_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Initialize UI on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectOverlayUI);
  } else {
    injectOverlayUI();
  }
})();
