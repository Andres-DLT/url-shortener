import { keys, redis } from '../redis.js';
import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Límite de peticiones por IP con ventana fija en Redis (INCR + EXPIRE atómicos).
 * Si Redis falla, deja pasar la petición: preferimos disponibilidad a bloquear.
 */
export function rateLimit({ bucket, max, windowSeconds }) {
  return async (req, res, next) => {
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = keys.rateLimit(bucket, req.ip ?? 'unknown', window);
    let count;
    try {
      const [[, value]] = await redis.multi().incr(key).expire(key, windowSeconds).exec();
      count = value;
    } catch (err) {
      logger.warn(`rate limit desactivado temporalmente: ${err.message}`);
      return next();
    }

    const resetIn = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(max - count, 0)));
    res.set('RateLimit-Reset', String(resetIn));
    if (count > max) {
      res.set('Retry-After', String(resetIn));
      return next(new HttpError(429, 'rate_limited', `Demasiadas peticiones. Inténtalo de nuevo en ${resetIn} s`));
    }
    return next();
  };
}
