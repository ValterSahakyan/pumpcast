require("dotenv").config();

const crypto = require("crypto");
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
const {
  verifySolanaSignature,
  getSolanaTokenBalance,
  getPcastPriceUsd,
  MIN_USD_VALUE,
} = require("./services/tokenVerifier");

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
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "pumpcast-dev-access-secret";
const ACCESS_TOKEN_TTL_MS = Number(
  process.env.ACCESS_TOKEN_TTL_MS || 24 * 60 * 60 * 1000
);

app.set("trust proxy", true);
app.use(
  cors(function resolveCorsOptions(req, callback) {
    const origin = req.headers.origin;

    // Admin routes: allow any origin — requireAdmin (wallet check) is the security boundary
    if (req.path.startsWith("/api/admin/")) {
      return callback(null, {
        origin: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "OPTIONS"],
      });
    }

    // Public routes: strict origin check
    if (!origin || allowedOrigins === "*") {
      return callback(null, { origin: true, allowedHeaders: ["Content-Type", "Authorization"], methods: ["GET", "POST", "OPTIONS"] });
    }

    if (
      allowedOrigins.includes(origin) ||
      origin === "https://dexscreener.com" ||
      origin === "https://pump.fun" ||
      origin.startsWith("chrome-extension://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1")
    ) {
      return callback(null, { origin: true, allowedHeaders: ["Content-Type", "Authorization"], methods: ["GET", "POST", "OPTIONS"] });
    }

    callback(new Error("Origin not allowed by CORS"));
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

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function signAccessToken(payload) {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", ACCESS_TOKEN_SECRET)
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${body}.${signature}`;
}

function verifyAccessToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", ACCESS_TOKEN_SECRET)
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body));
    if (!payload?.wallet || !payload?.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function requireHolderAccess(req, res, next) {
  const authHeader = String(req.headers.authorization || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res
      .status(401)
      .json({ success: false, error: "Holder access required." });
  }

  req.holderAccess = payload;
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
    res.json({
      success: true,
      token: rows[0] || null,
      gate: {
        minUsdValue: MIN_USD_VALUE,
        accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
      },
    });
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

// ─── Token-gate auth ──────────────────────────────────────────────────────────
// Single-use nonces prevent replay attacks. Each nonce lives for 5 minutes.
const nonceStore = new Map(); // wallet -> { nonce, expiresAt }
const NONCE_TTL_MS = 5 * 60 * 1000;

function describeSignaturePayload(signature) {
  if (Array.isArray(signature)) {
    return { type: "array", length: signature.length };
  }
  if (!signature) {
    return { type: "empty", length: 0 };
  }
  if (typeof signature === "string") {
    return { type: "string", length: signature.length, preview: signature.slice(0, 16) };
  }
  if (Array.isArray(signature?.data)) {
    return { type: "data-array", length: signature.data.length };
  }
  if (signature instanceof Uint8Array) {
    return { type: "uint8array", length: signature.length };
  }
  if (signature?.signature) {
    return {
      type: "nested-signature",
      nested: describeSignaturePayload(signature.signature),
    };
  }
  return {
    type: typeof signature,
    keys: Object.keys(signature).slice(0, 12),
  };
}

function generateNonce() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

function pruneExpiredNonces() {
  const now = Date.now();
  for (const [k, v] of nonceStore) {
    if (v.expiresAt < now) nonceStore.delete(k);
  }
}

// GET /api/auth/nonce?wallet=<base58-solana-address>
app.get("/api/auth/nonce", (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!isValidSolanaAddress(wallet)) {
    return res.status(400).json({ success: false, error: "Invalid wallet address." });
  }
  pruneExpiredNonces();
  const nonce = generateNonce();
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
  res.json({ success: true, nonce });
});

// POST /api/auth/verify
// body: { wallet: string, signature: number[], nonce: string }
app.post("/api/auth/verify", async (req, res) => {
  const { wallet, signature, nonce } = req.body || {};

  if (
    typeof wallet !== "string" ||
    typeof nonce !== "string" ||
    !Array.isArray(signature) ||
    signature.length === 0
  ) {
    return res.status(400).json({ success: false, error: "Missing or invalid fields." });
  }

  if (!isValidSolanaAddress(wallet)) {
    return res.status(400).json({ success: false, error: "Invalid wallet address." });
  }

  // 1 — Validate nonce
  const stored = nonceStore.get(wallet);
  if (!stored || stored.nonce !== nonce || stored.expiresAt < Date.now()) {
    return res.status(401).json({ success: false, error: "Nonce is invalid or expired." });
  }
  nonceStore.delete(wallet); // single-use

  // 2 — Verify Ed25519 signature (proves the caller owns the wallet's private key)
  const message = `PumpCast Access: ${nonce}`;
  const sigValid = verifySolanaSignature(wallet, message, signature);
  if (!sigValid) {
    const signatureDebug = describeSignaturePayload(signature);
    console.warn("Signature verification failed", {
      wallet,
      nonce,
      messageLength: message.length,
      signatureDebug,
    });
    return res.status(401).json({
      success: false,
      error: "Signature verification failed.",
      details: signatureDebug,
    });
  }

  // 3 — Look up $PCAST token address (DB first, env fallback, hardcoded last resort)
  const HARDCODED_MINT = "5o5xUwYKZ4YGFFsEgz1T7j9W2pNU6t1T4ucfTVESpump";
  let mintAddress = process.env.PCAST_TOKEN_ADDRESS || HARDCODED_MINT;
  try {
    const { rows } = await pool.query("SELECT address FROM token_config WHERE id = 1");
    mintAddress = (rows[0]?.address || "").trim() || mintAddress;
  } catch (err) {
    console.error("Token config DB error — using fallback mint address:", err.message);
  }

  // 4 — Check token balance + USD value in parallel
  let balance = 0;
  let priceUsd = 0;
  try {
    [balance, priceUsd] = await Promise.all([
      getSolanaTokenBalance(wallet, mintAddress),
      getPcastPriceUsd(mintAddress),
    ]);
  } catch (err) {
    console.error("Token balance check error:", err.message);
    return res.status(503).json({ success: false, error: "Could not fetch token balance." });
  }

  const balanceUsd = balance * priceUsd;
  console.log(`[verify] wallet=${wallet} balance=${balance} priceUsd=${priceUsd} balanceUsd=${balanceUsd} required=${MIN_USD_VALUE}`);
  const access = balanceUsd >= MIN_USD_VALUE;
  const expiresAt = access ? Date.now() + ACCESS_TOKEN_TTL_MS : null;
  const accessToken = access
    ? signAccessToken({
        wallet,
        exp: expiresAt,
        mintAddress,
      })
    : null;

  res.json({
    success: true,
    access,
    balance,
    priceUsd,
    balanceUsd,
    required: MIN_USD_VALUE,
    mintAddress,
    accessToken,
    expiresAt,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pumpcast-backend" });
});

// Temporary debug endpoint — remove after diagnosing the balance/price issue
app.get("/api/debug/check", async (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  const HARDCODED_MINT = "5o5xUwYKZ4YGFFsEgz1T7j9W2pNU6t1T4ucfTVESpump";
  let mintAddress = process.env.PCAST_TOKEN_ADDRESS || HARDCODED_MINT;
  try {
    const { rows } = await pool.query("SELECT address FROM token_config WHERE id = 1");
    mintAddress = (rows[0]?.address || "").trim() || mintAddress;
  } catch {}

  let balance = null, balanceError = null;
  try { balance = await getSolanaTokenBalance(wallet || "test", mintAddress); }
  catch (e) { balanceError = e.message; }

  let priceUsd = null, priceError = null;
  try { priceUsd = await getPcastPriceUsd(mintAddress); }
  catch (e) { priceError = e.message; }

  res.json({
    mintAddress,
    wallet: wallet || "(not provided)",
    balance,
    balanceError,
    priceUsd,
    priceError,
    balanceUsd: (balance && priceUsd) ? balance * priceUsd : 0,
    required: MIN_USD_VALUE,
  });
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

app.get("/api/commentator", requireHolderAccess, async (req, res) => {
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
    if (error.message === "No Solana pair data found for the provided address.") {
      return res.status(404).json({
        success: false,
        error: "Token market data unavailable. The token may have been removed or is invalid.",
      });
    }
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
