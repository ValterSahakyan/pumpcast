# Pumpcast

Pumpcast is an MVP AI meme-token commentator for pump.fun coin pages. It consists of a local Node.js/Express backend and a Chrome extension that injects a floating live commentary widget into pump.fun while using DEX Screener as the market data source.

## What the MVP does

- Detects the Solana token address from a `https://pump.fun/coin/{address}` page
- Injects a small floating dark-mode commentator widget
- Polls the local backend every 15 seconds while commentary is active
- Fetches market data from DEX Screener
- Detects meaningful events with rule-based logic before any AI call
- Generates short commentary with OpenAI or a local fallback template
- Displays the latest comment, stores the last 5 comments, and optionally speaks them with browser `SpeechSynthesis`

## Project structure

- `server.js`: Express API and request handling
- `services/dexScreener.js`: DEX Screener fetching and market normalization
- `services/eventDetector.js`: Rule-based event detection and anti-spam logic
- `services/commentGenerator.js`: OpenAI prompt call and local fallback comment templates
- `store/tokenState.js`: In-memory token state tracking
- `extension/manifest.json`: Chrome extension manifest
- `extension/content.js`: Widget injection, polling, URL detection, and speech playback
- `extension/widget.css`: Widget styling
- `extension/background.js`: Minimal MV3 service worker

## Backend setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and configure it:

```bash
copy .env.example .env
```

3. Set environment variables in `.env`:

```env
OPENAI_API_KEY=your_openai_api_key
PORT=3001
ALLOWED_ORIGIN=https://pump.fun
```

4. Start the backend:

```bash
npm start
```

5. Verify the backend is running:

```text
http://localhost:3001/health
```

## Chrome extension setup

1. Open [extension/content.js](/abs/c:/work/pumpcast/extension/content.js) and confirm `BACKEND_URL` points to your backend. By default it is `http://localhost:3001`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click `Load unpacked`.
5. Select the local `extension` folder from this repo.
6. After code changes, click the extension reload button in `chrome://extensions`.

## How to test the MVP

1. Start the backend locally.
2. Load the Chrome extension in Developer Mode.
3. Open a pump.fun coin page such as:

```text
https://pump.fun/coin/GN6BcKkktXeMim5t5dxUuh4BXeiooG8iScwJMAC1pump
```

4. Confirm the `🎙️ MemeRace Commentator` widget appears in the bottom-right corner.
5. Choose `Race Mode`, `Pro Mode`, or `Risk Mode`.
6. Leave Voice on or switch it off.
7. Click `Start Commentary`.
8. Wait for the backend polling cycle. If a meaningful market event is detected, the widget will show the comment and optionally speak it.
9. Click `Stop` to end polling and any active speech.

## API contract

### Request

```text
GET /api/commentator?address={tokenOrPairAddress}&mode={race|pro|risk}
```

### Success with event

```json
{
  "success": true,
  "token": {
    "name": "Bonk Cat",
    "symbol": "BONKCAT",
    "address": "..."
  },
  "event": {
    "type": "strong_pump",
    "priority": "medium",
    "reason": "Price is up 18.0% in 5 minutes."
  },
  "comment": "BONKCAT is charging down the track, up 18% in five minutes with volume roaring behind it!",
  "message": "Meaningful market event detected.",
  "market": {
    "priceUsd": 0.00045,
    "priceChangeM5": 18,
    "priceChangeH1": 42,
    "volumeM5": 45000,
    "liquidityUsd": 120000,
    "buysM5": 120,
    "sellsM5": 75
  }
}
```

### Success without event

```json
{
  "success": true,
  "event": null,
  "comment": null,
  "message": "No meaningful market event detected."
}
```

## MVP rules implemented

- Comments are capped to 25 words
- OpenAI is only called after rule-based event detection
- No trading, wallet, or swap features are included
- The backend keeps in-memory state per token
- The backend avoids repeating comments more than once every 30 seconds per token
- Risk Mode filters to risk-focused events only
- If OpenAI fails or no API key is configured, local template-based commentary is used

## Known limitations

- State is in memory only and resets when the backend restarts
- The extension is hardcoded to a local backend URL for MVP simplicity
- pump.fun page structure or routing changes could require content-script adjustments
- The widget does not persist user preferences across browser sessions
- Voice playback quality depends on browser and system voices
- Pair selection uses the most liquid Solana pair returned by DEX Screener

## Future improvements

- Support GMGN, Photon, BullX, and Birdeye
- Custom commentator voices
- Telegram alerts
- OBS overlay for streamers
- Wallet position tracking
- Paid subscription
- User accounts
- Commentator personality marketplace
