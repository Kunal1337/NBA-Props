import React from 'react';

/**
 * Visual progress bar showing a hit rate percentage.
 * @param {string} label - e.g. "L5", "L10", "H2H"
 * @param {number|null} value - 0-100
 * @param {boolean} compact - if true, smaller version for table cells
 */
export default function HitRateBar({ label, value, compact = false }) {
  if (value == null) {
    return compact ? (
      <span style={{ color: '#555', fontSize: '0.75rem' }}>—</span>
    ) : (
      <div style={{ ...rowStyle, opacity: 0.4 }}>
        <span style={labelStyle}>{label}</span>
        <div style={trackStyle}><div style={{ ...fillStyle, width: 0 }} /></div>
        <span style={valStyle}>—</span>
      </div>
    );
  }

  const color = value >= 70 ? '#22c55e' : value >= 45 ? '#f59e0b' : '#ef4444';
  const pct = Math.min(100, Math.max(0, value));

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 80 }}>
        <div style={{ ...trackStyleCompact }}>
          <div style={{ ...fillStyleCompact, width: `${pct}%`, background: color }} />
        </div>
        <span style={{ fontSize: '0.7rem', color, fontWeight: 600, minWidth: 28 }}>{value}%</span>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={trackStyle}>
        <div style={{ ...fillStyle, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...valStyle, color }}>{value}%</span>
    </div>
  );
}

/**
 * Group of hit rate bars for L5, L10, L20, H2H.
 */
export function HitRateGroup({ hitRates, compact = false }) {
  if (!hitRates) return null;
  const items = [
    { label: 'L5', value: hitRates.last5 },
    { label: 'L10', value: hitRates.last10 },
    { label: 'L20', value: hitRates.last20 },
    { label: 'H2H', value: hitRates.h2h },
  ];

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((it) => (
          <div key={it.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{it.label}</span>
            <HitRateBar label={it.label} value={it.value} compact />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it) => (
        <HitRateBar key={it.label} label={it.label} value={it.value} />
      ))}
    </div>
  );
}

/* ---- Styles ---- */
const rowStyle = { display: 'flex', alignItems: 'center', gap: 8 };
const labelStyle = { fontSize: '0.7rem', color: '#999', minWidth: 28, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' };
const valStyle = { fontSize: '0.8rem', fontWeight: 600, minWidth: 34, textAlign: 'right' };

const trackStyle = {
  flex: 1, height: 6, background: 'rgba(255,255,255,0.06)',
  borderRadius: 3, overflow: 'hidden', minWidth: 60,
};
const fillStyle = {
  height: '100%', borderRadius: 3,
  transition: 'width 0.4s ease',
};

const trackStyleCompact = {
  width: 48, height: 4, background: 'rgba(255,255,255,0.08)',
  borderRadius: 2, overflow: 'hidden',
};
const fillStyleCompact = {
  height: '100%', borderRadius: 2,
  transition: 'width 0.4s ease',
};
