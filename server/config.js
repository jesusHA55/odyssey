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
    provider: str(process.env.MAPS_PROVIDER, "geoapify").toLowerCase(),
    baseUrl: str(
      process.env.MAPS_BASE_URL,
      "https://api.geoapify.com/v1",
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
    maxDistanceMeters: num(process.env.MAX_DISTANCE_METERS, 600000),
  },
};

// Este proyecto solo admite Geoapify como proveedor de mapas.
// Si se configura OpenRouteService (u otro proveedor) por error, fallamos
// al arrancar con un mensaje claro en lugar de provocar errores 401/404
// confusos en tiempo de ejecución (p. ej. "authorization field missing").
if (
  config.maps.provider !== "geoapify" ||
  /openrouteservice/i.test(config.maps.baseUrl)
) {
  throw new Error(
    "Configuración de mapas no soportada: este proyecto solo admite Geoapify. Revisa MAPS_PROVIDER y MAPS_BASE_URL en server/.env.",
  );
}

export function mockFlags() {
  return {
    llm: !config.llm.apiKey,
    maps: !config.maps.apiKey,
  };
}
