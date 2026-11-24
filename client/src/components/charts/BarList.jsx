import { useState } from 'react';
import { formatNumber, formatPercent } from '../../lib/format.js';

/**
 * Barras horizontales ordenadas (de mayor a menor) para comparar partes de un todo.
 * Un único color (las categorías no tienen orden propio); "Otros" va en gris.
 * items: [{ id, label, value, icon?, href?, onNavigate? }]
 */
export function BarList({ items, other = 0, total, unitLabel = 'clics', emptyText = 'Sin datos en este periodo' }) {
  const [hover, setHover] = useState(null);
  const rows = other > 0 ? [...items, { id: '__other', label: 'Otros', value: other, isOther: true }] : items;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);

  if (rows.length === 0) return <div className="empty-chart">{emptyText}</div>;

  return (
    <ul className="barlist">
      {rows.map((row) => {
        const share = sum ? row.value / sum : 0;
        const description = `${row.label}: ${formatNumber(row.value)} ${unitLabel} (${formatPercent(share)})`;
        return (
          <li
            key={row.id}
            className="barlist-row"
            tabIndex={0}
            aria-label={description}
            onPointerEnter={() => setHover(row.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(row.id)}
            onBlur={() => setHover(null)}
          >
            <div className="barlist-label">
              {row.icon !== undefined && <span className="icon-slot" aria-hidden="true">{row.icon}</span>}
              {row.href ? (
                <a
                  className="truncate"
                  href={row.href}
                  title={row.title ?? row.label}
                  onClick={(e) => {
                    if (row.onNavigate && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      row.onNavigate();
                    }
                  }}
                >
                  {row.label}
                </a>
              ) : (
                <span className="truncate" title={row.title ?? row.label}>{row.label}</span>
              )}
            </div>
            <div className="barlist-track" aria-hidden="true">
              <div className={`barlist-bar${row.isOther ? ' is-other' : ''}`} style={{ width: `${(row.value / max) * 100}%` }} />
              <span className="barlist-value">
                {hover === row.id ? `${formatNumber(row.value)} · ${formatPercent(share)}` : formatNumber(row.value)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
