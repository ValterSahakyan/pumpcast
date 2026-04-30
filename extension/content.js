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
  const LIGHT_LOGO_URL = chrome.runtime.getURL("light.png");
  let availableVoices = [];

  function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
  }

  function scoreVoice(voice) {
    const name = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
    const lang = String(voice.lang || "").toLowerCase();
    let score = 0;

    if (lang.startsWith("en-gb")) {
      score += 90;
    } else if (lang.startsWith("en")) {
      score += 25;
    }

    if (name.includes("male")) {
      score += 40;
    }

    if (name.includes("daniel")) {
      score += 50;
    }

    if (name.includes("google uk english male")) {
      score += 70;
    }

    if (name.includes("ryan") || name.includes("george") || name.includes("arthur")) {
      score += 28;
    }

    if (name.includes("natural")) {
      score += 12;
    }

    if (name.includes("female") || name.includes("zira") || name.includes("susan")) {
      score -= 25;
    }

    if (voice.default) {
      score += 6;
    }

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
    if (currentMode === "race") {
      return {
        rate: 1.12,
        pitch: 0.92,
        volume: 1,
      };
    }

    if (currentMode === "pro") {
      return {
        rate: 1.01,
        pitch: 0.9,
        volume: 1,
      };
    }

    return {
      rate: 0.98,
      pitch: 0.88,
      volume: 1,
    };
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
      tokenNode.textContent = label;
    }
  }

  function updateStatus(status, errorText = "") {
    const statusNode = widgetRoot?.querySelector("[data-role='status']");
    const errorNode = widgetRoot?.querySelector("[data-role='error']");

    if (statusNode) {
      statusNode.textContent = status;
    }

    if (errorNode) {
      errorNode.textContent = errorText;
      errorNode.style.display = errorText ? "block" : "none";
    }
  }

  function updateLatestComment(comment) {
    const latestNode = widgetRoot?.querySelector("[data-role='latest']");
    if (latestNode) {
      latestNode.textContent = comment || "No commentary yet.";
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
    setTokenLabel(currentAddress ? `Address: ${currentAddress}` : "Token unavailable");
    updateLatestComment("No commentary yet.");
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

    const root = document.createElement("aside");
    root.id = "pumpcast-widget";
    root.className = "pumpcast-widget";
    root.innerHTML = `
      <div class="pumpcast-orbit pumpcast-orbit-a"></div>
      <div class="pumpcast-orbit pumpcast-orbit-b"></div>
      <div class="pumpcast-header">
        <div class="pumpcast-brand">
          <div class="pumpcast-logo-shell">
            <img class="pumpcast-logo" src="${LIGHT_LOGO_URL}" alt="Pumpcast logo" />
          </div>
          <div class="pumpcast-brand-copy">
            <div class="pumpcast-eyebrow">Live AI Commentary</div>
            <div class="pumpcast-title">MemeRace Commentator</div>
            <div class="pumpcast-token" data-role="token">${currentAddress ? `Address: ${currentAddress}` : "Token unavailable"}</div>
          </div>
        </div>
        <button class="pumpcast-collapse" data-role="collapse" type="button">_</button>
      </div>
      <div class="pumpcast-body" data-role="body">
        <div class="pumpcast-row">
          <span class="pumpcast-label">Status</span>
          <span class="pumpcast-status-badge" data-role="status">Idle</span>
        </div>
        <div class="pumpcast-error" data-role="error"></div>
        <div class="pumpcast-controls">
          <label class="pumpcast-field">
            <span class="pumpcast-label">Mode</span>
            <select data-role="mode">
              <option value="race">Race Mode</option>
              <option value="pro">Pro Mode</option>
              <option value="risk">Risk Mode</option>
            </select>
          </label>
          <label class="pumpcast-toggle">
            <span class="pumpcast-label">Voice</span>
            <span class="pumpcast-toggle-control">
              <input data-role="voice" type="checkbox" checked />
              <span class="pumpcast-toggle-text">On</span>
            </span>
          </label>
        </div>
        <div class="pumpcast-actions">
          <button data-role="start" type="button">Start Commentary</button>
          <button data-role="stop" type="button" class="secondary">Stop</button>
        </div>
        <div class="pumpcast-section">
          <div class="pumpcast-label">Latest</div>
          <div class="pumpcast-latest" data-role="latest">No commentary yet.</div>
        </div>
        <div class="pumpcast-section">
          <div class="pumpcast-label">History</div>
          <ol class="pumpcast-history" data-role="history"></ol>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    widgetRoot = root;

    root.querySelector("[data-role='mode']").value = currentMode;
    root.querySelector("[data-role='mode']").addEventListener("change", (event) => {
      currentMode = event.target.value;
      const selected = MODE_LABELS[currentMode] || "Mode";
      updateLatestComment(`Mode switched to ${selected}.`);
      lastSpokenComment = "";
      if (isWatching) {
        startPolling();
      }
    });

    root.querySelector("[data-role='voice']").addEventListener("change", (event) => {
      voiceEnabled = Boolean(event.target.checked);
      root.querySelector(".pumpcast-toggle-text").textContent = voiceEnabled ? "On" : "Off";
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
      root.querySelector("[data-role='collapse']").textContent = isCollapsed ? "+" : "_";
    });
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
