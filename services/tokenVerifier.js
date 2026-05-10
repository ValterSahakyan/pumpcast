"use strict";

const nacl = require("tweetnacl");
const bs58Module = require("bs58");
const bs58 = bs58Module.decode ? bs58Module : bs58Module.default;

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const MIN_USD_VALUE = parseFloat(process.env.PCAST_MIN_USD || "5");

function normalizeSignatureBytes(signature) {
  if (!signature) return null;
  if (Array.isArray(signature)) return signature;
  if (signature instanceof Uint8Array) return Array.from(signature);
  if (ArrayBuffer.isView(signature)) {
    return Array.from(new Uint8Array(signature.buffer, signature.byteOffset, signature.byteLength));
  }
  if (signature instanceof ArrayBuffer) return Array.from(new Uint8Array(signature));
  if (typeof signature === "string") {
    const trimmed = signature.trim();
    if (!trimmed) return null;
    try {
      return Array.from(bs58.decode(trimmed));
    } catch {}
    try {
      return Array.from(Buffer.from(trimmed, "base64"));
    } catch {}
    try {
      return Array.from(Buffer.from(trimmed, "hex"));
    } catch {}
    return null;
  }
  if (Array.isArray(signature.data)) return signature.data;
  if (signature.signature) return normalizeSignatureBytes(signature.signature);
  const numericKeys = Object.keys(signature)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));
  if (numericKeys.length) {
    return numericKeys.map((key) => Number(signature[key]));
  }
  return null;
}

// Verify an Ed25519 signature produced by a Solana wallet (Phantom / Solflare).
// walletAddress – base58-encoded Solana public key
// message       – the plaintext string that was signed
// signature     – Array<number> (0-255) representing the 64-byte signature
function verifySolanaSignature(walletAddress, message, signature) {
  try {
    const publicKeyBytes = bs58.decode(walletAddress);
    const sigSource = normalizeSignatureBytes(signature);
    if (!sigSource || !sigSource.length) {
      return false;
    }
    const sigBytes = Uint8Array.from(sigSource);
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sigBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

// Query Solana mainnet RPC for the SPL token balance held by walletAddress.
// Returns the UI-formatted token amount (respects decimals) as a number.
async function getSolanaTokenBalance(walletAddress, mintAddress) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      walletAddress,
      { mint: mintAddress },
      { encoding: "jsonParsed" },
    ],
  };

  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Solana RPC: ${data.error.message}`);
  }

  const accounts = data.result?.value || [];
  let total = 0;
  for (const account of accounts) {
    const amt = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amt === "number") total += amt;
  }
  return total;
}

// Fetch the current USD price of the $PCAST token from DexScreener.
// Returns 0 if the token is not listed yet.
async function getPcastPriceUsd(mintAddress) {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      {
        headers: { Accept: "application/json", "User-Agent": "pumpcast-verify" },
        signal: AbortSignal.timeout(8_000),
      }
    );

    if (!response.ok) return 0;

    const data = await response.json();
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];

    const solanaPairs = pairs.filter((p) => p.chainId === "solana");
    if (!solanaPairs.length) return 0;

    // Pick the highest-liquidity pair
    const best = solanaPairs.sort(
      (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    return parseFloat(best.priceUsd || 0) || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  verifySolanaSignature,
  getSolanaTokenBalance,
  getPcastPriceUsd,
  MIN_USD_VALUE,
};
