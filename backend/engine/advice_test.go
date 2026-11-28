package engine

import (
	"strings"
	"testing"
)

// x01AdviceState returns a two-player X01 state with the given remaining
// scores; the first player is on turn.
func x01AdviceState(scores ...int) *X01GameState {
	g := makeTestGame(501, len(scores))
	for i, s := range scores {
		g.Players[i].Score = s
	}
	return g
}

// cricketAdviceState returns a two-player cricket state with the given marks
// per number (missing entries mean 0) and scores; player 0 is on turn.
func cricketAdviceState(myMarks, oppMarks map[int]int, scores ...int) *CricketGameState {
	g := makeTestCricketGame(2)
	for _, n := range CricketNumbers {
		g.Players[0].Marks[n] = myMarks[n]
		g.Players[1].Marks[n] = oppMarks[n]
	}
	if len(scores) > 0 {
		g.Players[0].Score = scores[0]
	}
	if len(scores) > 1 {
		g.Players[1].Score = scores[1]
	}
	return g
}

func closedMarks(exclude int) map[int]int {
	m := make(map[int]int, len(CricketNumbers))
	for _, n := range CricketNumbers {
		m[n] = 3
	}
	if exclude > 0 {
		m[exclude] = 0
	}
	return m
}

// Scores that no combination of up to three standard darts can finish.
var unreachableCheckoutScores = map[int]bool{
	159: true, 162: true, 163: true, 165: true, 166: true, 168: true, 169: true,
}

func TestCheckoutTableCoversEveryReachableScore(t *testing.T) {
	for score := 2; score <= maxCheckoutScore; score++ {
		routes := checkoutDartsForScore(score)
		if unreachableCheckoutScores[score] {
			if len(routes) != 0 {
				t.Errorf("score %d: expected no routes, got %d (%s)", score, len(routes), labelsOf(routes))
			}
			continue
		}
		if len(routes) == 0 {
			t.Errorf("score %d: expected at least one route", score)
		}
	}
}

func TestCheckoutRoutesAreValidDarts(t *testing.T) {
	for score := 2; score <= maxCheckoutScore; score++ {
		routes := checkoutDartsForScore(score)
		if len(routes) == 0 {
			continue
		}
		if len(routes) > 3 {
			t.Errorf("score %d: expected at most 3 routes, got %d", score, len(routes))
		}
		for _, r := range routes {
			if r.DartCount != len(r.Darts) {
				t.Errorf("score %d: dart count %d != %d labels", score, r.DartCount, len(r.Darts))
			}
			if r.DartCount < 1 || r.DartCount > 3 {
				t.Errorf("score %d: %s has %d darts", score, strings.Join(r.Darts, " "), r.DartCount)
			}
			total := 0
			for i, label := range r.Darts {
				s, err := ParseSegment(label)
				if err != nil {
					t.Errorf("score %d: dart %q does not parse: %v", score, label, err)
					continue
				}
				total += SegmentScore(s)
				if i == r.DartCount-1 {
					if s.Type != Double && s.Type != Bullseye {
						t.Errorf("score %d: %s ends on a %v, not a double or bullseye", score, label, s.Type)
					}
				}
			}
			if total != score {
				t.Errorf("score %d: %s sums to %d", score, strings.Join(r.Darts, " "), total)
			}
		}
		for i := 1; i < len(routes); i++ {
			prev, next := routes[i-1], routes[i]
			if prev.DartCount > next.DartCount ||
				(prev.DartCount == next.DartCount && prev.Difficulty > next.Difficulty) {
				t.Errorf("score %d: routes not ordered by darts then difficulty: %s(%d/%d) then %s(%d/%d)",
					score, labelsOf([]AdviceRoute{prev}), prev.DartCount, prev.Difficulty,
					labelsOf([]AdviceRoute{next}), next.DartCount, next.Difficulty)
			}
		}
	}
}

func TestCheckoutTableKnownFirstRoutes(t *testing.T) {
	cases := []struct {
		score  int
		finish string
	}{
		{170, "T20 T20 DB"},
		{167, "T20 T19 DB"},
		{161, "T20 T17 DB"},
		{160, "T20 T20 D20"},
		{158, "T20 T20 D19"},
		{156, "T20 T20 D18"},
		{155, "T20 T19 D19"},
		{153, "T20 T19 D18"},
		{50, "DB"},
		{40, "D20"},
		{11, "9 D1"},
		{10, "D5"},
		{9, "7 D1"},
		{4, "D2"},
		{3, "1 D1"},
		{2, "D1"},
	}
	for _, tc := range cases {
		routes := checkoutDartsForScore(tc.score)
		if len(routes) == 0 {
			t.Errorf("score %d: no routes, want %q", tc.score, tc.finish)
			continue
		}
		if got := strings.Join(routes[0].Darts, " "); got != tc.finish {
			t.Errorf("score %d: first route %q, want %q", tc.score, got, tc.finish)
		}
	}
}

func TestCheckoutDartsForScoreOutOfRange(t *testing.T) {
	for _, score := range []int{1, 171, 501} {
		if routes := checkoutDartsForScore(score); routes != nil {
			t.Errorf("score %d: expected nil, got %v", score, routes)
		}
	}
}

// labelsOf renders routes for failure messages.
func labelsOf(routes []AdviceRoute) []string {
	out := make([]string, len(routes))
	for i, r := range routes {
		out[i] = strings.Join(r.Darts, " ")
	}
	return out
}

func x01Advice(t *testing.T, score, oppScore int) *Advice {
	g := x01AdviceState(score, oppScore)
	a := computeX01Advice(g)
	if a == nil {
		t.Fatalf("score %d: expected advice", score)
	}
	return a
}

func TestX01AdviceCheckoutScores(t *testing.T) {
	for _, score := range []int{170, 167, 161, 156, 155, 40, 10, 9, 3, 2} {
		a := x01Advice(t, score, 301)
		if a.Tip != "Finish:" || a.Priority != priorityHigh {
			t.Errorf("score %d: tip %q priority %s, want Finish:/high", score, a.Tip, a.Priority)
		}
		if len(a.Routes) == 0 {
			t.Errorf("score %d: expected checkout routes", score)
		}
	}
}

func TestX01AdviceOddLowScore(t *testing.T) {
	a := x01Advice(t, 1, 301)
	if a.Tip != "Odd score — hit any single to make even" || a.Priority != priorityMedium {
		t.Errorf("got %q / %s", a.Tip, a.Priority)
	}
	if len(a.Routes) != 0 {
		t.Errorf("score 1: unexpected routes %v", labelsOf(a.Routes))
	}
}

func TestX01AdviceUnreachableScores(t *testing.T) {
	for _, score := range []int{159, 163, 165, 169} {
		a := x01Advice(t, score, 301)
		if a.Tip != "Odd — hit any single to make even" || a.Priority != priorityLow {
			t.Errorf("score %d: got %q / %s", score, a.Tip, a.Priority)
		}
		if len(a.Routes) != 0 {
			t.Errorf("score %d: unreachable scores must have no routes", score)
		}
	}
	for _, score := range []int{162, 166, 168} {
		a := x01Advice(t, score, 301)
		if a.Tip != "Aim T20 — set up finish" || a.Priority != priorityLow {
			t.Errorf("score %d: got %q / %s", score, a.Tip, a.Priority)
		}
	}
}

func TestX01AdviceHighScore(t *testing.T) {
	a := x01Advice(t, 200, 301)
	if a.Tip != "Aim T20 — reduce fast" || a.Priority != priorityLow {
		t.Errorf("got %q / %s", a.Tip, a.Priority)
	}
}

func TestX01AdviceOpponentWarning(t *testing.T) {
	a := x01Advice(t, 101, 32)
	if a.OppWarning != " · Opponent on 32 — hurry!" {
		t.Errorf("got %q", a.OppWarning)
	}
	a = x01Advice(t, 101, 41)
	if a.OppWarning != "" {
		t.Errorf("expected no warning for opponent on 41, got %q", a.OppWarning)
	}
}

func TestX01AdviceNilCases(t *testing.T) {
	g := x01AdviceState(101, 301)
	g.IsOver = true
	if computeX01Advice(g) != nil {
		t.Error("over game should have no advice")
	}

	g = x01AdviceState(101, 301)
	g.Players[0].IsBot = true
	if computeX01Advice(g) != nil {
		t.Error("bot turn should have no advice")
	}

	g = x01AdviceState(0, 301)
	if computeX01Advice(g) != nil {
		t.Error("finished player should have no advice")
	}
}

func TestCricketAdviceAllClosed(t *testing.T) {
	// Every number closed by both players: nothing to close, nothing to score on.
	g := cricketAdviceState(closedMarks(0), closedMarks(0))
	a := computeCricketAdvice(g)
	if a == nil || a.Tip != "All closed, opponent too. Go for bull!" || a.Priority != priorityMedium {
		t.Fatalf("got %+v", a)
	}
	if len(a.Moves) != 0 {
		t.Errorf("expected no moves, got %v", a.Moves)
	}

	// All closed by me, opponent leaves the bull open: score on it for free.
	g = cricketAdviceState(closedMarks(0), closedMarks(25), 200, 100)
	g.Players[1].Marks[25] = 1
	a = computeCricketAdvice(g)
	if a == nil || a.Tip != "All closed! Score on Bull — free points" || a.Priority != priorityHigh {
		t.Fatalf("got %+v", a)
	}
	if len(a.Moves) != 1 || a.Moves[0].Reason != "Score on Bull (opponent has 1/3 marks)" ||
		a.Moves[0].Priority != priorityHigh {
		t.Errorf("unexpected moves %+v", a.Moves)
	}

	// Same, but the opponent has no marks on the bull: medium priority.
	g = cricketAdviceState(closedMarks(0), closedMarks(25))
	a = computeCricketAdvice(g)
	if len(a.Moves) != 1 || a.Moves[0].Priority != priorityMedium {
		t.Errorf("expected medium score move, got %+v", a.Moves)
	}
}

func TestCricketAdviceClosingRace(t *testing.T) {
	// Both players sit at 2/3 marks on 20: each side of the closing race gets
	// its own move, and the current player's own closer is listed first.
	my, opp := closedMarks(20), closedMarks(20)
	my[20], opp[20] = 2, 2
	g := cricketAdviceState(my, opp)
	a := computeCricketAdvice(g)
	if a == nil {
		t.Fatal("expected advice")
	}
	if len(a.Moves) != 2 {
		t.Fatalf("expected 2 moves, got %+v", a.Moves)
	}
	if a.Moves[0].Reason != "Close 20 (2/3 marks)" || a.Moves[0].Type != "close" || a.Moves[0].Priority != priorityHigh {
		t.Errorf("move 0: %+v", a.Moves[0])
	}
	if a.Moves[1].Reason != "Close 20 before opponent does (2/3 marks)" {
		t.Errorf("move 1: %+v", a.Moves[1])
	}
	if a.Tip != a.Moves[0].Reason || a.Priority != priorityHigh {
		t.Errorf("tip %q priority %s", a.Tip, a.Priority)
	}
}

func TestCricketAdviceOpponentClosed(t *testing.T) {
	my, opp := closedMarks(20), closedMarks(20)
	my[20], opp[20] = 0, 3
	g := cricketAdviceState(my, opp)
	a := computeCricketAdvice(g)
	if a == nil || a.Tip != "Close 20 — opponent scoring on it" || a.Priority != priorityHigh {
		t.Fatalf("got %+v", a)
	}
}

func TestCricketAdviceOrderingAndDiff(t *testing.T) {
	// Close on 19 (2/3 marks) and score on 20 (closed, opponent has 1/3):
	// winning puts closes first, behind puts scoring first.
	my, opp := closedMarks(20), closedMarks(20)
	my[19], opp[19] = 2, 0
	my[20], opp[20] = 3, 1

	g := cricketAdviceState(my, opp, 200, 100)
	a := computeCricketAdvice(g)
	if len(a.Moves) != 2 || a.Moves[0].Reason != "Close 19 (2/3 marks)" ||
		a.Moves[1].Reason != "Score on 20 (opponent has 1/3 marks)" {
		t.Fatalf("winning order: %+v", a.Moves)
	}
	if a.Tip != "Close 19 (2/3 marks) — you're ahead by 100, close up" || a.Priority != priorityHigh {
		t.Errorf("tip %q priority %s", a.Tip, a.Priority)
	}

	g = cricketAdviceState(my, opp, 100, 200)
	a = computeCricketAdvice(g)
	if len(a.Moves) != 2 || a.Moves[0].Reason != "Score on 20 (opponent has 1/3 marks)" ||
		a.Moves[1].Reason != "Close 19 (2/3 marks)" {
		t.Fatalf("losing order: %+v", a.Moves)
	}
	if a.Tip != "Score on 20 (opponent has 1/3 marks) — behind by 100, need points" {
		t.Errorf("tip %q", a.Tip)
	}
}

func TestCricketAdviceFallbackWorkOn(t *testing.T) {
	// Nothing closeable this turn: 20 is open for both, the opponent has no
	// head start on it; the tip falls back to working on the open number.
	my, opp := closedMarks(20), closedMarks(20)
	my[20], opp[20] = 1, 1
	g := cricketAdviceState(my, opp)
	a := computeCricketAdvice(g)
	if a == nil || a.Tip != "Work on 20 (1/3)" || a.Priority != priorityLow {
		t.Fatalf("got %+v", a)
	}
	if len(a.Moves) != 0 {
		t.Errorf("expected no moves, got %+v", a.Moves)
	}
}

func TestCricketAdviceNilCases(t *testing.T) {
	g := cricketAdviceState(closedMarks(0), closedMarks(20))
	g.IsOver = true
	if computeCricketAdvice(g) != nil {
		t.Error("over game should have no advice")
	}

	g = cricketAdviceState(closedMarks(0), closedMarks(20))
	g.Players[0].IsBot = true
	if computeCricketAdvice(g) != nil {
		t.Error("bot turn should have no advice")
	}

	g = NewCricketGame(makeTestCricketGame(1).Players)
	if computeCricketAdvice(g) != nil {
		t.Error("single-player game should have no advice")
	}
}

func TestRefreshAdvice(t *testing.T) {
	x := x01AdviceState(101, 301)
	RefreshAdvice(x)
	if x.Advice == nil {
		t.Error("x01 state missing advice after refresh")
	}

	c := cricketAdviceState(closedMarks(20), closedMarks(20))
	RefreshAdvice(c)
	if c.Advice == nil {
		t.Error("cricket state missing advice after refresh")
	}

	RefreshAdvice(struct{ X int }{})
}
