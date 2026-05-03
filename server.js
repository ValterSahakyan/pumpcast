require("dotenv").config();

const cors = require("cors");
const express = require("express");
const path = require("path");
const { Pool } = require("pg");

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
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "OPTIONS"],
    origin(origin, callback) {
      if (!origin || allowedOrigins === "*") {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.includes(origin) ||
        origin === "https://dexscreener.com" ||
        origin === "https://pump.fun" ||
        origin.startsWith("chrome-extension://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
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

const dbUrl = process.env.DATABASE_URL || "postgres://admin:adminpassword@localhost:5432/pumpcast";
const pool = new Pool({ connectionString: dbUrl });

const ADMIN_WALLET = "0xd21760a4ad624d15ee37570b3c09fd3bff489309";

function requireAdmin(req, res, next) {
  const wallet = (req.headers.authorization || "").toLowerCase().trim();
  if (wallet !== ADMIN_WALLET) {
    return res.status(403).json({ success: false, error: "Unauthorized" });
  }
  req.adminWallet = wallet;
  next();
}

// Public: only active ads for the extension
app.get("/api/ads", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM ads WHERE active = TRUE ORDER BY sort_order ASC, id ASC"
    );
    res.json({ success: true, ads: rows });
  } catch (err) {
    console.error("GET /api/ads:", err.message);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// Admin: all ads including inactive
app.get("/api/admin/ads", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM ads ORDER BY sort_order ASC, id ASC"
    );
    res.json({ success: true, ads: rows });
  } catch (err) {
    console.error("GET /api/admin/ads:", err.message);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// Admin: replace all ads atomically
app.post("/api/admin/ads", requireAdmin, async (req, res) => {
  const { ads } = req.body;
  if (!Array.isArray(ads)) {
    return res.status(400).json({ success: false, error: "ads must be an array" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM ads");
    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      await client.query(
        `INSERT INTO ads (image, badge, title, "desc", link, accent, active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ad.image  || "",
          ad.badge  || "",
          ad.title  || "",
          ad.desc   || "",
          ad.link   || "",
          ad.accent || "#FF6A00",
          ad.active !== false,
          i,
        ]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/admin/ads:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Public: token config for landing page
app.get("/api/token", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM token_config WHERE id = 1");
    res.json({ success: true, token: rows[0] || null });
  } catch (err) {
    console.error("GET /api/token:", err.message);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// Admin: save token config
app.post("/api/admin/token", requireAdmin, async (req, res) => {
  const { symbol, name, address, pumpfun_url, icon_url, description } = req.body;
  try {
    await pool.query(`
      UPDATE token_config SET
        symbol      = $1,
        name        = $2,
        address     = $3,
        pumpfun_url = $4,
        icon_url    = $5,
        description = $6
      WHERE id = 1
    `, [
      (symbol      || "").trim(),
      (name        || "").trim(),
      (address     || "").trim(),
      (pumpfun_url || "").trim(),
      (icon_url    || "").trim(),
      (description || "").trim(),
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/admin/token:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id           SERIAL PRIMARY KEY,
        image        TEXT,
        badge        VARCHAR(50),
        title        VARCHAR(255),
        "desc"       TEXT,
        link         TEXT,
        accent       VARCHAR(50),
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order   INTEGER NOT NULL DEFAULT 0
      )
    `);
    await client.query(`
      ALTER TABLE ads
        ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS token_config (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        symbol      VARCHAR(20)  DEFAULT 'PCAST',
        name        VARCHAR(100) DEFAULT 'PumpCast AI',
        address     VARCHAR(200) DEFAULT '',
        pumpfun_url TEXT         DEFAULT '',
        icon_url    TEXT         DEFAULT '',
        description TEXT         DEFAULT '',
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);
    await client.query(`
      INSERT INTO token_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING
    `);
    console.log("Database ready.");
  } finally {
    client.release();
  }
}

async function start() {
  try {
    await initDb();
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Pumpcast backend listening on http://localhost:${port}`);
  });
}

start();
