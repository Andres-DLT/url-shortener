import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

/** "Actualizado hace X s" + botón de refresco manual. */
export function UpdatedAt({ state }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!state.updatedAt) return null;
  const seconds = Math.round((Date.now() - state.updatedAt) / 1000);
  const label = seconds < 10 ? 'ahora mismo' : seconds < 60 ? `hace ${seconds} s` : `hace ${Math.round(seconds / 60)} min`;

  return (
    <span className="updated-at">
      <span className="live-dot" aria-hidden="true" />
      Actualizado {label}
      <button type="button" className="btn btn-ghost btn-icon" onClick={state.reload} aria-label="Actualizar datos" title="Actualizar">
        <Icon name="refresh" />
      </button>
    </span>
  );
}
