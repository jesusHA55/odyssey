import { useState } from 'react';

import AutocompleteInput from './AutocompleteInput.jsx';

const MEAL_OPTIONS = [
  { value: 'desayuno', label: 'Desayuno' },
  { value: 'almuerzo', label: 'Almuerzo' },
  { value: 'comida', label: 'Comida' },
  { value: 'cafe', label: 'Café' },
  { value: 'merienda', label: 'Merienda' },
  { value: 'cena', label: 'Cena' },
];

const PACE_OPTIONS = [
  { value: 'relajado', label: 'Relajado' },
  { value: 'normal', label: 'Normal' },
  { value: 'intenso', label: 'Intenso' },
];

const TRANSPORT_OPTIONS = [
  { value: 'walking', label: 'A pie' },
  { value: 'transit', label: 'Transporte público' },
  { value: 'mixed', label: 'Mixto (caminar y transporte público)' },
];

let counter = 0;
const nextId = () => {
  counter += 1;
  return `item-${counter}`;
};

function toInputValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function todayAt(hour, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return toInputValue(date);
}

function toIso(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function exampleForm() {
  return {
    startTime: todayAt(9, 0),
    startLocation: 'Plaza Mayor, Madrid',
    endTime: todayAt(18, 0),
    endLocation: 'Estación de Atocha, Madrid',
    city: 'Madrid',
    pace: 'normal',
    interests: 'arte, tapas',
    maxDistanceMeters: '5000',
    foodBudget: '60',
    keyLocations: [{ id: nextId(), value: 'Museo del Prado' }, { id: nextId(), value: 'Parque del Retiro' }],
    meals: [{ id: nextId(), type: 'almuerzo', time: todayAt(13, 0) }],
  };
}

export default function RouteForm({ onSubmit, loading }) {
  const initial = exampleForm();

  const [startTime, setStartTime] = useState(initial.startTime);
  const [startLocation, setStartLocation] = useState(initial.startLocation);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [endLocation, setEndLocation] = useState(initial.endLocation);
  const [city, setCity] = useState(initial.city);
  const [pace, setPace] = useState(initial.pace);
  const [interests, setInterests] = useState(initial.interests);
  const [maxDistanceMeters, setMaxDistanceMeters] = useState(initial.maxDistanceMeters);
  const [foodBudget, setFoodBudget] = useState(initial.foodBudget);
  const [transportMode, setTransportMode] = useState('walking');
  const [keyLocations, setKeyLocations] = useState(initial.keyLocations);
  const [meals, setMeals] = useState(initial.meals);
  const [localError, setLocalError] = useState('');

  function updateKeyLocation(id, value) {
    setKeyLocations((current) => current.map((item) => (item.id === id ? { ...item, value } : item)));
  }

  function addKeyLocation() {
    if (keyLocations.length >= 10) return;
    setKeyLocations((current) => [...current, { id: nextId(), value: '' }]);
  }

  function removeKeyLocation(id) {
    setKeyLocations((current) => current.filter((item) => item.id !== id));
  }

  function updateMeal(id, patch) {
    setMeals((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addMeal() {
    if (meals.length >= 6) return;
    setMeals((current) => [...current, { id: nextId(), type: 'cena', time: todayAt(20, 0) }]);
  }

  function removeMeal(id) {
    setMeals((current) => current.filter((item) => item.id !== id));
  }

  function loadExample() {
    const sample = exampleForm();
    setStartTime(sample.startTime);
    setStartLocation(sample.startLocation);
    setEndTime(sample.endTime);
    setEndLocation(sample.endLocation);
    setCity(sample.city);
    setPace(sample.pace);
    setInterests(sample.interests);
    setMaxDistanceMeters(sample.maxDistanceMeters);
    setFoodBudget(sample.foodBudget);
    setTransportMode('walking');
    setKeyLocations(sample.keyLocations);
    setMeals(sample.meals);
    setLocalError('');
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!startLocation.trim() || !endLocation.trim()) {
      setLocalError('Indica el lugar de inicio y el lugar de fin.');
      return;
    }

    const startIso = toIso(startTime);
    const endIso = toIso(endTime);

    if (!startIso || !endIso) {
      setLocalError('Revisa las horas de inicio y fin.');
      return;
    }

    if (new Date(endIso) <= new Date(startIso)) {
      setLocalError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    setLocalError('');

    const parsedMaxDistance = Number(maxDistanceMeters);
    const parsedFoodBudget = Number(foodBudget);

    onSubmit({
      start: { time: startIso, location: startLocation.trim() },
      end: { time: endIso, location: endLocation.trim() },
      keyLocations: keyLocations.map((item) => item.value.trim()).filter(Boolean),
      meals: meals
        .filter((meal) => meal.time)
        .map((meal) => ({ type: meal.type, time: toIso(meal.time) })),
      preferences: {
        city: city.trim() || undefined,
        pace,
        transportMode,
        interests: interests
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        maxDistanceMeters:
          Number.isFinite(parsedMaxDistance) && parsedMaxDistance > 0 ? parsedMaxDistance : undefined,
        foodBudget:
          Number.isFinite(parsedFoodBudget) && parsedFoodBudget >= 0 ? parsedFoodBudget : undefined,
      },
    });
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <fieldset className="form__group">
        <legend>Ventana temporal</legend>

        <label className="field">
          <span>Hora de inicio</span>
          <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>

        <label className="field">
          <span>Lugar de inicio</span>
          <AutocompleteInput
            value={startLocation}
            onChange={setStartLocation}
            placeholder="Plaza Mayor, Madrid"
          />
        </label>

        <label className="field">
          <span>Hora de fin</span>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>

        <label className="field">
          <span>Lugar de fin</span>
          <AutocompleteInput
            value={endLocation}
            onChange={setEndLocation}
            placeholder="Estación de Atocha, Madrid"
          />
        </label>
      </fieldset>

      <fieldset className="form__group">
        <legend>Ubicaciones clave obligatorias ({keyLocations.length}/10)</legend>

        {keyLocations.map((item, index) => (
          <div className="row" key={item.id}>
            <AutocompleteInput
              value={item.value}
              onChange={(newValue) => updateKeyLocation(item.id, newValue)}
              placeholder={`Parada obligatoria ${index + 1}`}
            />
            <button type="button" className="btn btn--ghost" onClick={() => removeKeyLocation(item.id)}>
              Quitar
            </button>
          </div>
        ))}

        <button type="button" className="btn btn--ghost" onClick={addKeyLocation}>
          + Añadir parada
        </button>
      </fieldset>

      <fieldset className="form__group">
        <legend>Comidas</legend>

        {meals.map((meal) => (
          <div className="row" key={meal.id}>
            <select value={meal.type} onChange={(e) => updateMeal(meal.id, { type: e.target.value })}>
              {MEAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={meal.time}
              onChange={(e) => updateMeal(meal.id, { time: e.target.value })}
            />
            <button type="button" className="btn btn--ghost" onClick={() => removeMeal(meal.id)}>
              Quitar
            </button>
          </div>
        ))}

        <button type="button" className="btn btn--ghost" onClick={addMeal}>
          + Añadir comida
        </button>
      </fieldset>

      <fieldset className="form__group">
        <legend>Preferencias</legend>

        <label className="field">
          <span>Ciudad o región</span>
          <input
            type="text"
            value={city}
            placeholder="Madrid"
            onChange={(e) => setCity(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Ritmo</span>
          <select value={pace} onChange={(e) => setPace(e.target.value)}>
            {PACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Modo de desplazamiento</span>
          <select value={transportMode} onChange={(e) => setTransportMode(e.target.value)}>
            {TRANSPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Intereses (separados por comas)</span>
          <input
            type="text"
            value={interests}
            placeholder="arte, tapas, arquitectura"
            onChange={(e) => setInterests(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Distancia máxima entre paradas (m)</span>
          <input
            type="number"
            min="0"
            step="100"
            value={maxDistanceMeters}
            onChange={(e) => setMaxDistanceMeters(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Presupuesto para comidas (€)</span>
          <input
            type="number"
            min="0"
            step="5"
            value={foodBudget}
            onChange={(e) => setFoodBudget(e.target.value)}
          />
        </label>
      </fieldset>

      {localError && <p className="status status--error">{localError}</p>}

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Generando…' : 'Generar ruta'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={loadExample} disabled={loading}>
          Cargar ejemplo (Madrid)
        </button>
      </div>
    </form>
  );
}
