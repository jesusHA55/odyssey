export async function generateRoute(payload) {
  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `Error ${response.status} al generar la ruta.`;
    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    const error = new Error([message, ...details].join(' '));
    error.details = details;
    throw error;
  }

  return data;
}
