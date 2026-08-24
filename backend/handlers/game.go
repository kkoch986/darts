package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/engine"
)

var (
	activeGames = make(map[string]interface{})
	gameMu      sync.RWMutex
)

func persistGameState(gameID string, state interface{}) {
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return
	}
	db.SaveGameState(gameID, string(stateJSON))
}

type CreateGameRequest struct {
	Type          string         `json:"type"`
	StartingScore int            `json:"starting_score,omitempty"`
	Players       []PlayerConfig `json:"players"`
	MatchLength   int            `json:"match_length,omitempty"`
}

type PlayerConfig struct {
	Name       string `json:"name"`
	PlayerID   string `json:"player_id,omitempty"`
	IsBot      bool   `json:"is_bot"`
	Difficulty string `json:"difficulty,omitempty"`
}

type ThrowRequest struct {
	Segment string `json:"segment"`
}

type GameResponse struct {
	GameID string         `json:"game_id"`
	Type   string         `json:"type"`
	State  interface{}    `json:"state"`
	Match  *db.MatchScore `json:"match,omitempty"`
}

func CreateGame(w http.ResponseWriter, r *http.Request) {
	var req CreateGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type != "x01" && req.Type != "cricket" {
		http.Error(w, "game type must be 'x01' or 'cricket'", http.StatusBadRequest)
		return
	}

	matchLength := req.MatchLength
	if matchLength != 1 && matchLength != 3 && matchLength != 5 && matchLength != 7 {
		matchLength = 1
	}

	var state interface{}
	gameID := ""

	switch req.Type {
	case "x01":
		players := make([]*engine.X01Player, len(req.Players))
		for i, pc := range req.Players {
			pid := pc.PlayerID
			if pid == "" {
				pid = uuid.New().String()
			}
			pc.PlayerID = pid
			players[i] = &engine.X01Player{
				ID:         pid,
				Name:       pc.Name,
				IsBot:      pc.IsBot,
				Difficulty: pc.Difficulty,
			}
		}
		startScore := req.StartingScore
		if startScore == 0 {
			startScore = 501
		}
		game := engine.NewX01Game(engine.X01Config{StartingScore: startScore}, players)
		gameID = game.ID
		state = game

	case "cricket":
		players := make([]*engine.CricketPlayer, len(req.Players))
		for i, pc := range req.Players {
			pid := pc.PlayerID
			if pid == "" {
				pid = uuid.New().String()
			}
			pc.PlayerID = pid
			players[i] = &engine.CricketPlayer{
				ID:         pid,
				Name:       pc.Name,
				IsBot:      pc.IsBot,
				Difficulty: pc.Difficulty,
			}
		}
		game := engine.NewCricketGame(players)
		gameID = game.ID
		state = game
	}

	gameMu.Lock()
	activeGames[gameID] = state
	gameMu.Unlock()

	var resolvedPlayerIDs []string
	for _, pc := range req.Players {
		resolvedID := db.EnsurePlayer(pc.PlayerID, pc.Name, pc.IsBot)
		resolvedPlayerIDs = append(resolvedPlayerIDs, resolvedID)
	}

	// Create match if best-of series
	var matchScore *db.MatchScore
	if matchLength > 1 {
		mid := uuid.New().String()
		db.CreateMatch(&db.Match{
			ID:            mid,
			Type:          req.Type,
			StartingScore: req.StartingScore,
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
			Type:           req.Type,
			ConfigJSON:     "",
			MatchID:        &mid,
			MatchGameIndex: 0,
		})
		matchScore, _ = db.GetMatchScore(mid)
	} else {
		db.CreateGame(&db.Game{ID: gameID, Type: req.Type})
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

	persistGameState(gameID, state)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GameResponse{GameID: gameID, Type: req.Type, State: state, Match: matchScore})
}

func GetGame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	gameMu.RLock()
	state, ok := activeGames[id]
	gameMu.RUnlock()

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
		state = hydrateGameState(id, loaded)
		gameMu.Lock()
		activeGames[id] = state
		gameMu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

func Throw(w http.ResponseWriter, r *http.Request) {
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

	gameMu.Lock()
	defer gameMu.Unlock()

	state, ok := activeGames[id]
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
	case *engine.X01GameState:
		err := g.Throw(seg)
		if err != nil {
			// If bust, auto-end the turn
			if g.CurrentTurnPlayer().Busted {
				g.EndTurn()
				g.RecomputeScores()
				persistGameState(id, g)

				result := throwResult{State: g, Error: err.Error()}
				if g.CurrentTurnPlayer().IsBot && !g.IsOver {
					aiTurns := playBotTurnsX01(g)
					result.AiTurns = aiTurns
					if g.IsOver {
						_, _ = db.CompleteGame(id, &g.Winner.ID)
					}
					persistGameState(id, g)
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(result)
				return
			}
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

		persistGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	case *engine.CricketGameState:
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

		persistGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	default:
		http.Error(w, "unknown game type", http.StatusInternalServerError)
	}
}

type AiThrowResult struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
	Aim      string `json:"aim"`
	Segment  string `json:"segment"`
	Score    int    `json:"score"`
	Error    string `json:"error,omitempty"`
}

func EndTurn(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	gameMu.Lock()
	defer gameMu.Unlock()

	state, ok := activeGames[id]
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
	case *engine.X01GameState:
		p := g.CurrentTurnPlayer()
		for p.DartsUsed < 3 {
			g.Throw(missSeg)
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
		if stats, ok := g.Stats[p.ID]; ok {
			stats.RecordTurnEnd(p.TurnScore)
		}
		g.EndTurn()
		g.RecomputeScores()

		result := endTurnResult{State: g}

		if g.CurrentTurnPlayer().IsBot {
			aiTurns := playBotTurnsX01(g)
			result.AiTurns = aiTurns
			if g.IsOver {
				_, _ = db.CompleteGame(id, &g.Winner.ID)
			}
		}

		persistGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	case *engine.CricketGameState:
		p := g.CurrentTurnPlayer()
		for p.DartsUsed < 3 {
			p.DartsUsed++
			record := engine.ThrowRecord{
				Segment: engine.Segment{Type: engine.Single, Value: 0, Multiplier: 1},
				Label:   "UNK",
				Score:   0,
				Round:   g.Round,
				DartNum: p.DartsUsed,
			}
			p.TurnDarts = append(p.TurnDarts, record)
			if stats, ok := g.Stats[p.ID]; ok {
				stats.SegmentHits["UNK"]++
			}
			db.RecordThrow(&db.GameThrow{
				ID:           uuid.New().String(),
				GameID:       id,
				PlayerID:     p.ID,
				RoundNum:     g.Round,
				DartNum:      p.DartsUsed,
				SegmentLabel: "UNK",
				Score:        0,
			})
		}
		g.EndTurn()
		g.RecomputeScores()

		result := endTurnResult{State: g}

		if g.CurrentTurnPlayer().IsBot {
			aiTurns := playBotTurnsCricket(g)
			result.AiTurns = aiTurns
			if g.IsOver {
				_, _ = db.CompleteGame(id, &g.Winner.ID)
			}
		}

		persistGameState(id, g)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func playBotTurnsX01(g *engine.X01GameState) []*AiThrowResult {
	p := g.CurrentTurnPlayer()
	opp := engine.NewOpponent(p.Name, engine.Persona(p.Difficulty))
	var results []*AiThrowResult

	for i := 0; i < 3; i++ {
		if g.IsOver {
			break
		}
		botRes := opp.ThrowX01(p.Score)
		err := g.Throw(botRes.Segment)

		results = append(results, &AiThrowResult{
			PlayerID: p.ID,
			Name:     p.Name,
			Aim:      botRes.AimLabel,
			Segment:  engine.SegmentLabel(botRes.Segment),
			Score:    engine.SegmentScore(botRes.Segment),
		})

		if err != nil {
			results[len(results)-1].Error = err.Error()
			break
		}
	}

	if !g.IsOver {
		stats := g.Stats[p.ID]
		stats.RecordTurnEnd(p.TurnScore)
		g.EndTurn()
		g.RecomputeScores()
	}

	return results
}

func playBotTurnsCricket(g *engine.CricketGameState) []*AiThrowResult {
	p := g.CurrentTurnPlayer()
	opp := engine.NewOpponent(p.Name, engine.Persona(p.Difficulty))

	var openTargets []int
	for _, n := range engine.CricketNumbers {
		for _, opp := range g.Players {
			if opp.ID != p.ID && opp.Marks[n] < 3 {
				openTargets = append(openTargets, n)
				break
			}
		}
	}

	var oppMarks []map[int]int
	for _, opp := range g.Players {
		if opp.ID != p.ID {
			oppMarks = append(oppMarks, opp.Marks)
		}
	}

	var results []*AiThrowResult
	for i := 0; i < 3; i++ {
		if g.IsOver {
			break
		}
		var oppScores []int
		for _, opp := range g.Players {
			if opp.ID != p.ID {
				oppScores = append(oppScores, opp.Score)
			}
		}
		botRes := opp.ThrowCricket(openTargets, p.Marks, oppMarks, p.Score, oppScores)
		scoreBefore := p.Score
		err := g.Throw(botRes.Segment)
		scoreDelta := p.Score - scoreBefore

		log.Printf("[AI cricket] player=%s aim=%s hit=%s openTargets=%v ownMarks=%+v",
			p.Name, botRes.AimLabel, engine.SegmentLabel(botRes.Segment), openTargets, p.Marks)

		results = append(results, &AiThrowResult{
			PlayerID: p.ID,
			Name:     p.Name,
			Aim:      botRes.AimLabel,
			Segment:  engine.SegmentLabel(botRes.Segment),
			Score:    scoreDelta,
		})

		if err != nil {
			results[len(results)-1].Error = err.Error()
			break
		}
	}

	if !g.IsOver {
		g.EndTurn()
		g.RecomputeScores()
	}

	return results
}

func UndoLastThrow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	gameMu.Lock()
	defer gameMu.Unlock()

	state, ok := activeGames[id]
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	type undoResult struct {
		State interface{} `json:"state"`
		Error string      `json:"error,omitempty"`
	}

	switch g := state.(type) {
	case *engine.X01GameState:
		if err := g.UndoLastThrow(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(undoResult{Error: err.Error()})
			return
		}
		persistGameState(id, g)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(undoResult{State: g})

	case *engine.CricketGameState:
		if err := g.UndoLastThrow(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(undoResult{Error: err.Error()})
			return
		}
		persistGameState(id, g)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(undoResult{State: g})

	default:
		http.Error(w, "unknown game type", http.StatusInternalServerError)
	}
}

func ListGames(w http.ResponseWriter, r *http.Request) {
	games, err := db.ListGames(20)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

type GameSummary struct {
	ID            string         `json:"id"`
	Type          string         `json:"type"`
	StartingScore int            `json:"starting_score,omitempty"`
	CreatedAt     string         `json:"created_at"`
	CompletedAt   *string        `json:"completed_at,omitempty"`
	WinnerName    *string        `json:"winner_name,omitempty"`
	Players       []string       `json:"players"`
	Scores        map[string]int `json:"scores,omitempty"`
	Rounds        int            `json:"rounds,omitempty"`
}

func ListGamesWithDetails(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT g.id, g.type, g.created_at, g.completed_at,
			COALESCE(p_winner.name, 'Unknown') as winner_name,
			g.state_json
		FROM games g
		LEFT JOIN players p_winner ON g.winner_id = p_winner.id
		ORDER BY g.created_at DESC
		LIMIT 20
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var games []GameSummary
	for rows.Next() {
		var g GameSummary
		var createdAt string
		var completedAt, winnerName sql.NullString
		var stateJSON sql.NullString
		if err := rows.Scan(&g.ID, &g.Type, &createdAt, &completedAt, &winnerName, &stateJSON); err != nil {
			log.Printf("ListGamesWithDetails scan error: %v", err)
			continue
		}
		g.CreatedAt = createdAt
		if completedAt.Valid {
			g.CompletedAt = &completedAt.String
		}
		if winnerName.Valid {
			g.WinnerName = &winnerName.String
		}
		if stateJSON.Valid {
			var stateMap map[string]interface{}
			if json.Unmarshal([]byte(stateJSON.String), &stateMap) == nil {
				if ss, ok := stateMap["starting_score"].(float64); ok {
					g.StartingScore = int(ss)
				}
				if r, ok := stateMap["round"].(float64); ok {
					g.Rounds = int(r)
				}
				if playersRaw, ok := stateMap["players"].([]interface{}); ok {
					g.Players = make([]string, 0, len(playersRaw))
					g.Scores = make(map[string]int)
					for _, pRaw := range playersRaw {
						if p, ok := pRaw.(map[string]interface{}); ok {
							name, _ := p["name"].(string)
							score, _ := p["score"].(float64)
							if name != "" {
								g.Players = append(g.Players, name)
								g.Scores[name] = int(score)
							}
						}
					}
				}
			}
		}
		if g.Players == nil {
			g.Players = []string{}
		}
		games = append(games, g)
	}
	if games == nil {
		games = []GameSummary{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

func ListActiveGames(w http.ResponseWriter, r *http.Request) {
	games, err := db.ListIncompleteGames()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

func DeleteGame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := db.DeleteGame(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	gameMu.Lock()
	delete(activeGames, id)
	gameMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func hydrateGameState(gameID string, raw interface{}) interface{} {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return raw
	}
	gameType, _ := m["type"].(string)

	reJSON, _ := json.Marshal(m)

	switch gameType {
	case "x01":
		var g engine.X01GameState
		if err := json.Unmarshal(reJSON, &g); err == nil {
			return &g
		}
	case "cricket":
		var g engine.CricketGameState
		if err := json.Unmarshal(reJSON, &g); err == nil {
			return &g
		}
	}
	return raw
}

func GetMatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	score, err := db.GetMatchScore(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(score)
}

func CreateNextMatchGame(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	m, err := db.GetMatch(id)
	if err != nil {
		http.Error(w, "match not found", http.StatusNotFound)
		return
	}
	if m.Status == "completed" {
		http.Error(w, "match already completed", http.StatusBadRequest)
		return
	}

	latest, err := db.GetLatestMatchGame(id)
	if err != nil {
		http.Error(w, "no games in match", http.StatusInternalServerError)
		return
	}
	if latest.WinnerID == nil || *latest.WinnerID == "" {
		http.Error(w, "latest game not completed", http.StatusBadRequest)
		return
	}

	matchPlayers, err := db.GetMatchPlayers(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	nextIndex := latest.MatchGameIndex + 1
	if nextIndex >= m.TotalGames {
		http.Error(w, "match is complete", http.StatusBadRequest)
		return
	}

	var state interface{}
	var gameID string

	switch m.Type {
	case "x01":
		players := make([]*engine.X01Player, len(matchPlayers))
		for i, mp := range matchPlayers {
			p, _ := db.GetPlayer(mp.PlayerID)
			name := mp.PlayerID
			if p != nil {
				name = p.Name
			}
			players[i] = &engine.X01Player{
				ID:         mp.PlayerID,
				Name:       name,
				IsBot:      mp.IsBot,
				Difficulty: *mp.Difficulty,
			}
		}
		game := engine.NewX01Game(engine.X01Config{StartingScore: m.StartingScore}, players)
		gameID = game.ID
		state = game

	case "cricket":
		players := make([]*engine.CricketPlayer, len(matchPlayers))
		for i, mp := range matchPlayers {
			p, _ := db.GetPlayer(mp.PlayerID)
			name := mp.PlayerID
			if p != nil {
				name = p.Name
			}
			players[i] = &engine.CricketPlayer{
				ID:         mp.PlayerID,
				Name:       name,
				IsBot:      mp.IsBot,
				Difficulty: *mp.Difficulty,
			}
		}
		game := engine.NewCricketGame(players)
		gameID = game.ID
		state = game
	}

	gameMu.Lock()
	activeGames[gameID] = state
	gameMu.Unlock()

	db.CreateGameInMatch(&db.Game{
		ID:             gameID,
		Type:           m.Type,
		ConfigJSON:     "",
		MatchID:        &id,
		MatchGameIndex: nextIndex,
	})

	for _, mp := range matchPlayers {
		dbGP := &db.GamePlayer{
			ID:         uuid.New().String(),
			GameID:     gameID,
			PlayerID:   mp.PlayerID,
			IsBot:      mp.IsBot,
			Difficulty: mp.Difficulty,
		}
		db.AddGamePlayer(dbGP)
	}

	persistGameState(gameID, state)

	matchScore, _ := db.GetMatchScore(id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GameResponse{GameID: gameID, Type: m.Type, State: state, Match: matchScore})
}

func LoadActiveGames() {
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
		state := hydrateGameState(g.ID, raw)
		gameMu.Lock()
		activeGames[g.ID] = state
		gameMu.Unlock()
	}
}
