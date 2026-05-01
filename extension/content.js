(function pumpcastContentScript() {
  const BACKEND_URL = "http://localhost:3001";
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

  const VOICE_PROFILES = {
    chad: "🦍 Hyper Chad",
    briish: "☕ Degen",
    panic: "🐹 Panic Squeak"
  };
  let currentVoiceProfile = "chad";

  function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
  }

  function scoreVoice(voice) {
    const name = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
    const lang = String(voice.lang || "").toLowerCase();
    let score = 0;

    if (currentVoiceProfile === "briish") {
      if (lang.startsWith("en-gb") || name.includes("british") || name.includes("uk")) score += 100;
      if (name.includes("male")) score += 20;
    } else if (currentVoiceProfile === "chad") {
      if (name.includes("male") || name.includes("david") || name.includes("mark")) score += 50;
    } else if (currentVoiceProfile === "panic") {
      if (name.includes("female") || name.includes("zira") || name.includes("susan") || name.includes("google")) score += 50;
    }

    if (lang.startsWith("en")) score += 10;
    if (voice.default) score += 5;
    return score;
  }

  function getPreferredVoice() {
    if (!availableVoices.length) {
      loadVoices();
    }
    if (!availableVoices.length) {
      return null;
    }
    return [...availableVoices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0] || null;
  }

  function getSpeechStyle() {
    let rate = 1.0;
    let pitch = 1.0;

    if (currentMode === "race") rate *= 1.1;
    else if (currentMode === "pro") rate *= 0.95;

    if (currentVoiceProfile === "chad") {
      pitch = 0.6;
      rate *= 1.0;
    } else if (currentVoiceProfile === "briish") {
      pitch = 1.0;
      rate *= 1.0;
    } else if (currentVoiceProfile === "panic") {
      pitch = 1.5;
      rate *= 1.15;
    }

    return { rate, pitch, volume: 1 };
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
      const requestUrl =
        `${BACKEND_URL}/api/commentator?address=${encodeURIComponent(currentAddress)}&mode=${encodeURIComponent(currentMode)}`;
      const result = await chrome.runtime.sendMessage({
        type: "pumpcast:fetchCommentary",
        url: requestUrl,
      });

      if (!result?.success) {
        throw new Error(result?.error || "Backend request failed.");
      }

      const payload = result.payload;
      if (!payload?.success) {
        throw new Error(payload?.error || "Backend request failed.");
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
      updateStatus("Error", error.message);
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
      injectWidget();
      return;
    }

    if (isWatching) {
      startPolling();
    }
  }

  function injectWidget() {
    if (!isPumpFunCoinPage() || document.getElementById("pumpcast-widget")) {
      return;
    }

    currentAddress = extractPumpFunAddress(location.href);

    const DONATION_ADDRESS = "FAomiJibEwiNy7teURECEzyrUaJpVGxkBqZUEAH4ViGt";

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
        
        <a href="https://telegram.me/yogurtsoftware" target="_blank" class="pumpcast-ad-banner">
          <div class="pumpcast-ad-badge">SPONSORED</div>
          <div class="pumpcast-ad-content">
            <span class="pumpcast-ad-title">Advertise Your Token! 🚀</span>
            <span class="pumpcast-ad-desc">Click here to reach meme traders directly.</span>
          </div>
        </a>

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
              <option value="chad">🦍 Hyper Chad</option>
              <option value="briish">☕ Degen</option>
              <option value="panic">🐹 Panic Squeak</option>
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

        <div class="pumpcast-donation-section">
          <div class="pumpcast-donation-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            Support Pumpcast
          </div>
          <div class="pumpcast-donation-text">If you're banking on pump.fun, consider supporting the dev!</div>
          <div class="pumpcast-address-box" data-role="donate" title="Click to copy SOL address">
            <span class="pumpcast-address-text">${DONATION_ADDRESS}</span>
            <svg class="pumpcast-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <div class="pumpcast-copy-feedback" data-role="copy-feedback">Copied!</div>
          </div>
        </div>

        <div class="pumpcast-footer">
          <a href="https://pumpcast.co" target="_blank">pumpcast.co</a>
          <span>&bull;</span>
          <a href="https://telegram.me/yogurtsoftware" target="_blank">Telegram</a>
          <span>&bull;</span>
          <a href="mailto:hello@pumpcast.co">hello@pumpcast.co</a>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    widgetRoot = root;

    root.querySelector("[data-role='donate']").addEventListener("click", async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(DONATION_ADDRESS);
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = DONATION_ADDRESS;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          textArea.style.top = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          textArea.remove();
        }
        const feedback = root.querySelector("[data-role='copy-feedback']");
        feedback.classList.add("show");
        setTimeout(() => feedback.classList.remove("show"), 2000);
      } catch (err) {
        console.error("Failed to copy address:", err);
      }
    });

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

    root.querySelector("[data-role='voice-profile']").value = currentVoiceProfile;
    root.querySelector("[data-role='voice-profile']").addEventListener("change", (event) => {
      currentVoiceProfile = event.target.value;
      lastSpokenComment = ""; // reset so they can hear it immediately next time
      const profileNames = { chad: "Hyper Chad", briish: "Degen", panic: "Panic Squeak" };
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

    // Auto-start commentary by default
    setTimeout(() => {
      if (!isWatching) {
        startPolling();
      }
    }, 1000);
  }


  function observeSpaNavigation() {
    const observer = new MutationObserver(() => {
      handleUrlChange();
      if (!widgetRoot && isPumpFunCoinPage()) {
        injectWidget();
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
      injectWidget();
      observeSpaNavigation();
    });
  } else {
    loadVoices();
    injectWidget();
    observeSpaNavigation();
  }

  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
})();
