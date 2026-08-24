package engine

import "time"

type GameStats struct {
	ThrowCount        int            `json:"throw_count"`
	TurnCount         int            `json:"turn_count"`
	SegmentHits       map[string]int `json:"segment_hits"`
	TypeHits          map[string]int `json:"type_hits"`
	TotalScore        int            `json:"total_score"`
	TurnAverages      []float64      `json:"turn_averages"`
	CheckoutAttempts  int            `json:"checkout_attempts"`
	CheckoutSuccesses int            `json:"checkout_successes"`
	HighTurn          int            `json:"high_turn"`
	HitTimestamps     []time.Time    `json:"hit_timestamps"`
}

func NewGameStats() *GameStats {
	return &GameStats{
		SegmentHits: make(map[string]int),
		TypeHits:    make(map[string]int),
	}
}

func (s *GameStats) RecordThrow(r ThrowRecord) {
	s.ThrowCount++
	s.TotalScore += r.Score
	label := r.Label
	if r.Segment.Type == Single && r.Segment.Value > 0 && r.Segment.Value != 25 {
		label = r.Segment.RawLabel
	}
	if label == "" {
		label = r.Label
	}
	s.SegmentHits[label]++
	typeName := "single"
	switch r.Segment.Type {
	case Double:
		typeName = "double"
	case Triple:
		typeName = "triple"
	case OuterBull:
		typeName = "outer_bull"
	case Bullseye:
		typeName = "bullseye"
	}
	s.TypeHits[typeName]++
	s.HitTimestamps = append(s.HitTimestamps, r.Timestamp)
}

func (s *GameStats) RecordTurnEnd(turnScore int) {
	s.TurnCount++
	s.TurnAverages = append(s.TurnAverages, float64(s.TotalScore)/float64(s.TurnCount))
	if turnScore > s.HighTurn {
		s.HighTurn = turnScore
	}
}

func (s *GameStats) RecordCheckoutAttempt(success bool) {
	s.CheckoutAttempts++
	if success {
		s.CheckoutSuccesses++
	}
}

type LifetimeStats struct {
	PlayerID        string         `json:"player_id"`
	GamesPlayed     int            `json:"games_played"`
	GamesWon        int            `json:"games_wins"`
	TotalThrows     int            `json:"total_throws"`
	SegmentHits     map[string]int `json:"segment_hits"`
	AveragePerTurn  float64        `json:"average_per_turn"`
	CheckoutRate    float64        `json:"checkout_rate"`
	HighestCheckout int            `json:"highest_checkout"`
	HeatmapData     map[string]int `json:"heatmap_data"`
}

func NewLifetimeStats() *LifetimeStats {
	return &LifetimeStats{
		SegmentHits: make(map[string]int),
		HeatmapData: make(map[string]int),
	}
}
