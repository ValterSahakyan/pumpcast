const DEX_SCREENER_BASE = "https://api.dexscreener.com/latest/dex";
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolanaAddress(address) {
  return SOLANA_ADDRESS_REGEX.test(address);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "pumpcast-mvp",
    },
  });

  if (!response.ok) {
    throw new Error(`DEX Screener request failed with status ${response.status}`);
  }

  return response.json();
}

function pickBestPair(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return null;
  }

  return [...pairs].sort((left, right) => {
    const liquidityGap = (right?.liquidity?.usd || 0) - (left?.liquidity?.usd || 0);
    if (liquidityGap !== 0) {
      return liquidityGap;
    }

    return (right?.volume?.h1 || 0) - (left?.volume?.h1 || 0);
  })[0];
}

function normalizePair(pair, requestedAddress) {
  const baseTokenAddress = pair?.baseToken?.address || requestedAddress;

  return {
    token: {
      name: pair?.baseToken?.name || "Unknown Token",
      symbol: pair?.baseToken?.symbol || "UNKNOWN",
      address: baseTokenAddress,
      pairAddress: pair?.pairAddress || requestedAddress,
    },
    market: {
      dexId: pair?.dexId || null,
      chainId: pair?.chainId || null,
      priceUsd: Number(pair?.priceUsd || 0),
      priceChangeM5: Number(pair?.priceChange?.m5 || 0),
      priceChangeH1: Number(pair?.priceChange?.h1 || 0),
      volumeM5: Number(pair?.volume?.m5 || 0),
      volumeH1: Number(pair?.volume?.h1 || 0),
      liquidityUsd: Number(pair?.liquidity?.usd || 0),
      fdv: Number(pair?.fdv || 0),
      marketCap: Number(pair?.marketCap || 0),
      pairAddress: pair?.pairAddress || requestedAddress,
      pairCreatedAt: pair?.pairCreatedAt || null,
      buysM5: Number(pair?.txns?.m5?.buys || 0),
      sellsM5: Number(pair?.txns?.m5?.sells || 0),
      url: pair?.url || null,
    },
  };
}

async function fetchDexScreenerMarketData(address) {
  const tokenResponse = await fetchJson(`${DEX_SCREENER_BASE}/tokens/${address}`).catch(() => null);
  const tokenPair = pickBestPair(tokenResponse?.pairs);

  if (tokenPair && tokenPair.chainId === "solana") {
    return normalizePair(tokenPair, address);
  }

  const pairResponse = await fetchJson(`${DEX_SCREENER_BASE}/pairs/solana/${address}`).catch(() => null);
  const pair = pairResponse?.pair || null;

  if (pair && pair.chainId === "solana") {
    return normalizePair(pair, address);
  }

  throw new Error("No Solana pair data found for the provided address.");
}

module.exports = {
  fetchDexScreenerMarketData,
  isValidSolanaAddress,
};
