const axios = require('axios');

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/basketball_nba';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let propsCache = { data: null, ts: 0 };

const MARKETS = 'player_points,player_assists,player_rebounds,player_threes';
const REGIONS = 'us';

// Map The Odds API bookmaker keys to the shape the frontend expects.
// The frontend was designed for sleeper/prizepicks/underdog, but those are
// DFS platforms not available on The Odds API. We map the sportsbooks that
// ARE available and let the frontend display whatever comes back.
const BOOKMAKER_MAP = {
  draftkings: 'draftkings',
  fanduel: 'fanduel',
  betmgm: 'betmgm',
  prizepicks: 'prizepicks',
  underdog: 'underdog',
};

/**
 * Fetch the list of current NBA events (games).
 */
async function fetchEvents() {
  const { data } = await axios.get(`${ODDS_BASE}/events`, {
    params: { apiKey: process.env.ODDS_API_KEY },
  });
  return data; // array of event objects
}

/**
 * Fetch player-prop odds for a single event.
 */
async function fetchEventOdds(eventId) {
  const { data } = await axios.get(`${ODDS_BASE}/events/${eventId}/odds`, {
    params: {
      apiKey: process.env.ODDS_API_KEY,
      regions: REGIONS,
      markets: MARKETS,
      oddsFormat: 'american',
    },
  });
  return data;
}

/**
 * Normalize a single bookmaker market outcome into a prop object fragment.
 */
function normalizeOutcomes(event, bookmaker, market) {
  const props = [];
  const outcomes = market.outcomes || [];

  // Group Over/Under pairs by player description
  const byPlayer = {};
  for (const o of outcomes) {
    const player = o.description || 'Unknown';
    if (!byPlayer[player]) byPlayer[player] = {};
    byPlayer[player][o.name] = { price: o.price, point: o.point };
  }

  const statTypeMap = {
    player_points: 'Points',
    player_assists: 'Assists',
    player_rebounds: 'Rebounds',
    player_threes: 'Threes',
  };

  for (const [playerName, sides] of Object.entries(byPlayer)) {
    const over = sides['Over'];
    if (!over) continue; // skip if no over line

    props.push({
      player: playerName,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      statType: statTypeMap[market.key] || market.key,
      line: over.point,
      bookmakerKey: BOOKMAKER_MAP[bookmaker.key] || bookmaker.key,
      overPrice: over.price,
      underPrice: sides['Under']?.price || null,
      commenceTime: event.commence_time,
    });
  }
  return props;
}

/**
 * Fetch all NBA player props across today's events.
 * Returns an array of prop objects the frontend can consume.
 */
async function fetchAllProps() {
  // Check cache
  if (propsCache.data && Date.now() - propsCache.ts < CACHE_TTL) {
    return propsCache.data;
  }

  const events = await fetchEvents();
  const allProps = [];

  for (const event of events) {
    let eventOdds;
    try {
      eventOdds = await fetchEventOdds(event.id);
    } catch (err) {
      console.error(`Failed to fetch odds for event ${event.id}:`, err.message);
      continue;
    }

    const bookmakers = eventOdds.bookmakers || [];
    for (const bm of bookmakers) {
      for (const mkt of bm.markets || []) {
        const normalized = normalizeOutcomes(eventOdds, bm, mkt);
        allProps.push(...normalized);
      }
    }
  }

  // Consolidate: group by player+statType, merge bookmaker odds
  const grouped = {};
  for (const p of allProps) {
    const key = `${p.player}|${p.statType}`;
    if (!grouped[key]) {
      grouped[key] = {
        player: p.player,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        statType: p.statType,
        line: p.line,
        commenceTime: p.commenceTime,
        odds: {},
      };
    }
    grouped[key].odds[p.bookmakerKey] = {
      over: p.overPrice,
      under: p.underPrice,
      line: p.line,
    };
  }

  const result = Object.values(grouped);
  propsCache = { data: result, ts: Date.now() };
  return result;
}

module.exports = { fetchAllProps, fetchEvents };
