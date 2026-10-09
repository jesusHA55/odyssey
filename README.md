# Odyssey II — Urban Route Planner with an LLM

A web app that builds an optimized city itinerary from:

- a start time and place,
- an end time and place,
- mandatory key locations,
- the number of meals and the time for each one,
- preferences (city, pace, interests, transport mode, maximum distance, and food budget).

The backend geocodes every location, asks an LLM for real recommendations, computes
travel times, and assembles a realistic timeline that fits inside the available window.

## Features

- **LLM-powered recommendations**: asks the model (DeepSeek, OpenAI-compatible) for real places and restaurants for the city, validates the JSON response, and retries once on failure.
- **Geoapify maps**: geocoding, address autocomplete, and routing. Geoapify is the only supported maps provider.
- **Transport modes**: `walking`, `transit`, or `mixed` (uses transit for legs longer than 1.2 km).
- **Food budget**: filters restaurants by the remaining budget; if none fit, it warns and picks the cheapest option.
- **Configurable maximum distance** between consecutive stops: discards recommendations that exceed it (mandatory stops are always kept, with a warning).
- **Mandatory stops** (max 10) and **meals** (max 6), plus pace, interests, and city.
- **Autocomplete** for the start, end, and mandatory stops.
- **Automatic mock mode**: if the LLM and/or maps key is missing, simulated data is generated so the app still runs without any keys.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + Vite 5 + Leaflet |
| Backend | Node.js + Express 4 |
| LLM | Any OpenAI-compatible chat API (DeepSeek by default) |
| Maps | Geoapify (geocoding, autocomplete, routing) |

## Project structure

```
OdysseyII/
├── client/                          # Frontend (React + Vite + Leaflet)
│   ├── index.html
│   ├── vite.config.js               # Proxy /api -> http://localhost:3001
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                  # Global state and result composition
│       ├── api.js                   # POST /api/route call
│       ├── styles.css
│       └── components/
│           ├── RouteForm.jsx           # Route form
│           ├── AutocompleteInput.jsx   # Address autocomplete
│           ├── RouteMap.jsx            # Leaflet map with the route
│           └── ItineraryList.jsx       # Itinerary, meals, and recommendations
└── server/                          # REST API (Express)
    ├── index.js                     # Bootstrap, CORS, and error handling
    ├── config.js                    # Env var loading + validation
    ├── package.json
    ├── .env.example
    ├── routes/
    │   ├── route.js                 # POST /api/route
    │   └── geocode.js               # GET /api/geocode/suggest
    └── services/
        ├── routeGenerator.js        # Orchestrates geocoding + LLM + scheduler
        ├── llm.js                   # LLM client (DeepSeek, OpenAI-compatible)
        ├── geo.js                   # Geocoding, autocomplete, and travel times
        ├── scheduler.js             # Builds the timeline
        └── validation.js            # Input validation and normalization
```

## Requirements

- Node.js >= 18.17 (the client uses Vite and the server uses native `fetch`).

## Getting started

### 1. Backend

```bash
cd server
cp .env.example .env   # fill in the keys you need
npm install
npm run dev            # http://localhost:3001
```

Without keys, the server still starts in **mock mode**.

### 2. Frontend

```bash
cd client
npm install
npm run dev            # http://localhost:5173
```

The Vite dev server proxies `/api` requests to the backend on port `3001`.

## Environment variables

Configure them in `server/.env` (see `server/.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Server port. |
| `LLM_API_KEY` | — | LLM API key. Without it, mock mode is used. |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | `deepseek-chat` | Model to use. |
| `LLM_TIMEOUT_MS` | `45000` | Timeout for LLM requests. |
| `MAPS_API_KEY` | — | Geoapify API key. Without it, mock mode is used. |
| `MAPS_PROVIDER` | `geoapify` | Must be `geoapify` (the only supported provider). |
| `MAPS_BASE_URL` | `https://api.geoapify.com/v1` | Geoapify endpoint. |
| `MAPS_TIMEOUT_MS` | `15000` | Timeout for maps requests. |
| `MOCK_CENTER_LAT` | `40.4168` | Mock mode center (latitude). |
| `MOCK_CENTER_LNG` | `-3.7038` | Mock mode center (longitude). |
| `DEFAULT_VISIT_MINUTES` | `60` | Default duration of each visit. |
| `DEFAULT_MEAL_MINUTES` | `60` | Default duration of each meal. |
| `TRAVEL_BUFFER_MINUTES` | `5` | Buffer added to every leg. |
| `MAX_EXTRA_STOPS` | `5` | Maximum extra places suggested by the LLM. |
| `MAX_DISTANCE_METERS` | `600000` | Default maximum distance between stops. |

## API

### `GET /api/health`

Checks service status and reports whether the LLM and maps are in mock mode.

```json
{ "ok": true, "timestamp": "2026-05-01T09:00:00.000Z", "mode": { "llm": false, "maps": false } }
```

### `POST /api/route`

Generates the itinerary. Example request:

```json
{
  "start": { "time": "2026-05-01T09:00:00.000Z", "location": "Plaza Mayor, Madrid" },
  "end": { "time": "2026-05-01T18:00:00.000Z", "location": "Estación de Atocha, Madrid" },
  "keyLocations": ["Museo del Prado", "Parque del Retiro"],
  "meals": [{ "type": "almuerzo", "time": "2026-05-01T13:00:00.000Z" }],
  "preferences": {
    "city": "Madrid",
    "pace": "normal",
    "transportMode": "walking",
    "interests": ["arte", "tapas"],
    "maxDistanceMeters": 5000,
    "foodBudget": 60
  }
}
```

`preferences.pace` accepts `relajado`, `normal`, or `intenso` (English equivalents `relaxed`, `normal`, `intense` are also accepted). `preferences.transportMode` accepts `walking`, `transit`, or `mixed`.

Response (abbreviated):

```json
{
  "meta": {
    "city": "Madrid",
    "window": { "start": "...", "end": "..." },
    "totals": { "stops": 3, "meals": 1, "travelMinutes": 42, "visitMinutes": 210 },
    "sources": { "llm": "llm", "maps": "geoapify" },
    "omittedStops": [],
    "warnings": []
  },
  "route": [
    {
      "order": 0,
      "type": "start",
      "location": "Plaza Mayor, Madrid",
      "lat": 40.4155,
      "lng": -3.7074,
      "arrival": "2026-05-01T09:00:00.000Z",
      "departure": "2026-05-01T09:00:00.000Z",
      "travelMinutes": 0,
      "activity": "Punto de partida"
    }
  ],
  "meals": [
    {
      "type": "almuerzo",
      "requestedTime": "2026-05-01T13:00:00.000Z",
      "time": "2026-05-01T13:05:00.000Z",
      "restaurant": "Taberna El Rincón (Madrid)",
      "inRoute": true,
      "onSchedule": true,
      "estimatedCost": 20
    }
  ],
  "recommendations": [
    { "name": "Museo del Prado", "included": true }
  ],
  "geometry": [[40.4155, -3.7074]],
  "debug": { "mockLlm": false, "optionalStops": 5, "restaurants": 4 }
}
```

Validation errors return `400` with `error.message` and `error.details`.

### `GET /api/geocode/suggest`

Address suggestions for autocomplete.

| Parameter | Description |
| --- | --- |
| `text` | Text to search for (required). |
| `limit` | Number of results (1–10, default 5). |

Returns `{ "results": [{ "label": "...", "lat": 0, "lng": 0 }] }`.

## How it works

1. **Validation** (`validation.js`): normalizes times, mandatory stops, and preferences; caps at 10 stops and 6 meals; warns about meals outside the time window.
2. **Geocoding** (`geo.js`): converts locations into coordinates with Geoapify (with caching and a local fallback on failure).
3. **Recommendations** (`llm.js`): asks the LLM for places and restaurants, validates the JSON, and filters out any that duplicate mandatory stops.
4. **Planning** (`scheduler.js`):
   - orders stops with a greedy nearest-neighbor heuristic, slightly biased toward mandatory stops;
   - applies the transport mode and the maximum-distance limit;
   - inserts meals at their scheduled time, choosing a nearby restaurant while respecting the remaining budget;
   - omits recommendations that do not fit in the window and collects warnings.
5. **Response**: `routeGenerator.js` returns the route, meals, recommendations (included and discarded), map geometry, and totals.

## Notes

- **Geoapify is the only supported maps provider.** If another one is configured (`MAPS_PROVIDER` other than `geoapify`, or an OpenRouteService `MAPS_BASE_URL`), the server fails at startup with a clear message instead of raising confusing runtime errors.
- **No keys, no problem**: if `LLM_API_KEY` and/or `MAPS_API_KEY` are missing, that part runs in mock mode (simulated data) and the `mode` field of `/api/health` reports it.
- **Spanish output text**: generated text (reasons, categories, etc.) is requested in Spanish, since the UI targets Spanish-speaking users.
