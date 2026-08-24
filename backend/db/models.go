package db

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Player struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type Game struct {
	ID             string     `json:"id"`
	Type           string     `json:"type"`
	ConfigJSON     string     `json:"config_json,omitempty"`
	StateJSON      string     `json:"state_json,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	WinnerID       *string    `json:"winner_id,omitempty"`
	MatchID        *string    `json:"match_id,omitempty"`
	MatchGameIndex int        `json:"match_game_index"`
}

type GamePlayer struct {
	ID         string  `json:"id"`
	GameID     string  `json:"game_id"`
	PlayerID   string  `json:"player_id"`
	IsBot      bool    `json:"is_bot"`
	Difficulty *string `json:"difficulty,omitempty"`
	FinalScore int     `json:"final_score"`
}

type GameThrow struct {
	ID           string    `json:"id"`
	GameID       string    `json:"game_id"`
	PlayerID     string    `json:"player_id"`
	RoundNum     int       `json:"round_num"`
	DartNum      int       `json:"dart_num"`
	SegmentLabel string    `json:"segment_label"`
	Score        int       `json:"score"`
	Timestamp    time.Time `json:"timestamp"`
}

func CreatePlayer(name string) (*Player, error) {
	var existingID string
	err := DB.QueryRow("SELECT id FROM players WHERE name = ?", name).Scan(&existingID)
	if err == nil {
		return &Player{ID: existingID, Name: name}, nil
	}
	p := &Player{
		ID:        uuid.New().String(),
		Name:      name,
		CreatedAt: time.Now(),
	}
	_, err = DB.Exec("INSERT INTO players (id, name) VALUES (?, ?)", p.ID, p.Name)
	return p, err
}

func EnsurePlayer(id, name string, isBot bool) string {
	var existingID string
	err := DB.QueryRow("SELECT id FROM players WHERE name = ?", name).Scan(&existingID)
	if err == nil {
		return existingID
	}
	if isBot {
		DB.Exec("INSERT INTO players (id, name, is_bot) VALUES (?, ?, TRUE)", id, name)
	} else {
		DB.Exec("INSERT INTO players (id, name) VALUES (?, ?)", id, name)
	}
	return id
}

func DeleteGame(id string) error {
	DB.Exec("DELETE FROM game_throws WHERE game_id = ?", id)
	DB.Exec("DELETE FROM game_players WHERE game_id = ?", id)
	_, err := DB.Exec("DELETE FROM games WHERE id = ?", id)
	return err
}

func DeleteMatch(id string) error {
	rows, err := DB.Query("SELECT id FROM games WHERE match_id = ?", id)
	if err == nil {
		for rows.Next() {
			var gid string
			if rows.Scan(&gid) == nil {
				DeleteGame(gid)
			}
		}
		rows.Close()
	}
	DB.Exec("DELETE FROM match_states WHERE match_id = ?", id)
	DB.Exec("DELETE FROM match_players WHERE match_id = ?", id)
	_, err = DB.Exec("DELETE FROM matches WHERE id = ?", id)
	return err
}

func SaveMatchState(matchID string, stateJSON string) error {
	_, err := DB.Exec(`
		INSERT INTO match_states (match_id, state_json, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(match_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
	`, matchID, stateJSON, time.Now())
	return err
}

func LoadMatchState(matchID string) (string, error) {
	var stateJSON string
	err := DB.QueryRow("SELECT state_json FROM match_states WHERE match_id = ?", matchID).Scan(&stateJSON)
	return stateJSON, err
}

func GetPlayer(id string) (*Player, error) {
	p := &Player{}
	err := DB.QueryRow("SELECT id, name, created_at FROM players WHERE id = ?", id).
		Scan(&p.ID, &p.Name, &p.CreatedAt)
	return p, err
}

func ListPlayers() ([]Player, error) {
	rows, err := DB.Query("SELECT id, name, created_at FROM players WHERE is_bot = 0 ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	players := make([]Player, 0)
	for rows.Next() {
		var p Player
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt); err != nil {
			return nil, err
		}
		players = append(players, p)
	}
	return players, nil
}

func CreateGame(g *Game) error {
	_, err := DB.Exec(
		"INSERT INTO games (id, type, config_json) VALUES (?, ?, ?)",
		g.ID, g.Type, g.ConfigJSON,
	)
	return err
}

func GetGame(id string) (*Game, error) {
	g := &Game{}
	err := DB.QueryRow(
		"SELECT id, type, config_json, state_json, created_at, completed_at, winner_id FROM games WHERE id = ?", id,
	).Scan(&g.ID, &g.Type, &g.ConfigJSON, &g.StateJSON, &g.CreatedAt, &g.CompletedAt, &g.WinnerID)
	return g, err
}

func CompleteGame(id string, winnerID *string) (*MatchScore, error) {
	var alreadyCompleted bool
	DB.QueryRow("SELECT completed_at IS NOT NULL FROM games WHERE id = ?", id).Scan(&alreadyCompleted)
	if alreadyCompleted {
		// Game already recorded; don't double-count match results
		var matchID *string
		DB.QueryRow("SELECT match_id FROM games WHERE id = ?", id).Scan(&matchID)
		if matchID != nil && *matchID != "" {
			return GetMatchScore(*matchID)
		}
		return nil, nil
	}

	now := time.Now()
	_, err := DB.Exec(
		"UPDATE games SET completed_at = ?, winner_id = ? WHERE id = ?",
		now, winnerID, id,
	)
	if err != nil {
		return nil, err
	}

	var matchID *string
	var matchGameIndex int
	DB.QueryRow("SELECT match_id, match_game_index FROM games WHERE id = ?", id).Scan(&matchID, &matchGameIndex)
	if matchID != nil && *matchID != "" && winnerID != nil {
		return RecordMatchGameResult(*matchID, *winnerID, matchGameIndex)
	}
	return nil, nil
}

func SaveGameState(id string, stateJSON string) error {
	_, err := DB.Exec("UPDATE games SET state_json = ? WHERE id = ?", stateJSON, id)
	return err
}

func LoadGameState(id string) (string, error) {
	var stateJSON string
	err := DB.QueryRow("SELECT state_json FROM games WHERE id = ?", id).Scan(&stateJSON)
	if err != nil {
		return "", err
	}
	return stateJSON, nil
}

func ListIncompleteGames() ([]Game, error) {
	rows, err := DB.Query(
		"SELECT id, type, config_json, state_json, created_at FROM games WHERE completed_at IS NULL AND state_json IS NOT NULL ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		var g Game
		if err := rows.Scan(&g.ID, &g.Type, &g.ConfigJSON, &g.StateJSON, &g.CreatedAt); err != nil {
			return nil, err
		}
		games = append(games, g)
	}
	return games, nil
}

func ListGames(limit int) ([]Game, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := DB.Query(
		"SELECT id, type, config_json, state_json, created_at, completed_at, winner_id FROM games ORDER BY created_at DESC LIMIT ?",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		var g Game
		if err := rows.Scan(&g.ID, &g.Type, &g.ConfigJSON, &g.StateJSON, &g.CreatedAt, &g.CompletedAt, &g.WinnerID); err != nil {
			return nil, err
		}
		games = append(games, g)
	}
	return games, nil
}

func AddGamePlayer(gp *GamePlayer) error {
	_, err := DB.Exec(
		"INSERT INTO game_players (id, game_id, player_id, is_bot, difficulty) VALUES (?, ?, ?, ?, ?)",
		gp.ID, gp.GameID, gp.PlayerID, gp.IsBot, gp.Difficulty,
	)
	return err
}

func GetGamePlayers(gameID string) ([]GamePlayer, error) {
	rows, err := DB.Query(
		"SELECT id, game_id, player_id, is_bot, difficulty, final_score FROM game_players WHERE game_id = ?", gameID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	players := make([]GamePlayer, 0)
	for rows.Next() {
		var gp GamePlayer
		if err := rows.Scan(&gp.ID, &gp.GameID, &gp.PlayerID, &gp.IsBot, &gp.Difficulty, &gp.FinalScore); err != nil {
			return nil, err
		}
		players = append(players, gp)
	}
	return players, nil
}

type Match struct {
	ID            string     `json:"id"`
	Type          string     `json:"type"`
	StartingScore int        `json:"starting_score"`
	TotalGames    int        `json:"total_games"`
	Status        string     `json:"status"`
	WinnerID      *string    `json:"winner_id,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

type MatchPlayer struct {
	ID         string  `json:"id"`
	MatchID    string  `json:"match_id"`
	PlayerID   string  `json:"player_id"`
	IsBot      bool    `json:"is_bot"`
	Difficulty *string `json:"difficulty,omitempty"`
}

type MatchScore struct {
	MatchID     string         `json:"match_id"`
	TotalGames  int            `json:"total_games"`
	GamesPlayed int            `json:"games_played"`
	Status      string         `json:"status"`
	WinnerID    *string        `json:"winner_id,omitempty"`
	Scores      map[string]int `json:"scores"`
}

func CreateMatch(m *Match) error {
	_, err := DB.Exec(
		"INSERT INTO matches (id, type, starting_score, total_games, status) VALUES (?, ?, ?, ?, ?)",
		m.ID, m.Type, m.StartingScore, m.TotalGames, m.Status,
	)
	return err
}

func AddMatchPlayer(mp *MatchPlayer) error {
	_, err := DB.Exec(
		"INSERT INTO match_players (id, match_id, player_id, is_bot, difficulty) VALUES (?, ?, ?, ?, ?)",
		mp.ID, mp.MatchID, mp.PlayerID, mp.IsBot, mp.Difficulty,
	)
	return err
}

func GetMatchPlayers(matchID string) ([]MatchPlayer, error) {
	rows, err := DB.Query(
		"SELECT id, match_id, player_id, is_bot, difficulty FROM match_players WHERE match_id = ?", matchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	players := make([]MatchPlayer, 0)
	for rows.Next() {
		var mp MatchPlayer
		if err := rows.Scan(&mp.ID, &mp.MatchID, &mp.PlayerID, &mp.IsBot, &mp.Difficulty); err != nil {
			return nil, err
		}
		players = append(players, mp)
	}
	return players, nil
}

func CreateGameInMatch(g *Game) error {
	_, err := DB.Exec(
		"INSERT INTO games (id, type, config_json, match_id, match_game_index) VALUES (?, ?, ?, ?, ?)",
		g.ID, g.Type, g.ConfigJSON, g.MatchID, g.MatchGameIndex,
	)
	return err
}

func GetMatch(matchID string) (*Match, error) {
	m := &Match{}
	err := DB.QueryRow(
		"SELECT id, type, starting_score, total_games, status, winner_id, created_at, completed_at FROM matches WHERE id = ?", matchID,
	).Scan(&m.ID, &m.Type, &m.StartingScore, &m.TotalGames, &m.Status, &m.WinnerID, &m.CreatedAt, &m.CompletedAt)
	return m, err
}

func GetMatchScore(matchID string) (*MatchScore, error) {
	m, err := GetMatch(matchID)
	if err != nil {
		return nil, err
	}

	rows, err := DB.Query(
		"SELECT winner_id FROM games WHERE match_id = ? AND completed_at IS NOT NULL AND winner_id IS NOT NULL",
		matchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	scores := make(map[string]int)
	gamesPlayed := 0
	for rows.Next() {
		var winnerID string
		if err := rows.Scan(&winnerID); err != nil {
			continue
		}
		scores[winnerID]++
		gamesPlayed++
	}

	return &MatchScore{
		MatchID:     m.ID,
		TotalGames:  m.TotalGames,
		GamesPlayed: gamesPlayed,
		Status:      m.Status,
		WinnerID:    m.WinnerID,
		Scores:      scores,
	}, nil
}

func RecordMatchGameResult(matchID string, winnerID string, gameIndex int) (*MatchScore, error) {
	m, err := GetMatch(matchID)
	if err != nil {
		return nil, err
	}

	score, err := GetMatchScore(matchID)
	if err != nil {
		return nil, err
	}
	score.Scores[winnerID]++
	score.GamesPlayed++

	needed := m.TotalGames/2 + 1
	if score.Scores[winnerID] >= needed {
		now := time.Now()
		_, err := DB.Exec(
			"UPDATE matches SET status = 'completed', winner_id = ?, completed_at = ? WHERE id = ?",
			winnerID, now, matchID,
		)
		if err != nil {
			return nil, err
		}
		score.Status = "completed"
		score.WinnerID = &winnerID
	}

	return score, nil
}

func GetLatestMatchGame(matchID string) (*Game, error) {
	g := &Game{}
	err := DB.QueryRow(
		"SELECT id, type, config_json, state_json, created_at, completed_at, winner_id, match_id, match_game_index FROM games WHERE match_id = ? ORDER BY match_game_index DESC LIMIT 1",
		matchID,
	).Scan(&g.ID, &g.Type, &g.ConfigJSON, &g.StateJSON, &g.CreatedAt, &g.CompletedAt, &g.WinnerID, &g.MatchID, &g.MatchGameIndex)
	if err != nil {
		return nil, err
	}
	return g, nil
}

func RecordThrow(t *GameThrow) error {
	_, err := DB.Exec(
		"INSERT INTO game_throws (id, game_id, player_id, round_num, dart_num, segment_label, score) VALUES (?, ?, ?, ?, ?, ?, ?)",
		t.ID, t.GameID, t.PlayerID, t.RoundNum, t.DartNum, t.SegmentLabel, t.Score,
	)
	return err
}

func GetGameThrows(gameID string) ([]GameThrow, error) {
	rows, err := DB.Query(
		"SELECT id, game_id, player_id, round_num, dart_num, segment_label, score, timestamp FROM game_throws WHERE game_id = ? ORDER BY round_num, dart_num",
		gameID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	throws := make([]GameThrow, 0)
	for rows.Next() {
		var t GameThrow
		if err := rows.Scan(&t.ID, &t.GameID, &t.PlayerID, &t.RoundNum, &t.DartNum, &t.SegmentLabel, &t.Score, &t.Timestamp); err != nil {
			return nil, err
		}
		throws = append(throws, t)
	}
	return throws, nil
}

func GetPlayerLifetimeStats(playerID string, gameType string) (map[string]interface{}, error) {
	typeJoin := ""
	typeWhere := ""
	var args []interface{}
	args = append(args, playerID)
	if gameType != "" && gameType != "all" {
		typeJoin = "JOIN games g ON g.id = gp.game_id"
		typeWhere = "AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		args = append(args, gameType)
	}

	gamesPlayed := 0
	gamesWon := 0
	totalThrows := 0

	gpQuery := "SELECT COUNT(*) FROM game_players gp"
	if typeJoin != "" {
		gpQuery += " " + typeJoin
	}
	gpQuery += " WHERE gp.player_id = ? " + typeWhere
	DB.QueryRow(gpQuery, args...).Scan(&gamesPlayed)

	gwQuery := "SELECT COUNT(*) FROM games WHERE winner_id = ?"
	var gwArgs []interface{}
	gwArgs = append(gwArgs, playerID)
	if gameType != "" && gameType != "all" {
		gwQuery += " AND (CASE WHEN type = 'x01' THEN COALESCE(CAST(CAST(json_extract(state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(type)) = ?"
		gwArgs = append(gwArgs, gameType)
	}
	DB.QueryRow(gwQuery, gwArgs...).Scan(&gamesWon)

	throwQuery := "SELECT COUNT(*) FROM game_throws gt JOIN games g ON g.id = gt.game_id WHERE gt.player_id = ? AND gt.segment_label != 'UNK'"
	var throwArgs []interface{}
	throwArgs = append(throwArgs, playerID)
	if gameType != "" && gameType != "all" {
		throwQuery += " AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		throwArgs = append(throwArgs, gameType)
	}
	DB.QueryRow(throwQuery, throwArgs...).Scan(&totalThrows)

	segQuery := "SELECT gt.segment_label, COUNT(*) as cnt FROM game_throws gt JOIN games g ON g.id = gt.game_id WHERE gt.player_id = ?"
	var segArgs []interface{}
	segArgs = append(segArgs, playerID)
	if gameType != "" && gameType != "all" {
		segQuery += " AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		segArgs = append(segArgs, gameType)
	}
	segQuery += " GROUP BY gt.segment_label ORDER BY cnt DESC"

	rows, err := DB.Query(segQuery, segArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	segmentHits := make(map[string]int)
	for rows.Next() {
		var label string
		var cnt int
		if err := rows.Scan(&label, &cnt); err != nil {
			return nil, err
		}
		segmentHits[label] = cnt
	}

	// Total rounds played = sum of max round_num per game
	roundsQuery := "SELECT COALESCE(SUM(max_round), 0) FROM (SELECT MAX(gt.round_num) as max_round FROM game_throws gt JOIN games g ON g.id = gt.game_id WHERE gt.player_id = ?"
	var roundsArgs []interface{}
	roundsArgs = append(roundsArgs, playerID)
	if gameType != "" && gameType != "all" {
		roundsQuery += " AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		roundsArgs = append(roundsArgs, gameType)
	}
	roundsQuery += " GROUP BY gt.game_id)"

	totalRounds := 0
	DB.QueryRow(roundsQuery, roundsArgs...).Scan(&totalRounds)

	avgRoundsPerGame := 0.0
	avgDartsPerGame := 0.0
	if gamesPlayed > 0 {
		avgRoundsPerGame = float64(totalRounds) / float64(gamesPlayed)
		avgDartsPerGame = float64(totalThrows) / float64(gamesPlayed)
	}

	return map[string]interface{}{
		"player_id":           playerID,
		"games_played":        gamesPlayed,
		"games_won":           gamesWon,
		"total_throws":        totalThrows,
		"total_rounds":        totalRounds,
		"avg_rounds_per_game": avgRoundsPerGame,
		"avg_darts_per_game":  avgDartsPerGame,
		"segment_hits":        segmentHits,
	}, nil
}

type historyGameState struct {
	Type          string          `json:"type"`
	StartingScore int             `json:"starting_score"`
	Players       []historyPlayer `json:"players"`
}

type historyPlayer struct {
	ID        string         `json:"id"`
	History   []historyThrow `json:"history"`
	TurnDarts []historyThrow `json:"turn_darts"`
}

type historyThrow struct {
	Segment struct {
		Type       int    `json:"type"`
		Value      int    `json:"value"`
		Multiplier int    `json:"multiplier"`
		RawLabel   string `json:"raw_label"`
	} `json:"segment"`
	Label string `json:"label"`
}

func GetPlayerHeatmapFromHistory(playerID string, gameType string) (map[string]int, error) {
	rows, err := DB.Query(`
		SELECT g.state_json FROM games g
		JOIN game_players gp ON gp.game_id = g.id
		WHERE gp.player_id = ? AND g.state_json IS NOT NULL AND g.state_json != ''
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	heatmap := make(map[string]int)
	for rows.Next() {
		var stateJSON string
		if err := rows.Scan(&stateJSON); err != nil {
			continue
		}

		var state historyGameState
		if err := json.Unmarshal([]byte(stateJSON), &state); err != nil {
			continue
		}

		displayType := strings.ToUpper(state.Type)
		if state.Type == "x01" {
			if state.StartingScore > 0 {
				displayType = fmt.Sprintf("%d X01", state.StartingScore)
			} else {
				displayType = "X01"
			}
		}
		if gameType != "" && gameType != "all" && displayType != gameType {
			continue
		}

		for _, p := range state.Players {
			if p.ID != playerID {
				continue
			}
			throws := append(p.History, p.TurnDarts...)
			for _, t := range throws {
				label := t.Label
				if t.Segment.Type == 0 && t.Segment.Value > 0 && t.Segment.Value != 25 {
					if t.Segment.RawLabel != "" {
						label = t.Segment.RawLabel
					}
				}
				if label == "" {
					label = t.Label
				}
				heatmap[label]++
			}
		}
	}

	return heatmap, nil
}

func marksFromLabel(label string) int {
	if len(label) == 0 {
		return 0
	}
	// Miss / not-applicable darts are not marks
	if label == "Miss" || label == "UNK" {
		return 0
	}
	// Bullseye
	if label == "DB" {
		return 2
	}
	// Outer bull
	if label == "SB" {
		return 1
	}
	// Triple
	if label[0] == 'T' {
		return 3
	}
	// Double - not a mark in cricket (unless bull)
	if label[0] == 'D' {
		return 0
	}
	// Single (plain number or S-prefixed)
	return 1
}

type DifficultyStats struct {
	Difficulty  string  `json:"difficulty"`
	GamesPlayed int     `json:"games_played"`
	GamesWon    int     `json:"games_won"`
	WinRate     float64 `json:"win_rate"`
	AvgScore    float64 `json:"avg_score"`
	MPR         float64 `json:"mpr"`
}

func GetPlayerDifficultyStats(playerID string) ([]DifficultyStats, error) {
	// Get basic stats per difficulty
	rows, err := DB.Query(`
		SELECT
			COALESCE(gp_bot.difficulty, 'unknown') as difficulty,
			COUNT(*) as games_played,
			SUM(CASE WHEN g.winner_id = gp_human.player_id THEN 1 ELSE 0 END) as games_won,
			COALESCE(AVG(gp_human.final_score), 0) as avg_score
		FROM game_players gp_human
		JOIN games g ON g.id = gp_human.game_id
		JOIN game_players gp_bot ON gp_bot.game_id = g.id AND gp_bot.is_bot = 1
		WHERE gp_human.player_id = ? AND gp_human.is_bot = 0
		GROUP BY gp_bot.difficulty
		ORDER BY gp_bot.difficulty
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]DifficultyStats, 0)
	for rows.Next() {
		var d DifficultyStats
		if err := rows.Scan(&d.Difficulty, &d.GamesPlayed, &d.GamesWon, &d.AvgScore); err != nil {
			return nil, err
		}
		if d.GamesPlayed > 0 {
			d.WinRate = float64(d.GamesWon) / float64(d.GamesPlayed) * 100
		}
		results = append(results, d)
	}

	// Compute MPR per difficulty for cricket games
	for i := range results {
		gameRows, err := DB.Query(`
			SELECT g.id FROM games g
			JOIN game_players gp_human ON gp_human.game_id = g.id
			JOIN game_players gp_bot ON gp_bot.game_id = g.id AND gp_bot.is_bot = 1
			WHERE gp_human.player_id = ? AND gp_human.is_bot = 0
				AND g.type = 'cricket' AND gp_bot.difficulty = ?
		`, playerID, results[i].Difficulty)
		if err != nil {
			continue
		}

		totalMarks := 0
		totalRounds := 0
		for gameRows.Next() {
			var gid string
			if err := gameRows.Scan(&gid); err != nil {
				continue
			}
			var maxRound int
			DB.QueryRow("SELECT COALESCE(MAX(round_num), 0) FROM game_throws WHERE game_id = ? AND player_id = ?", gid, playerID).Scan(&maxRound)
			totalRounds += maxRound

			throwRows, err := DB.Query("SELECT segment_label FROM game_throws WHERE game_id = ? AND player_id = ?", gid, playerID)
			if err != nil {
				continue
			}
			for throwRows.Next() {
				var label string
				if err := throwRows.Scan(&label); err != nil {
					continue
				}
				totalMarks += marksFromLabel(label)
			}
			throwRows.Close()
		}
		gameRows.Close()

		if totalRounds > 0 {
			results[i].MPR = float64(totalMarks) / float64(totalRounds)
		}
	}

	return results, nil
}

func GetPlayerLifetimeMPR(playerID string, gameType string) (float64, error) {
	// MPR only applies to cricket games; "all" or "cricket" filter keeps existing behavior
	if gameType != "" && gameType != "all" && !strings.EqualFold(gameType, "CRICKET") {
		return 0, nil
	}

	// Get all cricket game IDs this player participated in
	gameRows, err := DB.Query(`
		SELECT g.id FROM games g
		JOIN game_players gp ON gp.game_id = g.id
		WHERE gp.player_id = ? AND g.type = 'cricket'
	`, playerID)
	if err != nil {
		return 0, err
	}
	defer gameRows.Close()

	var gameIDs []string
	for gameRows.Next() {
		var gid string
		if err := gameRows.Scan(&gid); err != nil {
			return 0, err
		}
		gameIDs = append(gameIDs, gid)
	}

	if len(gameIDs) == 0 {
		return 0, nil
	}

	totalMarks := 0
	totalRounds := 0

	for _, gid := range gameIDs {
		// Get max round for this game (rounds played)
		var maxRound int
		DB.QueryRow("SELECT COALESCE(MAX(round_num), 0) FROM game_throws WHERE game_id = ? AND player_id = ?", gid, playerID).Scan(&maxRound)
		totalRounds += maxRound

		// Get marks from all throws in this game
		throwRows, err := DB.Query(
			"SELECT segment_label FROM game_throws WHERE game_id = ? AND player_id = ?",
			gid, playerID,
		)
		if err != nil {
			continue
		}
		for throwRows.Next() {
			var label string
			if err := throwRows.Scan(&label); err != nil {
				continue
			}
			totalMarks += marksFromLabel(label)
		}
		throwRows.Close()
	}

	if totalRounds == 0 {
		return 0, nil
	}
	return float64(totalMarks) / float64(totalRounds), nil
}

func DeletePlayer(id string) error {
	DB.Exec("DELETE FROM game_throws WHERE player_id = ?", id)
	DB.Exec("UPDATE game_throws SET player_id = NULL WHERE player_id = ?", id)
	DB.Exec("DELETE FROM game_players WHERE player_id = ?", id)
	DB.Exec("UPDATE games SET winner_id = NULL WHERE winner_id = ?", id)
	_, err := DB.Exec("DELETE FROM players WHERE id = ?", id)
	return err
}

func ResetPlayerStats(id string) error {
	DB.Exec("DELETE FROM game_throws WHERE player_id = ?", id)
	DB.Exec("DELETE FROM game_players WHERE player_id = ?", id)
	DB.Exec("UPDATE games SET winner_id = NULL WHERE winner_id = ?", id)
	return nil
}

type WinMatrixEntry struct {
	Opponent    string `json:"opponent"`
	GameType    string `json:"game_type"`
	Wins        int    `json:"wins"`
	Losses      int    `json:"losses"`
	TotalGames  int    `json:"total_games"`
	TotalThrows int    `json:"total_throws"`
	TotalRounds int    `json:"total_rounds"`
}

type TimelineEntry struct {
	GameID   string `json:"game_id"`
	Date     string `json:"date"`
	Won      bool   `json:"won"`
	Rounds   int    `json:"rounds"`
	Throws   int    `json:"throws"`
	Opponent string `json:"opponent"`
}

func GetPlayerTimeline(playerID string, gameType string) ([]TimelineEntry, error) {
	query := `
		SELECT
			g.id,
			g.created_at,
			g.winner_id = ? AS won,
			COALESCE(MAX(gt.round_num), 0) AS rounds,
			COUNT(gt.id) AS throws,
			COALESCE(GROUP_CONCAT(opp.name, ', '), 'Unknown') AS opponent
		FROM games g
		JOIN game_players gp ON gp.game_id = g.id
		LEFT JOIN game_throws gt ON gt.game_id = g.id AND gt.player_id = ?
		LEFT JOIN game_players opp_gp ON opp_gp.game_id = g.id AND opp_gp.player_id != ?
		LEFT JOIN players opp ON opp.id = opp_gp.player_id
		WHERE gp.player_id = ?
	`
	args := []interface{}{playerID, playerID, playerID, playerID}
	if gameType != "" && gameType != "all" {
		query += " AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		args = append(args, gameType)
	}
	query += " GROUP BY g.id ORDER BY g.created_at ASC"

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]TimelineEntry, 0)
	for rows.Next() {
		var e TimelineEntry
		var won int
		if err := rows.Scan(&e.GameID, &e.Date, &won, &e.Rounds, &e.Throws, &e.Opponent); err != nil {
			continue
		}
		e.Won = won == 1
		results = append(results, e)
	}
	return results, nil
}

func GetPlayerWinsMatrix(playerID string, gameType string) ([]WinMatrixEntry, error) {
	query := `
		SELECT
			opp.name AS opponent,
			CASE
				WHEN g.type = 'x01' THEN COALESCE(
					CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT),
					'X01'
				) || ' '
				ELSE ''
			END || UPPER(g.type) AS game_type,
			SUM(CASE WHEN g.winner_id = ? THEN 1 ELSE 0 END) AS wins,
			SUM(CASE WHEN g.winner_id != ? OR g.winner_id IS NULL THEN 1 ELSE 0 END) AS losses,
			COUNT(*) AS total_games,
			COALESCE(SUM(gt_summary.throws), 0) AS total_throws,
			COALESCE(SUM(gt_summary.rounds), 0) AS total_rounds
		FROM game_players gp
		JOIN games g ON g.id = gp.game_id
		JOIN game_players opp_gp ON opp_gp.game_id = g.id AND opp_gp.player_id != ?
		JOIN players opp ON opp.id = opp_gp.player_id
		LEFT JOIN (
			SELECT game_id, player_id, COUNT(*) AS throws, MAX(round_num) AS rounds
			FROM game_throws
			WHERE segment_label != 'UNK'
			GROUP BY game_id, player_id
		) gt_summary ON gt_summary.game_id = g.id AND gt_summary.player_id = gp.player_id
		WHERE gp.player_id = ?
	`
	args := []interface{}{playerID, playerID, playerID, playerID}
	if gameType != "" && gameType != "all" {
		query += " AND (CASE WHEN g.type = 'x01' THEN COALESCE(CAST(CAST(json_extract(g.state_json, '$.starting_score') AS INTEGER) AS TEXT), 'X01') || ' ' ELSE '' END || UPPER(g.type)) = ?"
		args = append(args, gameType)
	}
	query += " GROUP BY opp.name, game_type ORDER BY opp.name, game_type"

	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]WinMatrixEntry, 0)
	for rows.Next() {
		var e WinMatrixEntry
		if err := rows.Scan(&e.Opponent, &e.GameType, &e.Wins, &e.Losses, &e.TotalGames, &e.TotalThrows, &e.TotalRounds); err != nil {
			continue
		}
		results = append(results, e)
	}
	return results, nil
}
