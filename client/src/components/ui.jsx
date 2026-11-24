import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { copyToClipboard, useToasts } from '../lib/hooks.js';
import { formatDate, formatNumber, RANGE_OPTIONS } from '../lib/format.js';
import { Icon } from './Icon.jsx';

/** Contenedor de gráfico con su "gemela" accesible: la vista de tabla. */
export function ChartCard({ title, subtitle, table, className = '', children }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={`card chart-card ${className}`}>
      <div className="chart-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="table-toggle" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            <Icon name={showTable ? 'chart' : 'table'} size={14} />
            {showTable ? 'Gráfico' : 'Tabla'}
          </button>
        )}
      </div>
      {showTable && table ? <DataTable {...table} /> : children}
    </figure>
  );
}

export function DataTable({ columns, rows, caption }) {
  if (rows.length === 0) return <div className="empty-chart">Sin datos en este periodo</div>;
  return (
    <div className="table-wrap">
      <table className="table data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.numeric ? 'num' : undefined} scope="col">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'num' : undefined}>
                  {c.numeric && typeof row[c.key] === 'number' ? formatNumber(row[c.key]) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tile de KPI: etiqueta, valor y variación frente al periodo anterior. */
export function StatTile({ label, value, suffix, current, previous, previousLabel, note }) {
  let delta = null;
  if (previous !== undefined) {
    if (previous === 0 && current === 0) delta = <span className="delta-flat">Sin cambios</span>;
    else if (previous === 0) delta = <span className="delta-up"><Icon name="up" size={13} strokeWidth={2.4} />Nuevo</span>;
    else {
      const change = (current - previous) / previous;
      const pct = `${Math.abs(Math.round(change * 100))} %`;
      if (Math.round(change * 100) === 0) delta = <span className="delta-flat">= 0 %</span>;
      else if (change > 0) delta = <span className="delta-up"><Icon name="up" size={13} strokeWidth={2.4} />{pct}</span>;
      else delta = <span className="delta-down"><Icon name="down" size={13} strokeWidth={2.4} />{pct}</span>;
    }
  }
  return (
    <div className="card stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {suffix && <small> {suffix}</small>}
      </div>
      <div className="stat-delta">
        {delta}
        {delta && previousLabel && <span>vs. {previousLabel}</span>}
        {!delta && note}
      </div>
    </div>
  );
}

export function RangeFilter({ value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Periodo">
      {RANGE_OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS = {
  active: { label: 'Activo', className: 'status-active' },
  disabled: { label: 'Desactivado', className: 'status-disabled' },
  expired: { label: 'Caducado', className: 'status-expired' },
};

export function StatusBadge({ status, expiresAt }) {
  const s = STATUS[status] ?? STATUS.active;
  const title = status === 'active' && expiresAt ? `Caduca el ${formatDate(expiresAt)}` : undefined;
  return (
    <span className={`status ${s.className}`} title={title}>
      <i aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function CopyButton({ text, label = 'Copiar', compact = false }) {
  return (
    <button
      type="button"
      className={compact ? 'btn btn-ghost btn-icon' : 'btn'}
      onClick={() => copyToClipboard(text)}
      aria-label={compact ? `Copiar ${text}` : undefined}
      title={compact ? 'Copiar enlace' : undefined}
    >
      <Icon name="copy" />
      {!compact && label}
    </button>
  );
}

export function QrDialog({ link, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (link && dialog && !dialog.open) dialog.showModal();
  }, [link]);
  if (!link) return null;
  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="qr-title"
    >
      <h2 id="qr-title">Código QR</h2>
      <p className="qr-url">{link.shortUrl}</p>
      <img className="qr-img" src={api.qrUrl(link.code)} alt={`Código QR de ${link.shortUrl}`} />
      <div className="modal-actions">
        <a className="btn" href={api.qrUrl(link.code)} download={`qr-${link.code}.svg`}>
          <Icon name="download" />
          Descargar SVG
        </a>
        <button type="button" className="btn btn-primary" onClick={() => ref.current.close()}>Cerrar</button>
      </div>
    </dialog>
  );
}

export function ToastHost() {
  const toasts = useToasts();
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.error ? ' is-error' : ''}`}>
          {t.error && <Icon name="alert" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ErrorAlert({ error, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="alert" size={18} />
      <div style={{ flex: 1 }}>{error.message}</div>
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}
