/** Build a league-aware player headshot URL, or null if no personId. */
export function getHeadshotUrl(league, personId) {
  if (!personId) return null;
  return league === 'wnba'
    ? `https://cdn.wnba.com/headshots/wnba/latest/1040x760/${personId}.png`
    : `https://cdn.nba.com/headshots/nba/latest/260x190/${personId}.png`;
}
