const PUMPFUN_API = "https://frontend-api.pump.fun";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "pumpcast-mvp",
    },
  });
  if (!response.ok) {
    throw new Error(`Pump.fun API request failed with status ${response.status}`);
  }
  return response.json();
}

function calcPriceChangePercent(trades) {
  if (trades.length < 2) return 0;
  const sorted = [...trades].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const priceFirst = Number(first.token_amount) > 0
    ? Number(first.sol_amount) / Number(first.token_amount)
    : 0;
  const priceLast = Number(last.token_amount) > 0
    ? Number(last.sol_amount) / Number(last.token_amount)
    : 0;
  if (!priceFirst) return 0;
  return ((priceLast - priceFirst) / priceFirst) * 100;
}

async function fetchPumpFunMarketData(address) {
  const [coinResult, tradesResult] = await Promise.allSettled([
    fetchJson(`${PUMPFUN_API}/coins/${address}`),
    fetchJson(`${PUMPFUN_API}/trades/${address}?limit=200`),
  ]);

  if (coinResult.status === "rejected" || !coinResult.value?.mint) {
    throw new Error("Token not found on pump.fun.");
  }

  const coin = coinResult.value;
  const trades = tradesResult.status === "fulfilled" && Array.isArray(tradesResult.value)
    ? tradesResult.value
    : [];

  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  const m5Trades = trades.filter(t => Number(t.timestamp) * 1000 >= fiveMinAgo);
  const h1Trades = trades.filter(t => Number(t.timestamp) * 1000 >= oneHourAgo);

  const buysM5 = m5Trades.filter(t => t.is_buy).length;
  const sellsM5 = m5Trades.filter(t => !t.is_buy).length;

  // sol_amount is in lamports on the pump.fun API
  const volumeM5 = m5Trades.reduce((s, t) => s + Number(t.sol_amount || 0), 0) / 1e9;
  const volumeH1 = h1Trades.reduce((s, t) => s + Number(t.sol_amount || 0), 0) / 1e9;

  const priceChangeM5 = calcPriceChangePercent(m5Trades);
  const priceChangeH1 = calcPriceChangePercent(h1Trades);

  // market_cap is in SOL, usd_market_cap is in USD — derive SOL price from the ratio
  const marketCapSol = Number(coin.market_cap || 0);
  const marketCapUsd = Number(coin.usd_market_cap || 0);
  const solPriceUsd = marketCapSol > 0 && marketCapUsd > 0
    ? marketCapUsd / marketCapSol
    : 150;

  // Liquidity = SOL locked in the bonding curve
  const virtualSolLamports = Number(coin.virtual_sol_reserves || 0);
  const liquidityUsd = (virtualSolLamports / 1e9) * solPriceUsd;

  // Price per token: market_cap_usd / circulating_supply_in_whole_tokens
  const totalSupplyRaw = Number(coin.total_supply || 1e15);
  const totalSupplyTokens = totalSupplyRaw / 1e6; // pump.fun tokens have 6 decimals
  const priceUsd = totalSupplyTokens > 0 ? marketCapUsd / totalSupplyTokens : 0;

  return {
    token: {
      name: coin.name || "Unknown Token",
      symbol: coin.symbol || "UNKNOWN",
      address: coin.mint || address,
      pairAddress: address,
    },
    market: {
      dexId: "pumpfun",
      chainId: "solana",
      priceUsd,
      priceChangeM5,
      priceChangeH1,
      volumeM5,
      volumeH1,
      liquidityUsd,
      fdv: marketCapUsd,
      marketCap: marketCapUsd,
      pairAddress: address,
      pairCreatedAt: coin.created_timestamp ? coin.created_timestamp * 1000 : null,
      buysM5,
      sellsM5,
      url: `https://pump.fun/coin/${address}`,
    },
  };
}

module.exports = { fetchPumpFunMarketData };
