package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/engine"
)

var (
	activeRoundWorldGames = make(map[string]interface{})
	roundWorldMu          sync.RWMutex
)

func persistRoundWorldGameState(gameID string, state interface{}) {
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return
	}
	db.SaveGameState(gameID, string(stateJSON))
}

type CreateRoundWorldGameRequest struct {
	Players []PlayerConfig `json:"players"`
}

type RoundWorldResponse struct {
	GameID string              `json:"game_id"`
	Type   string              `json:"type"`
	State  interface{}         `json:"state"`
	Match  *db.MatchScore      `json:"match,omitempty"`
}

func CreateRoundWorldGame(w http.ResponseWriter, r *http.Request) {
	var req CreateRoundWorldGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	players := make([]*engine.RoundWorldPlayer, len(req.Players))
	for i, pc := range req.Players {
		pid := pc.PlayerID
		if pid == "" {
			pid = uuid.New().String()
		}
		pc.PlayerID = pid
		players[i] = &engine.RoundWorldPlayer{
			ID:         pid,
			Name:       pc.Name,
			IsBot:      pc.IsBot,
			Difficulty: pc.Difficulty,
		}
	}

	game := engine.NewRoundWorldGame(players)
	gameID := game.ID

	roundWorldMu.Lock()
	activeRoundWorldGames[gameID] = game
	roundWorldMu.Unlock()

	var resolvedPlayerIDs []string
	for _, pc := range req.Players {
		resolvedID := db.EnsurePlayer(pc.PlayerID, pc.Name, pc.IsBot)
		resolvedPlayerIDs = append(resolvedPlayerIDs, resolvedID)
	}

	// Create match if needed (for best-of series)
	var matchScore *db.MatchScore
	matchLength := 1 // Default to single game

	if matchLength > 1 {
		mid := uuid.New().String()
		db.CreateMatch(&db.Match{
			ID:            mid,
			Type:          "round_world",
			TotalGames:    matchLength,
			Status:        "active",
		})
		for i, pc := range req.Players {
			db.AddMatchPlayer(&db.MatchPlayer{
				ID:         uuid.New().String(),
				MatchID:    mid,
				PlayerID:   resolvedPlayerIDs[i],
				IsBot:      pc.IsBot,
				Difficulty: &pc.Difficulty,
			})
		}
		db.CreateGameInMatch(&db.Game{
			ID:             gameID,
			Type:           "round_world",
			ConfigJSON:     "",
			MatchID:        &mid,
			MatchGameIndex: 0,
		})
		matchScore, _ = db.GetMatchScore(mid)
	} else {
		db.CreateGame(&db.Game{ID: gameID, Type: "round_world"})
	}

	for i, pc := range req.Players {
		dbGP := &db.GamePlayer{
			ID:         uuid.New().String(),
			GameID:     gameID,
			PlayerID:   resolvedPlayerIDs[i],
			IsBot:      pc.IsBot,
			Difficulty: &pc.Difficulty,
		}
		db.AddGamePlayer(dbGP)
	}

	persistRoundWorldGameState(gameID, game)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(RoundWorldResponse{GameID: gameID, Type: "round_world", State: game, Match: matchScore})
}

func GetRoundWorldGame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	roundWorldMu.RLock()
	state, ok := activeRoundWorldGames[id]
	roundWorldMu.RUnlock()

	if !ok {
		// Try loading from DB
		stateJSON, err := db.LoadGameState(id)
		if err != nil || stateJSON == "" {
			http.Error(w, "game not found", http.StatusNotFound)
			return
		}
		var loaded interface{}
		if err := json.Unmarshal([]byte(stateJSON), &loaded); err != nil {
			http.Error(w, "failed to load game state", http.StatusInternalServerError)
			return
		}
		state = hydrateRoundWorldGameState(id, loaded)
		roundWorldMu.Lock()
		activeRoundWorldGames[id] = state
		roundWorldMu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func RoundWorldThrow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req ThrowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	seg, err := engine.ParseSegment(req.Segment)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	roundWorldMu.Lock()
	defer roundWorldMu.Unlock()

	state, ok := activeRoundWorldGames[id]
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	type throwResult struct {
		State   interface{}      `json:"state"`
		Error   string           `json:"error,omitempty"`
		AiTurns []*AiThrowResult `json:"ai_turns,omitempty"`
	}

	switch g := state.(type) {
	case *engine.RoundWorldGameState:
		err := g.Throw(seg)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(throwResult{Error: err.Error()})
			return
		}

		db.RecordThrow(&db.GameThrow{
			ID:           uuid.New().String(),
			GameID:       id,
			PlayerID:     g.CurrentTurnPlayer().ID,
			RoundNum:     g.Round,
			DartNum:      g.CurrentTurnPlayer().DartsUsed,
			SegmentLabel: engine.SegmentLabel(seg),
			Score:        engine.SegmentScore(seg),
		})

		result := throwResult{State: g}

		if g.IsOver {
			_, _ = db.CompleteGame(id, &g.Winner.ID)
		}

		persistRoundWorldGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	default:
		http.Error(w, "unknown game type", http.StatusInternalServerError)
	}
}

func EndRoundWorldTurn(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	roundWorldMu.Lock()
	defer roundWorldMu.Unlock()

	state, ok := activeRoundWorldGames[id]
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	type endTurnResult struct {
		State   interface{}      `json:"state"`
		AiTurns []*AiThrowResult `json:"ai_turns,omitempty"`
	}

	missSeg := engine.Segment{Type: engine.Single, Value: 0, Multiplier: 1}

	switch g := state.(type) {
	case *engine.RoundWorldGameState:
		p := g.CurrentTurnPlayer()
		
		// End turn by recording missed throws if needed
		for p.DartsUsed < 3 {
			p.DartsUsed++
			db.RecordThrow(&db.GameThrow{
				ID:           uuid.New().String(),
				GameID:       id,
				PlayerID:     p.ID,
				RoundNum:     g.Round,
				DartNum:      p.DartsUsed,
				SegmentLabel: "Miss",
				Score:        0,
			})
		}
		
		g.EndTurn()
		g.RecomputeScores()

		result := endTurnResult{State: g}

		if g.IsOver {
			_, _ = db.CompleteGame(id, &g.Winner.ID)
		}

		persistRoundWorldGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	default:
		http.Error(w, "unknown game type", http.StatusInternalServerError)
	}
}

func UndoLastRoundWorldThrow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	roundWorldMu.Lock()
	defer roundWorldMu.Unlock()

	state, ok := activeRoundWorldGames[id]
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	type undoResult struct {
		State interface{} `json:"state"`
		Error string      `json:"error,omitempty"`
	}

	switch g := state.(type) {
	case *engine.RoundWorldGameState:
		if err := g.UndoLastThrow(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(undoResult{Error: err.Error()})
			return
		}
		persistRoundWorldGameState(id, g)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(undoResult{State: g})

	default:
		http.Error(w, "unknown game type", http.StatusInternalServerError)
	}
}

func hydrateRoundWorldGameState(gameID string, raw interface{}) interface{} {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return raw
	}
	gameType, _ := m["type"].(string)

	reJSON, _ := json.Marshal(m)

	switch gameType {
	case "round_world":
		var g engine.RoundWorldGameState
		if err := json.Unmarshal(reJSON, &g); err == nil {
			return &g
		}
	}
	return raw
}

func LoadActiveRoundWorldGames() {
	games, err := db.ListIncompleteGames()
	if err != nil {
		return
	}
	for _, g := range games {
		if g.StateJSON == "" {
			continue
		}
		var raw interface{}
		if err := json.Unmarshal([]byte(g.StateJSON), &raw); err != nil {
			continue
		}
		state := hydrateRoundWorldGameState(g.ID, raw)
		roundWorldMu.Lock()
		activeRoundWorldGames[g.ID] = state
		roundWorldMu.Unlock()
	}
}