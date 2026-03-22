import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import PerformanceChart from './PerformanceChart';
import { resolveStatValue, mapStatType, generateInsights } from '../utils/statHelpers';

const STAT_SELECTOR = [
  { label: 'Points', key: 'points' },
  { label: 'Assists', key: 'assists' },
  { label: 'Rebounds', key: 'rebounds' },
  { label: '3PA', key: 'tpa' },
  { label: 'Pts+Ast', key: 'pts+ast' },
  { label: 'Pts+Reb', key: 'pts+reb' },
  { label: 'Reb+Ast', key: 'reb+ast' },
];

export default function PlayerModal({ playerName, propData, onClose }) {
  const [gameLogs, setGameLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stat type selector defaults to the prop's stat type if available
  const defaultStatKey = propData ? mapStatType(propData.statType) : 'points';
  const [selectedStat, setSelectedStat] = useState(defaultStatKey);

  const propLine = propData?.line ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teamParam = propData?.playerTeam || propData?.homeTeam || '';
        const { data } = await axios.get(
          `/api/player/${encodeURIComponent(playerName)}`,
          { params: teamParam ? { team: teamParam } : {} },
        );
        if (!cancelled) setGameLogs(data.gameLogs || []);
      } catch (err) {
        if (!cancelled) setError('Could not load game logs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerName]);

  // Compute supporting stats
  const supportingStats = useMemo(() => {
    if (gameLogs.length === 0) return null;
    const recent = gameLogs.slice(0, 10);
    const avg = (arr, fn) => arr.length === 0 ? 0 : arr.reduce((s, g) => s + fn(g), 0) / arr.length;
    const fgaAvg = avg(recent, (g) => g.fga || 0);
    const tpaAvg = avg(recent, (g) => g.tpa || 0);
    const ftaAvg = avg(recent, (g) => g.fta || 0);
    const mins = recent.map((g) => parseFloat(g.minutes) || 0).filter((m) => m > 0);
    const minAvg = mins.length > 0 ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
    const minStd = mins.length > 1
      ? Math.sqrt(mins.reduce((s, m) => s + (m - minAvg) ** 2, 0) / mins.length)
      : 0;
    return {
      fgaAvg: fgaAvg.toFixed(1),
      tpaAvg: tpaAvg.toFixed(1),
      ftaAvg: ftaAvg.toFixed(1),
      minAvg: minAvg.toFixed(1),
      minStd: minStd.toFixed(1),
    };
  }, [gameLogs]);

  // Generate insights
  const insights = useMemo(
    () => generateInsights(gameLogs, selectedStat, propLine),
    [gameLogs, selectedStat, propLine],
  );

  const chartLogs = gameLogs.slice(0, 10);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {propData?.personId && (
              <img
                src={`https://cdn.nba.com/headshots/nba/latest/260x190/${propData.personId}.png`}
                alt=""
                style={{ width: 48, height: 36, borderRadius: 6, objectFit: 'cover', background: 'var(--bg-surface)' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2 }}>{playerName}</h2>
              {propData && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {propData.statType} {propData.line} • {propData.awayTeam} @ {propData.homeTeam}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: 'var(--red)' }}>{error}</p>
        ) : gameLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No game logs found.</p>
        ) : (
          <>
            {/* Stat selector */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
              {STAT_SELECTOR.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSelectedStat(s.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                    border: '1px solid transparent', fontWeight: 500,
                    background: selectedStat === s.key ? 'var(--accent)' : 'transparent',
                    color: selectedStat === s.key ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Performance Chart */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 18, border: '1px solid var(--border)' }}>
              <PerformanceChart gameLogs={chartLogs} statKey={selectedStat} propLine={propLine} />
            </div>

            {/* Game Log Table */}
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Opp', 'PTS', 'AST', 'REB', 'MIN', 'FGA', 'FTA', '3PA', 'PF'].map(
                      (h) => <th key={h} style={thStyle}>{h}</th>,
                    )}
                  </tr>
                </thead>
                <tbody>
                  {gameLogs.map((g, i) => {
                    const val = resolveStatValue(g, selectedStat);
                    const cleared = propLine != null && val > propLine;
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: cleared ? 'rgba(34,197,94,0.06)' : 'transparent',
                        }}
                      >
                        <td style={tdStyle}>{fmtDate(g.date)}</td>
                        <td style={tdStyle}>{g.opp || '—'}</td>
                        <td style={tdStyle}>{g.points}</td>
                        <td style={tdStyle}>{g.assists}</td>
                        <td style={tdStyle}>{g.rebounds}</td>
                        <td style={tdStyle}>{g.minutes}</td>
                        <td style={tdStyle}>{g.fga}</td>
                        <td style={tdStyle}>{g.fta}</td>
                        <td style={tdStyle}>{g.tpa}</td>
                        <td style={tdStyle}>{g.fouls ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Supporting Stats */}
            {supportingStats && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={sectionHeading}>Supporting Stats (Last 10)</h3>
                <div style={cardGrid}>
                  <StatCard label="FGA/game" value={supportingStats.fgaAvg} />
                  <StatCard label="3PA/game" value={supportingStats.tpaAvg} />
                  <StatCard label="FTA/game" value={supportingStats.ftaAvg} />
                  <StatCard label="MIN/game" value={supportingStats.minAvg} />
                  <StatCard label="MIN ±" value={supportingStats.minStd} />
                </div>
              </div>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <div>
                <h3 style={sectionHeading}>Insights</h3>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {insights.map((text, i) => (
                    <li key={i} style={{ fontSize: '0.84rem', marginBottom: 6, color: 'var(--text-secondary)' }}>
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

/* ---- Styles ---- */
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle = {
  background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
  borderRadius: 'var(--radius)', padding: 28,
  width: '94%', maxWidth: 860, maxHeight: '88vh', overflowY: 'auto',
  border: '1px solid var(--border)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
};
const closeBtnStyle = {
  background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-secondary)',
  fontSize: '1rem', cursor: 'pointer', borderRadius: 6, width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s',
};
const thStyle = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)',
  fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
};
const tdStyle = { padding: '8px 10px', fontSize: '0.84rem' };
const sectionHeading = {
  fontSize: '0.78rem', marginBottom: 10, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
};
const cardGrid = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const statCardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '10px 16px', minWidth: 85, textAlign: 'center',
};
