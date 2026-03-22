import React from 'react';
import { resolveStatValue } from '../utils/statHelpers';

const W = 600;
const H = 200;
const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

/**
 * Simple SVG line chart showing stat values over recent games.
 * @param {Array} gameLogs - game log entries (newest first from API)
 * @param {string} statKey - e.g. 'points', 'pts+ast'
 * @param {number|null} propLine - horizontal reference line
 */
export default function PerformanceChart({ gameLogs, statKey, propLine }) {
  if (!gameLogs || gameLogs.length === 0) return null;

  // Reverse so chart reads left (oldest) → right (newest)
  const logs = [...gameLogs].reverse();
  const values = logs.map((g) => resolveStatValue(g, statKey));
  const dates = logs.map((g) => {
    if (!g.date) return '?';
    const d = new Date(g.date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const allVals = propLine != null ? [...values, propLine] : values;
  const minY = Math.min(...allVals) * 0.8;
  const maxY = Math.max(...allVals) * 1.15;
  const rangeY = maxY - minY || 1;

  const xStep = values.length > 1 ? INNER_W / (values.length - 1) : INNER_W;
  const toX = (i) => PAD.left + i * xStep;
  const toY = (v) => PAD.top + INNER_H - ((v - minY) / rangeY) * INNER_H;

  // Build polyline points
  const points = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = PAD.top + INNER_H * (1 - frac);
        const label = (minY + rangeY * frac).toFixed(0);
        return (
          <g key={frac}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#2a2d35" strokeWidth={0.5} />
            <text x={PAD.left - 6} y={y + 3} fill="#888" fontSize={9} textAnchor="end">{label}</text>
          </g>
        );
      })}

      {/* Prop line */}
      {propLine != null && (
        <g>
          <line
            x1={PAD.left} y1={toY(propLine)}
            x2={W - PAD.right} y2={toY(propLine)}
            stroke="#58a6ff" strokeWidth={1.5} strokeDasharray="6,3"
          />
          <text x={W - PAD.right + 4} y={toY(propLine) + 3} fill="#58a6ff" fontSize={9}>
            {propLine}
          </text>
        </g>
      )}

      {/* Data line */}
      <polyline
        fill="none" stroke="#4caf50" strokeWidth={2}
        points={points}
      />

      {/* Data points + labels */}
      {values.map((v, i) => {
        const above = propLine != null && v > propLine;
        return (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(v)} r={3.5} fill={above ? '#4caf50' : '#f44336'} />
            <text x={toX(i)} y={toY(v) - 8} fill="#e4e6eb" fontSize={8} textAnchor="middle">
              {v}
            </text>
            <text x={toX(i)} y={H - 6} fill="#888" fontSize={7.5} textAnchor="middle">
              {dates[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
