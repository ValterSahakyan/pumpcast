// Runs in the MAIN world (page context) so it can reach window.phantom / window.solana.
// Communicates with the isolated-world content script via window.postMessage.
(function pumpcastWalletBridge() {
  "use strict";

  function toByteArray(value) {
    if (!value) return null;
    if (value instanceof Uint8Array) return Array.from(value);
    if (Array.isArray(value)) return value;
    if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
    if (typeof value === "string") return value;
    if (value.signature) return toByteArray(value.signature);
    if (Array.isArray(value.data)) return value.data;
    return null;
  }

  function getProvider() {
    // Phantom injects window.phantom.solana; older Phantom also used window.solana
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solana?.isPhantom) return window.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    // Generic Solana provider as last resort
    if (window.solana) return window.solana;
    return null;
  }

  window.addEventListener("message", async function handlePumpcastBridge(event) {
    if (event.source !== window) return;
    const { type } = event.data || {};

    // ── Detect whether a Solana wallet extension is installed ──────────────────
    if (type === "PUMPCAST_DETECT_WALLET") {
      const provider = getProvider();
      window.postMessage({
        type: "PUMPCAST_WALLET_DETECTED",
        hasWallet: !!provider,
        walletName: provider
          ? (provider.isPhantom ? "Phantom" : provider.isSolflare ? "Solflare" : "Solana")
          : null,
      }, "*");
    }

    // ── Connect wallet and return the public key ───────────────────────────────
    if (type === "PUMPCAST_WALLET_CONNECT") {
      const provider = getProvider();
      if (!provider) {
        window.postMessage({ type: "PUMPCAST_WALLET_CONNECTED", error: "NO_WALLET" }, "*");
        return;
      }
      try {
        const resp = await provider.connect();
        window.postMessage({
          type: "PUMPCAST_WALLET_CONNECTED",
          wallet: resp.publicKey.toString(),
        }, "*");
      } catch (err) {
        window.postMessage({
          type: "PUMPCAST_WALLET_CONNECTED",
          error: err?.message || "Connection rejected",
        }, "*");
      }
    }

    // ── Sign a UTF-8 message and return the raw signature bytes ───────────────
    if (type === "PUMPCAST_SIGN_MESSAGE") {
      const provider = getProvider();
      if (!provider) {
        window.postMessage({ type: "PUMPCAST_MESSAGE_SIGNED", error: "NO_WALLET" }, "*");
        return;
      }
      try {
        const encoded = new TextEncoder().encode(event.data.message);
        let result;
        try {
          result = await provider.signMessage(encoded, "utf8");
        } catch (_firstError) {
          result = await provider.signMessage(encoded);
        }
        const signature = toByteArray(result);
        if (!signature?.length) {
          throw new Error("Wallet returned an unsupported signature format");
        }
        const signerWallet =
          result?.publicKey?.toString?.() ||
          provider.publicKey?.toString?.() ||
          null;
        window.postMessage({
          type: "PUMPCAST_MESSAGE_SIGNED",
          signature,
          wallet: signerWallet,
        }, "*");
      } catch (err) {
        window.postMessage({
          type: "PUMPCAST_MESSAGE_SIGNED",
          error: err?.message || "Signature rejected",
        }, "*");
      }
    }
  });
})();
