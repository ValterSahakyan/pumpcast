require("dotenv").config();

const cors = require("cors");
const express = require("express");
const path = require("path");

const {
  fetchDexScreenerMarketData,
  isValidSolanaAddress,
} = require("./services/dexScreener");
const { detectEvent } = require("./services/eventDetector");
const { generateCommentary } = require("./services/commentGenerator");
const tokenStateStore = require("./store/tokenState");

const app = express();
const port = Number(process.env.PORT || 3001);
const landingDistDir = path.join(__dirname, "landing-react", "dist");
const allowedOriginConfig = process.env.ALLOWED_ORIGIN || "*";
const allowedOrigins =
  allowedOriginConfig === "*"
    ? "*"
    : allowedOriginConfig
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins === "*") {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.includes(origin) ||
        origin === "https://dexscreener.com" ||
        origin === "https://pump.fun" ||
        origin.startsWith("chrome-extension://")
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
  })
);
app.use(express.json());
app.use(express.static(landingDistDir));
app.use(express.static("."));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/commentator", async (req, res) => {
  const rawAddress = String(req.query.address || "").trim();
  const mode = String(req.query.mode || "race").trim().toLowerCase();

  if (!isValidSolanaAddress(rawAddress)) {
    res.status(400).json({
      success: false,
      error: "Invalid Solana token or pair address.",
    });
    return;
  }

  if (!["race", "pro", "risk"].includes(mode)) {
    res.status(400).json({
      success: false,
      error: "Invalid mode. Use race, pro, or risk.",
    });
    return;
  }

  try {
    const marketData = await fetchDexScreenerMarketData(rawAddress);
    const key = marketData.token.address.toLowerCase();
    const previousState = tokenStateStore.getState(key);
    const event = detectEvent({
      marketData,
      previousState,
      mode,
      now: Date.now(),
    });

    let comment = null;
    let message = "No meaningful market event detected.";

    if (event) {
      comment = await generateCommentary({
        mode,
        event,
        marketData,
        previousState,
      });
      message = "Meaningful market event detected.";
    }

    tokenStateStore.updateState(key, {
      token: marketData.token,
      market: marketData.market,
      lastObservedAt: Date.now(),
      lastEventType: event ? event.type : previousState?.lastEventType || null,
      lastEventPriority: event ? event.priority : previousState?.lastEventPriority || null,
      lastCommentAt: comment ? Date.now() : previousState?.lastCommentAt || 0,
      lastCommentText: comment || previousState?.lastCommentText || "",
    });

    res.json({
      success: true,
      token: marketData.token,
      event,
      comment,
      message,
      market: marketData.market,
    });
  } catch (error) {
    console.error("Commentator API error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process commentator request.",
      details: error.message,
    });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  res.sendFile(path.join(landingDistDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Unexpected server error.",
  });
});

app.listen(port, () => {
  console.log(`Pumpcast backend listening on http://localhost:${port}`);
});
