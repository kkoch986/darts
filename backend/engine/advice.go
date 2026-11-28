package engine

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Advice is engine-generated strategy guidance for the current game state,
// attached to game states so it flows through game and match responses.
type Advice struct {
	Tip        string        `json:"tip"`
	Priority   string        `json:"priority"`
	OppWarning string        `json:"opp_warning,omitempty"`
	Routes     []AdviceRoute `json:"routes,omitempty"`
	Moves      []AdviceMove  `json:"moves,omitempty"`
}

// AdviceRoute is one checkout route (a sequence of darts that finishes the leg).
type AdviceRoute struct {
	Darts      []string `json:"darts"`
	DartCount  int      `json:"dart_count"`
	Difficulty int      `json:"difficulty"`
}

// AdviceMove is one recommended cricket target/move.
type AdviceMove struct {
	Number   int    `json:"number"`
	Label    string `json:"label"`
	Type     string `json:"type"`
	Reason   string `json:"reason"`
	Priority string `json:"priority"`
}

const (
	priorityHigh   = "high"
	priorityMedium = "medium"
	priorityLow    = "low"
)

// segmentDifficulty mirrors the frontend's segmentDifficulty heuristic: a rough
// cost keyed on the segment's base value and type, lower being easier to hit.
func segmentDifficulty(base int, typ SegmentType) int {
	switch typ {
	case Bullseye:
		return 10
	case Triple:
		switch {
		case base >= 19:
			return 1
		case base >= 17:
			return 2
		case base >= 15:
			return 3
		default:
			return 5
		}
	case Double:
		switch {
		case base >= 16:
			return 2
		case base >= 12:
			return 3
		case base >= 8:
			return 4
		default:
			return 6
		}
	default: // singles (including the 25 outer bull)
		return 4
	}
}

// checkoutDart is one dart in a candidate checkout route.
type checkoutDart struct {
	label string
	value int
	typ   SegmentType
	base  int
	diff  int
}

type checkoutCandidate struct {
	darts []checkoutDart
	diff  int
}

func (c checkoutCandidate) label() string {
	parts := make([]string, len(c.darts))
	for i, d := range c.darts {
		parts[i] = d.label
	}
	return strings.Join(parts, " ")
}

// Checkout routes are generated once and cached per score. Setup darts are all
// singles (1-20, 25), doubles and triples; finish darts are doubles and the
// bullseye ("DB"), which is how a checkout leg must always end.
const maxCheckoutScore = 170

var (
	checkoutOnce  sync.Once
	checkoutTable map[int][]AdviceRoute
)

func checkoutDartsForScore(score int) []AdviceRoute {
	if score < 2 || score > maxCheckoutScore {
		return nil
	}
	checkoutOnce.Do(func() { checkoutTable = buildCheckoutTable() })
	return checkoutTable[score]
}

// buildCheckoutSetups returns every non-finishing dart, sorted descending by
// value (difficulty as tiebreak) so enumeration order favors conventional
// high-scoring routes when rank criteria tie.
func buildCheckoutSetups() []checkoutDart {
	var out []checkoutDart
	for v := 1; v <= 20; v++ {
		out = append(out, checkoutDart{
			label: fmt.Sprintf("%d", v), value: v, typ: Single, base: v,
			diff: segmentDifficulty(v, Single),
		})
	}
	out = append(out, checkoutDart{
		label: "25", value: 25, typ: OuterBull, base: 25,
		diff: segmentDifficulty(25, OuterBull),
	})
	for v := 1; v <= 20; v++ {
		out = append(out, checkoutDart{
			label: fmt.Sprintf("D%d", v), value: v * 2, typ: Double, base: v,
			diff: segmentDifficulty(v, Double),
		})
	}
	for v := 1; v <= 20; v++ {
		out = append(out, checkoutDart{
			label: fmt.Sprintf("T%d", v), value: v * 3, typ: Triple, base: v,
			diff: segmentDifficulty(v, Triple),
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].value != out[j].value {
			return out[i].value > out[j].value
		}
		return out[i].diff < out[j].diff
	})
	return out
}

// buildCheckoutFinishes returns every dart legal as the final dart of a
// checkout: doubles 1-20 and the bullseye.
func buildCheckoutFinishes() []checkoutDart {
	var out []checkoutDart
	for v := 1; v <= 20; v++ {
		out = append(out, checkoutDart{
			label: fmt.Sprintf("D%d", v), value: v * 2, typ: Double, base: v,
			diff: segmentDifficulty(v, Double),
		})
	}
	out = append(out, checkoutDart{
		label: "DB", value: 50, typ: Bullseye, base: 25,
		diff: segmentDifficulty(25, Bullseye),
	})
	return out
}

func buildCheckoutTable() map[int][]AdviceRoute {
	setups := buildCheckoutSetups()
	finishes := buildCheckoutFinishes()

	buckets := make([][]checkoutCandidate, maxCheckoutScore+1)
	add := func(sum int, darts ...checkoutDart) {
		if sum < 2 || sum > maxCheckoutScore {
			return
		}
		diff := 0
		for _, d := range darts {
			diff += d.diff
		}
		owned := make([]checkoutDart, len(darts))
		copy(owned, darts)
		buckets[sum] = append(buckets[sum], checkoutCandidate{darts: owned, diff: diff})
	}

	for _, f := range finishes {
		add(f.value, f)
	}
	for _, s := range setups {
		for _, f := range finishes {
			add(s.value+f.value, s, f)
		}
	}
	for _, a := range setups {
		for _, b := range setups {
			for _, f := range finishes {
				add(a.value+b.value+f.value, a, b, f)
			}
		}
	}

	table := make(map[int][]AdviceRoute, maxCheckoutScore)
	for score := 2; score <= maxCheckoutScore; score++ {
		cands := buckets[score]
		if len(cands) == 0 {
			continue
		}
		sort.SliceStable(cands, func(i, j int) bool {
			ci, cj := cands[i], cands[j]
			if len(ci.darts) != len(cj.darts) {
				return len(ci.darts) < len(cj.darts)
			}
			if ci.diff != cj.diff {
				return ci.diff < cj.diff
			}
			for k := 0; k < len(ci.darts) && k < len(cj.darts); k++ {
				if ci.darts[k].value != cj.darts[k].value {
					return ci.darts[k].value > cj.darts[k].value
				}
			}
			return false // fully equal: the earlier route wins
		})
		if len(cands) > 3 {
			cands = cands[:3]
		}
		routes := make([]AdviceRoute, 0, len(cands))
		for _, c := range cands {
			routes = append(routes, AdviceRoute{
				Darts:      strings.Fields(c.label()),
				DartCount:  len(c.darts),
				Difficulty: c.diff,
			})
		}
		table[score] = routes
	}
	return table
}

// suggestX01Tip mirrors the frontend's suggestSegment helper for scores that
// have no direct checkout route.
func suggestX01Tip(score int) string {
	if score > 170 {
		return "Aim T20 — reduce fast"
	}
	if score%2 != 0 {
		target := score - 1
		if target >= 2 && target <= 20 && target%2 == 0 {
			return fmt.Sprintf("Hit S%d → leaves D%d", target, target/2)
		}
		return "Odd — hit any single to make even"
	}
	if checkouts := checkoutDartsForScore(score); len(checkouts) > 0 {
		return fmt.Sprintf("Finish: %s", strings.Join(checkouts[0].Darts, " "))
	}
	if score > 40 {
		return "Aim T20 — set up finish"
	}
	return fmt.Sprintf("Aim D%d to finish", score/2)
}

// computeX01Advice mirrors the frontend advisor's branch logic, using the
// generated checkout table instead of the hand-maintained route list.
func computeX01Advice(g *X01GameState) *Advice {
	if g.IsOver {
		return nil
	}
	current := g.CurrentTurnPlayer()
	if current == nil || current.IsBot || current.Score <= 0 {
		return nil
	}

	var opp *X01Player
	for _, p := range g.Players {
		if p != current && p.ID != current.ID {
			opp = p
			break
		}
	}

	score := current.Score
	tip := ""
	priority := priorityMedium
	var routes []AdviceRoute

	if checkouts := checkoutDartsForScore(score); len(checkouts) > 0 {
		routes = checkouts
		tip = "Finish:"
		priority = priorityHigh
	} else if score <= 70 && score%2 != 0 {
		target := score - 1
		if target >= 2 && target <= 20 {
			tip = fmt.Sprintf("Hit S%d → leaves D%d", target, target/2)
		} else if checkouts := checkoutDartsForScore(target); len(checkouts) > 0 {
			routes = checkouts
			tip = fmt.Sprintf("Make %d even — then finish:", target)
		} else {
			tip = "Odd score — hit any single to make even"
		}
		priority = priorityMedium
	} else {
		tip = suggestX01Tip(score)
		if score <= 50 {
			priority = priorityHigh
		} else {
			priority = priorityLow
		}
	}

	oppWarning := ""
	if opp != nil && opp.Score > 0 && opp.Score <= 40 {
		oppWarning = fmt.Sprintf(" · Opponent on %d — hurry!", opp.Score)
	}

	return &Advice{
		Tip:        tip,
		Priority:   priority,
		OppWarning: oppWarning,
		Routes:     routes,
	}
}

// cricketLabel renders a cricket number the way the frontend labels it: "Bull"
// for 25, the plain number otherwise.
func cricketLabel(n int) string {
	if n == 25 {
		return "Bull"
	}
	return strconv.Itoa(n)
}

func priorityRank(p string) int {
	switch p {
	case priorityHigh:
		return 0
	case priorityMedium:
		return 1
	default:
		return 2
	}
}

// cricketMoveLess mirrors the frontend's stable sort of cricket moves:
// priority first, then close-before-score when winning (score-first when
// behind), then higher numbers.
func cricketMoveLess(a, b AdviceMove, imWinning bool) bool {
	ra, rb := priorityRank(a.Priority), priorityRank(b.Priority)
	if ra != rb {
		return ra < rb
	}
	if a.Type != b.Type {
		if imWinning {
			return a.Type == "close"
		}
		return a.Type == "score"
	}
	return a.Number > b.Number
}

// computeCricketAdvice mirrors the frontend advisor: the numbers worth closing
// or scoring on this turn, plus a one-line tip.
func computeCricketAdvice(g *CricketGameState) *Advice {
	if g.IsOver {
		return nil
	}
	current := g.CurrentTurnPlayer()
	if current == nil || current.IsBot {
		return nil
	}

	var opp *CricketPlayer
	for _, p := range g.Players {
		if p != current && p.ID != current.ID {
			opp = p
			break
		}
	}
	if opp == nil {
		return nil
	}

	myMarks, oppMarks := current.Marks, opp.Marks

	// Closed counts drive the "all closed" tip; myOpen drives the fallback.
	var myOpen, myClosed []int
	myClosedCount := 0
	for _, n := range CricketNumbers {
		if myMarks[n] >= 3 {
			myClosedCount++
			myClosed = append(myClosed, n)
		} else {
			myOpen = append(myOpen, n)
		}
	}

	// Numbers I can score on because only I have them closed.
	var scoringTargets []int
	for _, n := range myClosed {
		if oppMarks[n] < 3 {
			scoringTargets = append(scoringTargets, n)
		}
	}

	// Every number that is not closed by both players yields zero or more
	// candidate moves; the conditions are independent, so one number can
	// produce several moves (e.g. I have 2 marks on a number the opponent
	// also has 2 marks on).
	var moves []AdviceMove
	for _, n := range CricketNumbers {
		label := cricketLabel(n)
		my := myMarks[n]
		op := oppMarks[n]
		iHaveIt := my >= 3
		oppHasIt := op >= 3
		if iHaveIt && oppHasIt {
			continue
		}

		if my == 2 && !oppHasIt {
			moves = append(moves, AdviceMove{
				Number: n, Label: label, Type: "close",
				Reason:   fmt.Sprintf("Close %s (2/3 marks)", label),
				Priority: priorityHigh,
			})
		}
		if iHaveIt && !oppHasIt {
			prio := priorityMedium
			if op >= 1 {
				prio = priorityHigh
			}
			moves = append(moves, AdviceMove{
				Number: n, Label: label, Type: "score",
				Reason:   fmt.Sprintf("Score on %s (opponent has %d/3 marks)", label, op),
				Priority: prio,
			})
		}
		if oppHasIt && !iHaveIt {
			moves = append(moves, AdviceMove{
				Number: n, Label: label, Type: "close",
				Reason:   fmt.Sprintf("Close %s — opponent scoring on it", label),
				Priority: priorityHigh,
			})
		}
		if op == 2 && my < 3 {
			moves = append(moves, AdviceMove{
				Number: n, Label: label, Type: "close",
				Reason:   fmt.Sprintf("Close %s before opponent does (%d/3 marks)", label, op),
				Priority: priorityHigh,
			})
		}
	}

	scoreDiff := current.Score - opp.Score
	imWinning := scoreDiff > 0
	sort.SliceStable(moves, func(i, j int) bool {
		return cricketMoveLess(moves[i], moves[j], imWinning)
	})

	tip := ""
	priority := priorityMedium
	switch {
	case myClosedCount == len(CricketNumbers):
		if len(scoringTargets) > 0 {
			// Numerically descending, so the bull (25) sorts first.
			sort.SliceStable(scoringTargets, func(i, j int) bool {
				return scoringTargets[i] > scoringTargets[j]
			})
			tip = fmt.Sprintf("All closed! Score on %s — free points", cricketLabel(scoringTargets[0]))
			priority = priorityHigh
		} else {
			tip = "All closed, opponent too. Go for bull!"
			priority = priorityMedium
		}
	case len(moves) > 0:
		best := moves[0]
		tip = best.Reason
		priority = best.Priority
		if imWinning && scoreDiff > 20 {
			tip += fmt.Sprintf(" — you're ahead by %d, close up", scoreDiff)
		} else if !imWinning && scoreDiff < -20 {
			tip += fmt.Sprintf(" — behind by %d, need points", -scoreDiff)
		}
	case len(myOpen) > 0:
		// Fallback: the open number the opponent has the most marks on.
		sort.SliceStable(myOpen, func(i, j int) bool {
			return oppMarks[myOpen[i]] > oppMarks[myOpen[j]]
		})
		n := myOpen[0]
		tip = fmt.Sprintf("Work on %s (%d/3)", cricketLabel(n), myMarks[n])
		priority = priorityLow
	}

	return &Advice{Tip: tip, Priority: priority, Moves: moves}
}

// RefreshAdvice recomputes strategy advice for a game state in place, so the
// engine-generated advice survives serialization to and from the database.
func RefreshAdvice(state interface{}) {
	switch s := state.(type) {
	case *X01GameState:
		s.Advice = computeX01Advice(s)
	case *CricketGameState:
		s.Advice = computeCricketAdvice(s)
	}
}
