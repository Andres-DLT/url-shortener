import { useState } from 'react';
import { AnalyticsView } from '../components/AnalyticsView.jsx';
import { LinksTable } from '../components/LinksTable.jsx';
import { ReadOnlyNotice } from '../components/LoginDialog.jsx';
import { useSession } from '../lib/session.jsx';
import { ShortenForm } from '../components/ShortenForm.jsx';
import { ErrorAlert, RangeFilter } from '../components/ui.jsx';
import { UpdatedAt } from '../components/UpdatedAt.jsx';
import { api } from '../lib/api.js';
import { useAsyncData, useQueryParam } from '../lib/hooks.js';
import { RANGE_OPTIONS } from '../lib/format.js';

const RANGES = RANGE_OPTIONS.map((o) => o.value);

export function HomePage() {
  const { baseUrl, session } = useSession();
  const [range, setRange] = useQueryParam('range', '7d', RANGES);
  const [refreshKey, setRefreshKey] = useState(0);
  const overview = useAsyncData(() => api.overview(range), [range, refreshKey], { refreshMs: 30_000 });

  return (
    <>
      <section className="hero">
        <h1>Acorta enlaces y mide cada clic</h1>
        <p>Crea enlaces cortos y descubre de dónde llegan tus visitas: sitios de referencia, países, ciudades, dispositivos y horas.</p>
        {session.canEdit
          ? <ShortenForm config={{ baseUrl }} onCreated={() => setRefreshKey((k) => k + 1)} />
          : <ReadOnlyNotice />}
      </section>

      <section className="section" aria-labelledby="links-title">
        <div className="section-head">
          <div>
            <h2 id="links-title">{session.canEdit ? 'Tus enlaces' : 'Enlaces'}</h2>
            <p>Los clics se actualizan en segundos.</p>
          </div>
        </div>
        <LinksTable refreshKey={refreshKey} />
      </section>

      <section className="section" aria-labelledby="overview-title">
        <div className="section-head">
          <div>
            <h2 id="overview-title">Panel general</h2>
            <p>Analíticas de todos tus enlaces juntos.</p>
          </div>
        </div>
        <div className="toolbar">
          <RangeFilter value={range} onChange={setRange} />
          <UpdatedAt state={overview} />
        </div>
        {overview.error && !overview.data && <ErrorAlert error={overview.error} onRetry={overview.reload} />}
        {overview.data && (
          <AnalyticsView stats={overview.data} range={overview.data.range} refreshing={overview.loading} variant="overview" />
        )}
        {!overview.data && !overview.error && <div className="placeholder-block" />}
      </section>
    </>
  );
}
