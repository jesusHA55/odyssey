import { getTravelTime, findNearbyRestaurant, haversineKm } from './geo.js';

const MINUTE = 60000;

function iso(ms) {
  return new Date(ms).toISOString();
}

function resolveTravelMode(from, to, preference) {
  if (preference === 'walking') return 'walk';
  if (preference === 'transit') return 'transit';
  if (preference === 'mixed') {
    const km = haversineKm(from, to);
    return km > 1.2 ? 'transit' : 'walk';
  }
  return 'walk';
}

async function travel(from, to, transportMode = 'walking') {
  if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) {
    return { minutes: 0, meters: 0, source: 'no-disponible', mode: 'walking' };
  }

  const resolvedMode = resolveTravelMode(from, to, transportMode);
  return getTravelTime(from, to, resolvedMode);
}

// Orden voraz tipo "vecino más cercano" con un pequeño sesgo hacia las paradas obligatorias.
async function orderStops({ start, candidates, windowStart, transportMode = 'walking' }) {
  const remaining = candidates.filter(
    (item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lng),
  );
  const ordered = [];
  let current = start;
  let at = windowStart;

  while (remaining.length) {
    const scored = [];
    for (const candidate of remaining) {
      const leg = await travel(current, candidate, transportMode);
      scored.push({ candidate, score: leg.minutes + (candidate.required ? 0 : 5) });
    }
    scored.sort((a, b) => a.score - b.score);

    const chosen = scored[0].candidate;
    ordered.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
    current = chosen;
    at += (chosen.visitMinutes ?? 60) * MINUTE;
  }

  return ordered;
}

export async function buildItinerary({
  start,
  end,
  requiredStops,
  optionalStops,
  restaurants,
  meals,
  warnings,
  maxDistanceMeters,
  foodBudget,
  transportMode = 'walking',
}) {
  const windowStart = new Date(start.time).getTime();
  const windowEnd = new Date(end.time).getTime();

  const orderedRequired = await orderStops({
    start,
    candidates: requiredStops,
    windowStart,
    transportMode,
  });
  const lastRequired = orderedRequired.length
    ? orderedRequired[orderedRequired.length - 1]
    : start;
  const orderedOptional = await orderStops({
    start: lastRequired,
    candidates: optionalStops,
    windowStart,
    transportMode,
  });
  const orderedStops = [...orderedRequired, ...orderedOptional];

  const queue = [...orderedStops];
  const pendingMeals = [...meals]
    .filter((meal) => meal.time)
    .map((meal) => ({ ...meal, ts: new Date(meal.time).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const route = [
    {
      order: 0,
      type: 'start',
      location: start.label || start.location,
      address: start.location,
      lat: start.lat,
      lng: start.lng,
      arrival: iso(windowStart),
      departure: iso(windowStart),
      travelMinutes: 0,
      activity: 'Punto de partida',
      category: 'inicio',
      required: true,
      transportMode: null,
    },
  ];

  const mealsResult = [];
  const omitted = [];

  let remainingFoodBudget = foodBudget;
  let time = windowStart;
  let current = { lat: start.lat, lng: start.lng, name: start.location };
  let guard = queue.length + pendingMeals.length + 10;

  while ((queue.length || pendingMeals.length) && guard > 0) {
    guard -= 1;

    const stop = queue[0];
    const meal = pendingMeals[0];

    const stopTravel = stop ? await travel(current, stop, transportMode) : null;

    // Control de distancia máxima entre paradas consecutivas.
    if (stop && maxDistanceMeters && stopTravel.meters > maxDistanceMeters) {
      if (stop.required) {
        warnings.push(
          `La parada obligatoria "${stop.name}" está a ${Math.round(stopTravel.meters)} m, superior al máximo de ${maxDistanceMeters} m; se incluye igualmente.`,
        );
      } else {
        omitted.push(stop.name);
        warnings.push(
          `Se omite "${stop.name}" por exceder la distancia máxima de ${maxDistanceMeters} m (${Math.round(stopTravel.meters)} m).`,
        );
        queue.shift();
        continue;
      }
    }

    const arrivalStop = stop ? time + stopTravel.minutes * MINUTE : Infinity;
    const departStop = stop ? arrivalStop + (stop.visitMinutes ?? 60) * MINUTE : Infinity;

    // Si la comida programada cae antes de poder completar la siguiente parada, se atiende primero.
    const mealFirst = Boolean(meal) && (!stop || departStop > meal.ts);

    if (mealFirst) {
      let mealCandidates = restaurants;

      if (remainingFoodBudget !== undefined && remainingFoodBudget !== null && remainingFoodBudget >= 0) {
        const affordable = restaurants.filter(
          (r) =>
            r.estimatedCost !== null &&
            r.estimatedCost !== undefined &&
            r.estimatedCost <= remainingFoodBudget,
        );

        if (affordable.length > 0) {
          mealCandidates = affordable;
        } else if (restaurants.length > 0) {
          const cheapest = [...restaurants].sort(
            (a, b) => (a.estimatedCost ?? Infinity) - (b.estimatedCost ?? Infinity),
          )[0];
          warnings.push(
            `Ningún restaurante recomendado cabe en el presupuesto restante de ${remainingFoodBudget} €; se elige el más barato.`,
          );
          mealCandidates = [cheapest];
        }
      }

      const restaurant =
        findNearbyRestaurant(current, mealCandidates, meal.type) || {
          name: `Restaurante cerca de ${current.name}`,
          address: current.name,
          cuisine: 'cocina local',
          lat: current.lat,
          lng: current.lng,
          source: 'estimado',
          estimatedCost: null,
        };

      const legToMeal = await travel(current, restaurant, transportMode);
      const arrivalMeal = time + legToMeal.minutes * MINUTE;
      const startMeal = Math.max(arrivalMeal, meal.ts);
      const endMeal = startMeal + meal.durationMinutes * MINUTE;
      const legFromMealToEnd = await travel(restaurant, end, transportMode);

      if (endMeal + legFromMealToEnd.minutes * MINUTE > windowEnd) {
        warnings.push(
          `La comida "${meal.type}" de las ${iso(meal.ts)} no cabe en la ventana disponible; se marca fuera de ruta.`,
        );
        mealsResult.push({
          type: meal.type,
          requestedTime: iso(meal.ts),
          time: iso(startMeal),
          durationMinutes: meal.durationMinutes,
          restaurant: restaurant.name,
          restaurantAddress: restaurant.address,
          lat: restaurant.lat,
          lng: restaurant.lng,
          inRoute: false,
          note: 'Fuera de la ventana de la ruta',
          estimatedCost: restaurant.estimatedCost ?? null,
        });
        pendingMeals.shift();
        continue;
      }

      const deviationMinutes = Math.round((startMeal - meal.ts) / MINUTE);

      mealsResult.push({
        type: meal.type,
        requestedTime: iso(meal.ts),
        time: iso(startMeal),
        durationMinutes: meal.durationMinutes,
        restaurant: restaurant.name,
        restaurantAddress: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        inRoute: true,
        onSchedule: Math.abs(deviationMinutes) <= 45,
        deviationMinutes,
        estimatedCost: restaurant.estimatedCost ?? null,
      });

      if (
        restaurant.estimatedCost !== null &&
        restaurant.estimatedCost !== undefined &&
        remainingFoodBudget !== undefined &&
        remainingFoodBudget !== null
      ) {
        remainingFoodBudget = Math.max(0, remainingFoodBudget - restaurant.estimatedCost);
      }

      if (Math.abs(deviationMinutes) > 45) {
        warnings.push(
          `La comida "${meal.type}" se sirve con ${Math.abs(deviationMinutes)} min de desviación respecto a la hora solicitada.`,
        );
      }

      route.push({
        order: route.length,
        type: 'meal',
        location: restaurant.name,
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        arrival: iso(startMeal),
        departure: iso(endMeal),
        travelMinutes: legToMeal.minutes,
        activity: `Comida (${meal.type})`,
        category: 'restaurante',
        required: true,
        transportMode: legToMeal.mode,
      });

      time = endMeal;
      current = { lat: restaurant.lat, lng: restaurant.lng, name: restaurant.name };
      pendingMeals.shift();
      continue;
    }

    if (stop) {
      const legToEnd = await travel(stop, end, transportMode);
      const fitsWindow =
        departStop <= windowEnd && departStop + legToEnd.minutes * MINUTE <= windowEnd;

      if (!fitsWindow) {
        if (stop.required) {
          throw new Error(
            `No se pueden incluir todas las paradas obligatorias. "${stop.name}" no cabe en la ventana de tiempo.`,
          );
        }
        omitted.push(stop.name);
        warnings.push(
          `No hay tiempo suficiente para incluir "${stop.name}"; se ha omitido.`,
        );
        queue.shift();
        continue;
      }

      route.push({
        order: route.length,
        type: 'stop',
        location: stop.name,
        address: stop.address || stop.label || stop.name,
        lat: stop.lat,
        lng: stop.lng,
        arrival: iso(arrivalStop),
        departure: iso(departStop),
        travelMinutes: stopTravel.minutes,
        activity: stop.category ? `Visita: ${stop.category}` : 'Visita',
        category: stop.category || 'interés',
        why: stop.why || '',
        required: Boolean(stop.required),
        transportMode: stopTravel.mode,
      });

      time = departStop;
      current = { lat: stop.lat, lng: stop.lng, name: stop.name };
      queue.shift();
      continue;
    }

    break;
  }

  const legToEnd = await travel(current, end, transportMode);
  const arrivalEnd = Math.min(time + legToEnd.minutes * MINUTE, windowEnd);

  route.push({
    order: route.length,
    type: 'end',
    location: end.label || end.location,
    address: end.location,
    lat: end.lat,
    lng: end.lng,
    arrival: iso(arrivalEnd),
    departure: iso(windowEnd),
    travelMinutes: legToEnd.minutes,
    activity: 'Fin de la ruta',
    category: 'fin',
    required: true,
    freeMinutes: Math.max(0, Math.round((windowEnd - arrivalEnd) / MINUTE)),
    transportMode: legToEnd.mode,
  });

  const totals = {
    windowMinutes: Math.round((windowEnd - windowStart) / MINUTE),
    plannedMinutes: Math.round((arrivalEnd - windowStart) / MINUTE),
    travelMinutes: route.reduce((acc, item) => acc + (item.travelMinutes || 0), 0),
    visitMinutes: route
      .filter((item) => item.type === 'stop')
      .reduce((acc, item) => acc + Math.round((new Date(item.departure) - new Date(item.arrival)) / MINUTE), 0),
    mealMinutes: mealsResult
      .filter((meal) => meal.inRoute)
      .reduce((acc, meal) => acc + meal.durationMinutes, 0),
    stops: route.filter((item) => item.type === 'stop').length,
    meals: mealsResult.filter((meal) => meal.inRoute).length,
  };

  return { route, meals: mealsResult, totals, omitted };
}
