package engine

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// MatchPlayer is the lightweight player info stored on a match.
type MatchPlayer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsBot      bool   `json:"is_bot"`
	Difficulty string `json:"difficulty,omitempty"`
}

// MatchLegResult records one completed leg of a match.
type MatchLegResult struct {
	GameID   string `json:"game_id"`
	WinnerID string `json:"winner_id"`
	Index    int    `json:"index"`
}

// MatchState is the first-class container for a best-of series.
type MatchState struct {
	ID                string           `json:"id"`
	Type              string           `json:"type"`
	StartingScore     int              `json:"starting_score,omitempty"`
	TotalGames        int              `json:"total_games"`
	Status            string           `json:"status"`
	WinnerID          *string          `json:"winner_id,omitempty"`
	Players           []*MatchPlayer   `json:"players"`
	CurrentGameIndex  int              `json:"current_game_index"`
	CurrentGameState  interface{}      `json:"current_game_state"`
	GameScores        map[string]int   `json:"game_scores"`
	GamesPlayed       int              `json:"games_played"`
	FirstThrowerIndex int              `json:"first_thrower_index"`
	LegHistory        []MatchLegResult `json:"leg_history"`
	CreatedAt         time.Time        `json:"created_at"`
}

// NewMatch creates a new match and starts the first leg.
func NewMatch(gameType string, startingScore int, totalGames int, players []*MatchPlayer, firstThrowerIndex int) (*MatchState, error) {
	if totalGames < 1 {
		totalGames = 1
	}
	if len(players) < 1 {
		return nil, fmt.Errorf("match needs at least one player")
	}
	if firstThrowerIndex < 0 || firstThrowerIndex >= len(players) {
		firstThrowerIndex = 0
	}

	m := &MatchState{
		ID:                uuid.New().String(),
		Type:              gameType,
		StartingScore:     startingScore,
		TotalGames:        totalGames,
		Status:            "active",
		Players:           players,
		GameScores:        make(map[string]int),
		FirstThrowerIndex: firstThrowerIndex,
		CreatedAt:         time.Now(),
	}
	for _, p := range players {
		m.GameScores[p.ID] = 0
	}
	m.startNewLeg()
	return m, nil
}

// startingPlayerForLeg returns the index of the player who throws first in the given leg.
func (m *MatchState) startingPlayerForLeg(legIndex int) int {
	return (m.FirstThrowerIndex + legIndex) % len(m.Players)
}

// startNewLeg creates a fresh game state for CurrentGameIndex and assigns the correct starting player.
func (m *MatchState) startNewLeg() {
	startPlayer := m.startingPlayerForLeg(m.CurrentGameIndex)
	switch m.Type {
	case "x01":
		x01Players := make([]*X01Player, len(m.Players))
		for i, mp := range m.Players {
			x01Players[i] = &X01Player{
				ID:         mp.ID,
				Name:       mp.Name,
				IsBot:      mp.IsBot,
				Difficulty: mp.Difficulty,
			}
		}
		game := NewX01Game(X01Config{StartingScore: m.StartingScore}, x01Players)
		game.CurrentPlayer = startPlayer
		m.CurrentGameState = game
	case "cricket":
		cricketPlayers := make([]*CricketPlayer, len(m.Players))
		for i, mp := range m.Players {
			cricketPlayers[i] = &CricketPlayer{
				ID:         mp.ID,
				Name:       mp.Name,
				IsBot:      mp.IsBot,
				Difficulty: mp.Difficulty,
			}
		}
		game := NewCricketGame(cricketPlayers)
		game.CurrentPlayer = startPlayer
		m.CurrentGameState = game
	}
}

// NeededWins returns the number of leg wins required to take the match.
func (m *MatchState) NeededWins() int {
	return m.TotalGames/2 + 1
}

// CurrentGame returns the current leg's game state as concrete types.
func (m *MatchState) CurrentGame() (x01 *X01GameState, cricket *CricketGameState, ok bool) {
	switch g := m.CurrentGameState.(type) {
	case *X01GameState:
		return g, nil, true
	case *CricketGameState:
		return nil, g, true
	}
	return nil, nil, false
}

// RecordLegWin should be called after the current leg ends. It updates match scores,
// advances to the next leg if the match isn't over, and returns true if the match ended.
func (m *MatchState) RecordLegWin(winnerID string) bool {
	if m.Status == "completed" {
		return true
	}

	var gameID string
	switch g := m.CurrentGameState.(type) {
	case *X01GameState:
		if g != nil {
			gameID = g.ID
		}
	case *CricketGameState:
		if g != nil {
			gameID = g.ID
		}
	}

	m.LegHistory = append(m.LegHistory, MatchLegResult{
		GameID:   gameID,
		WinnerID: winnerID,
		Index:    m.CurrentGameIndex,
	})
	m.GameScores[winnerID]++
	m.GamesPlayed++

	if m.GameScores[winnerID] >= m.NeededWins() {
		m.Status = "completed"
		m.WinnerID = &winnerID
		return true
	}

	m.CurrentGameIndex++
	m.startNewLeg()
	return false
}

// PlayerByID returns the match player with the given ID.
func (m *MatchState) PlayerByID(id string) *MatchPlayer {
	for _, p := range m.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}
