package engine

import (
	"fmt"
	"strconv"
	"strings"
)

type SegmentType int

const (
	Single SegmentType = iota
	Double
	Triple
	OuterBull
	Bullseye
)

type Segment struct {
	Type       SegmentType `json:"type"`
	Value      int         `json:"value"`
	Multiplier int         `json:"multiplier"`
	RawLabel   string      `json:"raw_label,omitempty"`
}

var boardOrder = [20]int{20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5}

func AllSegments() []Segment {
	var segs []Segment
	for _, v := range boardOrder {
		segs = append(segs, Segment{Type: Single, Value: v, Multiplier: 1})
		segs = append(segs, Segment{Type: Double, Value: v, Multiplier: 2})
		segs = append(segs, Segment{Type: Triple, Value: v, Multiplier: 3})
	}
	segs = append(segs, Segment{Type: OuterBull, Value: 25, Multiplier: 1})
	segs = append(segs, Segment{Type: Bullseye, Value: 25, Multiplier: 2})
	return segs
}

func SegmentScore(s Segment) int {
	return s.Value * s.Multiplier
}

func SegmentLabel(s Segment) string {
	if s.Value == 0 {
		return "Miss"
	}
	switch s.Type {
	case Double:
		return fmt.Sprintf("D%d", s.Value)
	case Triple:
		return fmt.Sprintf("T%d", s.Value)
	case OuterBull:
		return "SB"
	case Bullseye:
		return "DB"
	default:
		return strconv.Itoa(s.Value)
	}
}

func ParseSegment(label string) (Segment, error) {
	original := strings.TrimSpace(label)
	label = strings.ToUpper(original)

	if label == "MISS" || label == "0" || label == "NO SCORE" {
		return Segment{Type: Single, Value: 0, Multiplier: 1, RawLabel: "MISS"}, nil
	}

	if label == "DB" || label == "D25" {
		return Segment{Type: Bullseye, Value: 25, Multiplier: 2, RawLabel: "DB"}, nil
	}
	if label == "SB" || label == "S25" || label == "BULL" {
		return Segment{Type: OuterBull, Value: 25, Multiplier: 1, RawLabel: "SB"}, nil
	}

	if strings.HasPrefix(label, "D") {
		v, err := strconv.Atoi(label[1:])
		if err != nil {
			return Segment{}, fmt.Errorf("invalid segment: %s", label)
		}
		if v < 1 || v > 20 {
			return Segment{}, fmt.Errorf("invalid segment: %s", label)
		}
		return Segment{Type: Double, Value: v, Multiplier: 2, RawLabel: fmt.Sprintf("D%d", v)}, nil
	}

	if strings.HasPrefix(label, "T") {
		v, err := strconv.Atoi(label[1:])
		if err != nil {
			return Segment{}, fmt.Errorf("invalid segment: %s", label)
		}
		if v < 1 || v > 20 {
			return Segment{}, fmt.Errorf("invalid segment: %s", label)
		}
		return Segment{Type: Triple, Value: v, Multiplier: 3, RawLabel: fmt.Sprintf("T%d", v)}, nil
	}

	clean := strings.TrimPrefix(label, "S")
	v, err := strconv.Atoi(clean)
	if err != nil {
		return Segment{}, fmt.Errorf("invalid segment: %s", label)
	}
	if v < 1 || v > 20 {
		return Segment{}, fmt.Errorf("invalid segment: %s", label)
	}

	// Preserve S prefix if user sent it (inner single), otherwise plain number (outer single)
	raw := fmt.Sprintf("%d", v)
	if strings.HasPrefix(label, "S") {
		raw = fmt.Sprintf("S%d", v)
	}
	return Segment{Type: Single, Value: v, Multiplier: 1, RawLabel: raw}, nil
}

func IsCricketNumber(v int) bool {
	return v >= 15 && v <= 20 || v == 25
}

func MarksForSegment(s Segment) int {
	if !IsCricketNumber(s.Value) {
		return 0
	}
	if s.Value == 25 {
		if s.Type == Bullseye {
			return 2
		}
		return 1
	}
	return s.Multiplier
}
