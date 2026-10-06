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
  const key = config.maps.apiKey;

  if (config.maps.provider === 'mapbox') {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query,
    )}.json?limit=1&language=es&access_token=${key}`;
    const data = await fetchJson(url);
    const feature = data?.features?.[0];
    if (!feature) throw new Error('Sin resultados de geocodificación.');
    return {
      lat: feature.center[1],
      lng: feature.center[0],
      label: feature.place_name || query,
      source: 'mapbox',
    };
  }

  if (config.maps.provider === 'google') {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      query,
    )}&language=es&key=${key}`;
    const data = await fetchJson(url);
    const result = data?.results?.[0];
    if (!result) throw new Error('Sin resultados de geocodificación.');
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      label: result.formatted_address || query,
      source: 'google',
    };
  }

  // openrouteservice (Pelias) por defecto
  const url = `${config.maps.baseUrl}/geocode/search?api_key=${encodeURIComponent(
    key,
  )}&size=1&text=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  const feature = data?.features?.[0];
  if (!feature) throw new Error('Sin resultados de geocodificación.');
  return {
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
    label: feature.properties?.label || query,
    source: 'openrouteservice',
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

function estimateTravel(origin, destination) {
  const km = haversineKm(origin, destination);
  const speedKmh = 18;
  const minutes = Math.max(4, (km / speedKmh) * 60);
  return { minutes, meters: Math.round(km * 1000), source: 'estimado' };
}

async function travelWithProvider(origin, destination) {
  if (config.maps.provider === 'mapbox') {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?access_token=${config.maps.apiKey}&overview=false`;
    const data = await fetchJson(url);
    const route = data?.routes?.[0];
    if (!route) throw new Error('Sin rutas en la respuesta.');
    return { minutes: route.duration / 60, meters: route.distance, source: 'mapbox' };
  }

  if (config.maps.provider === 'google') {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&mode=driving&language=es&key=${config.maps.apiKey}`;
    const data = await fetchJson(url);
    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') throw new Error('Sin matriz de distancias válida.');
    return {
      minutes: element.duration.value / 60,
      meters: element.distance.value,
      source: 'google',
    };
  }

  const response = await fetch(`${config.maps.baseUrl}/v2/directions/driving-car`, {
    method: 'POST',
    headers: {
      Authorization: config.maps.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    }),
    signal: AbortSignal.timeout(config.maps.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${text.slice(0, 180)}`);
  }

  const data = await response.json();
  const summary = data?.routes?.[0]?.summary;
  if (!summary) throw new Error('Respuesta sin rutas.');
  return { minutes: summary.duration / 60, meters: summary.distance, source: 'openrouteservice' };
}

export async function getTravelTime(origin, destination) {
  if (!origin || !destination) {
    return { minutes: 0, meters: 0, source: 'no-disponible' };
  }

  const cacheKey = `${round(origin.lat, 4)},${round(origin.lng, 4)}|${round(destination.lat, 4)},${round(destination.lng, 4)}`;
  if (travelCache.has(cacheKey)) return travelCache.get(cacheKey);

  let base;
  if (isMockMaps()) {
    base = estimateTravel(origin, destination);
  } else {
    try {
      base = await travelWithProvider(origin, destination);
    } catch (error) {
      console.warn(`[geo] Cálculo de ruta fallido: ${error.message}. Se usa estimación.`);
      base = estimateTravel(origin, destination);
    }
  }

  const result = {
    minutes: Math.max(1, Math.round(base.minutes) + config.defaults.travelBufferMinutes),
    meters: base.meters,
    source: base.source,
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
