import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'El cuerpo de la petición no es JSON válido' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'El cuerpo de la petición es demasiado grande' } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  logger.error(`${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: { code: 'internal', message: 'Error interno del servidor' } });
}
