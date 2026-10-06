import "dotenv/config";

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export const config = {
  port: num(process.env.PORT, 3001),

  llm: {
    apiKey: str(process.env.LLM_API_KEY, ""),
    baseUrl: str(
      process.env.LLM_BASE_URL,
      "https://api.deepseek.com/v1",
    ).replace(/\/+$/, ""),
    model: str(process.env.LLM_MODEL, "deepseek-chat"),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 45000),
  },

  maps: {
    apiKey: str(process.env.MAPS_API_KEY, ""),
    provider: str(process.env.MAPS_PROVIDER, "openrouteservice").toLowerCase(),
    baseUrl: str(
      process.env.MAPS_BASE_URL,
      "https://api.openrouteservice.org",
    ).replace(/\/+$/, ""),
    timeoutMs: num(process.env.MAPS_TIMEOUT_MS, 15000),
    mockCenter: {
      lat: num(process.env.MOCK_CENTER_LAT, 40.4168),
      lng: num(process.env.MOCK_CENTER_LNG, -3.7038),
    },
  },

  defaults: {
    visitMinutes: num(process.env.DEFAULT_VISIT_MINUTES, 60),
    mealMinutes: num(process.env.DEFAULT_MEAL_MINUTES, 60),
    travelBufferMinutes: num(process.env.TRAVEL_BUFFER_MINUTES, 5),
    maxExtraStops: num(process.env.MAX_EXTRA_STOPS, 5),
  },
};

export function mockFlags() {
  return {
    llm: !config.llm.apiKey,
    maps: !config.maps.apiKey,
  };
}
