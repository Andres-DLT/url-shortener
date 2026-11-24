import { useMemo, useState } from 'react';
import { useElementWidth } from '../../lib/hooks.js';
import { formatBucketLong, formatBucketShort, formatCompact, formatNumber } from '../../lib/format.js';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };

/** Máximo y paso "redondos" para el eje Y (0 / 5 / 10 / 15…). */
function niceScale(max, targetTicks = 4) {
  if (max <= 0) return { max: 4, step: 1 };
  const raw = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const step = Math.max(1, (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude);
  return { max: Math.ceil(max / step) * step, step };
}

/**
 * Gráfico de líneas con cruceta: el puntero (o las flechas del teclado) se ajusta
 * al punto más cercano y el tooltip lista todas las series en esa fecha.
 */
export function LineChart({ points, unit, series }) {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState(null);

  const geometry = useMemo(() => {
    if (!width || points.length === 0) return null;
    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const maxValue = Math.max(0, ...points.flatMap((p) => series.map((s) => p[s.key])));
    const { max, step } = niceScale(maxValue);
    const x = (i) => MARGIN.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
    const y = (v) => MARGIN.top + innerH - (v / max) * innerH;
    const ticks = [];
    for (let v = 0; v <= max; v += step) ticks.push(v);

    // Etiquetas del eje X: tantas como quepan (~70 px cada una).
    const maxLabels = Math.max(2, Math.floor(innerW / 70));
    const every = Math.ceil(points.length / maxLabels);
    const xLabels = points
      .map((p, i) => ({ i, t: p.t }))
      .filter(({ i }) => (points.length - 1 - i) % every === 0);

    const paths = series.map((s) => ({
      ...s,
      d: points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(''),
    }));
    return { innerW, innerH, x, y, ticks, xLabels, paths };
  }, [width, points, series]);

  const indexFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left - MARGIN.left;
    const ratio = geometry.innerW ? px / geometry.innerW : 0;
    return Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
  };

  const onKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return setActive(null);
    const current = active ?? points.length - 1;
    const next = {
      ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: points.length - 1,
    }[event.key];
    return setActive(Math.min(points.length - 1, Math.max(0, next)));
  };

  const activePoint = active !== null ? points[active] : null;
  const tooltipLeft = geometry && active !== null ? geometry.x(active) : 0;
  const flip = tooltipLeft > width * 0.62;

  return (
    <div
      ref={ref}
      className="line-chart"
      tabIndex={0}
      role="img"
      aria-label={`Gráfico de ${series.map((s) => s.label.toLowerCase()).join(' y ')}. Usa las flechas para recorrer los valores; la tabla tiene todos los datos.`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((a) => a ?? points.length - 1)}
      onBlur={() => setActive(null)}
    >
      <svg
        height={HEIGHT}
        onPointerMove={(e) => geometry && setActive(indexFromPointer(e))}
        onPointerLeave={() => setActive(null)}
        aria-hidden="true"
      >
        {geometry && (
          <>
            {geometry.ticks.map((v) => (
              <g key={v}>
                <line className={v === 0 ? 'baseline' : 'gridline'} x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.y(v)} y2={geometry.y(v)} />
                <text className="axis-label" x={MARGIN.left - 8} y={geometry.y(v)} dy="0.35em" textAnchor="end">
                  {formatCompact(v)}
                </text>
              </g>
            ))}
            {geometry.xLabels.map(({ i, t }) => (
              <text
                key={t}
                className="axis-label"
                x={geometry.x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              >
                {formatBucketShort(t, unit)}
              </text>
            ))}
            {active !== null && (
              <line className="crosshair" x1={geometry.x(active)} x2={geometry.x(active)} y1={MARGIN.top} y2={MARGIN.top + geometry.innerH} />
            )}
            {geometry.paths.map((s) => (
              <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {active !== null && geometry.paths.map((s) => (
              <circle
                key={s.key}
                cx={geometry.x(active)}
                cy={geometry.y(points[active][s.key])}
                r="4.5"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ))}
            {/* Zona de captura transparente: todo el área del gráfico responde al puntero */}
            <rect x={MARGIN.left} y={MARGIN.top} width={geometry.innerW} height={geometry.innerH} fill="transparent" />
          </>
        )}
      </svg>

      {activePoint && (
        <div
          className="tooltip"
          style={{
            top: MARGIN.top,
            left: flip ? undefined : tooltipLeft + 12,
            right: flip ? width - tooltipLeft + 12 : undefined,
          }}
          aria-live="polite"
        >
          <div className="tooltip-title">{formatBucketLong(activePoint.t, unit)}</div>
          {series.map((s) => (
            <div key={s.key} className="tooltip-row">
              <span className="key-line" style={{ background: s.color }} />
              <strong>{formatNumber(activePoint[s.key])}</strong>
              <span>{s.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
