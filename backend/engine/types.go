package engine

import (
	"fmt"
	"math"
)

type SegmentType int

const (
	Single SegmentType = iota
	Double
	Triple
	OuterBull
	Bullseye
)

func (t SegmentType) String() string {
	switch t {
	case Single:
		return "single"
	case Double:
		return "double"
	case Triple:
		return "triple"
	case OuterBull:
		return "outer_bull"
	case Bullseye:
		return "bullseye"
	default:
		return "unknown"
	}
}

type Segment struct {
	Type      SegmentType `json:"type"`
	Value     int         `json:"value"`
	Multiplier int        `json:"multiplier"`
	RawLabel  string      `json:"raw_label,omitempty"`
}

func (s Segment) String() string {
	switch s.Type {
	case Single:
		return fmt.Sprintf("%d", s.Value)
	case Double:
		return fmt.Sprintf("D%d", s.Value)
	case Triple:
		return fmt.Sprintf("T%d", s.Value)
	case OuterBull:
		return "25"
	case Bullseye:
		return "50"
	default:
		return ""
	}
}

func SegmentScore(seg Segment) int {
	switch seg.Type {
	case Single:
		return seg.Value
	case Double:
		return seg.Value * 2
	case Triple:
		return seg.Value * 3
	case OuterBull:
		return 25
	case Bullseye:
		return 50
	default:
		return 0
	}
}

func SegmentLabel(seg Segment) string {
	switch seg.Type {
	case Single:
		if seg.Value == 25 {
			return "25"
		}
		return fmt.Sprintf("%d", seg.Value)
	case Double:
		return fmt.Sprintf("D%d", seg.Value)
	case Triple:
		return fmt.Sprintf("T%d", seg.Value)
	case OuterBull:
		return "25"
	case Bullseye:
		return "50"
	default:
		return ""
	}
}

func IsCricketNumber(val int) bool {
	for _, n := range CricketNumbers {
		if n == val {
			return true
		}
	}
	return false
}

type ThrowRecord struct {
	Segment     Segment `json:"segment"`
	Label       string  `json:"label"`
	Score       int     `json:"score"`
	Round       int     `json:"round"`
	DartNum     int     `json:"dart_num"`
	ExtraScore  int     `json:"extra_score,omitempty"`
}

type GameStats struct {
	TotalScore   int            `json:"total_score"`
	ThrowCount   int            `json:"throw_count"`
	RowCount     int            `json:"row_count"`
	SegmentHits  map[string]int `json:"segment_hits"`
	TypeHits     map[string]int `json:"type_hits"`
}

func NewGameStats() *GameStats {
	return &GameStats{
		TotalScore:  0,
		ThrowCount:  0,
		RowCount:    0,
		SegmentHits: make(map[string]int),
		TypeHits:    make(map[string]int),
	}
}

func (gs *GameStats) RecordThrow(record ThrowRecord) {
	gs.ThrowCount++
	gs.TotalScore += record.Score
	if record.Label != "" {
		gs.SegmentHits[record.Label]++
	}
	typeName := record.Segment.Type.String()
	gs.TypeHits[typeName]++
	if record.DartNum == 1 {
		gs.RowCount++
	}
}

func (gs *GameStats) Accuracy() float64 {
	if gs.ThrowCount == 0 {
		return 0.0
	}
	return math.Round(float64(gs.ThrowCount-gs.SegmentHits[""]) / float64(gs.ThrowCount) * 100)
}