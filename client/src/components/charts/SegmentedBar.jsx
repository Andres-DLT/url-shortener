import { useElementWidth } from '../../lib/hooks.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

/**
 * Barra segmentada alta: un todo dividido en ≤ 6 partes, de un vistazo.
 * El color sigue a la entidad (parts[].color), nunca a su posición.
 * El porcentaje se imprime dentro solo si cabe; la leyenda nombra las partes.
 */
export function SegmentedBar({ parts, label }) {
  const [ref, width] = useElementWidth();
  const visible = parts.filter((p) => p.value > 0);
  const total = visible.reduce((s, p) => s + p.value, 0);

  if (total === 0) return <div className="empty-chart">Sin datos en este periodo</div>;

  const gaps = (visible.length - 1) * 2;
  return (
    <div>
      <div
        ref={ref}
        className="segbar"
        role="group"
        aria-label={`${label}: ${visible.map((p) => `${p.label} ${formatPercent(p.value / total)}`).join(', ')}`}
      >
        {visible.map((p) => {
          const share = p.value / total;
          const text = formatPercent(share);
          const blockWidth = (width - gaps) * share;
          const fits = blockWidth >= text.length * 7.5 + 16;
          return (
            <div
              key={p.id}
              className="segbar-part"
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color, color: p.textColor ?? '#fff' }}
              title={`${p.label}: ${formatNumber(p.value)} (${text})`}
              tabIndex={0}
              aria-label={`${p.label}: ${formatNumber(p.value)} clics, ${text}`}
            >
              {fits ? text : ''}
            </div>
          );
        })}
      </div>
      <div className="segbar-legend">
        {visible.map((p) => (
          <div key={p.id} className="segbar-legend-row">
            <span className="key-rect" style={{ background: p.color }} aria-hidden="true" />
            <span>{p.label}</span>
            <span className="value">{formatNumber(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
