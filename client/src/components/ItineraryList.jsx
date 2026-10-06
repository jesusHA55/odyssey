function formatTime(value) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatCost(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${Number(value)} €`;
}

function transportIcon(mode) {
  if (mode === 'transit') return '🚌';
  if (mode === 'drive') return '🚗';
  return '🚶';
}

const TYPE_LABELS = {
  start: 'Inicio',
  stop: 'Visita',
  meal: 'Comida',
  end: 'Fin',
};

export default function ItineraryList({ route, meals, recommendations }) {
  const safeRoute = route || [];
  const safeMeals = meals || [];
  const safeRecommendations = recommendations || [];

  const included = safeRecommendations.filter((item) => item.included);
  const discarded = safeRecommendations.filter((item) => !item.included);

  return (
    <div className="itinerary">
      <section>
        <h2>Itinerario</h2>
        <ol className="timeline">
          {safeRoute.map((item, index) => (
            <li className={`timeline__item timeline__item--${item.type}`} key={`${item.type}-${index}`}>
              <div className="timeline__time">
                <strong>{formatTime(item.arrival)}</strong>
                <span>{formatTime(item.departure)}</span>
              </div>
              <div className="timeline__body">
                <div className="timeline__head">
                  <span className="pill">{TYPE_LABELS[item.type] ?? item.type}</span>
                  <h3>{item.location}</h3>
                </div>
                {item.address && <p className="timeline__address">{item.address}</p>}
                <p>{item.activity}</p>
                {item.why && <p className="timeline__why">{item.why}</p>}
                <div className="timeline__meta">
                  {item.travelMinutes > 0 && (
                    <span>
                      {transportIcon(item.transportMode)} {item.travelMinutes} min{' '}
                      {item.transportMode === 'transit' ? 'transporte público' : 'a pie'}
                    </span>
                  )}
                  {item.category && item.type === 'stop' && <span>🏷️ {item.category}</span>}
                  {item.required && item.type === 'stop' && <span>⭐ obligatoria</span>}
                  {typeof item.freeMinutes === 'number' && item.freeMinutes > 15 && (
                    <span>⏳ {item.freeMinutes} min libres</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {safeMeals.length > 0 && (
        <section>
          <h2>Comidas</h2>
          <ul className="cards">
            {safeMeals.map((meal, index) => (
              <li className="card" key={`meal-${index}`}>
                <div className="card__head">
                  <strong>{meal.restaurant}</strong>
                  <span className={`pill ${meal.inRoute ? '' : 'pill--warn'}`}>
                    {meal.inRoute ? formatTime(meal.time) : 'fuera de ruta'}
                  </span>
                </div>
                <p>
                  {meal.type} · solicitada a las {formatTime(meal.requestedTime)}
                  {meal.inRoute && !meal.onSchedule && ` · desviación ${meal.deviationMinutes} min`}
                  {formatCost(meal.estimatedCost) ? ` · coste aprox. ${formatCost(meal.estimatedCost)}` : ''}
                </p>
                {meal.restaurantAddress && <p className="card__muted">{meal.restaurantAddress}</p>}
                {meal.note && <p className="card__muted">{meal.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {safeRecommendations.length > 0 && (
        <section>
          <h2>Recomendaciones del asistente</h2>
          <ul className="cards">
            {[...included, ...discarded].map((item, index) => (
              <li className="card" key={`rec-${index}`}>
                <div className="card__head">
                  <strong>{item.name}</strong>
                  <span className={`pill ${item.included ? 'pill--ok' : 'pill--muted'}`}>
                    {item.included ? 'en la ruta' : 'descartada'}
                  </span>
                </div>
                <p>
                  {item.category} · {item.visitMinutes} min
                </p>
                {item.why && <p className="card__muted">{item.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
