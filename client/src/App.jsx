import { useState } from 'react';

import RouteForm from './components/RouteForm.jsx';
import RouteMap from './components/RouteMap.jsx';
import ItineraryList from './components/ItineraryList.jsx';
import { generateRoute } from './api.js';

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(payload) {
    setLoading(true);
    setError('');
    try {
      const data = await generateRoute(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'No se pudo generar la ruta.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const warnings = result?.meta?.warnings ?? [];

  return (
    <div className="app">
      <header className="app__header">
        <h1>Planificador de rutas urbanas</h1>
        <p>
          Define tus horas, tus paradas obligatorias y tus comidas; el asistente propone el resto del
          itinerario.
        </p>
      </header>

      <main className="app__layout">
        <section className="panel">
          <RouteForm onSubmit={handleSubmit} loading={loading} />
        </section>

        <section className="results">
          {loading && <p className="status status--loading">Generando ruta…</p>}

          {error && <p className="status status--error">{error}</p>}

          {!loading && !error && !result && (
            <p className="status">Completa el formulario para ver tu itinerario.</p>
          )}

          {result && (
            <>
              <div className="results__meta">
                <span className="badge">{result.meta.city}</span>
                <span className="badge">{result.meta.totals.stops} paradas</span>
                <span className="badge">{result.meta.totals.meals} comidas</span>
                <span className="badge">{result.meta.totals.travelMinutes} min de traslado</span>
                <span className="badge badge--soft">
                  LLM: {result.meta.sources.llm} · Mapas: {result.meta.sources.maps}
                </span>
              </div>

              {warnings.length > 0 && (
                <ul className="warnings">
                  {warnings.map((warning, index) => (
                    <li key={`warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              )}

              <RouteMap route={result.route} />
              <ItineraryList route={result.route} meals={result.meals} recommendations={result.recommendations} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
