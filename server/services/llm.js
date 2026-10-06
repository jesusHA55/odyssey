import { config } from '../config.js';
import { normalizeText } from './validation.js';

export function isMockLlm() {
  return !config.llm.apiKey;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizePlaces(list, limit) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name ?? '').trim();
    if (!name) continue;
    result.push({
      name,
      address: String(item.address ?? '').trim(),
      category: String(item.category ?? 'interés').trim(),
      visitMinutes: clampNumber(item.visitMinutes, 20, 180, config.defaults.visitMinutes),
      why: String(item.why ?? item.reason ?? '').trim().slice(0, 240),
    });
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeRestaurants(list, limit) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name ?? '').trim();
    if (!name) continue;
    result.push({
      name,
      address: String(item.address ?? '').trim(),
      cuisine: String(item.cuisine ?? 'cocina local').trim(),
      mealTypes: Array.isArray(item.mealTypes)
        ? item.mealTypes.filter((type) => typeof type === 'string' && type.trim()).map((type) => type.trim())
        : [],
      why: String(item.why ?? '').trim().slice(0, 200),
      estimatedCost: clampNumber(item.estimatedCost, 0, 1000, null),
    });
    if (result.length >= limit) break;
  }
  return result;
}

function parseJson(content) {
  const cleaned = String(content ?? '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  if (!cleaned) throw new Error('Respuesta vacía del LLM.');
  return JSON.parse(cleaned);
}

function buildPrompt({ city, dateLabel, windowLabel, keyLocations, meals, preferences }) {
  const limit = config.defaults.maxExtraStops;
  const required = keyLocations.length ? keyLocations.join(', ') : 'ninguna';
  const mealsText = meals.length
    ? meals.map((meal) => `${meal.type} a las ${new Date(meal.time).toISOString().slice(11, 16)}`).join(', ')
    : 'sin comidas planificadas';
  const interests = preferences.interests.length ? preferences.interests.join(', ') : 'no especificados';
  const foodBudgetText = preferences.foodBudget !== undefined && preferences.foodBudget !== null
    ? `${preferences.foodBudget} EUR`
    : 'sin restricción';

  return [
    'Eres un asistente experto en planificación de rutas urbanas a pie.',
    `Ciudad o región: ${city}.`,
    `Fecha: ${dateLabel}. Ventana disponible: ${windowLabel}.`,
    `Paradas obligatorias que YA están en la ruta (no las repitas): ${required}.`,
    `Comidas solicitadas: ${mealsText}.`,
    `Intereses del usuario: ${interests}. Ritmo deseado: ${preferences.pace}.`,
    `Presupuesto para comidas: ${foodBudgetText}.`,
    '',
    'Propón actividades y restaurantes reales y bien ubicados dentro de la ciudad.',
    'Devuelve EXCLUSIVAMENTE un JSON con esta forma exacta:',
    '{"places":[{"name":"...","address":"...","category":"museo|parque|mirador|mercado|barrio|monumento|galeria|cafe|compras","visitMinutes":60,"why":"motivo breve"}],"restaurants":[{"name":"...","address":"...","cuisine":"...","mealTypes":["almuerzo"],"estimatedCost":30,"why":"motivo breve"}]}',
    '',
    `Reglas: máximo ${limit} lugares, máximo 4 restaurantes, "visitMinutes" entre 20 y 180, "estimatedCost" entre 5 y 200,`,
    'direcciones dentro de la ciudad indicada, textos en español, sin texto fuera del JSON.',
  ].join('\n');
}

async function callChat(prompt, attempt) {
  const url = `${config.llm.baseUrl}/chat/completions`;
  const body = {
    model: config.llm.model,
    temperature: attempt === 0 ? 0.7 : 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Eres un planificador de viajes que responde siempre con JSON válido, sin markdown ni comentarios.',
      },
      { role: 'user', content: prompt },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.llm.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Respuesta del LLM sin contenido.');
  return content;
}

function mockSuggestions({ city, keyLocations, limit }) {
  const label = city || 'la ciudad';
  const pool = [
    {
      name: `Museo de Arte Contemporáneo de ${label}`,
      address: `Centro histórico, ${label}`,
      category: 'museo',
      visitMinutes: 90,
      why: 'Colección local con exposiciones temporales.',
    },
    {
      name: `Parque Central de ${label}`,
      address: `Paseo Central, ${label}`,
      category: 'parque',
      visitMinutes: 60,
      why: 'Pausa al aire libre entre visitas.',
    },
    {
      name: `Mercado de Abastos de ${label}`,
      address: `Plaza del Mercado, ${label}`,
      category: 'mercado',
      visitMinutes: 45,
      why: 'Productos locales y tapeo rápido.',
    },
    {
      name: 'Mirador del Casco Antiguo',
      address: `Casco Antiguo, ${label}`,
      category: 'mirador',
      visitMinutes: 30,
      why: 'Vistas panorámicas de la ciudad.',
    },
    {
      name: `Barrio Histórico de ${label}`,
      address: `Distrito Centro, ${label}`,
      category: 'barrio',
      visitMinutes: 60,
      why: 'Paseo por calles con encanto.',
    },
    {
      name: 'Galería del Paseo',
      address: `Paseo Principal, ${label}`,
      category: 'galeria',
      visitMinutes: 45,
      why: 'Arte emergente y tienda de diseño.',
    },
  ];

  const restaurants = [
    {
      name: `Taberna El Rincón (${label})`,
      address: `Casco Antiguo, ${label}`,
      cuisine: 'cocina local',
      mealTypes: ['almuerzo', 'comida', 'cena'],
      why: 'Menú del día casero y precio medio.',
      estimatedCost: 20,
    },
    {
      name: `Bistró Central (${label})`,
      address: `Centro, ${label}`,
      cuisine: 'cocina de mercado',
      mealTypes: ['almuerzo', 'comida', 'cena'],
      why: 'Cocina de temporada a pocos minutos de los museos.',
      estimatedCost: 25,
    },
    {
      name: `Café del Paseo (${label})`,
      address: `Paseo Principal, ${label}`,
      cuisine: 'cafetería',
      mealTypes: ['desayuno', 'cafe', 'merienda'],
      why: 'Ideal para una pausa breve.',
      estimatedCost: 8,
    },
  ];

  const excluded = new Set(keyLocations.map(normalizeText));
  const places = pool.filter((place) => !excluded.has(normalizeText(place.name))).slice(0, limit);

  return { places, restaurants };
}

export async function suggestPlaces({ city, dateLabel, windowLabel, keyLocations, meals, preferences }) {
  const limit = config.defaults.maxExtraStops;

  if (isMockLlm()) {
    const mock = mockSuggestions({ city, keyLocations, limit });
    return {
      places: mock.places,
      restaurants: mock.restaurants,
      source: 'mock',
    };
  }

  const prompt = buildPrompt({ city, dateLabel, windowLabel, keyLocations, meals, preferences });
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callChat(prompt, attempt);
      const parsed = parseJson(content);
      const excluded = new Set(keyLocations.map(normalizeText));
      const places = normalizePlaces(parsed?.places, limit).filter(
        (place) => !excluded.has(normalizeText(place.name)),
      );
      return {
        places,
        restaurants: normalizeRestaurants(parsed?.restaurants, 4),
        source: 'llm',
      };
    } catch (error) {
      lastError = error;
      console.warn(`[llm] Intento ${attempt + 1} fallido: ${error.message}`);
    }
  }

  throw lastError ?? new Error('No se pudo obtener respuesta válida del LLM.');
}
