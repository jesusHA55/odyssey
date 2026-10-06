const MEAL_DURATIONS = {
  desayuno: 45,
  almuerzo: 60,
  comida: 75,
  cafe: 30,
  merienda: 30,
  cena: 90,
  snack: 30,
};

const MINUTES = 60000;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function mealDurationMinutes(type) {
  const key = normalizeText(type);
  return MEAL_DURATIONS[key] ?? MEAL_DURATIONS.comida;
}

export function clampMealDuration(value, type) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(180, Math.max(15, Math.round(parsed)));
  }
  return mealDurationMinutes(type);
}

function parseEndpoint(raw, field, errors) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`"${field}" es obligatorio y debe ser un objeto con "time" y "location".`);
    return null;
  }

  const location = typeof raw.location === 'string' ? raw.location.trim() : '';
  if (!location) {
    errors.push(`"${field}.location" es obligatorio.`);
  }

  let isoTime = null;
  if (typeof raw.time !== 'string' || !raw.time.trim()) {
    errors.push(`"${field}.time" es obligatorio (fecha ISO 8601).`);
  } else {
    const date = new Date(raw.time);
    if (Number.isNaN(date.getTime())) {
      errors.push(`"${field}.time" no es una fecha válida: "${raw.time}".`);
    } else {
      isoTime = date.toISOString();
    }
  }

  if (!location || !isoTime) return null;
  return { time: isoTime, location };
}

function normalizePreferences(raw, errors) {
  const preferences = { city: '', pace: 'normal', interests: [] };
  if (raw === undefined || raw === null) return preferences;

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('"preferences" debe ser un objeto.');
    return preferences;
  }

  if (typeof raw.city === 'string') preferences.city = raw.city.trim();

  if (typeof raw.pace === 'string') {
    const pace = normalizeText(raw.pace);
    if (['relajado', 'normal', 'intenso'].includes(pace)) preferences.pace = pace;
    else if (['relaxed', 'normal', 'intense'].includes(pace)) {
      preferences.pace = { relaxed: 'relajado', intense: 'intenso' }[pace] ?? 'normal';
    }
  }

  if (Array.isArray(raw.interests)) {
    preferences.interests = raw.interests
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
      .slice(0, 8);
  }

  return preferences;
}

export function validateRouteRequest(body) {
  const errors = [];
  const warnings = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      errors: ['El cuerpo de la petición debe ser un objeto JSON.'],
      warnings,
      value: null,
    };
  }

  const start = parseEndpoint(body.start, 'start', errors);
  const end = parseEndpoint(body.end, 'end', errors);

  const keyLocations = [];
  if (body.keyLocations !== undefined) {
    if (!Array.isArray(body.keyLocations)) {
      errors.push('"keyLocations" debe ser un array de textos.');
    } else {
      for (const item of body.keyLocations) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (!text) continue;
        if (keyLocations.length >= 10) {
          warnings.push('Se han ignorado ubicaciones clave adicionales (máximo 10).');
          break;
        }
        if (!keyLocations.some((known) => normalizeText(known) === normalizeText(text))) {
          keyLocations.push(text);
        }
      }
    }
  }

  const meals = [];
  if (body.meals !== undefined) {
    if (!Array.isArray(body.meals)) {
      errors.push('"meals" debe ser un array.');
    } else {
      for (const [index, item] of body.meals.entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`"meals[${index}]" debe ser un objeto con "type" y "time".`);
          continue;
        }
        const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'comida';
        const date = item.time ? new Date(item.time) : null;
        if (!date || Number.isNaN(date.getTime())) {
          errors.push(`"meals[${index}].time" no es una fecha válida.`);
          continue;
        }
        if (meals.length >= 6) {
          warnings.push('Se han ignorado comidas adicionales (máximo 6).');
          break;
        }
        meals.push({
          type,
          time: date.toISOString(),
          durationMinutes: clampMealDuration(item.durationMinutes, type),
        });
      }
    }
  }

  if (!errors.length && start && end) {
    const startMs = new Date(start.time).getTime();
    const endMs = new Date(end.time).getTime();

    if (endMs <= startMs) {
      errors.push('La hora de fin debe ser posterior a la hora de inicio.');
    } else {
      const windowMinutes = (endMs - startMs) / MINUTES;
      if (windowMinutes < 60) {
        warnings.push('La ventana de tiempo es muy corta (menos de 1 hora).');
      }
      for (const meal of meals) {
        const mealMs = new Date(meal.time).getTime();
        if (mealMs < startMs || mealMs > endMs) {
          warnings.push(
            `La comida "${meal.type}" de las ${meal.time} está fuera de la ventana de la ruta; se devolverá como fuera de ruta.`,
          );
        }
      }
    }
  }

  const preferences = normalizePreferences(body.preferences, errors);

  if (errors.length) {
    return { ok: false, errors, warnings, value: null };
  }

  return {
    ok: true,
    errors: [],
    warnings,
    value: { start, end, keyLocations, meals, preferences },
  };
}
