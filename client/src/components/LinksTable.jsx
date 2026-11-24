import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { navigate, useAsyncData } from '../lib/hooks.js';
import { formatNumber, formatRelative, shortHost } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { CopyButton, ErrorAlert, QrDialog, StatusBadge } from './ui.jsx';

const PAGE_SIZE = 10;

export function LinksTable({ refreshKey }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [qrLink, setQrLink] = useState(null);

  // Búsqueda con debounce para no lanzar una petición por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useAsyncData(
    () => api.listLinks({ q: query, page, pageSize: PAGE_SIZE }),
    [query, page, refreshKey],
    { refreshMs: 30_000 },
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const openStats = (code) => navigate(`/links/${encodeURIComponent(code)}`);

  return (
    <div className="card links-card">
      <div className="links-toolbar">
        <div className="input-group">
          <Icon name="search" />
          <label className="sr-only" htmlFor="search-links">Buscar enlaces</label>
          <input
            id="search-links"
            className="input"
            type="search"
            placeholder="Buscar por alias, URL o título"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {data && <span className="muted" style={{ fontSize: 13 }}>{formatNumber(data.total)} enlaces</span>}
      </div>

      {error && <div style={{ padding: 16 }}><ErrorAlert error={error} onRetry={reload} /></div>}

      {data && data.items.length === 0 && (
        <div className="empty-chart">
          {query ? `Ningún enlace coincide con «${query}».` : 'Todavía no hay enlaces. Acorta tu primera URL arriba.'}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={`table-wrap${loading ? ' is-refreshing' : ''}`}>
          <table className="table links-table">
            <thead>
              <tr>
                <th scope="col">Enlace</th>
                <th scope="col" className="num">Clics</th>
                <th scope="col">Creado</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((link) => (
                <tr key={link.id}>
                  <td className="col-link">
                    <div className="link-cell">
                      <a
                        className="code truncate"
                        href={`/links/${encodeURIComponent(link.code)}`}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey) return;
                          e.preventDefault();
                          openStats(link.code);
                        }}
                      >
                        /{link.code}
                      </a>
                      <span className="target truncate" title={link.targetUrl}>
                        {link.title ? `${link.title} · ` : ''}{shortHost(link.targetUrl)}
                      </span>
                    </div>
                  </td>
                  <td className="num"><strong>{formatNumber(link.clickCount)}</strong><span className="mobile-only"> clics</span></td>
                  <td className="col-created muted" title={new Date(link.createdAt).toLocaleString('es-ES')}>{formatRelative(link.createdAt)}</td>
                  <td className="col-status"><StatusBadge status={link.status} expiresAt={link.expiresAt} /></td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <CopyButton text={link.shortUrl} compact />
                      <button type="button" className="btn btn-ghost btn-icon" onClick={() => setQrLink(link)} aria-label={`Código QR de /${link.code}`} title="Código QR">
                        <Icon name="qr" />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openStats(link.code)}>
                        <Icon name="chart" />
                        Estadísticas
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="pagination">
          <span>Página {page} de {totalPages}</span>
          <div>
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <button type="button" className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
        </div>
      )}
      {!data && !error && <div className="placeholder-block" style={{ margin: 16 }} />}
      <QrDialog link={qrLink} onClose={() => setQrLink(null)} />
    </div>
  );
}
