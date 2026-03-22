import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Dashboard({ onPlayerClick }) {
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statFilter, setStatFilter] = useState('All');
  const [minRate, setMinRate] = useState(60);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    async function fetchData() {
      try {
        const { data } = await api.get('/api/props');
        if (cancelled) return;
        // Backend returns { loading: true, data: [] } while cache is warming
        if (data && data.loading) {
          retryTimer = setTimeout(fetchData, 5000);
          return;
        }
        setProps(Array.isArray(data) ? data : data.data || []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, []);

  const statTypes = ['All', ...new Set(props.map((p) => p.statType))];

  // --- Top Locks: highest hit rate props ---
  const topLocks = props
    .filter((p) => {
      const matchesStat = statFilter === 'All' || p.statType === statFilter;
      const rate = p.hitRates?.last10;
      return matchesStat && rate != null && rate >= minRate;
    })
    .sort((a, b) => (b.hitRates?.last10 || 0) - (a.hitRates?.last10 || 0))
    .slice(0, 10);

  // --- Trending Players: L5 avg significantly different from L20 avg ---
  const trending = props
    .filter((p) => {
      const l5 = p.hitRates?.last5;
      const l20 = p.hitRates?.last20;
      if (l5 == null || l20 == null) return false;
      return Math.abs(l5 - l20) >= 20;
    })
    .sort((a, b) => {
      const aDiff = (a.hitRates?.last5 || 0) - (a.hitRates?.last20 || 0);
      const bDiff = (b.hitRates?.last5 || 0) - (b.hitRates?.last20 || 0);
      return bDiff - aDiff; // hot players first
    })
    .slice(0, 10);

  if (loading) return <p>Loading dashboard…</p>;

  return (
    <div>
      {/* Quick filters */}
      <div style={filterBarStyle}>
        <select value={statFilter} onChange={(e) => setStatFilter(e.target.value)} style={selectStyle}>
          {statTypes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Min Hit Rate:</span>
          <input
            type="range" min="0" max="100" step="5"
            value={minRate}
            onChange={(e) => setMinRate(Number(e.target.value))}
          />
          <span style={{ fontSize: '0.85rem' }}>{minRate}%</span>
        </div>
      </div>

      {/* Top Locks */}
      <h2 style={sectionTitle}>🔒 Top Locks</h2>
      {topLocks.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No props meet the current threshold.</p>
      ) : (
        <div style={cardGrid}>
          {topLocks.map((p, i) => (
            <div
              key={`${p.player}-${p.statType}-${i}`}
              style={cardStyle}
              onClick={() => onPlayerClick(p.player, p)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {p.personId && (
                  <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.personId}.png`} alt=""
                    style={{ width: 36, height: 26, borderRadius: 4, objectFit: 'cover', background: 'var(--bg-surface)' }}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <span style={{ fontWeight: 600 }}>{p.player}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {p.statType} {p.line} | {p.awayTeam} @ {p.homeTeam}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Badge label="L5" value={p.hitRates?.last5} />
                <Badge label="L10" value={p.hitRates?.last10} />
                <Badge label="L20" value={p.hitRates?.last20} />
              </div>
              {p.matchupRating != null && (
                <div style={{ marginTop: 6 }}>
                  <RatingBadge value={p.matchupRating} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Trending Players */}
      <h2 style={{ ...sectionTitle, marginTop: 32 }}>📈 Trending Players</h2>
      {trending.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No notable trends right now.</p>
      ) : (
        <div style={cardGrid}>
          {trending.map((p, i) => {
            const diff = (p.hitRates?.last5 || 0) - (p.hitRates?.last20 || 0);
            const isHot = diff > 0;
            return (
              <div
                key={`${p.player}-${p.statType}-${i}`}
                style={{ ...cardStyle, borderLeft: `3px solid ${isHot ? 'var(--green)' : 'var(--red)'}` }}
                onClick={() => onPlayerClick(p.player, p)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {p.personId && (
                    <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.personId}.png`} alt=""
                      style={{ width: 32, height: 24, borderRadius: 3, objectFit: 'cover', background: 'var(--bg-surface)' }}
                      onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{isHot ? '🔥' : '🧊'} {p.player}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {p.statType} {p.line}
                </div>
                <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                  L5: {p.hitRates?.last5}% → L20: {p.hitRates?.last20}%
                  <span style={{ color: isHot ? 'var(--green)' : 'var(--red)', marginLeft: 8 }}>
                    ({isHot ? '+' : ''}{diff}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ label, value }) {
  if (value == null) return null;
  const c = value >= 70 ? 'var(--green)' : value >= 45 ? 'var(--yellow)' : 'var(--red)';
  return (
    <span style={{ fontSize: '0.75rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>{' '}
      <span style={{ color: c, fontWeight: 600 }}>{value}%</span>
    </span>
  );
}

function RatingBadge({ value }) {
  const c = value >= 70 ? 'var(--green)' : value >= 45 ? 'var(--yellow)' : 'var(--red)';
  return (
    <span style={{ background: `${c}22`, color: c, padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>
      {value}
    </span>
  );
}

const filterBarStyle = {
  display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap',
};
const selectStyle = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: '0.82rem',
};
const sectionTitle = { fontSize: '1.05rem', marginBottom: 14, fontWeight: 600, letterSpacing: '-0.2px' };
const cardGrid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14,
};
const cardStyle = {
  background: 'var(--bg-card)', backdropFilter: 'blur(12px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  padding: 16, cursor: 'pointer',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};
