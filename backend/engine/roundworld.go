package engine

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// RoundWorldNumbers represents the sequence of numbers in Round World
var RoundWorldNumbers = []int{20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5}

type RoundWorldPlayer struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	IsBot      bool          `json:"is_bot"`
	Difficulty string        `json:"difficulty,omitempty"`
	Score      int           `json:"score"`
	DartsUsed  int           `json:"darts_used"`
	TurnDarts  []ThrowRecord `json:"turn_darts"`
	History    []ThrowRecord `json:"history"`
	Sequence   int           `json:"sequence"` // Current position in the sequence
	Completed  bool          `json:"completed"` // Whether this player has completed the round
}

type RoundWorldGameState struct {
	ID            string                `json:"id"`
	Type          string                `json:"type"`
	Players       []*RoundWorldPlayer   `json:"players"`
	CurrentPlayer int                   `json:"current_player"`
	Round         int                   `json:"round"`
	IsOver        bool                  `json:"is_over"`
	Winner        *RoundWorldPlayer     `json:"winner,omitempty"`
	CreatedAt     time.Time             `json:"created_at"`
	Stats         map[string]*GameStats `json:"stats"`
}

func NewRoundWorldGame(players []*RoundWorldPlayer) *RoundWorldGameState {
	stats := make(map[string]*GameStats)
	for _, p := range players {
		p.Sequence = 0
		p.Completed = false
		stats[p.ID] = NewGameStats()
	}

	return &RoundWorldGameState{
		ID:            uuid.New().String(),
		Type:          "round_world",
		Players:       players,
		CurrentPlayer: 0,
		Round:         1,
		CreatedAt:     time.Now(),
		Stats:         stats,
	}
}

func (g *RoundWorldGameState) CurrentTurnPlayer() *RoundWorldPlayer {
	return g.Players[g.CurrentPlayer]
}

func (g *RoundWorldGameState) Throw(seg Segment) error {
	if g.IsOver {
		return fmt.Errorf("game is over")
	}

	p := g.CurrentTurnPlayer()
	if p.DartsUsed >= 3 {
		return fmt.Errorf("turn complete, end turn first")
	}

	p.DartsUsed++
	
	// Get the number we're trying to hit in sequence
	targetNumber := RoundWorldNumbers[p.Sequence]
	
	// Check if this is a valid throw for the current target
	score := SegmentScore(seg)
	
	// In Round World, we score points based on hitting the correct number
	// The scoring depends on what type of segment was thrown at the target number
	var points int
	if seg.Value == targetNumber {
		// Correct number hit
		switch seg.Type {
		case Single:
			points = 1
		case Double:
			points = 2
		case Triple:
			points = 3
		case OuterBull:
			points = 1 // Usually 1 point for outer bull
		case Bullseye:
			points = 5 // Usually 5 points for bullseye
		}
		
		// Record the hit in history
		p.History = append(p.History, ThrowRecord{
			Segment:   seg,
			Label:     SegmentLabel(seg),
			Score:     score,
			Round:     g.Round,
			DartNum:   p.DartsUsed,
			Timestamp: time.Now(),
		})
		
		p.Score += points
		
		// Record in stats
		if stats, ok := g.Stats[p.ID]; ok {
			stats.RecordThrow(ThrowRecord{
				Segment: seg,
				Label:   SegmentLabel(seg),
				Score:   score,
				Round:   g.Round,
				DartNum: p.DartsUsed,
			})
		}
		
		// Move to next number in sequence
		p.Sequence++
		
		// Check if player has completed the round
		if p.Sequence >= len(RoundWorldNumbers) {
			p.Completed = true
		}
	} else {
		// Wrong number hit - no points, but still record the throw
		p.History = append(p.History, ThrowRecord{
			Segment:   seg,
			Label:     SegmentLabel(seg),
			Score:     score,
			Round:     g.Round,
			DartNum:   p.DartsUsed,
			Timestamp: time.Now(),
		})
		
		// Record in stats
		if stats, ok := g.Stats[p.ID]; ok {
			stats.RecordThrow(ThrowRecord{
				Segment: seg,
				Label:   SegmentLabel(seg),
				Score:   score,
				Round:   g.Round,
				DartNum: p.DartsUsed,
			})
		}
	}

	p.TurnDarts = append(p.TurnDarts, ThrowRecord{
		Segment:   seg,
		Label:     SegmentLabel(seg),
		Score:     score,
		Round:     g.Round,
		DartNum:   p.DartsUsed,
		Timestamp: time.Now(),
	})

	return nil
}

func (g *RoundWorldGameState) EndTurn() {
	p := g.CurrentTurnPlayer()

	if len(p.TurnDarts) > 0 {
		p.History = append(p.History, p.TurnDarts...)
	}
	p.TurnDarts = nil
	p.DartsUsed = 0

	// Move to next player if current player has completed the round or all players have had a turn
	g.CurrentPlayer = (g.CurrentPlayer + 1) % len(g.Players)
	
	// Check if game is over - all players have completed their rounds
	allCompleted := true
	for _, player := range g.Players {
		if !player.Completed {
			allCompleted = false
			break
		}
	}
	
	if allCompleted {
		g.IsOver = true
		
		// Determine winner (highest score)
		var winner *RoundWorldPlayer
		maxScore := -1
		for _, player := range g.Players {
			if player.Score > maxScore {
				maxScore = player.Score
				winner = player
			}
		}
		
		g.Winner = winner
	}
}

func (g *RoundWorldGameState) UndoLastThrow() error {
	if g.IsOver {
		return fmt.Errorf("game is over")
	}

	p := g.CurrentTurnPlayer()
	if len(p.TurnDarts) == 0 {
		return fmt.Errorf("nothing to undo")
	}

	last := p.TurnDarts[len(p.TurnDarts)-1]
	p.TurnDarts = p.TurnDarts[:len(p.TurnDarts)-1]
	p.DartsUsed--

	// Remove from history
	if len(p.History) > 0 {
		p.History = p.History[:len(p.History)-1]
	}

	// Revert score - this is a simplified undo that just removes the last throw effect
	// In a real implementation, we'd need to track more detailed state for proper undo

	// Revert stats
	if stats, ok := g.Stats[p.ID]; ok {
		label := last.Label
		if last.Segment.Type == Single && last.Segment.Value > 0 && last.Segment.Value != 25 {
			label = last.Segment.RawLabel
		}
		if label == "" {
			label = last.Label
		}
		if stats.SegmentHits[label] > 0 {
			stats.SegmentHits[label]--
		}
		typeName := "single"
		switch last.Segment.Type {
		case Double:
			typeName = "double"
		case Triple:
			typeName = "triple"
		case OuterBull:
			typeName = "outer_bull"
		case Bullseye:
			typeName = "bullseye"
		}
		if stats.TypeHits[typeName] > 0 {
			stats.TypeHits[typeName]--
		}
		if stats.ThrowCount > 0 {
			stats.ThrowCount--
		}
		if stats.TotalScore >= last.Score {
			stats.TotalScore -= last.Score
		}
	}

	return nil
}

func (g *RoundWorldGameState) RecomputeScores() {
	// In Round World, scores are computed as we go, so this is mostly a no-op
	// But we can recompute if needed for consistency
	for _, p := range g.Players {
		p.Score = 0
		for _, record := range p.History {
			// Recompute score based on the history
			if record.Segment.Value == RoundWorldNumbers[p.Sequence] {
				switch record.Segment.Type {
				case Single:
					p.Score += 1
				case Double:
					p.Score += 2
				case Triple:
					p.Score += 3
				case OuterBull:
					p.Score += 1
				case Bullseye:
					p.Score += 5
				}
			}
		}
	}
}