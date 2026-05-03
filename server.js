require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");

const {
  fetchDexScreenerMarketData,
  isValidSolanaAddress,
} = require("./services/dexScreener");
const { detectEvent } = require("./services/eventDetector");
const { generateCommentary } = require("./services/commentGenerator");
const { createTokenStateStore } = require("./store/tokenState");

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOriginConfig = process.env.ALLOWED_ORIGIN || "*";
const allowedOrigins =
  allowedOriginConfig === "*"
    ? "*"
    : allowedOriginConfig
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
const dbUrl =
  process.env.DATABASE_URL || "postgres://admin:adminpassword@localhost:5432/pumpcast";
const pool = new Pool({
  connectionString: dbUrl,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
const tokenStateStore = createTokenStateStore(pool);

app.set("trust proxy", true);
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
app.use(express.json({ limit: "2mb" }));

const ADMIN_WALLET = (
  process.env.ADMIN_WALLET || "0xd21760a4ad624d15ee37570b3c09fd3bff489309"
)
  .toLowerCase()
  .trim();

function requireAdmin(req, res, next) {
  const wallet = (req.headers.authorization || "").toLowerCase().trim();
  if (wallet !== ADMIN_WALLET) {
    return res.status(403).json({ success: false, error: "Unauthorized" });
  }
  req.adminWallet = wallet;
  next();
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function toTrimmedString(value) {
  return String(value || "").trim();
}

function normalizeAd(ad, index) {
  return {
    image: String(ad?.image || "").trim(),
    badge: clampText(ad?.badge, 50),
    title: clampText(ad?.title, 255),
    desc: String(ad?.desc || "").trim(),
    link: String(ad?.link || "").trim(),
    accent: clampText(ad?.accent || "#FF6A00", 50) || "#FF6A00",
    active: ad?.active !== false,
    sortOrder: index,
  };
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
  const { ads } = req.body || {};
  if (!Array.isArray(ads)) {
    return res.status(400).json({ success: false, error: "ads must be an array" });
  }

  const normalizedAds = ads.map(normalizeAd);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("DELETE FROM ads");
    for (const ad of normalizedAds) {
      await client.query(
        `INSERT INTO ads (image, badge, title, "desc", link, accent, active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ad.image,
          ad.badge,
          ad.title,
          ad.desc,
          ad.link,
          ad.accent,
          ad.active,
          ad.sortOrder,
        ]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("POST /api/admin/ads:", err.message);
    res.status(500).json({ success: false, error: `Failed to save ads: ${err.message}` });
  } finally {
    if (client) {
      client.release();
    }
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
  try {
    const {
      symbol = "",
      name = "",
      address = "",
      pumpfun_url = "",
      icon_url = "",
      description = "",
    } = req.body || {};

    const values = [
      toTrimmedString(symbol),
      toTrimmedString(name),
      toTrimmedString(address),
      toTrimmedString(pumpfun_url),
      toTrimmedString(icon_url),
      toTrimmedString(description),
    ];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updateResult = await client.query(
        `
          UPDATE token_config SET
            symbol      = $1,
            name        = $2,
            address     = $3,
            pumpfun_url = $4,
            icon_url    = $5,
            description = $6
          WHERE id = 1
        `,
        values
      );

      if (updateResult.rowCount === 0) {
        await client.query(
          `
            INSERT INTO token_config (
              id,
              symbol,
              name,
              address,
              pumpfun_url,
              icon_url,
              description
            )
            VALUES (1, $1, $2, $3, $4, $5, $6)
          `,
          values
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/admin/token:", err.message);
    res.status(500).json({ success: false, error: `Failed to save token config: ${err.message}` });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pumpcast-backend" });
});

app.get("/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "up" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({ ok: false, database: "down" });
  }
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
    const result = await tokenStateStore.withLockedState(key, async (previousState) => {
      const now = Date.now();
      const event = detectEvent({
        marketData,
        previousState,
        mode,
        now,
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

      return {
        response: {
          success: true,
          token: marketData.token,
          event,
          comment,
          message,
          market: marketData.market,
        },
        nextState: {
          token: marketData.token,
          market: marketData.market,
          lastObservedAt: now,
          lastEventType: event ? event.type : previousState?.lastEventType || null,
          lastEventPriority: event ? event.priority : previousState?.lastEventPriority || null,
          lastCommentAt: comment ? now : previousState?.lastCommentAt || 0,
          lastCommentText: comment || previousState?.lastCommentText || "",
        },
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Commentator API error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process commentator request.",
      details: error.message,
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled middleware error:", error);

  // Body parser error (invalid JSON or wrong Content-Type)
  if (error.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return res.status(400).json({ success: false, error: "Invalid JSON in request body." });
  }

  // CORS rejection
  if (error.message && error.message.toLowerCase().includes("cors")) {
    return res.status(403).json({ success: false, error: `CORS error: ${error.message}` });
  }

  res.status(500).json({
    success: false,
    error: error.message || "Unexpected server error.",
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
        ADD COLUMN IF NOT EXISTS image      TEXT,
        ADD COLUMN IF NOT EXISTS badge      VARCHAR(50),
        ADD COLUMN IF NOT EXISTS title      VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "desc"     TEXT,
        ADD COLUMN IF NOT EXISTS link       TEXT,
        ADD COLUMN IF NOT EXISTS accent     VARCHAR(50),
        ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS token_states (
        token_address       TEXT PRIMARY KEY,
        token               JSONB,
        market              JSONB,
        last_observed_at    BIGINT NOT NULL DEFAULT 0,
        last_event_type     TEXT,
        last_event_priority TEXT,
        last_comment_at     BIGINT NOT NULL DEFAULT 0,
        last_comment_text   TEXT NOT NULL DEFAULT ''
      )
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
      ALTER TABLE token_config
        ADD COLUMN IF NOT EXISTS id          INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS symbol      VARCHAR(20)  DEFAULT 'PCAST',
        ADD COLUMN IF NOT EXISTS name        VARCHAR(100) DEFAULT 'PumpCast AI',
        ADD COLUMN IF NOT EXISTS address     VARCHAR(200) DEFAULT '',
        ADD COLUMN IF NOT EXISTS pumpfun_url TEXT         DEFAULT '',
        ADD COLUMN IF NOT EXISTS icon_url    TEXT         DEFAULT '',
        ADD COLUMN IF NOT EXISTS description TEXT         DEFAULT ''
    `);
    await client.query(`
      UPDATE token_config SET id = 1 WHERE id IS NULL
    `);
    await client.query(`
      INSERT INTO token_config (id)
      SELECT 1
      WHERE NOT EXISTS (
        SELECT 1 FROM token_config WHERE id = 1
      )
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
    console.error("Database initialization failed:", err?.message || err);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`Pumpcast backend listening on http://localhost:${port}`);
  });

  async function shutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully.`);

    const forceExitTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    server.close(async () => {
      try {
        await pool.end();
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error.message);
        process.exit(1);
      }
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
