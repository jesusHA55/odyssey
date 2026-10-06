import { Router } from 'express';

import { suggestAddresses } from '../services/geo.js';

const router = Router();

router.get('/suggest', async (req, res, next) => {
  try {
    const query = String(req.query.text || '').trim();
    const limit = Math.min(Number(req.query.limit) || 5, 10);

    if (!query) {
      return res.json({ results: [] });
    }

    const results = await suggestAddresses(query, limit);
    return res.json({ results });
  } catch (error) {
    return next(error);
  }
});

export default router;
