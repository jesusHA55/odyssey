import express from 'express';
import cors from 'cors';

import { config, mockFlags } from './config.js';
import routeRouter from './routes/route.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    mode: mockFlags(),
  });
});

app.use('/api/route', routeRouter);

app.use((req, res) => {
  res.status(404).json({ error: { message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` } });
});

// Manejador de errores centralizado
app.use((error, req, res, next) => {
  const status = error.status || error.statusCode || 500;
  if (status >= 500) {
    console.error('[api] Error no controlado:', error);
  }
  res.status(status).json({
    error: {
      message: error.message || 'Error interno del servidor.',
      details: error.details || null,
    },
  });
});

app.listen(config.port, () => {
  const flags = mockFlags();
  console.log(`[api] Escuchando en http://localhost:${config.port}`);
  console.log(`[api] LLM: ${flags.llm ? 'modo mock (sin LLM_API_KEY)' : config.llm.model}`);
  console.log(`[api] Mapas: ${flags.maps ? 'modo mock (sin MAPS_API_KEY)' : config.maps.provider}`);
});

export default app;
