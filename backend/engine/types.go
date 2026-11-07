package engine

import (
	"fmt"
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

