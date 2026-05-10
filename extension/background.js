chrome.runtime.onInstalled.addListener(() => {
  console.log("PumpCast AI installed.");
});

const HANDLED_TYPES = new Set([
  "pumpcast:fetchCommentary",
  "pumpcast:fetchAds",
  "pumpcast:fetchNonce",
  "pumpcast:verifyAccess",
  "pumpcast:fetchToken",
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!HANDLED_TYPES.has(message?.type)) return undefined;

  const { type, url, body, headers } = message;

  if (!url) {
    sendResponse({ success: false, error: "Missing URL." });
    return false;
  }

  (async () => {
    try {
      const isPost = type === "pumpcast:verifyAccess";
      const fetchOptions = {
        method: isPost ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          ...(headers && typeof headers === "object" ? headers : {}),
        },
      };

      if (isPost && body) {
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        sendResponse({
          success: false,
          status: response.status,
          error: payload?.error || `Request failed with status ${response.status}.`,
          details: payload?.details || null,
        });
        return;
      }

      sendResponse({ success: true, payload });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message || "Network request failed.",
      });
    }
  })();

  return true; // keep message channel open for async sendResponse
});
