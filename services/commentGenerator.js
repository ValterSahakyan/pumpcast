const OpenAI = require("openai");

const SYSTEM_PROMPT =
  "You are an AI live commentator for meme-token traders. You comment on token market action like a sports or horse-racing announcer. Your comments must be short, clear, entertaining, and based only on the provided data. Do not give financial advice. Do not tell the user to buy, sell, hold, ape in, or exit. Do not make guarantees. Maximum 25 words.";

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

function createUserPrompt({ mode, event, marketData }) {
  const { token, market } = marketData;

  return [
    `Mode: ${mode}`,
    `Token name: ${token.name}`,
    `Token symbol: ${token.symbol}`,
    `Event type: ${event.type}`,
    `Event reason: ${event.reason}`,
    `Price USD: ${market.priceUsd}`,
    `Market Cap USD: ${market.marketCap}`,
    `5m price change: ${market.priceChangeM5}%`,
    `1h price change: ${market.priceChangeH1}%`,
    `5m volume: ${market.volumeM5}`,
    `Liquidity USD: ${market.liquidityUsd}`,
    `5m buys: ${market.buysM5}`,
    `5m sells: ${market.sellsM5}`,
    "Generate one live commentary sentence. Talk about the chart moving, mention casual $20-$50 buys happening, or reference the pump.fun bonding curve progress (it completes around $69k market cap).",
  ].join("\n");
}

function truncateComment(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 25) {
    return normalized;
  }

  return `${words.slice(0, 25).join(" ").replace(/[.,;:!?-]+$/, "")}.`;
}

function fallbackComment({ mode, event, marketData }) {
  const { token, market } = marketData;
  const symbol = token.symbol || token.name || "This token";
  const absChange = Math.abs(market.priceChangeM5).toFixed(1);

  const templates = {
    race: {
      extreme_pump: `${symbol} is sprinting away from the pack, up ${market.priceChangeM5.toFixed(1)}% in five minutes with chaos on the tape.`,
      strong_pump: `${symbol} is picking up speed, up ${market.priceChangeM5.toFixed(1)}% in five minutes with momentum building.`,
      dump: `${symbol} is losing ground, down ${absChange}% in five minutes as sellers lean on the chart.`,
      hard_dump: `${symbol} is sliding hard, off ${absChange}% in five minutes as the crowd backs away.`,
      volume_spike: `${symbol} just hit a burst of activity, with volume and trade count jumping fast.`,
      buyers_control: `${symbol} has buyers pressing the pace, with bids clearly outnumbering sells.`,
      sellers_control: `${symbol} is under pressure as sellers take control of the last five minutes.`,
      liquidity_low: `Warning: ${symbol} has low liquidity, so price movement may be unstable.`,
      liquidity_warning: `${symbol} just saw a sharp liquidity drop, and the track could get slippery fast.`,
      quiet_market: `${symbol} is circling quietly right now, with muted price action and light traffic.`,
      chart_update: `Looking at the board, ${symbol} is sitting at a ${market.marketCap ? '$' + Math.round(market.marketCap / 1000) + 'k' : 'steady'} market cap.`,
    },
    pro: {
      extreme_pump: `${symbol} is showing extreme short-term momentum, up ${market.priceChangeM5.toFixed(1)}% in five minutes with heavy activity.`,
      strong_pump: `${symbol} is showing strong short-term momentum, up ${market.priceChangeM5.toFixed(1)}% in five minutes with rising activity.`,
      dump: `${symbol} is weakening short term, down ${absChange}% in five minutes as selling pressure builds.`,
      hard_dump: `${symbol} is in a sharp short-term drawdown, down ${absChange}% in five minutes.`,
      volume_spike: `${symbol} is seeing a clear volume spike with faster transaction flow.`,
      buyers_control: `${symbol} has buyers in control over the last five minutes.`,
      sellers_control: `${symbol} has sellers in control over the last five minutes.`,
      liquidity_low: `Warning: ${symbol} has low liquidity, which can increase short-term instability.`,
      liquidity_warning: `${symbol} just lost a meaningful share of liquidity, increasing execution risk.`,
      quiet_market: `${symbol} is relatively quiet, with muted movement and low short-term activity.`,
      chart_update: `Current valuation for ${symbol} is roughly ${market.marketCap ? '$' + Math.round(market.marketCap / 1000) + 'k' : 'stable'}, with normal market flow.`,
    },
    risk: {
      dump: `Warning: ${symbol} is down ${absChange}% in five minutes as selling pressure increases.`,
      hard_dump: `Warning: ${symbol} is down ${absChange}% in five minutes with severe short-term pressure.`,
      liquidity_low: `Warning: ${symbol} has low liquidity, so price movement may be unstable.`,
      liquidity_warning: `Warning: ${symbol} just saw a sharp liquidity drop, increasing short-term instability.`,
      sellers_control: `Warning: sellers are dominating ${symbol} over the last five minutes.`,
    },
  };

  return truncateComment(
    templates[mode]?.[event.type] ||
      templates.pro[event.type] ||
      `${symbol} is seeing notable market movement: ${event.reason}`
  );
}

async function generateCommentary({ mode, event, marketData, previousState }) {
  const client = getOpenAIClient();

  if (!client) {
    return fallbackComment({ mode, event, marketData });
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: mode === "race" ? 0.9 : 0.5,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: createUserPrompt({ mode, event, marketData }),
        },
      ],
      max_tokens: 60,
    });

    const comment = truncateComment(response.choices?.[0]?.message?.content || "");
    if (!comment || comment === previousState?.lastCommentText) {
      return fallbackComment({ mode, event, marketData });
    }

    return comment;
  } catch (error) {
    console.error("OpenAI commentary generation failed:", error.message);
    return fallbackComment({ mode, event, marketData });
  }
}

module.exports = {
  generateCommentary,
};
