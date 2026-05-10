(function pumpcastContentScript() {
  const BACKEND_URL = window.PUMPCAST_CONFIG?.BACKEND_URL || "http://localhost:3001";
  const POLL_INTERVAL_MS = 15000;
  const MAX_HISTORY = 5;
  const MODE_LABELS = {
    race: "Race Mode",
    pro: "Pro Mode",
    risk: "Risk Mode",
  };

  
  let widgetRoot = null;
  let currentAddress = null;
  let isWatching = false;
  let isSpeaking = false;
  let isCollapsed = false;
  let history = [];
  let pollTimer = null;
  let currentMode = "race";
  let voiceEnabled = true;
  let lastSpokenComment = "";
  let lastUrl = location.href;
  const LOGO_URL = chrome.runtime.getURL("logo-light.png");
  let availableVoices = [];
  let adSliderResizeHandlerBound = false;
  const DEFAULT_GATE_CONFIG = {
    minUsdValue: 5,
    tokenSymbol: "PCAST",
    tokenAddress: "",
    pumpFunUrl: "https://pumpcast.co",
  };
  let gateConfig = { ...DEFAULT_GATE_CONFIG };

  const VOICE_PROFILES = {
    godmode: "🎙️ GODMODE",
    glitch:  "⚡ GLITCH AI",
    hypeman: "🔥 HYPEMAN",
    oracle:  "🔮 ORACLE",
    doom:    "💀 DOOM",
    sarge:   "🎯 SARGE",
  };
  let currentVoiceProfile = "godmode";

  // Voice scoring: target specific browser voices per profile
  const VOICE_TARGETS = {
    godmode: ["david", "mark", "alex", "daniel", "google uk english male", "microsoft david"],
    glitch:  ["google", "microsoft mark", "fred", "alex"],
    hypeman: ["zira", "samantha", "karen", "google us english", "microsoft zira", "female"],
    oracle:  ["james", "daniel", "google uk english male", "microsoft james", "arthur"],
    doom:    ["microsoft david", "david", "alex", "daniel", "mark"],
    sarge:   ["mark", "microsoft mark", "google us english", "alex", "tom"],
  };

  function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
  }

  function scoreVoice(voice) {
    const name = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
    const lang = String(voice.lang || "").toLowerCase();
    let score = 0;
    const targets = VOICE_TARGETS[currentVoiceProfile] || [];
    targets.forEach((t, i) => {
      if (name.includes(t)) score += 100 - i * 8;
    });
    if (lang.startsWith("en")) score += 10;
    if (voice.default) score += 3;
    return score;
  }

  function getPreferredVoice() {
    if (!availableVoices.length) loadVoices();
    if (!availableVoices.length) return null;
    return [...availableVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  }

  // Each profile has a signature sound — pitch + rate shape the entire character
  function getSpeechStyle() {
    const modeRate = currentMode === "race" ? 1.08 : currentMode === "pro" ? 0.92 : 1.0;

    const profiles = {
      godmode: { pitch: 0.4,  rate: 0.88 * modeRate, volume: 1 }, // deep, slow, commanding broadcaster
      glitch:  { pitch: 0.78, rate: 1.38 * modeRate, volume: 1 }, // sharp, fast, robotic
      hypeman: { pitch: 1.45, rate: 1.22 * modeRate, volume: 1 }, // high, frantic, unhinged
      oracle:  { pitch: 0.55, rate: 0.65 * modeRate, volume: 1 }, // slow, mystic, prophetic whisper
      doom:    { pitch: 0.2,  rate: 0.78 * modeRate, volume: 1 }, // lowest possible, apocalyptic, grim
      sarge:   { pitch: 0.7,  rate: 1.28 * modeRate, volume: 1 }, // clipped, rapid-fire, military bark
    };

    return profiles[currentVoiceProfile] || profiles.godmode;
  }

  function extractPumpFunAddress(url) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parsed.hostname !== "pump.fun" || parts[0] !== "coin" || !parts[1]) {
        return null;
      }
      return parts[1];
    } catch (_error) {
      return null;
    }
  }

  function isPumpFunCoinPage() {
    return location.hostname === "pump.fun" && /^\/coin\/[^/]+/.test(location.pathname);
  }

  function stopSpeech() {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    updateStatus("Idle");
  }

  function setTokenLabel(label) {
    const tokenNode = widgetRoot?.querySelector("[data-role='token']");
    if (tokenNode) {
      // If it looks like a Solana address, shorten it
      if (label && label.length > 32 && !label.includes(" ")) {
        tokenNode.textContent = label.slice(0, 6) + "..." + label.slice(-6);
      } else {
        tokenNode.textContent = label;
      }
    }
  }

  let typingTimer = null;

  function typeWriter(text, element, speed = 30) {
    if (!element) return;
    clearInterval(typingTimer);
    element.textContent = "";
    let i = 0;
    typingTimer = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(typingTimer);
      }
    }, speed);
  }

  function updateStatus(status, errorText = "") {
    const statusNode = widgetRoot?.querySelector("[data-role='status-text']");
    const statusDot = widgetRoot?.querySelector("[data-role='status-dot']");
    const logoContainer = widgetRoot?.querySelector(".pumpcast-logo-container");
    const audioWave = widgetRoot?.querySelector(".pumpcast-audio-wave");
    const errorNode = widgetRoot?.querySelector("[data-role='error']");

    if (statusNode) {
      statusNode.textContent = status;
    }

    const isActive = status === "Watching" || status === "Speaking";
    const isSpeakingNow = status === "Speaking";

    if (statusDot) {
      isActive ? statusDot.classList.add("active") : statusDot.classList.remove("active");
    }

    if (logoContainer) {
      isSpeakingNow ? logoContainer.classList.add("speaking") : logoContainer.classList.remove("speaking");
    }

    if (audioWave) {
      isSpeakingNow ? audioWave.classList.add("active") : audioWave.classList.remove("active");
    }

    if (errorNode) {
      errorNode.textContent = errorText;
      errorNode.style.display = errorText ? "block" : "none";
    }
  }

  function updateLatestComment(comment) {
    const latestNode = widgetRoot?.querySelector("[data-role='latest']");
    if (latestNode) {
      typeWriter(comment || "No commentary yet.", latestNode);
    }
  }

  function renderHistory() {
    const list = widgetRoot?.querySelector("[data-role='history']");
    if (!list) {
      return;
    }

    list.innerHTML = "";
    history.forEach((item) => {
      const li = document.createElement("li");
      li.className = "pumpcast-history-item";
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function pushHistory(comment) {
    history = [comment, ...history.filter((item) => item !== comment)].slice(0, MAX_HISTORY);
    renderHistory();
  }

  function speakComment(comment) {
    if (!voiceEnabled || !comment || comment === lastSpokenComment) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(comment);
    const preferredVoice = getPreferredVoice();
    const style = getSpeechStyle();

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = "en-GB";
    }

    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.volume = style.volume;
    utterance.onstart = () => {
      isSpeaking = true;
      updateStatus("Speaking");
    };
    utterance.onend = () => {
      isSpeaking = false;
      updateStatus(isWatching ? "Watching" : "Idle");
    };
    utterance.onerror = () => {
      isSpeaking = false;
      updateStatus("Error", "Speech synthesis failed.");
    };

    window.speechSynthesis.speak(utterance);
    lastSpokenComment = comment;
  }

  async function pollCommentary() {
    if (!isWatching || !currentAddress) {
      return;
    }

    updateStatus(isSpeaking ? "Speaking" : "Watching");

    try {
      const access = await getStoredAccess();
      if (!access?.accessToken) {
        await resetToGate("Connect your holder wallet to unlock PumpCast.");
        return;
      }

      const requestUrl =
        `${BACKEND_URL}/api/commentator?address=${encodeURIComponent(currentAddress)}&mode=${encodeURIComponent(currentMode)}`;
      
      const result = await chrome.runtime.sendMessage({
        type: "pumpcast:fetchCommentary",
        url: requestUrl,
        headers: {
          Authorization: `Bearer ${access.accessToken}`,
        },
      }).catch(err => {
        // Handle common Chrome error when extension is reloaded but page is not
        if (err.message?.includes("Extension context invalidated")) {
          return { success: false, error: "Extension updated. Please refresh the page." };
        }
        return { success: false, error: err.message || "Failed to communicate with background script." };
      });

      if (!result || !result.success) {
        if (result?.status === 401) {
          await resetToGate("Session expired. Reconnect your holder wallet.");
          return;
        }
        const msg = result?.details
          ? `${result.error || "Backend request failed."}: ${result.details}`
          : (result?.error || "Backend request failed.");
        throw new Error(msg);
      }

      const payload = result.payload;
      if (!payload) {
        throw new Error("No data received from backend.");
      }

      if (payload.token) {
        const display = payload.token.symbol
          ? `${payload.token.name} (${payload.token.symbol})`
          : payload.token.name;
        setTokenLabel(display);
      }

      if (payload.comment) {
        updateLatestComment(payload.comment);
        pushHistory(payload.comment);
        if (voiceEnabled) {
          speakComment(payload.comment);
        }
      } else if (!history.length) {
        updateLatestComment(payload.message || "No meaningful market event detected.");
      }

      updateStatus(isSpeaking ? "Speaking" : "Watching");
    } catch (error) {
      console.error("Pumpcast polling error:", error);
      // Don't show "No meaningful market event detected" as an error
      if (error.message !== "No meaningful market event detected.") {
        updateStatus("Error", error.message);
      }
    }
  }

  function startPolling() {
    if (!currentAddress) {
      updateStatus("Error", "No Solana token address found in this URL.");
      return;
    }

    clearInterval(pollTimer);
    isWatching = true;
    updateStatus("Watching");
    
    const greeting = currentMode === "race" 
      ? "Buckle up! Commentary starting now." 
      : (currentMode === "pro" ? "Pro analytics active. Monitoring the market." : "Risk mode engaged. Let's see who gets rugged.");
    
    updateLatestComment(greeting);
    if (voiceEnabled) {
      speakComment(greeting);
    }

    pollCommentary();
    pollTimer = window.setInterval(pollCommentary, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    isWatching = false;
    clearInterval(pollTimer);
    pollTimer = null;
    stopSpeech();
    updateStatus("Idle");
  }

  function syncGateConfig(payload) {
    const token = payload?.token || null;
    const gate = payload?.gate || null;
    const tokenAddress = String(token?.address || "").trim();
    const pumpFunUrl =
      String(token?.pumpfun_url || "").trim() ||
      (tokenAddress ? `https://pump.fun/coin/${tokenAddress}` : gateConfig.pumpFunUrl);

    gateConfig = {
      minUsdValue: Number.isFinite(Number(gate?.minUsdValue))
        ? Number(gate.minUsdValue)
        : gateConfig.minUsdValue,
      tokenSymbol:
        String(token?.symbol || gateConfig.tokenSymbol || DEFAULT_GATE_CONFIG.tokenSymbol).trim() ||
        DEFAULT_GATE_CONFIG.tokenSymbol,
      tokenAddress,
      pumpFunUrl: pumpFunUrl || DEFAULT_GATE_CONFIG.pumpFunUrl,
    };
  }

  async function fetchGateConfig() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "pumpcast:fetchToken",
        url: `${BACKEND_URL}/api/token`,
      });

      if (result?.success && result.payload) {
        syncGateConfig(result.payload);
        return result.payload;
      }
    } catch (_error) {}

    return null;
  }

  function handleUrlChange() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    currentAddress = extractPumpFunAddress(location.href);
    setTokenLabel(currentAddress || "Token unavailable");
    updateLatestComment("Waiting for market event...");
    history = [];
    renderHistory();
    lastSpokenComment = "";

    if (!isPumpFunCoinPage()) {
      widgetRoot?.remove();
      widgetRoot = null;
      stopPolling();
      return;
    }

    if (!widgetRoot) {
      initWidget();
      return;
    }

    if (isWatching) {
      startPolling();
    }
  }

  // Default fallback ads if API fails
  const DEFAULT_ADS = [
    {
      image: "",
      badge: "ADVERTISE",
      title: "Your Ad Here 🚀",
      desc: "Reach thousands of pump.fun traders.",
      link: "https://t.me/pumpcastco",
      accent: "#FF6A00",
    },
    {
      image: "",
      badge: "SPONSOR",
      title: "Place Your Banner",
      desc: "High-visibility slot inside every widget.",
      link: "https://t.me/pumpcastco",
      accent: "#6366F1",
    },
  ];
  let ADS = [];

  function truncateTextToFit(element, text) {
    if (!element) return;

    const fullText = String(text || "").trim();
    element.textContent = fullText;
    element.title = fullText;

    if (!fullText) return;

    if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) {
      return;
    }

    let low = 0;
    let high = fullText.length;
    let best = "...";

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${fullText.slice(0, mid).trimEnd()}...`;
      element.textContent = candidate;

      if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    element.textContent = best;
  }

  function fitAdDescriptions(root) {
    root.querySelectorAll(".pumpcast-ad-desc").forEach((descEl) => {
      truncateTextToFit(descEl, descEl.dataset.fullText || descEl.textContent || "");
    });
  }

  function scheduleFitAdDescriptions(root) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitAdDescriptions(root));
    });
  }

  function createAdItem(ad, index, count) {
    const accent = ad.accent || "#FF6A00";
    const item = document.createElement("a");
    item.className = "pumpcast-ad-item";
    item.style.flex = `0 0 ${(100 / count).toFixed(4)}%`;
    item.href = ad.link || "#";
    item.target = "_blank";
    item.rel = "noreferrer";
    if (!ad.link) {
      item.addEventListener("click", (e) => e.preventDefault());
    }

    if (ad.image) {
      const thumb = document.createElement("div");
      thumb.className = "pumpcast-ad-thumb";
      const img = document.createElement("img");
      img.className = "pumpcast-ad-img";
      img.alt = ad.title || "";
      img.src = ad.image;
      img.addEventListener("load", () => {
        if (widgetRoot) scheduleFitAdDescriptions(widgetRoot);
      });
      thumb.appendChild(img);
      item.appendChild(thumb);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "pumpcast-ad-thumb-placeholder";
      placeholder.style.background = `${accent}18`;
      placeholder.style.borderColor = `${accent}44`;
      item.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "pumpcast-ad-body";

    const badge = document.createElement("span");
    badge.className = "pumpcast-ad-badge";
    badge.style.color = accent;
    badge.style.background = `${accent}18`;
    badge.style.borderColor = `${accent}44`;
    badge.textContent = ad.badge || "AD";

    const title = document.createElement("span");
    title.className = "pumpcast-ad-title";
    title.textContent = ad.title || "Your Ad Here";

    const desc = document.createElement("span");
    desc.className = "pumpcast-ad-desc";
    desc.dataset.fullText = String(ad.desc || "Click to learn more");
    desc.textContent = desc.dataset.fullText;

    body.appendChild(badge);
    body.appendChild(title);
    body.appendChild(desc);
    item.appendChild(body);

    return item;
  }

  function initAdSlider(root) {
    const sliderEl = root.querySelector("[data-role='ad-slider']");
    const track = root.querySelector("[data-role='ad-track']");
    const dotsContainer = root.querySelector("[data-role='ad-dots']");
    if (!sliderEl || !track || !dotsContainer) {
      return;
    }

    track.innerHTML = "";
    dotsContainer.innerHTML = "";

    if (!ADS.length) {
      sliderEl.style.display = "none";
      return;
    }

    sliderEl.style.display = "";
    const count = ADS.length;
    let currentAdIndex = 0;
    let adInterval = null;

    track.style.width = `${count * 100}%`;
    track.style.transform = "translateX(0)";

    function goToAd(index) {
      currentAdIndex = index;
      track.style.transform = `translateX(-${((index * 100) / count).toFixed(4)}%)`;
      dotsContainer.querySelectorAll(".pumpcast-ad-dot")
        .forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
    }

    ADS.forEach((ad, index) => {
      const item = createAdItem(ad, index, count);
      track.appendChild(item);

      if (count > 1) {
        const dot = document.createElement("button");
        dot.className = `pumpcast-ad-dot${index === 0 ? " active" : ""}`;
        dot.addEventListener("click", () => goToAd(index));
        dotsContainer.appendChild(dot);
      }
    });

    dotsContainer.style.display = count > 1 ? "" : "none";

    if (count > 1) {
      const startAuto = () => {
        clearInterval(adInterval);
        adInterval = window.setInterval(() => goToAd((currentAdIndex + 1) % count), 4000);
      };
      const stopAuto = () => {
        clearInterval(adInterval);
      };

      sliderEl.onmouseenter = stopAuto;
      sliderEl.onmouseleave = startAuto;
      startAuto();
    } else {
      sliderEl.onmouseenter = null;
      sliderEl.onmouseleave = null;
    }

    scheduleFitAdDescriptions(root);
    setTimeout(() => scheduleFitAdDescriptions(root), 120);
    setTimeout(() => scheduleFitAdDescriptions(root), 400);
  }

  function loadAdsInto(root) {
    ADS = DEFAULT_ADS;
    initAdSlider(root);

    Promise.race([
      chrome.runtime.sendMessage({ type: "pumpcast:fetchAds", url: BACKEND_URL + "/api/ads" })
        .then((result) => {
          if (result?.success && result.payload?.ads?.length > 0) {
            ADS = result.payload.ads;
          }
        })
        .catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).then(() => {
      if (widgetRoot === root && ADS !== DEFAULT_ADS) {
        initAdSlider(root);
      }
    });

    if (!adSliderResizeHandlerBound) {
      window.addEventListener("resize", () => {
        if (widgetRoot) scheduleFitAdDescriptions(widgetRoot);
      });
      adSliderResizeHandlerBound = true;
    }
  }

  function injectMainWidget() {
    if (!isPumpFunCoinPage() || document.getElementById("pumpcast-widget")) {
      return;
    }

    currentAddress = extractPumpFunAddress(location.href);

    const PCAST_TOKEN_ADDRESS = gateConfig.tokenAddress;
    const PCAST_TOKEN_URL = gateConfig.pumpFunUrl || (PCAST_TOKEN_ADDRESS
      ? `https://pump.fun/coin/${PCAST_TOKEN_ADDRESS}`
      : "");

    const root = document.createElement("aside");
    root.id = "pumpcast-widget";
    root.className = "pumpcast-widget";
    root.innerHTML = `
      <div class="pumpcast-glow pumpcast-glow-1"></div>
      <div class="pumpcast-glow pumpcast-glow-2"></div>
      <div class="pumpcast-header">
        <div class="pumpcast-brand">
          <div class="pumpcast-logo-container">
            <img class="pumpcast-logo" src="${LOGO_URL}" alt="Pumpcast" />
          </div>
          <div class="pumpcast-brand-info">
            <div class="pumpcast-eyebrow">Live Commentary</div>
            <div class="pumpcast-title">PumpCast AI</div>
          </div>
        </div>
        <button class="pumpcast-collapse-btn" data-role="collapse" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
        </button>
      </div>
      <div class="pumpcast-body" data-role="body">
        <div class="pumpcast-info-row">
          <div class="pumpcast-token-address" data-role="token">${currentAddress ? currentAddress.slice(0, 8) + '...' + currentAddress.slice(-8) : "No Address"}</div>
          <div class="pumpcast-status">
            <div class="pumpcast-audio-wave">
              <div class="pumpcast-wave-bar"></div>
              <div class="pumpcast-wave-bar"></div>
              <div class="pumpcast-wave-bar"></div>
              <div class="pumpcast-wave-bar"></div>
            </div>
            <div class="pumpcast-status-dot" data-role="status-dot"></div>
            <span data-role="status-text">Idle</span>
          </div>
        </div>
        
        <div class="pumpcast-error-msg" data-role="error"></div>
        
        <div class="pumpcast-ad-slider" data-role="ad-slider">
          <div class="pumpcast-ad-track" data-role="ad-track"></div>
          <div class="pumpcast-ad-dots" data-role="ad-dots"></div>
        </div>

        ${PCAST_TOKEN_ADDRESS ? `
        <a href="${PCAST_TOKEN_URL}" target="_blank" class="pumpcast-token-banner">
          <div class="pumpcast-token-banner-icon"><img src="${LOGO_URL}" style="width:20px;height:20px;object-fit:contain;" /></div>
          <div class="pumpcast-token-banner-content">
            <span class="pumpcast-token-banner-title">$PCAST Token is LIVE!</span>
            <span class="pumpcast-token-banner-desc">Buy on pump.fun — support the project.</span>
          </div>
          <svg class="pumpcast-token-banner-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </a>` : ''}

        <div class="pumpcast-controls-grid">
          <div class="pumpcast-control-group">
            <span class="pumpcast-label">Mode</span>
            <select data-role="mode">
              <option value="race">🏎️ Race</option>
              <option value="pro">🧠 Pro</option>
              <option value="risk">🔥 Risk</option>
            </select>
          </div>
          <div class="pumpcast-control-group">
            <span class="pumpcast-label">Audio</span>
            <div class="pumpcast-toggle-wrapper">
              <span class="pumpcast-label" style="margin:0; font-size: 12px; color: #fff;">Enabled</span>
              <label class="pumpcast-switch">
                <input data-role="voice" type="checkbox" checked />
                <span class="pumpcast-slider"></span>
              </label>
            </div>
          </div>
          <div class="pumpcast-control-group">
            <span class="pumpcast-label">Voice Character</span>
            <select data-role="voice-profile">
              <option value="godmode">🎙️ GODMODE</option>
              <option value="glitch">⚡ GLITCH AI</option>
              <option value="hypeman">🔥 HYPEMAN</option>
              <option value="oracle">🔮 ORACLE</option>
              <option value="doom">💀 DOOM</option>
              <option value="sarge">🎯 SARGE</option>
            </select>
          </div>
        </div>

        <div class="pumpcast-actions">
          <button class="btn btn-primary" data-role="start" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m7 4 12 8-12 8V4z"/></svg>
            Start Cast
          </button>
          <button class="btn btn-secondary" data-role="stop" type="button">
            Stop
          </button>
        </div>

        <div class="pumpcast-history-section">
          <span class="pumpcast-label">Live Feed</span>
          <div class="pumpcast-commentary-box">
            <div class="pumpcast-latest-text" data-role="latest">Waiting for market event...</div>
          </div>
        </div>

        <div class="pumpcast-history-section">
          <span class="pumpcast-label">Recent Highlights</span>
          <ul class="pumpcast-history-list" data-role="history"></ul>
        </div>

        <div class="pumpcast-footer">
          <a href="https://pumpcast.co" target="_blank">pumpcast.co</a>
          <span>&bull;</span>
          <a href="https://x.com/pump_cast_ai" target="_blank">X</a>
          <span>&bull;</span>
          <a href="https://t.me/pumpcastco" target="_blank">Telegram</a>
          ${PCAST_TOKEN_ADDRESS ? `<span>&bull;</span><a href="${PCAST_TOKEN_URL}" target="_blank" class="pumpcast-footer-token-link"><img src="${LOGO_URL}" style="width:12px;height:12px;object-fit:contain;vertical-align:middle;margin-top:-2px;margin-right:2px;" /> $${gateConfig.tokenSymbol}</a>` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(root);
    widgetRoot = root;

    root.querySelector(".pumpcast-logo-container").addEventListener("click", () => {
      const reactions = [
        "Hey! I'm watching the charts.",
        "Check those green candles!",
        "Solana is pumping!",
        "Ready for the next moon shot?",
        "Don't get rugged out there."
      ];
      const random = reactions[Math.floor(Math.random() * reactions.length)];
      updateLatestComment(random);
      if (voiceEnabled) speakComment(random);
    });

    root.querySelector("[data-role='mode']").value = currentMode;
    root.querySelector("[data-role='mode']").addEventListener("change", (event) => {
      currentMode = event.target.value;
      const selected = MODE_LABELS[currentMode] || "Mode";
      updateLatestComment(`Switching to ${selected}...`);
      lastSpokenComment = "";
      if (isWatching) {
        startPolling();
      }
    });

    root.querySelector("[data-role='voice-profile']").value = currentVoiceProfile || "godmode";
    root.querySelector("[data-role='voice-profile']").addEventListener("change", (event) => {
      currentVoiceProfile = event.target.value;
      lastSpokenComment = ""; // reset so they can hear it immediately next time
      const profileNames = { godmode: "GODMODE", glitch: "GLITCH AI", hypeman: "HYPEMAN", oracle: "ORACLE", doom: "DOOM", sarge: "SARGE" };
      const voiceName = profileNames[currentVoiceProfile];
      updateLatestComment(`Voice profile set to ${voiceName}.`);
      if (voiceEnabled) speakComment(`Voice profile set to ${voiceName}.`);
    });

    root.querySelector("[data-role='voice']").addEventListener("change", (event) => {
      voiceEnabled = Boolean(event.target.checked);
      if (!voiceEnabled) {
        stopSpeech();
      } else {
        updateStatus(isWatching ? "Watching" : "Idle");
      }
    });

    root.querySelector("[data-role='start']").addEventListener("click", startPolling);
    root.querySelector("[data-role='stop']").addEventListener("click", stopPolling);
    root.querySelector("[data-role='collapse']").addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      root.classList.toggle("collapsed", isCollapsed);
      const btn = root.querySelector("[data-role='collapse']");
      if (isCollapsed) {
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      } else {
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
      }
    });

    // ─── AD SLIDER LOGIC ───
    function renderAds() {
      const sliderEl    = root.querySelector("[data-role='ad-slider']");
      const track       = root.querySelector("[data-role='ad-track']");
      const dotsContainer = root.querySelector("[data-role='ad-dots']");
      if (!sliderEl || !track || !dotsContainer) return;

      // Clear any previous render
      track.innerHTML = '';
      dotsContainer.innerHTML = '';

      if (!ADS.length) {
        sliderEl.style.display = 'none';
        return;
      }

      sliderEl.style.display = '';
      const n = ADS.length;
      let currentAdIndex = 0;
      let adInterval;

      // Explicit carousel layout: track = N×100% wide, each item = 100%/N of track
      track.style.width = `${n * 100}%`;

      ADS.forEach((ad, index) => {
        const item = createAdItem(ad, index, n);
        track.appendChild(item);

        if (n > 1) {
          const dot = document.createElement("button");
          dot.className = `pumpcast-ad-dot${index === 0 ? " active" : ""}`;
          dot.addEventListener("click", () => goToAd(index));
          dotsContainer.appendChild(dot);
        }
      });

      dotsContainer.style.display = n > 1 ? '' : 'none';

      function goToAd(idx) {
        currentAdIndex = idx;
        // translateX percentage is relative to the track element itself
        // track width = n×100% of slider, so each step = 100%/n of track
        track.style.transform = `translateX(-${((idx * 100) / n).toFixed(4)}%)`;
        dotsContainer.querySelectorAll(".pumpcast-ad-dot")
          .forEach((dot, i) => dot.classList.toggle("active", i === idx));
      }

      if (n > 1) {
        const startAuto = () => {
          adInterval = setInterval(() => goToAd((currentAdIndex + 1) % n), 4000);
        };
        const stopAuto = () => clearInterval(adInterval);

        sliderEl.addEventListener("mouseenter", stopAuto);
        sliderEl.addEventListener("mouseleave", startAuto);
        startAuto();
      }

      scheduleFitAdDescriptions(root);
      setTimeout(() => scheduleFitAdDescriptions(root), 120);
      setTimeout(() => scheduleFitAdDescriptions(root), 400);
    }

    // Fetch ads via background service worker. Show defaults immediately so the
    // slider is never empty while waiting for the async response.
    ADS = DEFAULT_ADS;
    renderAds();

    Promise.race([
      chrome.runtime.sendMessage({ type: "pumpcast:fetchAds", url: BACKEND_URL + "/api/ads" })
        .then(result => {
          if (result?.success && result.payload?.ads?.length > 0) {
            ADS = result.payload.ads;
          }
        })
        .catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 5000)), // 5s hard cap
    ]).then(() => {
      // Re-render only if we got real ads different from what's showing
      if (ADS !== DEFAULT_ADS) renderAds();
    });

    if (!adSliderResizeHandlerBound) {
      window.addEventListener("resize", () => {
        if (widgetRoot) scheduleFitAdDescriptions(widgetRoot);
      });
      adSliderResizeHandlerBound = true;
    }

    // Auto-start commentary by default
    setTimeout(() => {
      if (!isWatching) {
        startPolling();
      }
    }, 1000);
  }


  // ─── Wallet bridge (postMessage ↔ MAIN world wallet-bridge.js) ───────────────
  const walletBridgeCallbacks = {};
  let walletBridgeListenerReady = false;

  function setupWalletBridgeListener() {
    if (walletBridgeListenerReady) return;
    walletBridgeListenerReady = true;
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const { type } = event.data || {};
      const cb = walletBridgeCallbacks[type];
      if (cb) {
        delete walletBridgeCallbacks[type];
        cb(event.data);
      }
    });
  }

  function bridgeCall(requestType, responseType, payload, timeoutMs) {
    return new Promise((resolve) => {
      setupWalletBridgeListener();
      let settled = false;

      walletBridgeCallbacks[responseType] = (data) => {
        if (!settled) { settled = true; resolve(data); }
      };

      window.postMessage({ type: requestType, ...payload }, "*");

      setTimeout(() => {
        if (!settled) {
          settled = true;
          delete walletBridgeCallbacks[responseType];
          resolve({ error: "Timeout" });
        }
      }, timeoutMs || 30_000);
    });
  }

  // ─── Token-gate: cached access ────────────────────────────────────────────────
  const GATE_STORAGE_KEY = "pumpcast_access";
  const GATE_EXPIRY_MS   = 24 * 60 * 60 * 1000; // 24 h

  async function clearStoredAccess() {
    try {
      await chrome.storage.local.remove(GATE_STORAGE_KEY);
    } catch {}
  }

  async function getStoredAccess() {
    try {
      const stored = await chrome.storage.local.get(GATE_STORAGE_KEY);
      const access = stored[GATE_STORAGE_KEY];
      if (!access || !access.expiresAt || !access.accessToken || !access.wallet) {
        return null;
      }
      if (access.expiresAt < Date.now()) {
        await clearStoredAccess();
        return null;
      }
      return access;
    } catch {
      return null;
    }
  }

  async function checkCachedAccess() {
    return Boolean(await getStoredAccess());
  }

  async function persistAccess({ wallet, accessToken, expiresAt }) {
    await chrome.storage.local.set({
      [GATE_STORAGE_KEY]: {
        wallet,
        accessToken,
        grantedAt: Date.now(),
        expiresAt: Number(expiresAt) || (Date.now() + GATE_EXPIRY_MS),
      },
    });
  }

  async function resetToGate(message) {
    await clearStoredAccess();
    stopPolling();
    if (widgetRoot?.parentNode) {
      widgetRoot.remove();
    }
    widgetRoot = null;
    await initWidget(message);
  }

  // ─── Token-gate: gate widget UI ───────────────────────────────────────────────
  function injectGateWidget(gateNotice) {
    if (!isPumpFunCoinPage() || document.getElementById("pumpcast-widget")) return;

    const root = document.createElement("aside");
    root.id = "pumpcast-widget";
    root.className = "pumpcast-widget pumpcast-gate";
    root.innerHTML = `
      <div class="pumpcast-glow pumpcast-glow-1"></div>
      <div class="pumpcast-glow pumpcast-glow-2"></div>
      <div class="pumpcast-gate-body">
        <div class="pumpcast-gate-logo-wrap">
          <img class="pumpcast-gate-logo" src="${LOGO_URL}" alt="PumpCast" />
        </div>
        <div class="pumpcast-gate-title">PumpCast AI</div>
        <div class="pumpcast-gate-subtitle">Exclusive to $${gateConfig.tokenSymbol} Holders</div>
        <div class="pumpcast-gate-lock">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="pumpcast-gate-req" id="pumpcast-gate-req">
          Hold at least <strong>$${gateConfig.minUsdValue}</strong> of <strong>$${gateConfig.tokenSymbol}</strong> to unlock
        </div>
        <div class="pumpcast-ad-slider" data-role="ad-slider">
          <div class="pumpcast-ad-track" data-role="ad-track"></div>
          <div class="pumpcast-ad-dots" data-role="ad-dots"></div>
        </div>
        <button class="btn btn-primary pumpcast-gate-connect" id="pumpcast-connect-btn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
          </svg>
          Connect Wallet
        </button>
        <div class="pumpcast-gate-status" id="pumpcast-gate-status"></div>
        <a class="pumpcast-buy-link" id="pumpcast-buy-link" href="${gateConfig.pumpFunUrl}" target="_blank" rel="noreferrer">
          Buy $${gateConfig.tokenSymbol} on pump.fun &#x2192;
        </a>
        <div class="pumpcast-gate-footer">
          <a href="https://pumpcast.co" target="_blank" rel="noreferrer">pumpcast.co</a>
          <span>&bull;</span>
          <a href="https://t.me/pumpcastco" target="_blank" rel="noreferrer">Telegram</a>
          <span>&bull;</span>
          <a href="https://x.com/pump_cast_ai" target="_blank" rel="noreferrer">X</a>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    widgetRoot = root;
    loadAdsInto(root);

    if (gateNotice) {
      const statusEl = root.querySelector("#pumpcast-gate-status");
      if (statusEl) {
        statusEl.textContent = gateNotice;
        statusEl.className = "pumpcast-gate-status pumpcast-gate-status--info";
      }
    }

    fetchGateConfig().then((payload) => {
      if (!payload || widgetRoot !== root) {
        return;
      }
      const reqEl = root.querySelector("#pumpcast-gate-req");
      const subtitleEl = root.querySelector(".pumpcast-gate-subtitle");
      const buyLink = root.querySelector("#pumpcast-buy-link");

      if (reqEl) {
        reqEl.innerHTML =
          `Hold at least <strong>$${gateConfig.minUsdValue}</strong> of <strong>$${gateConfig.tokenSymbol}</strong> to unlock`;
      }

      if (subtitleEl) {
        subtitleEl.textContent = `Exclusive to $${gateConfig.tokenSymbol} Holders`;
      }

      if (buyLink) {
        buyLink.href = gateConfig.pumpFunUrl;
        buyLink.textContent = `Buy $${gateConfig.tokenSymbol} on pump.fun →`;
      }
    }).catch(() => {});

    root.querySelector("#pumpcast-connect-btn").addEventListener("click", () => {
      startWalletConnection(root);
    });
  }

  // ─── Token-gate: wallet connection + verification flow ────────────────────────
  async function startWalletConnection(gateRoot) {
    const connectBtn = gateRoot.querySelector("#pumpcast-connect-btn");
    const statusEl   = gateRoot.querySelector("#pumpcast-gate-status");

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = `pumpcast-gate-status pumpcast-gate-status--${kind || "info"}`;
    }

    function setLoading(on) {
      if (!connectBtn) return;
      connectBtn.disabled = on;
      connectBtn.innerHTML = on
        ? '<span class="pumpcast-gate-spinner"></span>Verifying…'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg> Connect Wallet';
    }

    setLoading(true);
    setStatus("Connecting wallet…");

    // Step 1 — connect wallet via MAIN world bridge
    const connectResult = await bridgeCall(
      "PUMPCAST_WALLET_CONNECT",
      "PUMPCAST_WALLET_CONNECTED",
      {},
      60_000
    );

    if (connectResult.error) {
      setLoading(false);
      if (connectResult.error === "NO_WALLET" || connectResult.error === "Timeout") {
        setStatus("No Solana wallet found. Install Phantom or Solflare and reload.", "error");
      } else {
        setStatus(`Connection cancelled: ${connectResult.error}`, "error");
      }
      return;
    }

    const wallet = connectResult.wallet;
    setStatus("Getting verification code…");

    // Step 2 — get single-use nonce from backend
    const nonceMsg = await chrome.runtime.sendMessage({
      type: "pumpcast:fetchNonce",
      url: `${BACKEND_URL}/api/auth/nonce?wallet=${encodeURIComponent(wallet)}`,
    }).catch(() => null);

    if (!nonceMsg?.success || !nonceMsg.payload?.nonce) {
      setLoading(false);
      setStatus("Could not reach PumpCast server. Try again.", "error");
      return;
    }

    const nonce = nonceMsg.payload.nonce;
    setStatus("Sign the message in your wallet to prove ownership…");

    // Step 3 — sign nonce with wallet private key
    const signResult = await bridgeCall(
      "PUMPCAST_SIGN_MESSAGE",
      "PUMPCAST_MESSAGE_SIGNED",
      { message: `PumpCast Access: ${nonce}` },
      60_000
    );

    if (signResult.error) {
      setLoading(false);
      setStatus(`Signature rejected: ${signResult.error}`, "error");
      return;
    }

    setStatus("Checking $PCAST balance…");

    // Step 4 — verify signature + token balance on the backend
    const signedWallet = signResult.wallet || wallet;
    const verifyMsg = await chrome.runtime.sendMessage({
      type: "pumpcast:verifyAccess",
      url: `${BACKEND_URL}/api/auth/verify`,
      body: { wallet: signedWallet, signature: signResult.signature, nonce },
    }).catch(() => null);

    if (!verifyMsg?.success) {
      setLoading(false);
      const detailText = verifyMsg?.details
        ? ` (${typeof verifyMsg.details === "string" ? verifyMsg.details : JSON.stringify(verifyMsg.details)})`
        : "";
      setStatus(
        `${verifyMsg?.error || "Verification failed. Please try again."}${detailText}`,
        "error"
      );
      return;
    }

    const { access, balanceUsd, required, accessToken, expiresAt } = verifyMsg.payload;

    if (!access) {
      setLoading(false);
      const held = (balanceUsd != null && balanceUsd > 0)
        ? `$${balanceUsd.toFixed(2)}`
        : "none";
      setStatus(
        `Insufficient $PCAST. You hold ${held} — need $${required}. Buy more below.`,
        "error"
      );
      const buyLink = gateRoot.querySelector("#pumpcast-buy-link");
      if (buyLink) buyLink.classList.add("pumpcast-buy-link--highlight");
      return;
    }

    // Step 5 — access granted
    await persistAccess({ wallet, accessToken, expiresAt });
    setStatus("Access granted! Loading PumpCast…", "success");

    setTimeout(() => {
      if (gateRoot.parentNode) gateRoot.remove();
      widgetRoot = null;
      injectMainWidget();
    }, 700);
  }

  // ─── Gate-aware widget init ───────────────────────────────────────────────────
  async function initWidget(gateNotice) {
    if (!isPumpFunCoinPage() || document.getElementById("pumpcast-widget")) return;
    await fetchGateConfig();
    const hasAccess = await checkCachedAccess();
    if (hasAccess) {
      injectMainWidget();
    } else {
      injectGateWidget(gateNotice);
    }
  }

  function observeSpaNavigation() {
    const observer = new MutationObserver(() => {
      handleUrlChange();
      if (!widgetRoot && isPumpFunCoinPage()) {
        initWidget();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("beforeunload", stopPolling);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadVoices();
      initWidget();
      observeSpaNavigation();
    });
  } else {
    loadVoices();
    initWidget();
    observeSpaNavigation();
  }

  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
})();
