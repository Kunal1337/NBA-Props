"""
WNBA stats service for NBA-Props.

Invoked by the Node backend as a subprocess (see ../services/wnbaService.js
and ../services/wnbaMatchupService.js) — each call returns one JSON
document on stdout. This replaces the app's NBA-only cdn.nba.com scraper
and BallDontLie matchup proxy with nba_api's stats.nba.com access
(LeagueID='10' = WNBA), which natively provides makes/attempts splits and
real opponent-points-allowed data. See NBA-Props-handoff.md for context.

Commands:
    python wnba_stats.py game-log "<player name>"
    python wnba_stats.py opponent-stats
"""

import sys
import json

from nba_api.stats.static import players as static_players
from nba_api.stats.static import teams as static_teams
from nba_api.stats.endpoints import (
    playergamelog,
    leaguedashteamstats,
    commonplayerinfo,
    commonallplayers,
)
from nba_api.stats.library.parameters import LeagueID, WnbaSeason

TIMEOUT = 20


def _emit(obj):
    print(json.dumps(obj))


def _fail(msg):
    _emit({"error": msg})
    sys.exit(1)


def _parse_matchup(matchup):
    """'LVA vs. MIN' or 'LVA @ MIN' -> ('LVA', 'MIN')"""
    for sep in (" vs. ", " @ "):
        if sep in matchup:
            own, opp = matchup.split(sep, 1)
            return own.strip(), opp.strip()
    return None, None


def _find_player_live(player_name):
    """
    Fallback for players missing from nba_api's bundled static player list
    (e.g. recent draft picks — the static bundle ships with the package
    and can lag behind the actual current roster). Queries stats.nba.com
    directly for the live current-season roster instead of a snapshot.
    """
    try:
        resp = commonallplayers.CommonAllPlayers(
            is_only_current_season=1, league_id=LeagueID.wnba, season=WnbaSeason.default, timeout=TIMEOUT,
        )
        rows = resp.get_normalized_dict().get("CommonAllPlayers", [])
    except Exception:
        return None
    name_lower = player_name.strip().lower()
    for r in rows:
        if r.get("DISPLAY_FIRST_LAST", "").strip().lower() == name_lower:
            return {"id": r["PERSON_ID"], "full_name": r["DISPLAY_FIRST_LAST"]}
    return None


def cmd_game_log(player_name):
    matches = static_players.find_wnba_players_by_full_name(player_name)
    player = matches[0] if matches else _find_player_live(player_name)
    if not player:
        _fail(f"No WNBA player found matching '{player_name}'")

    position = None
    try:
        info = commonplayerinfo.CommonPlayerInfo(
            player_id=player["id"], league_id_nullable=LeagueID.wnba, timeout=TIMEOUT,
        )
        rows = info.get_normalized_dict().get("CommonPlayerInfo", [])
        if rows:
            position = rows[0].get("POSITION")
    except Exception:
        pass  # position is a nice-to-have, not fatal

    log = playergamelog.PlayerGameLog(
        player_id=player["id"],
        season=WnbaSeason.default,
        league_id_nullable=LeagueID.wnba,
        timeout=TIMEOUT,
    )
    rows = log.get_normalized_dict().get("PlayerGameLog", [])

    games = []
    team_abbr = None
    for r in rows:
        own, opp = _parse_matchup(r.get("MATCHUP", "") or "")
        team_abbr = team_abbr or own
        games.append({
            "date": r.get("GAME_DATE"),
            "opp": opp,
            "points": r.get("PTS") or 0,
            "assists": r.get("AST") or 0,
            "rebounds": r.get("REB") or 0,
            "minutes": r.get("MIN") or 0,
            "fga": r.get("FGA") or 0,
            "fta": r.get("FTA") or 0,
            "tpa": r.get("FG3A") or 0,
            "tpm": r.get("FG3M") or 0,
            "fouls": r.get("PF") or 0,
            "playerTeam": own,
            "position": position,
        })

    _emit({
        "player": player["full_name"],
        "personId": player["id"],
        "teamAbbr": team_abbr,
        "position": position,
        "games": games,
    })



# 2026 WNBA expansion teams not yet present in nba_api's bundled static
# team list (nba_api.stats.static.teams.get_wnba_teams()).
EXPANSION_TEAM_ABBRS = {
    "Toronto Tempo": "TOR",
    "Portland Fire": "POR",
    "Golden State Valkyries": "GSV",
}


def cmd_opponent_stats():
    abbr_by_full_name = {t["full_name"]: t["abbreviation"] for t in static_teams.get_wnba_teams()}
    abbr_by_full_name = {**EXPANSION_TEAM_ABBRS, **abbr_by_full_name}

    stats = leaguedashteamstats.LeagueDashTeamStats(
        season=WnbaSeason.default,
        league_id_nullable=LeagueID.wnba,
        measure_type_detailed_defense="Opponent",
        per_mode_detailed="PerGame",
        timeout=TIMEOUT,
    )
    rows = stats.get_normalized_dict().get("LeagueDashTeamStats", [])

    # Higher points allowed = more favorable matchup for bettors, same
    # semantics as the existing NBA matchupService.js.
    ranked = sorted(rows, key=lambda r: r.get("OPP_PTS") or 0, reverse=True)
    n = len(ranked)
    result = {}
    for idx, r in enumerate(ranked):
        rank = idx + 1
        bucket = "favorable" if rank <= n / 3 else "unfavorable" if rank > 2 * n / 3 else "neutral"
        name = r.get("TEAM_NAME")
        result[name] = {
            "abbreviation": abbr_by_full_name.get(name),
            "fullName": name,
            "overallRank": rank,
            "ptsAllowed": r.get("OPP_PTS"),
            "vsG": bucket,
            "vsF": bucket,
            "vsC": bucket,
        }
    _emit(result)


def main():
    if len(sys.argv) < 2:
        _fail("usage: wnba_stats.py <game-log|opponent-stats> [args]")
    command = sys.argv[1]
    try:
        if command == "game-log":
            if len(sys.argv) < 3:
                _fail("game-log requires a player name")
            cmd_game_log(sys.argv[2])
        elif command == "opponent-stats":
            cmd_opponent_stats()
        else:
            _fail(f"unknown command '{command}'")
    except Exception as e:
        _fail(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
