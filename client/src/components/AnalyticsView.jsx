import { navigate } from '../lib/hooks.js';
import {
  countryFlag, countryName, formatBucketLong, formatCompact, formatDateTime, formatNumber, formatPercent, RANGE_OPTIONS,
} from '../lib/format.js';
import { BarList } from './charts/BarList.jsx';
import { Heatmap } from './charts/Heatmap.jsx';
import { LineChart } from './charts/LineChart.jsx';
import { SegmentedBar } from './charts/SegmentedBar.jsx';
import { ChartCard, DataTable, StatTile } from './ui.jsx';

const SERIES = [
  { key: 'clicks', label: 'Clics', color: 'var(--series-1)' },
  { key: 'visitors', label: 'Visitantes únicos', color: 'var(--series-2)' },
];

// El color sigue al tipo de dispositivo, no a su posición en el ranking.
const DEVICE_COLORS = {
  Escritorio: { color: 'var(--series-1)' },
  Móvil: { color: 'var(--series-2)' },
  Tablet: { color: 'var(--series-3)' },
};
const OTHER_DEVICE = { color: 'var(--series-4)', textColor: 'var(--on-series-4)' };
const UNKNOWN = { color: 'var(--series-other)', textColor: 'var(--text-primary)' };

const unknownLabel = (key, fallback = 'Desconocido') => key || fallback;

function breakdownTable(data, total, keyLabel, labelFn) {
  const rows = data.items.map((i) => ({ name: labelFn(i), clicks: i.clicks, share: formatPercent(total ? i.clicks / total : 0) }));
  if (data.other > 0) rows.push({ name: 'Otros', clicks: data.other, share: formatPercent(total ? data.other / total : 0) });
  return {
    columns: [
      { key: 'name', label: keyLabel },
      { key: 'clicks', label: 'Clics', numeric: true },
      { key: 'share', label: '%', numeric: true },
    ],
    rows,
  };
}

export function AnalyticsView({ stats, range, refreshing, variant }) {
  const { summary, timeseries } = stats;
  const total = summary.clicks;
  const rangeOption = RANGE_OPTIONS.find((o) => o.value === range);
  const isOverview = variant === 'overview';

  const referrerLabel = (i) => unknownLabel(i.key, 'Directo / desconocido');
  const countryLabel = (i) => countryName(i.key);
  const cityLabel = (i) => (i.key ? `${i.key}${i.country ? `, ${countryName(i.country)}` : ''}` : 'Desconocida');

  const deviceParts = [
    ...stats.devices.items.map((d) => ({
      id: d.key || 'unknown',
      label: unknownLabel(d.key),
      value: d.clicks,
      ...(d.key ? DEVICE_COLORS[d.key] ?? OTHER_DEVICE : UNKNOWN),
    })),
    ...(stats.devices.other > 0 ? [{ id: 'other', label: 'Otros', value: stats.devices.other, ...UNKNOWN }] : []),
  ];

  return (
    <div className={refreshing ? 'is-refreshing' : undefined}>
      <div className="kpi-row">
        <StatTile
          label="Clics"
          value={formatCompact(summary.clicks)}
          current={summary.clicks}
          previous={summary.previous.clicks}
          previousLabel={rangeOption?.previous}
        />
        <StatTile
          label="Visitantes únicos"
          value={formatCompact(summary.visitors)}
          current={summary.visitors}
          previous={summary.previous.visitors}
          previousLabel={rangeOption?.previous}
        />
        <StatTile
          label="Clics totales"
          value={formatCompact(summary.allTimeClicks)}
          note={isOverview ? 'Histórico de todos los enlaces' : 'Desde que se creó el enlace'}
        />
        {isOverview ? (
          <StatTile
            label="Enlaces activos"
            value={formatNumber(summary.activeLinks)}
            suffix={`de ${formatNumber(summary.totalLinks)}`}
            note="Ni caducados ni desactivados"
          />
        ) : (
          <StatTile
            label="Bots filtrados"
            value={formatCompact(summary.botClicks)}
            note="Excluidos de las estadísticas"
          />
        )}
      </div>

      <div className="charts-grid">
        <ChartCard
          className={isOverview ? 'span-wide' : 'span-all'}
          title="Clics en el tiempo"
          subtitle={timeseries.unit === 'hour' ? 'Por hora, en tu zona horaria' : 'Por día, en tu zona horaria'}
          table={{
            caption: 'Clics y visitantes por periodo',
            columns: [
              { key: 'date', label: timeseries.unit === 'hour' ? 'Hora' : 'Día' },
              { key: 'clicks', label: 'Clics', numeric: true },
              { key: 'visitors', label: 'Visitantes únicos', numeric: true },
            ],
            rows: [...timeseries.points].reverse().map((p) => ({ date: formatBucketLong(p.t, timeseries.unit), clicks: p.clicks, visitors: p.visitors })),
          }}
        >
          <div className="legend">
            {SERIES.map((s) => (
              <span key={s.key} className="legend-item">
                <span className="key-line" style={{ background: s.color }} />
                {s.label}
                <strong>{formatNumber(s.key === 'clicks' ? summary.clicks : summary.visitors)}</strong>
              </span>
            ))}
          </div>
          <LineChart points={timeseries.points} unit={timeseries.unit} series={SERIES} />
        </ChartCard>

        {isOverview && (
          <ChartCard
            className="span-side"
            title="Enlaces más visitados"
            subtitle="Clics en el periodo"
            table={{
              columns: [{ key: 'code', label: 'Enlace' }, { key: 'clicks', label: 'Clics', numeric: true }],
              rows: stats.topLinks.map((l) => ({ code: `/${l.code}`, clicks: l.clicks })),
            }}
          >
            <BarList
              total={total}
              items={stats.topLinks.map((l) => ({
                id: l.code,
                label: `/${l.code}`,
                title: l.title ? `${l.title} — ${l.targetUrl}` : l.targetUrl,
                value: l.clicks,
                href: `/links/${encodeURIComponent(l.code)}`,
                onNavigate: () => navigate(`/links/${encodeURIComponent(l.code)}${window.location.search}`),
              }))}
            />
          </ChartCard>
        )}

        <ChartCard title="Sitios de referencia" subtitle="De dónde llegan los clics" table={breakdownTable(stats.referrers, total, 'Origen', referrerLabel)}>
          <BarList total={total} other={stats.referrers.other} items={stats.referrers.items.map((i) => ({ id: i.key, label: referrerLabel(i), value: i.clicks }))} />
        </ChartCard>

        <ChartCard title="Países" table={breakdownTable(stats.countries, total, 'País', countryLabel)}>
          <BarList
            total={total}
            other={stats.countries.other}
            items={stats.countries.items.map((i) => ({ id: i.key, label: countryLabel(i), value: i.clicks, icon: countryFlag(i.key) }))}
          />
        </ChartCard>

        <ChartCard title="Ciudades" table={breakdownTable(stats.cities, total, 'Ciudad', cityLabel)}>
          <BarList
            total={total}
            other={stats.cities.other}
            items={stats.cities.items.map((i) => ({
              id: `${i.country}-${i.key}`, label: i.key || 'Desconocida', title: cityLabel(i), value: i.clicks, icon: countryFlag(i.country),
            }))}
          />
        </ChartCard>

        <ChartCard title="Dispositivos" table={breakdownTable(stats.devices, total, 'Dispositivo', (i) => unknownLabel(i.key))}>
          <SegmentedBar parts={deviceParts} label="Clics por tipo de dispositivo" />
        </ChartCard>

        <ChartCard title="Navegadores" table={breakdownTable(stats.browsers, total, 'Navegador', (i) => unknownLabel(i.key))}>
          <BarList total={total} other={stats.browsers.other} items={stats.browsers.items.map((i) => ({ id: i.key, label: unknownLabel(i.key), value: i.clicks }))} />
        </ChartCard>

        <ChartCard title="Sistemas operativos" table={breakdownTable(stats.os, total, 'Sistema', (i) => unknownLabel(i.key))}>
          <BarList total={total} other={stats.os.other} items={stats.os.items.map((i) => ({ id: i.key, label: unknownLabel(i.key), value: i.clicks }))} />
        </ChartCard>

        <ChartCard className="span-all" title="¿Cuándo hacen clic?" subtitle="Clics por día de la semana y hora local">
          <Heatmap activity={stats.activity} />
        </ChartCard>

        <ChartCard className="span-all" title="Últimos clics" subtitle="Los 15 más recientes (sin bots)">
          <DataTable
            caption="Últimos clics"
            columns={[
              { key: 'when', label: 'Fecha' },
              ...(isOverview ? [{ key: 'code', label: 'Enlace' }] : []),
              { key: 'where', label: 'Ubicación' },
              { key: 'from', label: 'Origen' },
              { key: 'browser', label: 'Navegador' },
              { key: 'device', label: 'Dispositivo' },
            ]}
            rows={stats.recentClicks.map((c) => ({
              when: formatDateTime(c.clickedAt),
              code: `/${c.code}`,
              where: `${countryFlag(c.country)} ${c.city ? `${c.city}, ` : ''}${countryName(c.country)}`,
              from: c.referrerDomain || 'Directo / desconocido',
              browser: [c.browser, c.os].filter(Boolean).join(' · ') || 'Desconocido',
              device: c.device || 'Desconocido',
            }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
