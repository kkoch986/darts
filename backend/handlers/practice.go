package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ken/darts-backend/engine"
)

var (
	practiceGames = make(map[string]*engine.X01GameState)
	practiceMu    sync.RWMutex
)

type StartCheckoutPracticeRequest struct {
	StartingScore int `json:"starting_score"`
}

type CheckoutPracticeResponse struct {
	PracticeID    string               `json:"practice_id"`
	StartingScore int                  `json:"starting_score"`
	State         *engine.X01GameState `json:"state"`
	Result        string               `json:"result,omitempty"`
}

type CheckoutThrowRequest struct {
	Segment string `json:"segment"`
}

func StartCheckoutPractice(w http.ResponseWriter, r *http.Request) {
	var req StartCheckoutPracticeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.StartingScore < 2 || req.StartingScore > 170 {
		http.Error(w, "starting score must be between 2 and 170", http.StatusBadRequest)
		return
	}

	player := &engine.X01Player{
		ID:   uuid.New().String(),
		Name: "You",
	}
	game := engine.NewX01Game(engine.X01Config{StartingScore: req.StartingScore}, []*engine.X01Player{player})
	// Override the player score to the requested starting score for checkout practice
	game.Players[0].Score = req.StartingScore

	pid := uuid.New().String()
	practiceMu.Lock()
	practiceGames[pid] = game
	practiceMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CheckoutPracticeResponse{
		PracticeID:    pid,
		StartingScore: req.StartingScore,
		State:         game,
	})
}

func CheckoutPracticeThrow(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	practiceMu.RLock()
	game, ok := practiceGames[id]
	practiceMu.RUnlock()
	if !ok {
		http.Error(w, "practice session not found", http.StatusNotFound)
		return
	}

	var req CheckoutThrowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	seg, err := engine.ParseSegment(req.Segment)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result := "continue"
	throwErr := game.Throw(seg)
	if throwErr != nil {
		result = "bust"
	} else if game.IsOver {
		result = "checkout"
	}

	// Auto-end turn after 3 darts or bust/over
	p := game.CurrentTurnPlayer()
	if p.DartsUsed >= 3 || result == "bust" || result == "checkout" {
		game.EndTurn()
		game.RecomputeScores()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CheckoutPracticeResponse{
		PracticeID:    id,
		StartingScore: game.StartingScore,
		State:         game,
		Result:        result,
	})
}
