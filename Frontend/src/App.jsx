import React, { useState } from 'react';
import PropsTable from './components/PropsTable';
import PlayerModal from './components/PlayerModal';
import Dashboard from './components/Dashboard';
import MatchupsTab from './components/MatchupsTab';

const TABS = ['Dashboard', 'Props', 'Matchups'];

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedProp, setSelectedProp] = useState(null);

  const handlePlayerClick = (playerName, prop) => {
    setSelectedPlayer(playerName);
    setSelectedProp(prop || null);
  };

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '20px 20px 40px' }}>
      <div style={headerStyle}>
        <h1 style={logoStyle}>
          <span style={{ color: 'var(--text-primary)' }}>Kunal</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>is</span>{' '}
          <span style={{ color: 'var(--accent)' }}>Guru</span>
        </h1>
        <nav style={tabBarStyle}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...tabBtnStyle,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                background: activeTab === tab ? 'var(--accent-glow)' : 'transparent',
                borderColor: activeTab === tab ? 'var(--accent)' : 'transparent',
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ marginTop: 8 }}>
        {activeTab === 'Dashboard' && <Dashboard onPlayerClick={handlePlayerClick} />}
        {activeTab === 'Props' && <PropsTable onPlayerClick={handlePlayerClick} />}
        {activeTab === 'Matchups' && <MatchupsTab />}
      </div>

      {selectedPlayer && (
        <PlayerModal
          playerName={selectedPlayer}
          propData={selectedProp}
          onClose={() => { setSelectedPlayer(null); setSelectedProp(null); }}
        />
      )}
    </div>
  );
}

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 0 16px', borderBottom: '1px solid var(--border)',
  marginBottom: 24, flexWrap: 'wrap', gap: 12,
};
const logoStyle = { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.3px' };
const tabBarStyle = {
  display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)',
  borderRadius: 10, padding: 3,
};
const tabBtnStyle = {
  border: '1px solid transparent', borderRadius: 8,
  padding: '6px 18px', cursor: 'pointer',
  fontSize: '0.82rem', fontWeight: 500,
  transition: 'all 0.2s ease',
};
