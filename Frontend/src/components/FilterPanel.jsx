import React, { useState } from 'react';

const STAT_OPTIONS = [
  'All', 'Points', 'Assists', 'Rebounds', 'Threes',
  'Pts+Ast', 'Pts+Reb', 'Reb+Ast', 'Pts+Ast+Reb',
];
const ODDS_DIRECTIONS = ['Both', 'Over', 'Under'];
const TIME_WINDOWS = [
  { key: 'last5', label: 'L5' }, { key: 'last10', label: 'L10' },
  { key: 'last20', label: 'L20' }, { key: 'h2h', label: 'H2H' },
  { key: 'season', label: 'Season' },
];

export default function FilterPanel({ filters, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const update = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <input type="text" placeholder="Search player…" value={filters.search}
          onChange={(e) => update('search', e.target.value)} style={inputStyle} />
        <select value={filters.statType} onChange={(e) => update('statType', e.target.value)} style={inputStyle}>
          {STAT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
          {ODDS_DIRECTIONS.map((d) => (
            <button key={d} onClick={() => update('oddsDirection', d)} style={{
              ...pillStyle,
              background: filters.oddsDirection === d ? 'var(--accent)' : 'transparent',
              color: filters.oddsDirection === d ? '#fff' : 'var(--text-muted)',
            }}>{d}</button>
          ))}
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{
          ...pillStyle, background: 'transparent', color: 'var(--accent)',
          border: '1px solid var(--border)', marginLeft: 'auto',
        }}>{expanded ? '▾ Less' : '▸ More Filters'}</button>
      </div>

      {expanded && (
        <div style={{ ...rowStyle, paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 10 }}>
          <div style={groupStyle}>
            <span style={labelStyle}>Odds Range</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="range" min="-300" max="300" step="10" value={filters.oddsMin}
                onChange={(e) => update('oddsMin', Number(e.target.value))} style={sliderStyle} />
              <span style={valStyle}>{fmtOdds(filters.oddsMin)}</span>
              <span style={labelStyle}>to</span>
              <input type="range" min="-300" max="300" step="10" value={filters.oddsMax}
                onChange={(e) => update('oddsMax', Number(e.target.value))} style={sliderStyle} />
              <span style={valStyle}>{fmtOdds(filters.oddsMax)}</span>
            </div>
          </div>
          <div style={groupStyle}>
            <span style={labelStyle}>Min Hit Rate</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min="0" max="100" step="5" value={filters.minHitRate}
                onChange={(e) => update('minHitRate', Number(e.target.value))} style={{ ...inputStyle, width: 56 }} />
              <span style={valStyle}>%</span>
              <select value={filters.hitRateWindow} onChange={(e) => update('hitRateWindow', e.target.value)} style={inputStyle}>
                {TIME_WINDOWS.map((tw) => <option key={tw.key} value={tw.key}>{tw.label}</option>)}
              </select>
            </div>
          </div>
          <div style={groupStyle}>
            <span style={labelStyle}>Weighted Lock Rate</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {['last5', 'last10', 'last20'].map((key) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={labelStyle}>{key.replace('last', 'L')}</span>
                  <input type="range" min="0" max="100" step="5" value={filters.weights[key]}
                    onChange={(e) => update('weights', { ...filters.weights, [key]: Number(e.target.value) })}
                    style={{ ...sliderStyle, width: 50 }} />
                  <span style={valStyle}>{filters.weights[key]}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtOdds(v) { return v >= 0 ? `+${v}` : `${v}`; }

export const DEFAULT_FILTERS = {
  search: '', statType: 'All', oddsDirection: 'Both',
  oddsMin: -300, oddsMax: 300, minHitRate: 0, hitRateWindow: 'last10',
  weights: { last5: 40, last10: 35, last20: 25 },
};

const panelStyle = {
  background: 'var(--bg-card)', backdropFilter: 'blur(12px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  padding: '14px 18px', marginBottom: 20,
};
const rowStyle = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };
const groupStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const inputStyle = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: '0.82rem',
  outline: 'none',
};
const pillStyle = {
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: '0.78rem', fontWeight: 500, transition: 'all 0.15s',
};
const sliderStyle = { width: 70, accentColor: 'var(--accent)' };
const labelStyle = { fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' };
const valStyle = { fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 30 };
