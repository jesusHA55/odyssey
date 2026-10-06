import { Router } from 'express';

import { validateRouteRequest } from '../services/validation.js';
import { generateRoute } from '../services/routeGenerator.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const validation = validateRouteRequest(req.body);

    if (!validation.ok) {
      return res.status(400).json({
        error: {
          message: 'Los datos de entrada no son válidos.',
          details: validation.errors,
        },
      });
    }

    const result = await generateRoute(validation.value);
    result.meta.warnings = [...validation.warnings, ...result.meta.warnings];

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
