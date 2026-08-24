package engine

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

var CricketNumbers = []int{20, 19, 18, 17, 16, 15, 25}

type CricketPlayer struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	IsBot      bool          `json:"is_bot"`
	Difficulty string        `json:"difficulty,omitempty"`
	Marks      map[int]int   `json:"marks"`
	Score      int           `json:"score"`
	DartsUsed  int           `json:"darts_used"`
	TurnDarts  []ThrowRecord `json:"turn_darts"`
	History    []ThrowRecord `json:"history"`
	Opens      map[int]bool  `json:"opens"`
}

type CricketGameState struct {
	ID            string                `json:"id"`
	Type          string                `json:"type"`
	Players       []*CricketPlayer      `json:"players"`
	CurrentPlayer int                   `json:"current_player"`
	Round         int                   `json:"round"`
	IsOver        bool                  `json:"is_over"`
	Winner        *CricketPlayer        `json:"winner,omitempty"`
	CreatedAt     time.Time             `json:"created_at"`
	Stats         map[string]*GameStats `json:"stats"`
}

func NewCricketGame(players []*CricketPlayer) *CricketGameState {
	stats := make(map[string]*GameStats)
	for _, p := range players {
		p.Marks = make(map[int]int)
		p.Opens = make(map[int]bool)
		for _, n := range CricketNumbers {
			p.Marks[n] = 0
			p.Opens[n] = false
		}
		stats[p.ID] = NewGameStats()
	}

	return &CricketGameState{
		ID:            uuid.New().String(),
		Type:          "cricket",
		Players:       players,
		CurrentPlayer: 0,
		Round:         1,
		CreatedAt:     time.Now(),
		Stats:         stats,
	}
}

func (g *CricketGameState) CurrentTurnPlayer() *CricketPlayer {
	return g.Players[g.CurrentPlayer]
}

func (g *CricketGameState) Throw(seg Segment) error {
	if g.IsOver {
		return fmt.Errorf("game is over")
	}

	p := g.CurrentTurnPlayer()
	if p.DartsUsed >= 3 {
		return fmt.Errorf("turn complete, end turn first")
	}

	p.DartsUsed++
	score := SegmentScore(seg)
	record := ThrowRecord{
		Segment: seg,
		Label:   SegmentLabel(seg),
		Score:   score,
		Round:   g.Round,
		DartNum: p.DartsUsed,
	}

	if stats, ok := g.Stats[p.ID]; ok {
		stats.RecordThrow(record)
	}

	val := seg.Value
	if !IsCricketNumber(val) {
		p.TurnDarts = append(p.TurnDarts, record)
		return nil
	}

	marks := seg.Multiplier
	if val == 25 && seg.Type == OuterBull {
		marks = 1
	}
	if val == 25 && seg.Type == Bullseye {
		marks = 2
	}

	// Was this number already closed before this throw?
	alreadyOpen := p.Opens[val]
	marksBefore := p.Marks[val]

	p.Marks[val] += marks

	if p.Marks[val] >= 3 {
		p.Opens[val] = true
	}

	if alreadyOpen {
		// Already closed: score for each mark (extra marks still count)
		for _, opp := range g.Players {
			if opp.ID == p.ID {
				continue
			}
			if opp.Marks[val] < 3 {
				p.Score += score
				record.ExtraScore += score
			}
		}
	} else if marksBefore < 3 && p.Marks[val] >= 3 {
		// This throw closes the number: extra marks beyond 3 convert to points
		extraMarks := p.Marks[val] - 3
		for i := 0; i < extraMarks; i++ {
			for _, opp := range g.Players {
				if opp.ID == p.ID {
					continue
				}
				if opp.Marks[val] < 3 {
					p.Score += val
					record.ExtraScore += val
				}
			}
		}
	}

	p.TurnDarts = append(p.TurnDarts, record)
	g.checkWin()
	return nil
}

func (g *CricketGameState) checkWin() {
	for _, p := range g.Players {
		allClosed := true
		for _, n := range CricketNumbers {
			if p.Marks[n] < 3 {
				allClosed = false
				break
			}
		}
		if !allClosed {
			continue
		}

		highestScore := true
		for _, opp := range g.Players {
			if opp.ID != p.ID && opp.Score > p.Score {
				highestScore = false
				break
			}
		}

		if highestScore {
			g.IsOver = true
			g.Winner = p
			return
		}
	}
}

func (g *CricketGameState) UndoLastThrow() error {
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

	val := last.Segment.Value
	if IsCricketNumber(val) {
		marks := last.Segment.Multiplier
		if val == 25 && last.Segment.Type == OuterBull {
			marks = 1
		}
		if val == 25 && last.Segment.Type == Bullseye {
			marks = 2
		}
		p.Marks[val] -= marks
		if p.Marks[val] < 0 {
			p.Marks[val] = 0
		}
		if p.Marks[val] < 3 {
			p.Opens[val] = false
		}

		// Revert score unconditionally if points were scored
		if last.ExtraScore > 0 {
			p.Score -= last.ExtraScore
			if p.Score < 0 {
				p.Score = 0
			}
		}
	}

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

func (g *CricketGameState) EndTurn() {
	p := g.CurrentTurnPlayer()
	if len(p.TurnDarts) > 0 {
		p.History = append(p.History, p.TurnDarts...)
	}
	p.TurnDarts = nil
	p.DartsUsed = 0

	g.CurrentPlayer = (g.CurrentPlayer + 1) % len(g.Players)
	if g.CurrentPlayer == 0 {
		g.Round++
	}
}

func (g *CricketGameState) RecomputeScores() {
	type taggedThrow struct {
		playerID string
		record   ThrowRecord
	}
	var allThrows []taggedThrow
	for _, p := range g.Players {
		for _, r := range p.History {
			allThrows = append(allThrows, taggedThrow{playerID: p.ID, record: r})
		}
	}
	for i := 0; i < len(allThrows); i++ {
		for j := i + 1; j < len(allThrows); j++ {
			a, b := allThrows[i], allThrows[j]
			if a.record.Round > b.record.Round || (a.record.Round == b.record.Round && a.record.DartNum > b.record.DartNum) {
				allThrows[i], allThrows[j] = allThrows[j], allThrows[i]
			}
		}
	}

	// Reset marks and scores
	marks := make(map[string]map[int]int)
	opens := make(map[string]map[int]bool)
	scores := make(map[string]int)
	for _, p := range g.Players {
		marks[p.ID] = make(map[int]int)
		opens[p.ID] = make(map[int]bool)
		for _, n := range CricketNumbers {
			marks[p.ID][n] = 0
			opens[p.ID][n] = false
		}
		scores[p.ID] = 0
	}

	for _, t := range allThrows {
		seg := t.record.Segment
		val := seg.Value
		if !IsCricketNumber(val) {
			continue
		}

		m := seg.Multiplier
		if val == 25 && seg.Type == OuterBull {
			m = 1
		}
		if val == 25 && seg.Type == Bullseye {
			m = 2
		}

		alreadyOpen := opens[t.playerID][val]
		marksBefore := marks[t.playerID][val]
		marks[t.playerID][val] += m
		if marks[t.playerID][val] >= 3 {
			opens[t.playerID][val] = true
		}

		if alreadyOpen {
			for _, opp := range g.Players {
				if opp.ID != t.playerID && marks[opp.ID][val] < 3 {
					scores[t.playerID] += SegmentScore(seg)
				}
			}
		} else if marksBefore < 3 && marks[t.playerID][val] >= 3 {
			extraMarks := marks[t.playerID][val] - 3
			for i := 0; i < extraMarks; i++ {
				for _, opp := range g.Players {
					if opp.ID != t.playerID && marks[opp.ID][val] < 3 {
						scores[t.playerID] += val
					}
				}
			}
		}
	}

	for _, p := range g.Players {
		p.Score = scores[p.ID]
		p.Marks = marks[p.ID]
		p.Opens = opens[p.ID]
	}
}
