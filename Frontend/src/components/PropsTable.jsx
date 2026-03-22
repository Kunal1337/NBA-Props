import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { io } from 'socket.io-client';
import FilterPanel, { DEFAULT_FILTERS } from './FilterPanel';
import { computeWeightedLockRate } from '../utils/statHelpers';
import HitRateBar, { HitRateGroup } from './HitRateBar';

const POLL_INTERVAL = 600_000;

export default function PropsTable({ onPlayerClick }) {
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const fetchProps = useCallback(async () => {
    try {
      const { data } = await api.get('/api/props');
      setProps(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch props:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProps();
    const interval = setInterval(fetchProps, POLL_INTERVAL);
    const socket = io(import.meta.env.VITE_API_URL || '');
    socket.on('props_update', (data) => {
      setProps(data);
      setLastUpdated(new Date().toLocaleTimeString());
    });
    return () => { clearInterval(interval); socket.disconnect(); };
  }, [fetchProps]);

  const filtered = props.filter((p) => {
    if (filters.search && !p.player.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.statType !== 'All' && p.statType !== filters.statType) return false;
    if (filters.oddsDirection === 'Over' && (!p.overOdds || Object.keys(p.overOdds).length === 0)) return false;
    if (filters.oddsDirection === 'Under' && (!p.underOdds || Object.keys(p.underOdds).length === 0)) return false;
    if (p.overOdds && Object.keys(p.overOdds).length > 0) {
      const anyInRange = Object.values(p.overOdds).some((o) => o >= filters.oddsMin && o <= filters.oddsMax);
      if (!anyInRange) return false;
    }
    if (filters.minHitRate > 0) {
      const rate = p.hitRates?.[filters.hitRateWindow];
      if (rate == null || rate < filters.minHitRate) return false;
    }
    return true;
  });

  return (
    <div>
      <FilterPanel filters={filters} onChange={setFilters} />
      {lastUpdated && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 8, textAlign: 'right' }}>
          Updated {lastUpdated}
        </span>
      )}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No props found.</p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLUMNS.map((c) => <th key={c} style={thStyle}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const wlr = computeWeightedLockRate(p.hitRates, normalizeWeights(filters.weights));
                return (
                  <tr key={`${p.player}-${p.statType}-${i}`}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => onPlayerClick(p.player, p)}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img
                          src={p.personId ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.personId}.png` : ''}
                          alt=""
                          style={{ width: 28, height: 20, borderRadius: 3, objectFit: 'cover', background: 'var(--bg-surface)', display: p.personId ? 'block' : 'none' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <span style={{ fontWeight: 600 }}>{p.player}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{p.awayTeam} @ {p.homeTeam}</td>
                    <td style={tdStyle}><span style={statBadge}>{p.statType}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{p.line}</td>
                    <td style={tdStyle}>{fmtBestLine(p.bestLine, p.line, p.bestOver)}</td>
                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtOddsMap(p.overOdds)}</td>
                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtOddsMap(p.underOdds)}</td>
                    <td style={tdStyle}><HitRateBar label="L5" value={p.hitRates?.last5} compact /></td>
                    <td style={tdStyle}><HitRateBar label="L10" value={p.hitRates?.last10} compact /></td>
                    <td style={tdStyle}><HitRateBar label="L20" value={p.hitRates?.last20} compact /></td>
                    <td style={tdStyle}><HitRateBar label="H2H" value={p.hitRates?.h2h} compact /></td>
                    <td style={tdStyle}><MatchupBadge value={p.opponentRankVsPosition} /></td>
                    <td style={tdStyle}><ScorePill value={p.matchupRating} /></td>
                    <td style={tdStyle}><ScorePill value={wlr} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const COLUMNS = ['Player','Matchup','Stat','Line','Best','Over','Under','L5','L10','L20','H2H','Opp Rank','Rating','WLR'];

function normalizeWeights(w) {
  const total = (w.last5 || 0) + (w.last10 || 0) + (w.last20 || 0);
  if (total === 0) return { last5: 1/3, last10: 1/3, last20: 1/3 };
  return { last5: w.last5 / total, last10: w.last10 / total, last20: w.last20 / total };
}
function fmtOddsMap(m) {
  if (!m || Object.keys(m).length === 0) return '—';
  return Object.entries(m).map(([b, v]) => `${b}: ${v > 0 ? '+' : ''}${v}`).join(' | ');
}
function fmtBestLine(bestLine, defaultLine, bestOver) {
  // Show best line only if it differs from default, or show best over price
  if (bestOver) {
    const priceStr = bestOver.price > 0 ? `+${bestOver.price}` : bestOver.price;
    if (bestLine != null && bestLine !== defaultLine) {
      return (
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {bestLine} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({priceStr} {bestOver.book})</span>
        </span>
      );
    }
    return (
      <span style={{ color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: '0.75rem' }}>{priceStr}</span>{' '}
        <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{bestOver.book}</span>
      </span>
    );
  }
  return <span style={{ color: 'var(--text-muted)' }}>—</span>;
}
function ScorePill({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const c = value >= 70 ? 'var(--green)' : value >= 45 ? 'var(--yellow)' : 'var(--red)';
  return <span style={{ background: `${c}22`, color: c, padding: '3px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 }}>{value}</span>;
}
function MatchupBadge({ value }) {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const c = { favorable: 'var(--green)', neutral: 'var(--yellow)', unfavorable: 'var(--red)' };
  const col = c[value] || 'var(--text-muted)';
  return <span style={{ background: `${col}18`, color: col, padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 500, textTransform: 'capitalize' }}>{value}</span>;
}

const statBadge = { background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 5, fontSize: '0.75rem', fontWeight: 500 };
const thStyle = {
  textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)',
  fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
  textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500,
};
const tdStyle = { padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.84rem' };
