import { config } from '../config.js';

const EARTH_RADIUS_KM = 6371;
const geocodeCache = new Map();
const travelCache = new Map();

export function isMockMaps() {
  return !config.maps.apiKey;
}

export function haversineKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Reparte direcciones de forma determinista alrededor del centro configurado.
function mockPoint(address) {
  const hash = hashString(normalizeKey(address) || 'ubicacion');
  const angle = ((hash % 3600) / 3600) * Math.PI * 2;
  const radiusKm = 0.4 + ((hash >>> 9) % 46) / 10;
  const center = config.maps.mockCenter;
  const lat = center.lat + (radiusKm / 111) * Math.cos(angle);
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lng = center.lng + (radiusKm / (111 * cosLat)) * Math.sin(angle);
  return { lat: round(lat), lng: round(lng) };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(config.maps.timeoutMs),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${text.slice(0, 180)}`);
  }
  return response.json();
}

async function geocodeWithProvider(query) {
  const url = `${config.maps.baseUrl}/geocode/search?text=${encodeURIComponent(
    query,
  )}&apiKey=${encodeURIComponent(config.maps.apiKey)}&format=json&limit=1`;

  const data = await fetchJson(url);
  const feature = data?.results?.[0];
  if (!feature) throw new Error('Sin resultados de geocodificación.');

  return {
    lat: feature.lat,
    lng: feature.lon,
    label: feature.formatted || query,
    source: 'geoapify',
  };
}

export async function geocode(query) {
  const text = String(query ?? '').trim();
  if (!text) throw new Error('No se puede geocodificar una dirección vacía.');

  const cacheKey = normalizeKey(text);
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  let result;
  if (isMockMaps()) {
    result = { ...mockPoint(text), label: text, source: 'mock' };
  } else {
    try {
      result = await geocodeWithProvider(text);
    } catch (error) {
      console.warn(`[geo] Geocodificación fallida para "${text}": ${error.message}. Se usa aproximación local.`);
      result = { ...mockPoint(text), label: text, source: 'mock-fallback' };
    }
  }

  geocodeCache.set(cacheKey, result);
  return result;
}

function estimateTravel(origin, destination, mode = 'walk') {
  const km = haversineKm(origin, destination);

  const speedByMode = {
    walk: 5,
    transit: 30,
    drive: 40,
    bicycle: 15,
  };
  const speedKmh = speedByMode[mode] || 5;

  const minutes = Math.max(4, (km / speedKmh) * 60);

  return {
    minutes,
    meters: Math.round(km * 1000),
    source: 'estimado',
    mode,
  };
}

async function travelWithProvider(origin, destination, mode = 'walk') {
  const providerMode = mode === 'transit' ? 'drive' : mode;

  const waypoints = `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`;
  const url = `${config.maps.baseUrl}/routing?waypoints=${encodeURIComponent(
    waypoints,
  )}&mode=${encodeURIComponent(providerMode)}&apiKey=${encodeURIComponent(
    config.maps.apiKey,
  )}`;

  const data = await fetchJson(url);
  const feature = data?.features?.[0];
  if (!feature) throw new Error('Sin rutas en la respuesta.');

  return {
    minutes: feature.properties.time / 60,
    meters: feature.properties.distance,
    source: 'geoapify',
    mode,
  };
}

export async function getTravelTime(origin, destination, mode = 'walk') {
  if (!origin || !destination) {
    return { minutes: 0, meters: 0, source: 'no-disponible', mode };
  }

  const cacheKey = `${mode}|${round(origin.lat, 4)},${round(origin.lng, 4)}|${round(
    destination.lat,
    4,
  )},${round(destination.lng, 4)}`;

  if (travelCache.has(cacheKey)) return travelCache.get(cacheKey);

  let base;
  if (isMockMaps()) {
    base = estimateTravel(origin, destination, mode);
  } else {
    try {
      base = await travelWithProvider(origin, destination, mode);
    } catch (error) {
      console.warn(`[geo] Cálculo de ruta fallido: ${error.message}. Se usa estimación.`);
      base = estimateTravel(origin, destination, mode);
    }
  }

  const result = {
    minutes: Math.max(1, Math.round(base.minutes) + config.defaults.travelBufferMinutes),
    meters: base.meters,
    source: base.source,
    mode: base.mode || mode,
  };

  travelCache.set(cacheKey, result);
  return result;
}

export function findNearbyRestaurant(origin, candidates, mealType) {
  const list = (candidates || []).filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lng));
  if (!list.length) return null;

  const wanted = normalizeKey(mealType);
  const scored = list
    .map((candidate) => {
      const matches =
        Array.isArray(candidate.mealTypes) &&
        candidate.mealTypes.some((type) => normalizeKey(type).includes(wanted) || wanted.includes(normalizeKey(type)));
      return { candidate, score: haversineKm(origin, candidate) - (matches ? 1.5 : 0) };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0].candidate;
}

export async function suggestAddresses(query, limit = 5) {
  const text = String(query ?? '').trim();
  if (!text) return [];

  const size = Math.min(Math.max(Number(limit) || 5, 1), 10);

  if (isMockMaps()) {
    return [
      { label: `${text} (centro)`, lat: config.maps.mockCenter.lat, lng: config.maps.mockCenter.lng },
      { label: `${text} (norte)`, lat: config.maps.mockCenter.lat + 0.02, lng: config.maps.mockCenter.lng },
    ];
  }

  const url = `${config.maps.baseUrl}/geocode/autocomplete?text=${encodeURIComponent(
    text,
  )}&apiKey=${encodeURIComponent(config.maps.apiKey)}&format=json&limit=${size}`;

  const data = await fetchJson(url);
  const results = data?.results || [];

  return results
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => ({
      label: item.formatted || text,
      lat: item.lat,
      lng: item.lon,
    }))
    .slice(0, size);
}
