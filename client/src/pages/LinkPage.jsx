import { useState } from 'react';
import { AnalyticsView } from '../components/AnalyticsView.jsx';
import { Icon } from '../components/Icon.jsx';
import { UpdatedAt } from '../components/UpdatedAt.jsx';
import {
  CopyButton, ErrorAlert, QrDialog, RangeFilter, StatusBadge,
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { navigate, toast, useAsyncData, useQueryParam } from '../lib/hooks.js';
import { formatDate, RANGE_OPTIONS } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

const RANGES = RANGE_OPTIONS.map((o) => o.value);

export function LinkPage({ code }) {
  const { canEdit } = useSession().session;
  const [range, setRange] = useQueryParam('range', '7d', RANGES);
  const [qrLink, setQrLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const stats = useAsyncData(() => api.linkStats(code, range), [code, range], { refreshMs: 30_000 });
  const link = stats.data?.link;

  const back = (
    <a
      className="back-link"
      href="/"
      onClick={(e) => {
        e.preventDefault();
        navigate('/');
      }}
    >
      <Icon name="back" />
      Todos los enlaces
    </a>
  );

  if (stats.error && !stats.data) {
    return (
      <>
        {back}
        {stats.error.status === 404
          ? <ErrorAlert error={{ message: `El enlace /${code} no existe o ha sido eliminado.` }} />
          : <ErrorAlert error={stats.error} onRetry={stats.reload} />}
      </>
    );
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await api.updateLink(link.code, { isActive: !link.isActive });
      toast(link.isActive ? 'Enlace desactivado: ahora responde 410' : 'Enlace activado de nuevo');
      await stats.reload();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`¿Eliminar /${link.code} y todas sus estadísticas? No se puede deshacer.`)) return;
    setBusy(true);
    try {
      await api.deleteLink(link.code);
      toast(`/${link.code} eliminado`);
      navigate('/');
    } catch (err) {
      toast(err.message, { error: true });
      setBusy(false);
    }
  }

  return (
    <>
      {back}
      {link ? (
        <header className="link-header">
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1>{link.shortUrl.replace(/^https?:\/\//, '')}</h1>
            <a className="target" href={link.targetUrl} target="_blank" rel="noreferrer" title={link.targetUrl}>
              <span className="truncate">{link.title ? `${link.title} · ` : ''}{link.targetUrl}</span>
              <Icon name="external" size={14} />
            </a>
            <div className="link-meta">
              <StatusBadge status={link.status} expiresAt={link.expiresAt} />
              <span>Creado el {formatDate(link.createdAt)}</span>
              {link.expiresAt && <span>{link.status === 'expired' ? 'Caducó' : 'Caduca'} el {formatDate(link.expiresAt)}</span>}
            </div>
          </div>
          <div className="link-actions">
            <CopyButton text={link.shortUrl} />
            <button type="button" className="btn" onClick={() => setQrLink(link)}>
              <Icon name="qr" />
              QR
            </button>
            {canEdit && (
              <>
                <button type="button" className="btn" onClick={toggleActive} disabled={busy}>
                  <Icon name="power" />
                  {link.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  <Icon name="trash" />
                  Eliminar
                </button>
              </>
            )}
          </div>
        </header>
      ) : (
        <div className="placeholder-block" style={{ height: 90, marginBottom: 24 }} />
      )}

      <div className="toolbar">
        <RangeFilter value={range} onChange={setRange} />
        <UpdatedAt state={stats} />
      </div>
      {stats.error && stats.data && <div style={{ marginBottom: 16 }}><ErrorAlert error={stats.error} onRetry={stats.reload} /></div>}
      {stats.data ? (
        <AnalyticsView stats={stats.data} range={stats.data.range} refreshing={stats.loading} variant="link" />
      ) : (
        <div className="placeholder-block" />
      )}
      <QrDialog link={qrLink} onClose={() => setQrLink(null)} />
    </>
  );
}
