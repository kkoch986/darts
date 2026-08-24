package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/engine"
)

var (
	activeMatches = make(map[string]*engine.MatchState)
	matchMu       sync.RWMutex
)

// MatchResponse is the wire format for match endpoints.
type MatchResponse struct {
	Match   *engine.MatchState `json:"match"`
	Error   string             `json:"error,omitempty"`
	AiTurns []*AiThrowResult   `json:"ai_turns,omitempty"`
}

// CreateMatchRequest is the payload for starting a new match.
type CreateMatchRequest struct {
	Type              string         `json:"type"`
	StartingScore     int            `json:"starting_score,omitempty"`
	MatchLength       int            `json:"match_length,omitempty"`
	FirstThrowerIndex int            `json:"first_thrower_index,omitempty"`
	Players           []PlayerConfig `json:"players"`
}

// CreateMatch starts a new match (best-of series). Single games are match length 1.
func CreateMatch(w http.ResponseWriter, r *http.Request) {
	var req CreateMatchRequest
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

	players := make([]*engine.MatchPlayer, len(req.Players))
	resolvedPlayerIDs := make([]string, len(req.Players))
	for i, pc := range req.Players {
		pid := pc.PlayerID
		if pid == "" {
			pid = uuid.New().String()
		}
		pc.PlayerID = pid
		resolvedPlayerIDs[i] = db.EnsurePlayer(pid, pc.Name, pc.IsBot)
		players[i] = &engine.MatchPlayer{
			ID:         resolvedPlayerIDs[i],
			Name:       pc.Name,
			IsBot:      pc.IsBot,
			Difficulty: pc.Difficulty,
		}
	}

	startScore := req.StartingScore
	if req.Type == "x01" && startScore == 0 {
		startScore = 501
	}

	firstThrower := req.FirstThrowerIndex
	if firstThrower < 0 || firstThrower >= len(players) {
		firstThrower = 0
	}

	match, err := engine.NewMatch(req.Type, startScore, matchLength, players, firstThrower)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	matchMu.Lock()
	activeMatches[match.ID] = match
	matchMu.Unlock()

	// Persist match header.
	db.CreateMatch(&db.Match{
		ID:            match.ID,
		Type:          match.Type,
		StartingScore: match.StartingScore,
		TotalGames:    match.TotalGames,
		Status:        "active",
	})
	for i, mp := range req.Players {
		db.AddMatchPlayer(&db.MatchPlayer{
			ID:         uuid.New().String(),
			MatchID:    match.ID,
			PlayerID:   resolvedPlayerIDs[i],
			IsBot:      mp.IsBot,
			Difficulty: &mp.Difficulty,
		})
	}

	persistMatchState(match)
	persistCurrentLeg(match)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MatchResponse{Match: match})
}

// GetMatchState returns the current state of a match, loading from DB if not active.
func GetMatchState(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	matchMu.RLock()
	match, ok := activeMatches[id]
	matchMu.RUnlock()

	if ok {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MatchResponse{Match: match})
		return
	}

	// Try loading from DB.
	loaded, err := loadMatchFromDB(id)
	if err != nil {
		http.Error(w, "match not found", http.StatusNotFound)
		return
	}
	matchMu.Lock()
	activeMatches[id] = loaded
	matchMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MatchResponse{Match: loaded})
}

// ThrowInMatch records one throw on the current leg of a match.
func ThrowInMatch(w http.ResponseWriter, r *http.Request) {
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

	matchMu.Lock()
	defer matchMu.Unlock()

	match := activeMatches[id]
	if match == nil {
		loaded, err := loadMatchFromDB(id)
		if err != nil {
			http.Error(w, "match not found", http.StatusNotFound)
			return
		}
		match = loaded
		activeMatches[id] = match
	}

	if match.Status == "completed" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MatchResponse{Match: match})
		return
	}

	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		err := g.Throw(seg)
		if err != nil {
			// Bust handling mirrors the old game endpoint.
			if g.CurrentTurnPlayer().Busted {
				g.EndTurn()
				g.RecomputeScores()
				persistCurrentLeg(match)

				if g.IsOver {
					finishLeg(match, g.ID)
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(MatchResponse{Match: match, Error: err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(MatchResponse{Error: err.Error()})
			return
		}

		recordThrow(match, engine.SegmentLabel(seg), engine.SegmentScore(seg))
		if g.IsOver {
			finishLeg(match, g.ID)
		}
		persistMatchState(match)
		persistCurrentLeg(match)

	case *engine.CricketGameState:
		err := g.Throw(seg)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(MatchResponse{Error: err.Error()})
			return
		}

		recordThrow(match, engine.SegmentLabel(seg), engine.SegmentScore(seg))
		if g.IsOver {
			finishLeg(match, g.ID)
		}
		persistMatchState(match)
		persistCurrentLeg(match)

	default:
		http.Error(w, "unknown match game type", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MatchResponse{Match: match})
}

// EndTurnInMatch ends the current turn and plays any bot turns needed.
func EndTurnInMatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	matchMu.Lock()
	defer matchMu.Unlock()

	match := activeMatches[id]
	if match == nil {
		loaded, err := loadMatchFromDB(id)
		if err != nil {
			http.Error(w, "match not found", http.StatusNotFound)
			return
		}
		match = loaded
		activeMatches[id] = match
	}

	if match.Status == "completed" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MatchResponse{Match: match})
		return
	}

	var aiTurns []*AiThrowResult

	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		p := g.CurrentTurnPlayer()
		if !p.IsBot {
			for p.DartsUsed < 3 {
				g.Throw(engine.Segment{Type: engine.Single, Value: 0, Multiplier: 1})
				recordThrow(match, "Miss", 0)
			}
			if stats, ok := g.Stats[p.ID]; ok {
				stats.RecordTurnEnd(p.TurnScore)
			}
			g.EndTurn()
			g.RecomputeScores()
		}

		for g.CurrentTurnPlayer().IsBot && !g.IsOver {
			aiTurns = append(aiTurns, playBotTurnsX01InMatch(match, g)...)
		}

		if g.IsOver {
			finishLeg(match, g.ID)
		}
		persistMatchState(match)
		persistCurrentLeg(match)

	case *engine.CricketGameState:
		p := g.CurrentTurnPlayer()
		if !p.IsBot {
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
				recordThrow(match, "UNK", 0)
			}
			g.EndTurn()
			g.RecomputeScores()
		}

		for g.CurrentTurnPlayer().IsBot && !g.IsOver {
			aiTurns = append(aiTurns, playBotTurnsCricketInMatch(match, g)...)
		}

		if g.IsOver {
			finishLeg(match, g.ID)
		}
		persistMatchState(match)
		persistCurrentLeg(match)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MatchResponse{Match: match, AiTurns: aiTurns})
}

// UndoInMatch undoes the last throw in the current leg.
func UndoInMatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	matchMu.Lock()
	defer matchMu.Unlock()

	match := activeMatches[id]
	if match == nil {
		http.Error(w, "match not found", http.StatusNotFound)
		return
	}

	if match.Status == "completed" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(MatchResponse{Match: match})
		return
	}

	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		if err := g.UndoLastThrow(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(MatchResponse{Error: err.Error()})
			return
		}
	case *engine.CricketGameState:
		if err := g.UndoLastThrow(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(MatchResponse{Error: err.Error()})
			return
		}
	}

	persistMatchState(match)
	persistCurrentLeg(match)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MatchResponse{Match: match})
}

// GetMatchStats returns aggregated stats across all completed legs and the current leg.
func GetMatchStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	matchMu.RLock()
	match, ok := activeMatches[id]
	matchMu.RUnlock()

	if !ok {
		var err error
		match, err = loadMatchFromDB(id)
		if err != nil {
			http.Error(w, "match not found", http.StatusNotFound)
			return
		}
	}

	stats := computeMatchStats(match)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// DeleteMatch removes a match and all its legs.
func DeleteMatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	matchMu.Lock()
	delete(activeMatches, id)
	matchMu.Unlock()

	if err := db.DeleteMatch(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListMatches returns recent matches for the home screen.
func ListMatches(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
		SELECT m.id, m.type, m.starting_score, m.total_games, m.status, m.created_at,
			COALESCE(p_winner.name, 'Unknown') as winner_name
		FROM matches m
		LEFT JOIN players p_winner ON m.winner_id = p_winner.id
		ORDER BY m.created_at DESC
		LIMIT 20
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type matchSummary struct {
		ID            string   `json:"id"`
		Type          string   `json:"type"`
		StartingScore int      `json:"starting_score,omitempty"`
		TotalGames    int      `json:"total_games"`
		Status        string   `json:"status"`
		CreatedAt     string   `json:"created_at"`
		WinnerName    *string  `json:"winner_name,omitempty"`
		Players       []string `json:"players"`
	}

	var summaries []matchSummary
	for rows.Next() {
		var s matchSummary
		var winnerName sql.NullString
		if err := rows.Scan(&s.ID, &s.Type, &s.StartingScore, &s.TotalGames, &s.Status, &s.CreatedAt, &winnerName); err != nil {
			continue
		}
		if winnerName.Valid {
			s.WinnerName = &winnerName.String
		}
		players, _ := db.GetMatchPlayers(s.ID)
		for _, p := range players {
			if pl, _ := db.GetPlayer(p.PlayerID); pl != nil {
				s.Players = append(s.Players, pl.Name)
			} else {
				s.Players = append(s.Players, "Unknown")
			}
		}

		// Use the saved match state to fix stale DB rows or missing winner names.
		if stateJSON, err := db.LoadMatchState(s.ID); err == nil && stateJSON != "" {
			var ms engine.MatchState
			if json.Unmarshal([]byte(stateJSON), &ms) == nil {
				if s.Status == "active" && ms.Status == "completed" {
					s.Status = "completed"
				}
				if (s.WinnerName == nil || *s.WinnerName == "Unknown") && ms.WinnerID != nil {
					for _, p := range ms.Players {
						if p.ID == *ms.WinnerID {
							s.WinnerName = &p.Name
							break
						}
					}
				}
			}
		}
		summaries = append(summaries, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

// --- helpers ---

func persistMatchState(match *engine.MatchState) {
	stateJSON, err := json.Marshal(match)
	if err != nil {
		return
	}
	db.SaveMatchState(match.ID, string(stateJSON))
}

func persistCurrentLeg(match *engine.MatchState) {
	var gameID string
	var stateJSON string
	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		gameID = g.ID
		b, _ := json.Marshal(g)
		stateJSON = string(b)
	case *engine.CricketGameState:
		gameID = g.ID
		b, _ := json.Marshal(g)
		stateJSON = string(b)
	default:
		return
	}

	// Upsert the current leg game row.
	var exists int
	db.DB.QueryRow("SELECT COUNT(*) FROM games WHERE id = ?", gameID).Scan(&exists)
	if exists == 0 {
		mid := match.ID
		db.CreateGameInMatch(&db.Game{
			ID:             gameID,
			Type:           match.Type,
			ConfigJSON:     "",
			StateJSON:      stateJSON,
			MatchID:        &mid,
			MatchGameIndex: match.CurrentGameIndex,
		})
		for _, p := range match.Players {
			db.AddGamePlayer(&db.GamePlayer{
				ID:         uuid.New().String(),
				GameID:     gameID,
				PlayerID:   p.ID,
				IsBot:      p.IsBot,
				Difficulty: strPtr(p.Difficulty),
			})
		}
	} else {
		db.SaveGameState(gameID, stateJSON)
	}
}

func finishLeg(match *engine.MatchState, gameID string) {
	var winnerID string
	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		if g.Winner != nil {
			winnerID = g.Winner.ID
		}
	case *engine.CricketGameState:
		if g.Winner != nil {
			winnerID = g.Winner.ID
		}
	}

	// Mark the leg completed.
	now := time.Now()
	db.DB.Exec("UPDATE games SET completed_at = ?, winner_id = ? WHERE id = ?", now, winnerID, gameID)

	match.RecordLegWin(winnerID)
	if match.Status == "completed" {
		db.DB.Exec("UPDATE matches SET status = 'completed', winner_id = ?, completed_at = ? WHERE id = ?", winnerID, now, match.ID)
	}
	persistMatchState(match)
}

func recordThrow(match *engine.MatchState, label string, score int) {
	var gameID string
	var playerID string
	var round int
	var dartNum int
	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		gameID = g.ID
		p := g.CurrentTurnPlayer()
		playerID = p.ID
		round = g.Round
		dartNum = p.DartsUsed
	case *engine.CricketGameState:
		gameID = g.ID
		p := g.CurrentTurnPlayer()
		playerID = p.ID
		round = g.Round
		dartNum = p.DartsUsed
	}

	db.RecordThrow(&db.GameThrow{
		ID:           uuid.New().String(),
		GameID:       gameID,
		PlayerID:     playerID,
		RoundNum:     round,
		DartNum:      dartNum,
		SegmentLabel: label,
		Score:        score,
	})
}

func playBotTurnsX01InMatch(match *engine.MatchState, g *engine.X01GameState) []*AiThrowResult {
	p := g.CurrentTurnPlayer()
	opp := engine.NewOpponent(p.Name, engine.Persona(p.Difficulty))
	var results []*AiThrowResult
	for i := 0; i < 3; i++ {
		if g.IsOver || p.Busted {
			break
		}
		botRes := opp.ThrowX01(p.Score)
		err := g.Throw(botRes.Segment)
		recordThrow(match, engine.SegmentLabel(botRes.Segment), engine.SegmentScore(botRes.Segment))
		results = append(results, &AiThrowResult{
			PlayerID: p.ID,
			Name:     p.Name,
			Aim:      botRes.AimLabel,
			Segment:  engine.SegmentLabel(botRes.Segment),
			Score:    engine.SegmentScore(botRes.Segment),
			Error: func() string {
				if err != nil {
					return err.Error()
				}
				return ""
			}(),
		})
	}
	if !g.IsOver {
		if stats := g.Stats[p.ID]; stats != nil {
			stats.RecordTurnEnd(p.TurnScore)
		}
		g.EndTurn()
		g.RecomputeScores()
	}
	return results
}

func playBotTurnsCricketInMatch(match *engine.MatchState, g *engine.CricketGameState) []*AiThrowResult {
	p := g.CurrentTurnPlayer()
	opp := engine.NewOpponent(p.Name, engine.Persona(p.Difficulty))

	var openTargets []int
	for _, n := range engine.CricketNumbers {
		for _, oppP := range g.Players {
			if oppP.ID != p.ID && oppP.Marks[n] < 3 {
				openTargets = append(openTargets, n)
				break
			}
		}
	}

	var oppMarks []map[int]int
	for _, oppP := range g.Players {
		if oppP.ID != p.ID {
			oppMarks = append(oppMarks, oppP.Marks)
		}
	}

	var oppScores []int
	for _, oppP := range g.Players {
		if oppP.ID != p.ID {
			oppScores = append(oppScores, oppP.Score)
		}
	}

	var results []*AiThrowResult
	for i := 0; i < 3; i++ {
		if g.IsOver {
			break
		}
		botRes := opp.ThrowCricket(openTargets, p.Marks, oppMarks, p.Score, oppScores)
		g.Throw(botRes.Segment)
		recordThrow(match, engine.SegmentLabel(botRes.Segment), engine.SegmentScore(botRes.Segment))
		results = append(results, &AiThrowResult{
			PlayerID: p.ID,
			Name:     p.Name,
			Aim:      botRes.AimLabel,
			Segment:  engine.SegmentLabel(botRes.Segment),
			Score:    engine.SegmentScore(botRes.Segment),
		})
	}
	if !g.IsOver {
		g.EndTurn()
		g.RecomputeScores()
	}
	return results
}

func loadMatchFromDB(id string) (*engine.MatchState, error) {
	stateJSON, err := db.LoadMatchState(id)
	if err != nil || stateJSON == "" {
		return nil, err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(stateJSON), &raw); err != nil {
		return nil, err
	}
	var match engine.MatchState
	if err := json.Unmarshal([]byte(stateJSON), &match); err != nil {
		return nil, err
	}
	// Decode CurrentGameState into concrete type; json.Unmarshal into interface{}
	// leaves it as a map[string]interface{}.
	if cs, ok := raw["current_game_state"]; ok {
		switch match.Type {
		case "x01":
			var g engine.X01GameState
			if err := json.Unmarshal(cs, &g); err == nil {
				match.CurrentGameState = &g
			}
		case "cricket":
			var g engine.CricketGameState
			if err := json.Unmarshal(cs, &g); err == nil {
				match.CurrentGameState = &g
			}
		}
	}
	return &match, nil
}

func strPtr(s string) *string {
	return &s
}

type matchStats struct {
	LegsWon     map[string]int     `json:"legs_won"`
	Averages    map[string]float64 `json:"averages"`
	MPR         map[string]float64 `json:"mpr"`
	Checkout    map[string]float64 `json:"checkout_pct"`
	DartsPerLeg map[string]float64 `json:"darts_per_leg"`
}

func computeMatchStats(match *engine.MatchState) matchStats {
	stats := matchStats{
		LegsWon:     make(map[string]int),
		Averages:    make(map[string]float64),
		MPR:         make(map[string]float64),
		Checkout:    make(map[string]float64),
		DartsPerLeg: make(map[string]float64),
	}

	legDarts := make(map[string][]int)
	legScores := make(map[string][]int)
	legMarks := make(map[string][]int)
	checkoutAttempts := make(map[string]int)
	checkoutHits := make(map[string]int)

	for _, res := range match.LegHistory {
		gameID := res.GameID
		rows, err := db.DB.Query(`
			SELECT player_id, segment_label, score, round_num
			FROM game_throws
			WHERE game_id = ?
			ORDER BY round_num, dart_num
		`, gameID)
		if err != nil {
			continue
		}

		dartsByPlayer := make(map[string]int)
		scoreByPlayer := make(map[string]int)
		marksByPlayer := make(map[string]int)
		for rows.Next() {
			var playerID, label string
			var score, round int
			if err := rows.Scan(&playerID, &label, &score, &round); err != nil {
				continue
			}
			dartsByPlayer[playerID]++
			scoreByPlayer[playerID] += score
			marksByPlayer[playerID] += marksFromLabel(label)
			if label != "Miss" && label != "UNK" {
				seg, _ := engine.ParseSegment(label)
				if match.Type == "x01" {
					// Count checkout attempts at a double/bull when remaining was <= 40
					// We don't have remaining here, so approximate by label type.
					if seg.Type == engine.Double || seg.Type == engine.Bullseye {
						checkoutAttempts[playerID]++
						if playerID == res.WinnerID {
							checkoutHits[playerID]++
						}
					}
				}
			}
		}
		rows.Close()

		for pid, d := range dartsByPlayer {
			legDarts[pid] = append(legDarts[pid], d)
			legScores[pid] = append(legScores[pid], scoreByPlayer[pid])
			legMarks[pid] = append(legMarks[pid], marksByPlayer[pid])
		}
	}

	// Include current leg progress from in-memory state.
	switch g := match.CurrentGameState.(type) {
	case *engine.X01GameState:
		for _, p := range g.Players {
			legDarts[p.ID] = append(legDarts[p.ID], p.DartsUsed)
			legScores[p.ID] = append(legScores[p.ID], p.TotalScore)
		}
	case *engine.CricketGameState:
		for _, p := range g.Players {
			legDarts[p.ID] = append(legDarts[p.ID], p.DartsUsed)
			marks := 0
			for _, n := range engine.CricketNumbers {
				marks += p.Marks[n]
			}
			legMarks[p.ID] = append(legMarks[p.ID], marks)
		}
	}

	for _, p := range match.Players {
		stats.LegsWon[p.ID] = match.GameScores[p.ID]
		if darts, ok := legDarts[p.ID]; ok && len(darts) > 0 {
			totalDarts := 0
			for _, d := range darts {
				totalDarts += d
			}
			stats.DartsPerLeg[p.ID] = float64(totalDarts) / float64(len(darts))
		}
		if scores, ok := legScores[p.ID]; ok && len(scores) > 0 {
			totalScore := 0
			for _, s := range scores {
				totalScore += s
			}
			stats.Averages[p.ID] = float64(totalScore) / float64(len(scores))
		}
		if marks, ok := legMarks[p.ID]; ok && len(marks) > 0 {
			totalMarks := 0
			for _, m := range marks {
				totalMarks += m
			}
			stats.MPR[p.ID] = float64(totalMarks) / float64(len(marks))
		}
		if checkoutAttempts[p.ID] > 0 {
			stats.Checkout[p.ID] = float64(checkoutHits[p.ID]) / float64(checkoutAttempts[p.ID]) * 100
		}
	}

	return stats
}

func marksFromLabel(label string) int {
	seg, err := engine.ParseSegment(label)
	if err != nil {
		return 0
	}
	return engine.MarksForSegment(seg)
}
