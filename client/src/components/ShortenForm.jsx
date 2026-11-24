import { useState } from 'react';
import { api } from '../lib/api.js';
import { navigate } from '../lib/hooks.js';
import { shortHost } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { CopyButton, QrDialog } from './ui.jsx';

export function ShortenForm({ config, onCreated }) {
  const host = config?.baseUrl ? new URL(config.baseUrl).host : window.location.host;
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [title, setTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [qrLink, setQrLink] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { link } = await api.createLink({
        url,
        alias: alias.trim() || undefined,
        title: title.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setCreated(link);
      setUrl('');
      setAlias('');
      setTitle('');
      setExpiresAt('');
      onCreated?.(link);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card shorten-card" onSubmit={onSubmit} noValidate>
      <div className="shorten-main">
        <label className="sr-only" htmlFor="url">URL larga</label>
        <div className="input-group">
          <Icon name="link" />
          <input
            id="url"
            className="input input-lg"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Pega una URL larga, p. ej. https://ejemplo.com/un/articulo/muy-largo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || !url.trim()}>
          {submitting ? 'Acortando…' : 'Acortar'}
        </button>
      </div>

      <button
        type="button"
        className="options-toggle"
        aria-expanded={showOptions}
        aria-controls="shorten-options"
        onClick={() => setShowOptions((v) => !v)}
      >
        <Icon name="chevron" size={14} />
        Opciones: alias, título y caducidad
      </button>

      {showOptions && (
        <div className="options-grid" id="shorten-options">
          <div className="field">
            <label htmlFor="alias">Alias personalizado</label>
            <div className="prefix-input">
              <span>{host}/</span>
              <input
                id="alias"
                className="input"
                placeholder="mi-enlace"
                value={alias}
                maxLength={32}
                pattern="[A-Za-z0-9_\-]{3,32}"
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="title">Título (opcional)</label>
            <input id="title" className="input" placeholder="Campaña de noviembre" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="expires">Caduca el</label>
            <input id="expires" className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}

      {created && (
        <div className="result" aria-live="polite">
          <div className="result-link">
            <a href={created.shortUrl} target="_blank" rel="noreferrer">{created.shortUrl.replace(/^https?:\/\//, '')}</a>
            <div className="truncate" title={created.targetUrl}>→ {shortHost(created.targetUrl)}</div>
          </div>
          <div className="result-actions">
            <CopyButton text={created.shortUrl} />
            <button type="button" className="btn" onClick={() => setQrLink(created)}>
              <Icon name="qr" />
              QR
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/links/${encodeURIComponent(created.code)}`)}>
              <Icon name="chart" />
              Estadísticas
            </button>
          </div>
        </div>
      )}
      <QrDialog link={qrLink} onClose={() => setQrLink(null)} />
    </form>
  );
}
