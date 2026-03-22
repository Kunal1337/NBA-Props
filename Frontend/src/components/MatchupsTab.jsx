import React, { useEffect, useState } from 'react';
import api from '../api';

const POS_COLS = ['vsG', 'vsF', 'vsC'];
const POS_LABELS = { vsG: 'Guards', vsF: 'Forwards', vsC: 'Centers' };

const RATING_COLORS = {
  favorable: '#4caf50',
  neutral: '#ff9800',
  unfavorable: '#f44336',
};

export default function MatchupsTab() {
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/matchups');
        setRankings(data);
      } catch (err) {
        setError('Failed to load matchup data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p>Loading matchups…</p>;
  if (error) return <p style={{ color: '#f44336' }}>{error}</p>;
  if (!rankings || Object.keys(rankings).length === 0) {
    return <p style={{ color: '#888' }}>No matchup data available.</p>;
  }

  const teams = Object.values(rankings).sort((a, b) => a.overallRank - b.overallRank);

  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: 16 }}>
        Teams ranked by defensive vulnerability. Lower rank = allows more points = better for bettors.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Team</th>
              {POS_COLS.map((col) => (
                <th key={col} style={thStyle}>{POS_LABELS[col]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.abbreviation} style={{ borderBottom: '1px solid #2a2d35' }}>
                <td style={tdStyle}>{team.overallRank}</td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{team.abbreviation}</span>
                  <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: 8 }}>{team.fullName}</span>
                </td>
                {POS_COLS.map((col) => {
                  const rating = team[col];
                  const color = RATING_COLORS[rating] || '#888';
                  return (
                    <td key={col} style={tdStyle}>
                      <span style={{
                        background: color, color: '#fff', padding: '2px 10px',
                        borderRadius: 4, fontSize: '0.8rem', textTransform: 'capitalize',
                      }}>
                        {rating || '—'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)',
  fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
  textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500,
};
const tdStyle = { padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.84rem' };
