package db

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Tournament mirrors engine.TournamentState for persistence.
type Tournament struct {
	ID            string
	Name          string
	Type          string
	GameType      string
	StartingScore int
	MatchLength   int
	Status        string
	BracketJSON   string
	WinnerJSON    string
	StandingsJSON string
	CreatedAt     time.Time
}

func CreateTournament(t *Tournament) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	_, err := DB.Exec(
		`INSERT INTO tournaments (id, name, type, game_type, starting_score, match_length, status, bracket_json, winner_json, standings_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Name, t.Type, t.GameType, t.StartingScore, t.MatchLength, t.Status, t.BracketJSON, t.WinnerJSON, t.StandingsJSON, t.CreatedAt,
	)
	return err
}

func GetTournament(id string) (*Tournament, error) {
	row := DB.QueryRow(
		`SELECT id, name, type, game_type, starting_score, match_length, status, bracket_json, winner_json, standings_json, created_at
		 FROM tournaments WHERE id = ?`, id)
	t := &Tournament{}
	err := row.Scan(&t.ID, &t.Name, &t.Type, &t.GameType, &t.StartingScore, &t.MatchLength, &t.Status, &t.BracketJSON, &t.WinnerJSON, &t.StandingsJSON, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return t, nil
}

func UpdateTournament(t *Tournament) error {
	_, err := DB.Exec(
		`UPDATE tournaments SET name = ?, type = ?, game_type = ?, starting_score = ?, match_length = ?, status = ?, bracket_json = ?, winner_json = ?, standings_json = ?
		 WHERE id = ?`,
		t.Name, t.Type, t.GameType, t.StartingScore, t.MatchLength, t.Status, t.BracketJSON, t.WinnerJSON, t.StandingsJSON, t.ID,
	)
	return err
}

func ListTournaments() ([]*Tournament, error) {
	rows, err := DB.Query(
		`SELECT id, name, type, game_type, starting_score, match_length, status, bracket_json, winner_json, standings_json, created_at
		 FROM tournaments ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Tournament
	for rows.Next() {
		t := &Tournament{}
		if err := rows.Scan(&t.ID, &t.Name, &t.Type, &t.GameType, &t.StartingScore, &t.MatchLength, &t.Status, &t.BracketJSON, &t.WinnerJSON, &t.StandingsJSON, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func AddTournamentMatch(tournamentID, slotID, matchID string) error {
	_, err := DB.Exec(
		`INSERT INTO tournament_matches (tournament_id, slot_id, match_id) VALUES (?, ?, ?)
		 ON CONFLICT(tournament_id, slot_id) DO UPDATE SET match_id = excluded.match_id`,
		tournamentID, slotID, matchID)
	return err
}

func GetTournamentMatchMap(tournamentID string) (map[string]string, error) {
	rows, err := DB.Query(`SELECT slot_id, match_id FROM tournament_matches WHERE tournament_id = ?`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string]string)
	for rows.Next() {
		var slotID, matchID string
		if err := rows.Scan(&slotID, &matchID); err != nil {
			return nil, err
		}
		m[slotID] = matchID
	}
	return m, rows.Err()
}

func MustJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
