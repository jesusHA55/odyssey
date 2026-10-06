import { config, mockFlags } from '../config.js';
import { geocode, isMockMaps } from './geo.js';
import { suggestPlaces, isMockLlm } from './llm.js';
import { buildItinerary } from './scheduler.js';
import { normalizeText } from './validation.js';

function inferCity(address) {
  const parts = String(address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'la ciudad';
}

function formatWindow(startTime, endTime) {
  const fmt = (value) =>
    new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startTime)} - ${fmt(endTime)}`;
}

function formatDateLabel(value) {
  return new Date(value).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function geocodeMaybe(address, fallbackName) {
  const queries = [address, fallbackName].filter((query) => query && String(query).trim());
  for (const query of queries) {
    try {
      return await geocode(query);
    } catch (error) {
      console.warn(`[routeGenerator] No se pudo geocodificar "${query}": ${error.message}`);
    }
  }
  return null;
}

export async function generateRoute(input) {
  const warnings = [];
  const { start, end, keyLocations, meals, preferences } = input;

  const [startPoint, endPoint] = await Promise.all([
    geocode(start.location),
    geocode(end.location),
  ]);

  const city = preferences.city || inferCity(start.location);

  const requiredStops = [];
  for (const location of keyLocations) {
    const point = await geocodeMaybe(location, location);
    if (!point) {
      warnings.push(`No se pudo localizar la parada obligatoria "${location}"; se ha omitido.`);
      continue;
    }
    requiredStops.push({
      name: location,
      address: point.label || location,
      lat: point.lat,
      lng: point.lng,
      visitMinutes: config.defaults.visitMinutes,
      category: 'parada obligatoria',
      why: 'Ubicación clave solicitada por el usuario.',
      required: true,
    });
  }

  let suggestions = { places: [], restaurants: [], source: isMockLlm() ? 'mock' : 'llm' };
  try {
    suggestions = await suggestPlaces({
      city,
      dateLabel: formatDateLabel(start.time),
      windowLabel: formatWindow(start.time, end.time),
      keyLocations,
      meals,
      preferences,
    });
  } catch (error) {
    warnings.push(
      `No se pudieron obtener recomendaciones del LLM (${error.message}); la ruta se genera solo con las paradas obligatorias.`,
    );
    suggestions = { places: [], restaurants: [], source: 'error' };
  }

  const optionalStops = [];
  for (const place of suggestions.places) {
    const point = await geocodeMaybe(place.address ? `${place.name}, ${place.address}` : place.name, place.name);
    if (!point) {
      warnings.push(`No se pudo localizar la recomendación "${place.name}"; se ha descartado.`);
      continue;
    }
    optionalStops.push({
      ...place,
      lat: point.lat,
      lng: point.lng,
      address: place.address || point.label,
      required: false,
    });
  }

  const restaurants = [];
  for (const restaurant of suggestions.restaurants) {
    const point = await geocodeMaybe(
      restaurant.address ? `${restaurant.name}, ${restaurant.address}` : restaurant.name,
      restaurant.name,
    );
    if (!point) continue;
    restaurants.push({ ...restaurant, lat: point.lat, lng: point.lng, address: restaurant.address || point.label });
  }

  const itinerary = await buildItinerary({
    start: { ...startPoint, time: start.time, location: start.location },
    end: { ...endPoint, time: end.time, location: end.location },
    requiredStops,
    optionalStops,
    restaurants,
    meals,
    warnings,
    maxDistanceMeters: preferences.maxDistanceMeters ?? config.defaults.maxDistanceMeters,
    foodBudget: preferences.foodBudget,
  });

  const visitedNames = new Set(
    itinerary.route
      .filter((item) => item.type === 'stop')
      .map((item) => normalizeText(item.location)),
  );

  const recommendations = optionalStops.map((place) => ({
    name: place.name,
    address: place.address,
    category: place.category,
    visitMinutes: place.visitMinutes,
    why: place.why,
    lat: place.lat,
    lng: place.lng,
    included: visitedNames.has(normalizeText(place.name)),
  }));

  const sources = mockFlags();

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      city,
      startLocation: start.location,
      endLocation: end.location,
      window: { start: start.time, end: end.time },
      totals: itinerary.totals,
      sources: {
        llm: suggestions.source,
        maps: sources.maps ? 'mock' : config.maps.provider,
      },
      omittedStops: itinerary.omitted,
      warnings: itinerary.warnings ?? warnings,
    },
    route: itinerary.route,
    meals: itinerary.meals,
    recommendations,
    geometry: itinerary.route.map((item) => [item.lat, item.lng]),
    debug: {
      mockLlm: isMockLlm() || isMockMaps(),
      optionalStops: optionalStops.length,
      restaurants: restaurants.length,
    },
  };
}
