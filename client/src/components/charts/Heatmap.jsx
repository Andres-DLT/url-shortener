import { useState } from 'react';
import { DAY_NAMES, DAY_NAMES_LONG, formatNumber } from '../../lib/format.js';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SCALE_STEPS = [0.12, 0.3, 0.5, 0.75, 1];

/** Intensidad secuencial de un solo tono: de la superficie (poco) al azul (mucho). */
const cellColor = (ratio) => (ratio <= 0
  ? 'var(--grid)'
  : `color-mix(in oklab, var(--series-1) ${Math.round(12 + ratio * 88)}%, var(--surface))`);

/** Mapa de calor día de la semana × hora local. activity: [{ dow: 1..7, hour, clicks }] */
export function Heatmap({ activity }) {
  const [hover, setHover] = useState(null);
  const grid = new Map(activity.map((a) => [`${a.dow}-${a.hour}`, a.clicks]));
  const max = Math.max(0, ...activity.map((a) => a.clicks));

  if (max === 0) return <div className="empty-chart">Sin datos en este periodo</div>;

  const hovered = hover && {
    ...hover,
    clicks: grid.get(`${hover.dow}-${hover.hour}`) ?? 0,
  };

  return (
    <div>
      <div className="heatmap" role="grid" aria-label="Clics por día de la semana y hora">
        {DAY_NAMES.map((day, d) => (
          <div key={day} role="row" style={{ display: 'contents' }}>
            <div className="heatmap-day" role="rowheader">{day}</div>
            {HOURS.map((hour) => {
              const value = grid.get(`${d + 1}-${hour}`) ?? 0;
              return (
                <div
                  key={hour}
                  role="gridcell"
                  tabIndex={hour === 0 && d === 0 ? 0 : -1}
                  className="heatmap-cell"
                  style={{ background: cellColor(value / max) }}
                  aria-label={`${DAY_NAMES_LONG[d]} de ${hour}:00 a ${hour + 1}:00: ${formatNumber(value)} clics`}
                  onPointerEnter={() => setHover({ dow: d + 1, hour })}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover({ dow: d + 1, hour })}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => {
                    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 24, ArrowUp: -24 };
                    if (!moves[e.key]) return;
                    e.preventDefault();
                    const cells = e.currentTarget.closest('.heatmap').querySelectorAll('[role=gridcell]');
                    cells[d * 24 + hour + moves[e.key]]?.focus();
                  }}
                />
              );
            })}
          </div>
        ))}
        <div />
        {HOURS.map((hour) => (
          <div key={hour} className="heatmap-hour" aria-hidden="true">{hour % 6 === 0 ? `${hour}h` : ''}</div>
        ))}
      </div>
      <div className="scale-legend">
        <span aria-live="polite" style={{ marginRight: 'auto' }}>
          {hovered
            ? `${DAY_NAMES_LONG[hovered.dow - 1]}, ${hovered.hour}:00–${hovered.hour + 1}:00 · ${formatNumber(hovered.clicks)} clics`
            : `Máximo: ${formatNumber(max)} clics en una hora`}
        </span>
        <span>Menos</span>
        {SCALE_STEPS.map((s) => <i key={s} style={{ background: cellColor(s) }} />)}
        <span>Más</span>
      </div>
    </div>
  );
}
