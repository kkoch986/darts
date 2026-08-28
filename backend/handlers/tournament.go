package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/engine"
)

var (
	activeTournaments = make(map[string]*engine.TournamentState)
	tournamentMu      sync.RWMutex
)

type TournamentPlayerConfig struct {
	ID         string `json:"id,omitempty"`
	Name       string `json:"name"`
	IsBot      bool   `json:"is_bot"`
	Difficulty string `json:"difficulty,omitempty"`
}

type CreateTournamentRequest struct {
	Name          string                   `json:"name"`
	Type          string                   `json:"type"`
	GameType      string                   `json:"game_type"`
	StartingScore int                      `json:"starting_score"`
	MatchLength   int                      `json:"match_length"`
	Players       []TournamentPlayerConfig `json:"players"`
}

type TournamentResponse struct {
	*engine.TournamentState
}

// CreateTournament builds a tournament and starts any ready first-round matches.
func CreateTournament(w http.ResponseWriter, r *http.Request) {
	var req CreateTournamentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type != "single_elimination" && req.Type != "round_robin" && req.Type != "double_elimination" {
		http.Error(w, "tournament type must be 'single_elimination', 'round_robin', or 'double_elimination'", http.StatusBadRequest)
		return
	}
	if req.GameType != "x01" && req.GameType != "cricket" {
		http.Error(w, "game_type must be 'x01' or 'cricket'", http.StatusBadRequest)
		return
	}
	if len(req.Players) < 2 {
		http.Error(w, "tournament needs at least 2 players", http.StatusBadRequest)
		return
	}

	entrants := make([]*engine.TournamentPlayer, len(req.Players))
	for i, p := range req.Players {
		pid := p.ID
		if pid == "" {
			pid = uuid.New().String()
		}
		entrants[i] = &engine.TournamentPlayer{
			ID:         db.EnsurePlayer(pid, p.Name, p.IsBot),
			Name:       p.Name,
			IsBot:      p.IsBot,
			Difficulty: p.Difficulty,
			Seed:       i + 1,
		}
	}

	if req.GameType == "x01" && req.StartingScore == 0 {
		req.StartingScore = 501
	}
	if req.MatchLength != 3 && req.MatchLength != 5 && req.MatchLength != 7 {
		req.MatchLength = 1
	}

	var tournament *engine.TournamentState
	switch req.Type {
	case "single_elimination":
		tournament = engine.NewSingleEliminationTournament(req.Name, req.GameType, req.StartingScore, req.MatchLength, entrants)
	case "round_robin":
		tournament = engine.NewRoundRobinTournament(req.Name, req.GameType, req.StartingScore, req.MatchLength, entrants)
	case "double_elimination":
		tournament = engine.NewDoubleEliminationTournament(req.Name, req.GameType, req.StartingScore, req.MatchLength, entrants)
	default:
		http.Error(w, "unknown tournament type", http.StatusBadRequest)
		return
	}

	bracketJSON := db.MustJSON(tournament.Bracket)
	if err := db.CreateTournament(&db.Tournament{
		ID:            tournament.ID,
		Name:          tournament.Name,
		Type:          tournament.Type,
		GameType:      tournament.GameType,
		StartingScore: tournament.StartingScore,
		MatchLength:   tournament.MatchLength,
		Status:        tournament.Status,
		BracketJSON:   bracketJSON,
		CreatedAt:     tournament.CreatedAt,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := createReadyMatches(tournament); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	tournamentMu.Lock()
	activeTournaments[tournament.ID] = tournament
	tournamentMu.Unlock()

	persistTournament(tournament)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TournamentResponse{TournamentState: tournament})
}

// GetTournament returns a tournament with current bracket and match links.
func GetTournament(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tournament, err := loadTournamentFromDB(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tournament == nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TournamentResponse{TournamentState: tournament})
}

// ListTournaments returns all tournaments, newest first.
func ListTournaments(w http.ResponseWriter, r *http.Request) {
	rows, err := db.ListTournaments()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var out []*engine.TournamentState
	for _, row := range rows {
		t, err := unmarshalTournament(row)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// UpdateTournamentAfterMatch is called when a match that belongs to a tournament completes.
func UpdateTournamentAfterMatch(matchID string) error {
	var tournamentID, slotID string
	row := db.DB.QueryRow(`SELECT tournament_id, slot_id FROM tournament_matches WHERE match_id = ?`, matchID)
	if err := row.Scan(&tournamentID, &slotID); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}

	tournament, err := loadTournamentFromDB(tournamentID)
	if err != nil {
		return err
	}
	if tournament == nil {
		return fmt.Errorf("tournament %s not found", tournamentID)
	}

	match, err := loadMatchFromDB(matchID)
	if err != nil {
		return err
	}
	if match == nil || match.WinnerID == nil {
		return nil
	}

	var slot *engine.BracketSlot
	for _, s := range tournament.Bracket {
		if s.ID == slotID {
			slot = s
			break
		}
	}
	if slot == nil {
		return fmt.Errorf("slot %s not found in tournament %s", slotID, tournamentID)
	}

	var winner *engine.TournamentPlayer
	if slot.Player1 != nil && slot.Player1.ID == *match.WinnerID {
		winner = slot.Player1
	} else if slot.Player2 != nil && slot.Player2.ID == *match.WinnerID {
		winner = slot.Player2
	}
	if winner == nil {
		return fmt.Errorf("winner %s not found in slot %s", *match.WinnerID, slotID)
	}

	tournament.AdvanceWinner(slot.ID, winner)
	if err := createReadyMatches(tournament); err != nil {
		return err
	}
	return persistTournament(tournament)
}

func createReadyMatches(tournament *engine.TournamentState) error {
	for _, slot := range tournament.ReadySlots() {
		req := CreateMatchRequest{
			Type:          tournament.GameType,
			StartingScore: tournament.StartingScore,
			MatchLength:   tournament.MatchLength,
			Players: []PlayerConfig{
				{PlayerID: slot.Player1.ID, Name: slot.Player1.Name, IsBot: slot.Player1.IsBot, Difficulty: slot.Player1.Difficulty},
				{PlayerID: slot.Player2.ID, Name: slot.Player2.Name, IsBot: slot.Player2.IsBot, Difficulty: slot.Player2.Difficulty},
			},
		}
		match, err := createMatchInternal(req)
		if err != nil {
			return err
		}
		tournament.AssignMatch(slot.ID, match.ID)
		if err := db.AddTournamentMatch(tournament.ID, slot.ID, match.ID); err != nil {
			return err
		}
	}
	return nil
}

func persistTournament(tournament *engine.TournamentState) error {
	row, err := db.GetTournament(tournament.ID)
	if err != nil {
		return err
	}
	if row == nil {
		return fmt.Errorf("tournament %s not found", tournament.ID)
	}
	row.Status = tournament.Status
	row.BracketJSON = db.MustJSON(tournament.Bracket)
	if tournament.Winner != nil {
		row.WinnerJSON = db.MustJSON(tournament.Winner)
	}
	if tournament.Standings != nil {
		row.StandingsJSON = db.MustJSON(tournament.Standings)
	}
	return db.UpdateTournament(row)
}

func loadTournamentFromDB(id string) (*engine.TournamentState, error) {
	row, err := db.GetTournament(id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, nil
	}
	return unmarshalTournament(row)
}

func unmarshalTournament(row *db.Tournament) (*engine.TournamentState, error) {
	t := &engine.TournamentState{
		ID:            row.ID,
		Name:          row.Name,
		Type:          row.Type,
		GameType:      row.GameType,
		StartingScore: row.StartingScore,
		MatchLength:   row.MatchLength,
		Status:        row.Status,
		CreatedAt:     row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.BracketJSON), &t.Bracket); err != nil {
		return nil, err
	}
	if row.WinnerJSON != "" {
		json.Unmarshal([]byte(row.WinnerJSON), &t.Winner)
	}
	if row.StandingsJSON != "" {
		json.Unmarshal([]byte(row.StandingsJSON), &t.Standings)
	}

	matchMap, err := db.GetTournamentMatchMap(row.ID)
	if err != nil {
		return nil, err
	}
	for _, s := range t.Bracket {
		if mid, ok := matchMap[s.ID]; ok {
			s.MatchID = mid
			if s.Status == "pending" {
				s.Status = "active"
			}
		}
	}

	playerMap := make(map[string]*engine.TournamentPlayer)
	for _, s := range t.Bracket {
		if s.Player1 != nil {
			playerMap[s.Player1.ID] = s.Player1
		}
		if s.Player2 != nil {
			playerMap[s.Player2.ID] = s.Player2
		}
		if s.Winner != nil {
			playerMap[s.Winner.ID] = s.Winner
		}
	}
	t.Players = make([]*engine.TournamentPlayer, 0, len(playerMap))
	for _, p := range playerMap {
		t.Players = append(t.Players, p)
	}
	return t, nil
}
