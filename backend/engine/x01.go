package engine

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type X01Config struct {
	StartingScore int `json:"starting_score"`
}

type X01Player struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	IsBot        bool          `json:"is_bot"`
	Difficulty   string        `json:"difficulty,omitempty"`
	Score        int           `json:"score"`
	ScoreAtTurnStart int       `json:"score_at_turn_start"`
	DartsUsed    int           `json:"darts_used"`
	TurnScore    int           `json:"turn_score"`
	TurnDarts    []ThrowRecord `json:"turn_darts"`
	History      []ThrowRecord `json:"history"`
	DoublesIn    bool          `json:"doubles_in"`
	DartsThrown  int           `json:"darts_thrown"`
	TotalScore   int           `json:"total_score"`
	Busted       bool          `json:"busted"`
}

type X01GameState struct {
	ID            string         `json:"id"`
	Type          string         `json:"type"`
	StartingScore int            `json:"starting_score"`
	Players       []*X01Player   `json:"players"`
	CurrentPlayer int            `json:"current_player"`
	Round         int            `json:"round"`
	IsOver        bool           `json:"is_over"`
	Winner        *X01Player     `json:"winner,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	Stats         map[string]*GameStats `json:"stats"`
}

type ThrowRecord struct {
	Segment    Segment   `json:"segment"`
	Label      string    `json:"label"`
	Score      int       `json:"score"`
	Round      int       `json:"round"`
	DartNum    int       `json:"dart_num"`
	Timestamp  time.Time `json:"timestamp"`
	Busted     bool      `json:"busted,omitempty"`
	ExtraScore int       `json:"extra_score,omitempty"`
}

func NewX01Game(cfg X01Config, players []*X01Player) *X01GameState {
	if cfg.StartingScore == 0 {
		cfg.StartingScore = 501
	}

	stats := make(map[string]*GameStats)
	for _, p := range players {
		p.Score = cfg.StartingScore
		p.ScoreAtTurnStart = cfg.StartingScore
		stats[p.ID] = NewGameStats()
	}

	return &X01GameState{
		ID:            uuid.New().String(),
		Type:          "x01",
		StartingScore: cfg.StartingScore,
		Players:       players,
		CurrentPlayer: 0,
		Round:         1,
		CreatedAt:     time.Now(),
		Stats:         stats,
	}
}

func (g *X01GameState) CurrentTurnPlayer() *X01Player {
	return g.Players[g.CurrentPlayer]
}

func (g *X01GameState) Throw(seg Segment) error {
	if g.IsOver {
		return fmt.Errorf("game is over")
	}

	p := g.CurrentTurnPlayer()
	if p.Busted {
		return fmt.Errorf("turn busted, end turn first")
	}
	if p.DartsUsed >= 3 {
		return fmt.Errorf("turn complete, end turn first")
	}

	score := SegmentScore(seg)
	newScore := p.Score - score

	// Bust conditions
	if newScore < 0 || newScore == 1 {
		// Bust: revert entire turn — zero out scores so RecomputeScores stays correct
		for i := range p.TurnDarts {
			p.TurnDarts[i].Score = 0
		}
		p.DartsUsed++
		p.TurnDarts = append(p.TurnDarts, ThrowRecord{
			Segment:   seg,
			Label:     "BUST",
			Score:     0,
			Round:     g.Round,
			DartNum:   p.DartsUsed,
			Timestamp: time.Now(),
			Busted:    true,
		})
		p.Score = p.ScoreAtTurnStart
		p.TurnScore = 0
		p.Busted = true
		return fmt.Errorf("bust: %s leaves %d — turn reverts to %d", SegmentLabel(seg), newScore, p.ScoreAtTurnStart)
	}

	if newScore == 0 {
		// Must finish on a double (or bullseye)
		if seg.Type != Double && seg.Type != Bullseye {
			// Bust: revert entire turn — zero out scores so RecomputeScores stays correct
			for i := range p.TurnDarts {
				p.TurnDarts[i].Score = 0
			}
			p.DartsUsed++
			p.TurnDarts = append(p.TurnDarts, ThrowRecord{
				Segment:   seg,
				Label:     "BUST",
				Score:     0,
				Round:     g.Round,
				DartNum:   p.DartsUsed,
				Timestamp: time.Now(),
				Busted:    true,
			})
			p.Score = p.ScoreAtTurnStart
			p.TurnScore = 0
			p.Busted = true
			return fmt.Errorf("bust: must checkout on a double — turn reverts to %d", p.ScoreAtTurnStart)
		}
	}

	p.DartsUsed++
	p.TurnDarts = append(p.TurnDarts, ThrowRecord{
		Segment:   seg,
		Label:     SegmentLabel(seg),
		Score:     score,
		Round:     g.Round,
		DartNum:   p.DartsUsed,
		Timestamp: time.Now(),
	})
	p.Score = newScore
	p.TurnScore += score

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

	if newScore == 0 {
		g.IsOver = true
		g.Winner = p
	}

	return nil
}

func (g *X01GameState) EndTurn() {
	p := g.CurrentTurnPlayer()

	if len(p.TurnDarts) > 0 {
		p.History = append(p.History, p.TurnDarts...)
	}
	p.TurnScore = 0
	p.TurnDarts = nil
	p.DartsUsed = 0
	p.Busted = false

	g.CurrentPlayer = (g.CurrentPlayer + 1) % len(g.Players)
	if g.CurrentPlayer == 0 {
		g.Round++
	}

	// Set score at turn start for next player
	next := g.CurrentTurnPlayer()
	next.ScoreAtTurnStart = next.Score
}

func (g *X01GameState) UndoLastThrow() error {
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

	if last.Busted {
		// Undoing the bust dart — clear busted, restore zeroed dart scores
		p.Busted = false
		for i := range p.TurnDarts {
			if p.TurnDarts[i].Score == 0 && !p.TurnDarts[i].Busted {
				p.TurnDarts[i].Score = SegmentScore(p.TurnDarts[i].Segment)
			}
		}
		// Recalculate score from remaining turn darts
		turnTotal := 0
		for _, d := range p.TurnDarts {
			turnTotal += d.Score
		}
		p.TurnScore = turnTotal
		p.Score = p.ScoreAtTurnStart - turnTotal
	} else {
		// Normal dart — restore score, handling zeroed darts from a prior bust
		realScore := last.Score
		if realScore == 0 && last.Segment.Value > 0 && !last.Busted {
			// Dart was zeroed during a bust that was already undone — restore from segment
			realScore = SegmentScore(last.Segment)
		}
		p.Score += realScore
		p.TurnScore -= realScore
	}

	// Revert stats — skip for bust darts (score was 0, stats weren't meaningfully added)
	if !last.Busted {
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
	}

	return nil
}

func (g *X01GameState) IsCheckoutPossible(score int) bool {
	if score > 170 || score < 2 {
		return false
	}
	checkouts := map[int]bool{
		2: true, 4: true, 6: true, 8: true, 10: true,
		12: true, 14: true, 16: true, 18: true, 20: true,
		22: true, 24: true, 26: true, 28: true, 30: true,
		32: true, 34: true, 36: true, 38: true, 40: true,
		50: true,
	}
	return checkouts[score]
}

func (g *X01GameState) RecomputeScores() {
	for _, p := range g.Players {
		totalThrown := 0
		for _, r := range p.History {
			totalThrown += r.Score
		}
		p.Score = g.StartingScore - totalThrown
	}
}
