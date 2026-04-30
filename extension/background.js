chrome.runtime.onInstalled.addListener(() => {
  console.log("Pumpcast MemeRace Commentator installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "pumpcast:fetchCommentary") {
    return undefined;
  }

  const { url } = message;
  if (!url) {
    sendResponse({
      success: false,
      error: "Missing backend URL.",
    });
    return false;
  }

  (async () => {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }

      if (!response.ok) {
        sendResponse({
          success: false,
          error: payload?.error || `Backend request failed with status ${response.status}.`,
          details: payload?.details || null,
        });
        return;
      }

      sendResponse({
        success: true,
        payload,
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message || "Network request failed.",
      });
    }
  })();

  return true;
});
