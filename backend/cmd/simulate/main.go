package main

import (
	"flag"
	"fmt"
	"math/rand"

	"github.com/ken/darts-backend/engine"
)

func main() {
	gameType := flag.String("game", "cricket", "game type: x01 or cricket")
	p1Diff := flag.String("p1", "easy", "player 1 difficulty")
	p2Diff := flag.String("p2", "professional", "player 2 difficulty")
	games := flag.Int("n", 1000, "number of games to simulate")
	startScore := flag.Int("score", 501, "starting score for x01")
	flag.Parse()

	rng := rand.New(rand.NewSource(42))

	var p1Wins, p2Wins int
	var p1TotalDarts, p2TotalDarts int

	for i := 0; i < *games; i++ {
		var w, d1, d2 int
		switch *gameType {
		case "x01":
			w, d1, d2 = simX01(rng, *p1Diff, *p2Diff, *startScore)
		default:
			w, d1, d2 = simCricket(rng, *p1Diff, *p2Diff)
		}
		if w == 1 {
			p1Wins++
		} else {
			p2Wins++
		}
		p1TotalDarts += d1
		p2TotalDarts += d2
	}

	p1WinPct := float64(p1Wins) / float64(*games) * 100
	p1Avg := float64(p1TotalDarts) / float64(*games)
	p2Avg := float64(p2TotalDarts) / float64(*games)
	fmt.Printf("%-12s vs %-12s  P1 win: %d/%d (%.0f%%)  avg darts: %.0f/%.0f\n",
		*p1Diff, *p2Diff, p1Wins, *games, p1WinPct, p1Avg, p2Avg)
}

func simX01(rng *rand.Rand, p1Diff, p2Diff string, start int) (winner, p1Darts, p2Darts int) {
	p1 := makeOpp(rng, "P1", p1Diff)
	p2 := makeOpp(rng, "P2", p2Diff)
	p1Score, p2Score := start, start
	turn := 0
	dartsInTurn := 0

	for total := 0; total < 300; total++ {
		var score *int
		var myDarts *int
		var opp *engine.Opponent
		if turn%2 == 0 {
			score = &p1Score
			myDarts = &p1Darts
			opp = p1
		} else {
			score = &p2Score
			myDarts = &p2Darts
			opp = p2
		}

		result := opp.ThrowX01(*score)
		seg := result.Segment
		throwScore := engine.SegmentScore(seg)
		newScore := *score - throwScore
		dartsInTurn++
		*myDarts++

		bust := newScore < 0 || newScore == 1
		if !bust && newScore == 0 && seg.Type != engine.Double && seg.Type != engine.Bullseye {
			bust = true
		}

		if !bust {
			*score = newScore
			if *score == 0 {
				return turn%2 + 1, p1Darts, p2Darts
			}
		}

		if dartsInTurn >= 3 {
			dartsInTurn = 0
			turn++
		}
	}

	if p1Score < p2Score {
		return 1, p1Darts, p2Darts
	}
	return 2, p1Darts, p2Darts
}

func simCricket(rng *rand.Rand, p1Diff, p2Diff string) (winner, p1Darts, p2Darts int) {
	p1 := makeOpp(rng, "P1", p1Diff)
	p2 := makeOpp(rng, "P2", p2Diff)

	type state struct {
		marks map[int]int
		score int
		darts int
	}
	s1 := state{marks: make(map[int]int)}
	s2 := state{marks: make(map[int]int)}

	// Initialize marks
	for _, n := range engine.CricketNumbers {
		s1.marks[n] = 0
		s2.marks[n] = 0
	}

	turn := 0
	dartsInTurn := 0

	for total := 0; total < 300; total++ {
		var opp *engine.Opponent
		var me, them *state
		if turn%2 == 0 {
			opp, me, them = p1, &s1, &s2
		} else {
			opp, me, them = p2, &s2, &s1
		}

		// Pass my open targets (numbers I need to close)
		var myOpenTargets []int
		for _, n := range engine.CricketNumbers {
			if me.marks[n] < 3 {
				myOpenTargets = append(myOpenTargets, n)
			}
		}

		// Opponent marks for the bot to consider
		oppMarksList := []map[int]int{them.marks}

		result := opp.ThrowCricket(myOpenTargets, me.marks, oppMarksList, me.score, []int{them.score})
		seg := result.Segment
		dartsInTurn++
		me.darts++

		val := seg.Value
		if !engine.IsCricketNumber(val) {
			goto checkWin
		}

		{
			m := seg.Multiplier
			if val == 25 && seg.Type == engine.OuterBull {
				m = 1
			}
			if val == 25 && seg.Type == engine.Bullseye {
				m = 2
			}
			me.marks[val] += m

			// Score: I need marks >= 3 AND opponent needs < 3
			if me.marks[val] >= 3 && them.marks[val] < 3 {
				me.score += engine.SegmentScore(seg)
			}
		}

	checkWin:
		{
			// Win: all my numbers closed AND I have highest score
			allClosed := true
			for _, n := range engine.CricketNumbers {
				if me.marks[n] < 3 {
					allClosed = false
					break
				}
			}
			if allClosed && me.score >= them.score {
				return turn%2 + 1, s1.darts, s2.darts
			}
		}

		if dartsInTurn >= 3 {
			dartsInTurn = 0
			turn++
		}
	}

	if s1.score > s2.score {
		return 1, s1.darts, s2.darts
	}
	return 2, s1.darts, s2.darts
}

func makeOpp(rng *rand.Rand, name, diff string) *engine.Opponent {
	opp := engine.NewOpponent(name, engine.Difficulty(diff))
	opp.RNG = rng
	return opp
}
