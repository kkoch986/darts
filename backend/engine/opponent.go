package engine

import (
	"fmt"
	"math"
	"math/rand"
)

type Difficulty string

const (
	Easy         Difficulty = "easy"
	Medium       Difficulty = "medium"
	Hard         Difficulty = "hard"
	Professional Difficulty = "professional"
)

type Opponent struct {
	Name       string     `json:"name"`
	Difficulty Difficulty `json:"difficulty"`
	RNG        *rand.Rand
}

type BotResult struct {
	Segment  Segment
	AimLabel string
}

func NewOpponent(name string, diff Difficulty) *Opponent {
	return &Opponent{
		Name:       name,
		Difficulty: diff,
		RNG:        rand.New(rand.NewSource(rand.Int63())),
	}
}

// ─── 2D Board Geometry ────────────────────────────────────────────────────────
//
// Coordinate system: origin at board center, x = right, y = down.
// 20 is at top (0°, north), angles increase clockwise.
//
// Ring radii (0–200 scale):
//   Bullseye   0–7
//   Outer Bull 7–19
//   Inner Sgl 19–117
//   Triple   117–126
//   Outer Sgl 126–191
//   Double   191–200

func segmentToXY(seg Segment) (x, y float64) {
	switch seg.Type {
	case Bullseye:
		return 0, 0
	case OuterBull:
		return 0, -13
	}

	var angle float64
	for i, n := range boardOrder {
		if n == seg.Value {
			angle = float64(i) * 18.0
			break
		}
	}
	rad := angle * math.Pi / 180.0

	var r float64
	switch seg.Type {
	case Triple:
		r = 121.5
	case Double:
		r = 195.5
	default:
		r = 70
	}
	return r * math.Sin(rad), -r * math.Cos(rad)
}

func xyToSegment(x, y float64) Segment {
	r := math.Sqrt(x*x + y*y)
	if r > 200 {
		return Segment{Type: Single, Value: 0, Multiplier: 1, RawLabel: "Miss"}
	}

	angle := math.Atan2(x, -y) * 180.0 / math.Pi
	if angle < 0 {
		angle += 360
	}

	idx := int(math.Round(angle/18.0)) % 20
	value := boardOrder[idx]

	switch {
	case r <= 7:
		return Segment{Type: Bullseye, Value: 25, Multiplier: 2, RawLabel: "DB"}
	case r <= 19:
		return Segment{Type: OuterBull, Value: 25, Multiplier: 1, RawLabel: "SB"}
	case r <= 117:
		return Segment{Type: Single, Value: value, Multiplier: 1, RawLabel: fmt.Sprintf("S%d", value)}
	case r <= 126:
		return Segment{Type: Triple, Value: value, Multiplier: 3, RawLabel: fmt.Sprintf("T%d", value)}
	case r <= 191:
		return Segment{Type: Single, Value: value, Multiplier: 1, RawLabel: fmt.Sprintf("%d", value)}
	default:
		return Segment{Type: Double, Value: value, Multiplier: 2, RawLabel: fmt.Sprintf("D%d", value)}
	}
}

func (o *Opponent) deviate(aim Segment) Segment {
	ax, ay := segmentToXY(aim)
	sigma := o.deviationSigma()
	dx := o.RNG.NormFloat64() * sigma
	dy := o.RNG.NormFloat64() * sigma
	return xyToSegment(ax+dx, ay+dy)
}

func (o *Opponent) deviationSigma() float64 {
	switch o.Difficulty {
	case Easy:
		return 50
	case Medium:
		return 30
	case Hard:
		return 15
	case Professional:
		return 6
	}
	return 50
}

// ─── Public API ────────────────────────────────────────────────────────────────

func (o *Opponent) ThrowX01(remaining int) BotResult {
	switch o.Difficulty {
	case Easy:
		return o.x01Easy(remaining)
	case Medium:
		return o.x01Medium(remaining)
	case Hard:
		return o.x01Hard(remaining)
	case Professional:
		return o.x01Professional(remaining)
	}
	return o.x01Easy(remaining)
}

func (o *Opponent) ThrowCricket(openTargets []int, ownMarks map[int]int, oppMarks []map[int]int, ownScore int, oppScores []int) BotResult {
	switch o.Difficulty {
	case Easy:
		return o.cricketEasy()
	case Medium:
		return o.cricketMedium(openTargets, ownMarks, ownScore, oppScores)
	case Hard:
		return o.cricketHard(openTargets, ownMarks, ownScore, oppScores)
	case Professional:
		return o.cricketProfessional(openTargets, ownMarks, oppMarks, ownScore, oppScores)
	}
	return o.cricketEasy()
}

// ─── X01 Aiming Strategies ─────────────────────────────────────────────────────

func (o *Opponent) x01Easy(remaining int) BotResult {
	var aim Segment
	if remaining <= 40 && remaining%2 == 0 && o.RNG.Float64() < 0.25 {
		val := remaining / 2
		aim = Segment{Type: Double, Value: val, Multiplier: 2}
	} else {
		val := boardOrder[o.RNG.Intn(20)]
		aim = Segment{Type: Single, Value: val, Multiplier: 1}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func (o *Opponent) x01Medium(remaining int) BotResult {
	var aim Segment
	if remaining <= 50 && remaining%2 == 0 && o.RNG.Float64() < 0.5 {
		val := remaining / 2
		aim = Segment{Type: Double, Value: val, Multiplier: 2}
	} else if remaining <= 60 && remaining%2 == 0 && o.RNG.Float64() < 0.3 {
		val := remaining / 2
		aim = Segment{Type: Double, Value: val, Multiplier: 2}
	} else if o.RNG.Float64() < 0.35 {
		val := boardOrder[o.RNG.Intn(20)]
		aim = Segment{Type: Triple, Value: val, Multiplier: 3}
	} else {
		val := boardOrder[o.RNG.Intn(20)]
		aim = Segment{Type: Single, Value: val, Multiplier: 1}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func (o *Opponent) x01Hard(remaining int) BotResult {
	var aim Segment
	if remaining <= 50 {
		if checkout, ok := smartCheckout(remaining); ok && o.RNG.Float64() < 0.7 {
			aim = checkout
		}
	}
	if aim.Value == 0 {
		if remaining > 60 && o.RNG.Float64() < 0.6 {
			val := boardOrder[o.RNG.Intn(20)]
			aim = Segment{Type: Triple, Value: val, Multiplier: 3}
		} else {
			val := boardOrder[o.RNG.Intn(20)]
			aim = Segment{Type: Single, Value: val, Multiplier: 1}
		}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func (o *Opponent) x01Professional(remaining int) BotResult {
	var aim Segment
	if remaining <= 170 {
		if checkout, ok := smartCheckout(remaining); ok && o.RNG.Float64() < 0.8 {
			aim = checkout
		}
	}
	if aim.Value == 0 {
		val := boardOrder[o.RNG.Intn(20)]
		aim = Segment{Type: Triple, Value: val, Multiplier: 3}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

// ─── Cricket Aiming Strategies ─────────────────────────────────────────────────

func (o *Opponent) cricketEasy() BotResult {
	var aim Segment
	if o.RNG.Float64() < 0.4 {
		val := CricketNumbers[o.RNG.Intn(len(CricketNumbers))]
		aim = Segment{Type: Single, Value: val, Multiplier: 1}
	} else {
		val := boardOrder[o.RNG.Intn(20)]
		aim = Segment{Type: Single, Value: val, Multiplier: 1}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func isAhead(ownScore int, oppScores []int) bool {
	for _, s := range oppScores {
		if ownScore < s {
			return false
		}
	}
	return true
}

func (o *Opponent) cricketMedium(openTargets []int, ownMarks map[int]int, ownScore int, oppScores []int) BotResult {
	var ownUnclosed []int
	for _, n := range CricketNumbers {
		if ownMarks[n] < 3 {
			ownUnclosed = append(ownUnclosed, n)
		}
	}

	ahead := isAhead(ownScore, oppScores)
	var aim Segment
	switch {
	case ahead && len(ownUnclosed) > 0:
		aim = o.cricketAimFor(leastMarksTarget(ownUnclosed, ownMarks))
	case len(ownUnclosed) > 0 && o.RNG.Float64() < 0.7:
		aim = o.cricketAimFor(leastMarksTarget(ownUnclosed, ownMarks))
	case len(openTargets) > 0:
		val := openTargets[o.RNG.Intn(len(openTargets))]
		aim = o.cricketAimFor(val)
	default:
		val := CricketNumbers[o.RNG.Intn(len(CricketNumbers))]
		aim = o.cricketAimFor(val)
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func (o *Opponent) cricketHard(openTargets []int, ownMarks map[int]int, ownScore int, oppScores []int) BotResult {
	var aim Segment
	if target := leastMarksTarget(CricketNumbers, ownMarks); target != -1 {
		if !isAhead(ownScore, oppScores) && len(openTargets) > 0 && o.RNG.Float64() < 0.35 {
			val := openTargets[o.RNG.Intn(len(openTargets))]
			aim = o.cricketAimFor(val)
		} else {
			aim = o.cricketAimFor(target)
		}
	} else if len(openTargets) > 0 {
		val := openTargets[o.RNG.Intn(len(openTargets))]
		aim = o.cricketAimFor(val)
	} else {
		aim = Segment{Type: Triple, Value: boardOrder[o.RNG.Intn(20)], Multiplier: 3}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func leastMarksTarget(candidates []int, ownMarks map[int]int) int {
	leastClosed := -1
	leastMarks := 4
	for _, n := range candidates {
		if ownMarks[n] < 3 && (leastMarks == 4 || ownMarks[n] < leastMarks) {
			leastMarks = ownMarks[n]
			leastClosed = n
		}
	}
	return leastClosed
}

func (o *Opponent) cricketProfessional(openTargets []int, ownMarks map[int]int, oppMarks []map[int]int, ownScore int, oppScores []int) BotResult {
	ahead := isAhead(ownScore, oppScores)
	bestTarget := -1
	bestScore := 0
	for _, n := range CricketNumbers {
		score := 0
		if ownMarks[n] < 3 {
			score = (3 - ownMarks[n]) * 10
		}
		if !ahead {
			for _, opp := range oppMarks {
				if opp[n] > 0 && opp[n] < 3 {
					score += 15
				}
			}
		}
		if n >= 19 {
			score += 5
		}
		if score > bestScore {
			bestScore = score
			bestTarget = n
		}
	}
	var aim Segment
	if bestTarget != -1 {
		aim = o.cricketAimFor(bestTarget)
	} else {
		aim = Segment{Type: Triple, Value: boardOrder[o.RNG.Intn(20)], Multiplier: 3}
	}
	return BotResult{Segment: o.deviate(aim), AimLabel: SegmentLabel(aim)}
}

func (o *Opponent) cricketAimFor(val int) Segment {
	if val == 25 {
		if o.RNG.Float64() < 0.7 {
			return Segment{Type: Bullseye, Value: 25, Multiplier: 2}
		}
		return Segment{Type: OuterBull, Value: 25, Multiplier: 1}
	}
	return Segment{Type: Triple, Value: val, Multiplier: 3}
}

// ─── Checkout Helper ────────────────────────────────────────────────────────────

func smartCheckout(remaining int) (Segment, bool) {
	checkoutMap := map[int]Segment{
		2:  {Type: Double, Value: 1, Multiplier: 2},
		4:  {Type: Double, Value: 2, Multiplier: 2},
		6:  {Type: Double, Value: 3, Multiplier: 2},
		8:  {Type: Double, Value: 4, Multiplier: 2},
		10: {Type: Double, Value: 5, Multiplier: 2},
		12: {Type: Double, Value: 6, Multiplier: 2},
		14: {Type: Double, Value: 7, Multiplier: 2},
		16: {Type: Double, Value: 8, Multiplier: 2},
		18: {Type: Double, Value: 9, Multiplier: 2},
		20: {Type: Double, Value: 10, Multiplier: 2},
		22: {Type: Double, Value: 11, Multiplier: 2},
		24: {Type: Double, Value: 12, Multiplier: 2},
		26: {Type: Double, Value: 13, Multiplier: 2},
		28: {Type: Double, Value: 14, Multiplier: 2},
		30: {Type: Double, Value: 15, Multiplier: 2},
		32: {Type: Double, Value: 16, Multiplier: 2},
		34: {Type: Double, Value: 17, Multiplier: 2},
		36: {Type: Double, Value: 18, Multiplier: 2},
		38: {Type: Double, Value: 19, Multiplier: 2},
		40: {Type: Double, Value: 20, Multiplier: 2},
		50: {Type: Bullseye, Value: 25, Multiplier: 2},
	}
	if seg, ok := checkoutMap[remaining]; ok {
		return seg, true
	}
	for v := 1; v <= 20; v++ {
		dartVal := v * 2
		rest := remaining - dartVal
		if rest > 0 && rest != 1 {
			return Segment{Type: Double, Value: v, Multiplier: 2}, true
		}
	}
	if remaining > 50 {
		rest := remaining - 50
		if rest > 0 && rest != 1 {
			return Segment{Type: Bullseye, Value: 25, Multiplier: 2}, true
		}
	}
	return Segment{}, false
}
