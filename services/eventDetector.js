const COMMENT_COOLDOWN_MS = 30 * 1000;
const QUIET_MARKET_INTERVAL_MS = 4 * 60 * 1000;

const EVENT_PRIORITY = {
  quiet_market: 1,
  buyers_control: 2,
  sellers_control: 2,
  volume_spike: 2,
  liquidity_warning: 3,
  liquidity_low: 3,
  strong_pump: 3,
  dump: 3,
  extreme_pump: 4,
  hard_dump: 4,
};

function buildEvent(type, reason) {
  return {
    type,
    priority: priorityLabel(type),
    reason,
  };
}

function priorityLabel(type) {
  const score = EVENT_PRIORITY[type] || 1;
  if (score >= 4) {
    return "high";
  }
  if (score >= 3) {
    return "medium";
  }
  return "low";
}

function priorityScore(event) {
  if (!event) {
    return 0;
  }
  return EVENT_PRIORITY[event.type] || 0;
}

function isRiskEvent(type) {
  return ["dump", "hard_dump", "liquidity_low", "liquidity_warning", "sellers_control"].includes(type);
}

function percentDrop(previousValue, currentValue) {
  if (!previousValue || previousValue <= 0) {
    return 0;
  }
  return ((previousValue - currentValue) / previousValue) * 100;
}

function detectCandidateEvents({ marketData, previousState }) {
  const market = marketData.market;
  const buys = market.buysM5;
  const sells = market.sellsM5;
  const totalTxns = buys + sells;
  const prevVolume = previousState?.market?.volumeM5 || 0;
  const prevLiquidity = previousState?.market?.liquidityUsd || 0;

  const events = [];

  if (market.priceChangeM5 >= 25) {
    events.push(
      buildEvent(
        "extreme_pump",
        `Price is up ${market.priceChangeM5.toFixed(1)}% in 5 minutes.`
      )
    );
  } else if (market.priceChangeM5 >= 10) {
    events.push(
      buildEvent(
        "strong_pump",
        `Price is up ${market.priceChangeM5.toFixed(1)}% in 5 minutes.`
      )
    );
  }

  if (market.priceChangeM5 <= -25) {
    events.push(
      buildEvent(
        "hard_dump",
        `Price is down ${Math.abs(market.priceChangeM5).toFixed(1)}% in 5 minutes.`
      )
    );
  } else if (market.priceChangeM5 <= -10) {
    events.push(
      buildEvent(
        "dump",
        `Price is down ${Math.abs(market.priceChangeM5).toFixed(1)}% in 5 minutes.`
      )
    );
  }

  if (market.liquidityUsd < 10000) {
    events.push(
      buildEvent(
        "liquidity_low",
        `Liquidity is low at $${Math.round(market.liquidityUsd).toLocaleString()}.`
      )
    );
  }

  if (prevLiquidity > 0 && percentDrop(prevLiquidity, market.liquidityUsd) >= 30) {
    events.push(
      buildEvent(
        "liquidity_warning",
        `Liquidity dropped ${percentDrop(prevLiquidity, market.liquidityUsd).toFixed(1)}% since the last check.`
      )
    );
  }

  if (
    (prevVolume > 0 && market.volumeM5 >= prevVolume * 1.8 && market.volumeM5 - prevVolume >= 10000) ||
    totalTxns >= 150
  ) {
    events.push(
      buildEvent(
        "volume_spike",
        `Volume and transaction activity are accelerating with ${totalTxns} trades in 5 minutes.`
      )
    );
  }

  if (buys >= Math.max(10, sells * 1.5)) {
    events.push(
      buildEvent(
        "buyers_control",
        `Buyers lead ${buys} to ${sells} over the last 5 minutes.`
      )
    );
  }

  if (sells >= Math.max(10, buys * 1.5)) {
    events.push(
      buildEvent(
        "sellers_control",
        `Sellers lead ${sells} to ${buys} over the last 5 minutes.`
      )
    );
  }

  if (
    Math.abs(market.priceChangeM5) < 3 &&
    totalTxns < 25 &&
    (!previousState?.lastCommentAt ||
      Date.now() - previousState.lastCommentAt >= QUIET_MARKET_INTERVAL_MS)
  ) {
    events.push(
      buildEvent(
        "quiet_market",
        "Price action and transaction flow are muted right now."
      )
    );
  }

  return events;
}

function shouldSuppressEvent({ candidate, previousState, now }) {
  if (!candidate) {
    return true;
  }

  const lastCommentAt = previousState?.lastCommentAt || 0;
  if (now - lastCommentAt < COMMENT_COOLDOWN_MS) {
    return true;
  }

  const lastEventType = previousState?.lastEventType || null;
  const lastEventPriority = previousState?.lastEventPriority || null;
  const currentPriority = priorityLabel(candidate.type);

  if (candidate.type === lastEventType && currentPriority === lastEventPriority) {
    return true;
  }

  return false;
}

function pickBestEvent(events) {
  if (!events.length) {
    return null;
  }

  return [...events].sort((left, right) => priorityScore(right) - priorityScore(left))[0];
}

function detectEvent({ marketData, previousState, mode, now }) {
  const candidates = detectCandidateEvents({ marketData, previousState });
  const filtered = mode === "risk"
    ? candidates.filter((event) => isRiskEvent(event.type))
    : candidates.filter((event) => event.type !== "quiet_market" || mode !== "risk");

  const candidate = pickBestEvent(filtered);
  if (!candidate) {
    return null;
  }

  if (shouldSuppressEvent({ candidate, previousState, now })) {
    return null;
  }

  return candidate;
}

module.exports = {
  detectEvent,
};
