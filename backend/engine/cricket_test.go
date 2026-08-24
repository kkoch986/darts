package engine

import (
	"testing"
)

func makeTestCricketGame(numPlayers int) *CricketGameState {
	players := make([]*CricketPlayer, numPlayers)
	for i := 0; i < numPlayers; i++ {
		players[i] = &CricketPlayer{
			ID:   "p" + string(rune('0'+i)),
			Name: "Player" + string(rune('0'+i)),
		}
	}
	return NewCricketGame(players)
}

// --- Basic mechanics ---

func TestCricket_InitialState(t *testing.T) {
	g := makeTestCricketGame(2)
	for _, n := range CricketNumbers {
		if g.Players[0].Marks[n] != 0 {
			t.Fatalf("expected 0 marks for %d, got %d", n, g.Players[0].Marks[n])
		}
		if g.Players[0].Opens[n] {
			t.Fatalf("expected %d not open", n)
		}
	}
}

func TestCricket_RejectsAfter3Darts(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	err := g.Throw(seg("S20"))
	if err == nil {
		t.Fatal("expected error after 3 darts")
	}
}

func TestCricket_NonCricketNumberIgnored(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S10"))
	if g.Players[0].Marks[10] != 0 {
		t.Fatal("non-cricket number should not add marks")
	}
	if g.Players[0].Score != 0 {
		t.Fatal("non-cricket number should not score")
	}
}

func TestCricket_TurnDartsRecorded(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	g.Throw(seg("T19"))
	if len(g.Players[0].TurnDarts) != 2 {
		t.Fatalf("expected 2 turn darts, got %d", len(g.Players[0].TurnDarts))
	}
}

// --- Marks ---

func TestCricket_SingleAddsOneMark(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	if g.Players[0].Marks[20] != 1 {
		t.Fatalf("expected 1 mark on 20, got %d", g.Players[0].Marks[20])
	}
}

func TestCricket_DoubleAddsTwoMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("D20"))
	if g.Players[0].Marks[20] != 2 {
		t.Fatalf("expected 2 marks on 20, got %d", g.Players[0].Marks[20])
	}
}

func TestCricket_TripleAddsThreeMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("T20"))
	if g.Players[0].Marks[20] != 3 {
		t.Fatalf("expected 3 marks on 20, got %d", g.Players[0].Marks[20])
	}
}

func TestCricket_SBAddsOneMark(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("SB"))
	if g.Players[0].Marks[25] != 1 {
		t.Fatalf("expected 1 mark on 25, got %d", g.Players[0].Marks[25])
	}
}

func TestCricket_DBAddsTwoMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("DB"))
	if g.Players[0].Marks[25] != 2 {
		t.Fatalf("expected 2 marks on 25, got %d", g.Players[0].Marks[25])
	}
}

// --- Closing numbers ---

func TestCricket_CloseOnTriple(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("T20"))
	if !g.Players[0].Opens[20] {
		t.Fatal("T20 should close 20")
	}
}

func TestCricket_CloseAfterThreeSingles(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	if !g.Players[0].Opens[20] {
		t.Fatal("3 singles should close 20")
	}
}

func TestCricket_NotClosedWithTwoMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("D20"))
	if g.Players[0].Opens[20] {
		t.Fatal("2 marks should not close 20")
	}
}

// --- Scoring ---

func TestCricket_NoScoreOnClosingThrow(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("T20")) // close 20, no extra marks
	if g.Players[0].Score != 0 {
		t.Fatalf("closing throw should not score, got %d", g.Players[0].Score)
	}
}

func TestCricket_ScoreOnAlreadyClosed(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("T20")) // close 20
	g.Throw(seg("T20")) // already closed, score for opponent
	// T20 = 60 points per open opponent
	if g.Players[0].Score != 60 {
		t.Fatalf("expected 60 points, got %d", g.Players[0].Score)
	}
}

func TestCricket_NoScoreWhenOpponentClosed(t *testing.T) {
	g := makeTestCricketGame(2)
	// Close 20 for both players
	g.Throw(seg("T20")) // P0 closes 20
	g.EndTurn()
	g.Throw(seg("T20")) // P1 closes 20
	g.EndTurn()
	// Now P0 hits T20 again — opponent has it closed, no score
	g.Throw(seg("T20"))
	if g.Players[0].Score != 0 {
		t.Fatalf("should not score when opponent has number closed, got %d", g.Players[0].Score)
	}
}

func TestCricket_ClosingThrowWithExtraMarks(t *testing.T) {
	g := makeTestCricketGame(2)
	// P0: S20, S20 (2 marks), then T20 (3 marks = 5 total, 2 extra)
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	g.Throw(seg("T20")) // closes 20 with 2 extra marks
	// 2 extra marks × 20 = 40 points per open opponent
	if g.Players[0].Score != 40 {
		t.Fatalf("expected 40 points from extra marks, got %d", g.Players[0].Score)
	}
}

func TestCricket_SingleExtraMark(t *testing.T) {
	g := makeTestCricketGame(2)
	// P0: D20 (2 marks), S20 (1 mark = 3 total, closes), no extra
	g.Throw(seg("D20"))
	g.Throw(seg("S20"))
	if g.Players[0].Score != 0 {
		t.Fatalf("no extra marks, expected 0, got %d", g.Players[0].Score)
	}
}

func TestCricket_MultipleOpponentsScoring(t *testing.T) {
	g := makeTestCricketGame(3)
	g.Throw(seg("T20")) // P0 closes 20
	g.EndTurn()          // P0 -> P1
	g.Throw(seg("T19")) // P1 does something else (not 20)
	g.EndTurn()          // P1 -> P2
	g.Throw(seg("S10")) // P2 does something else
	g.EndTurn()          // P2 -> P0
	// P0 hits T20 again — P1 and P2 both have Marks[20]=0 (open)
	g.Throw(seg("T20"))
	// T20 = 60 per open opponent, 2 opponents open = 120
	if g.Players[0].Score != 120 {
		t.Fatalf("expected 120 points (2 open opponents), got %d", g.Players[0].Score)
	}
}

func TestCricket_ScoreOnClosingThrow_SingleExtraMark(t *testing.T) {
	g := makeTestCricketGame(2)
	// P0: D19 (2 marks on 19), then T19 (3 marks = 5 total, 2 extra)
	g.Throw(seg("D19"))
	g.Throw(seg("T19")) // 5 marks total, 2 extra beyond 3
	// 2 extra × 19 = 38
	if g.Players[0].Score != 38 {
		t.Fatalf("expected 38, got %d", g.Players[0].Score)
	}
}

// --- Undo ---

func TestCricket_UndoRevertsMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("T20"))
	g.UndoLastThrow()
	if g.Players[0].Marks[20] != 0 {
		t.Fatalf("expected 0 marks after undo, got %d", g.Players[0].Marks[20])
	}
}

func TestCricket_UndoRevertsOpens(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("T20"))
	g.UndoLastThrow()
	if g.Players[0].Opens[20] {
		t.Fatal("20 should not be open after undo")
	}
}

func TestCricket_UndoRevertsScore(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("T20")) // close 20
	g.Throw(seg("T20")) // score 60
	if g.Players[0].Score != 60 {
		t.Fatalf("expected score=60 before undo, got %d", g.Players[0].Score)
	}
	g.UndoLastThrow()
	if g.Players[0].Score != 0 {
		t.Fatalf("expected score=0 after undo, got %d", g.Players[0].Score)
	}
}

func TestCricket_UndoEmptyTurn(t *testing.T) {
	g := makeTestCricketGame(1)
	err := g.UndoLastThrow()
	if err == nil {
		t.Fatal("expected error on empty undo")
	}
}

func TestCricket_UndoPartialMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("D20")) // 2 marks
	g.Throw(seg("S20")) // 1 mark = 3 total, close
	g.UndoLastThrow()
	if g.Players[0].Marks[20] != 2 {
		t.Fatalf("expected 2 marks after undo, got %d", g.Players[0].Marks[20])
	}
	if g.Players[0].Opens[20] {
		t.Fatal("20 should not be open after undoing closing dart")
	}
}

func TestCricket_UndoAfterCloseThenScore(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("T20")) // close, score=0
	g.Throw(seg("T20")) // score=60
	g.Throw(seg("T20")) // score=120
	// Undo last (score goes to 60)
	g.UndoLastThrow()
	if g.Players[0].Score != 60 {
		t.Fatalf("expected score=60, got %d", g.Players[0].Score)
	}
	// Undo again (score goes to 0)
	g.UndoLastThrow()
	if g.Players[0].Score != 0 {
		t.Fatalf("expected score=0, got %d", g.Players[0].Score)
	}
}

// --- Win conditions ---

func TestCricket_Win_AllClosedAndHighestScore(t *testing.T) {
	g := makeTestCricketGame(2)
	// P0 closes all numbers
	g.Throw(seg("T20"))
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.EndTurn()
	g.Throw(seg("T17"))
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.EndTurn()

	// P1 also closes all (P0 already closed all, so no scoring)
	g.Throw(seg("T20"))
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.EndTurn()
	g.Throw(seg("T17"))
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.EndTurn()

	if !g.IsOver {
		t.Fatal("game should be over when both close all")
	}
}

func TestCricket_NotOver_AllClosed_ButOpponentHigherScore(t *testing.T) {
	g := makeTestCricketGame(2)
	// P0 closes all first
	g.Throw(seg("T20"))
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.EndTurn()
	g.Throw(seg("T17"))
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.EndTurn()

	// P0 hasn't won yet because P1 hasn't closed all
	if g.IsOver {
		t.Fatal("should not be over — P1 hasn't closed all")
	}

	// P1 also closes all
	g.Throw(seg("T20"))
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.EndTurn()
	g.Throw(seg("T17"))
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.EndTurn()

	// Now both closed all — tie, P0 wins (first to close)
	if !g.IsOver {
		t.Fatal("game should be over when both close all")
	}
}

func TestCricket_NotOver_P0Closed_ButP1HigherScore(t *testing.T) {
	g := makeTestCricketGame(2)
	// P1 scores points first, then P0 closes all
	// P1 throws T20 first (no close yet, no score)
	// Actually, you can only score on already-closed numbers.
	// So to get points before closing, you need to close a number, then score on it.

	// P0: close 20
	g.Throw(seg("T20"))
	// P0: score on 20 (P1 hasn't closed it)
	g.Throw(seg("T20")) // +60
	g.Throw(seg("T20")) // +60 = 120
	g.EndTurn()

	// P1: close 20, 19, 18, 17, 16, 15, 25
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.Throw(seg("T17"))
	g.EndTurn()
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.Throw(seg("T20")) // P1 closes 20
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB"))
	g.Throw(seg("DB")) // P1 closes 25
	g.EndTurn()

	// P0: close remaining
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.Throw(seg("T17"))
	g.EndTurn()
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.Throw(seg("DB"))
	g.EndTurn()
	g.Throw(seg("DB"))
	g.Throw(seg("DB")) // P0 closes 25
	g.EndTurn()

	// Now P1 needs to close all too
	g.Throw(seg("T19"))
	g.Throw(seg("T18"))
	g.Throw(seg("T17"))
	g.EndTurn()
	g.Throw(seg("T16"))
	g.Throw(seg("T15"))
	g.Throw(seg("T20"))
	g.EndTurn()

	// Check: P0 has 120, P1 has 0
	// P0 closed all, P1 closed all — P0 should win (higher score)
	if g.Winner == nil || g.Winner.ID != g.Players[0].ID {
		t.Fatal("P0 should win with higher score")
	}
}

// --- EndTurn ---

func TestCricket_EndTurn_AdvancesPlayer(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("S20"))
	g.EndTurn()
	if g.CurrentPlayer != 1 {
		t.Fatalf("expected player 1, got %d", g.CurrentPlayer)
	}
}

func TestCricket_EndTurn_IncrementsRound(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("S20"))
	g.EndTurn()
	g.Throw(seg("S20"))
	g.EndTurn()
	if g.Round != 2 {
		t.Fatalf("expected round 2, got %d", g.Round)
	}
}

func TestCricket_EndTurn_MovesToHistory(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	g.Throw(seg("S19"))
	g.EndTurn()
	if len(g.Players[0].History) != 2 {
		t.Fatalf("expected 2 history entries, got %d", len(g.Players[0].History))
	}
}

func TestCricket_EndTurn_ResetsState(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("S20"))
	g.EndTurn()
	if g.Players[0].DartsUsed != 0 || len(g.Players[0].TurnDarts) != 0 {
		t.Fatal("turn state should be reset")
	}
}

// --- RecomputeScores ---

func TestCricket_RecomputeScores(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("T20")) // close 20
	g.Throw(seg("T20")) // score 60
	g.EndTurn()
	// Corrupt score
	g.Players[0].Score = 999
	g.RecomputeScores()
	if g.Players[0].Score != 60 {
		t.Fatalf("expected recomputed score=60, got %d", g.Players[0].Score)
	}
}

func TestCricket_RecomputeScores_Marks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("T20"))
	g.Throw(seg("S19"))
	g.EndTurn()
	// Corrupt marks
	g.Players[0].Marks[20] = 0
	g.RecomputeScores()
	if g.Players[0].Marks[20] != 3 {
		t.Fatalf("expected 3 marks on 20 after recompute, got %d", g.Players[0].Marks[20])
	}
}

// --- Non-cricket scoring edge cases ---

func TestCricket_S10_NoMarks(t *testing.T) {
	g := makeTestCricketGame(2)
	g.Throw(seg("S10"))
	if g.Players[0].Score != 0 {
		t.Fatal("S10 should not score")
	}
	if len(g.Players[0].TurnDarts) != 1 {
		t.Fatal("S10 should still be recorded as a dart")
	}
}

// --- Undo with multiple players ---

func TestCricket_Undo_MultiPlayer_ScoreRevert(t *testing.T) {
	g := makeTestCricketGame(3)
	// P0 closes 20, scores on P1 and P2
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // +60 (20 × 3 per open opponent... wait, both P1 and P2 are open)
	// Actually: P1 and P2 are open, so +60 per opponent = 120
	g.UndoLastThrow()
	if g.Players[0].Score != 0 {
		t.Fatalf("expected score=0 after undo, got %d", g.Players[0].Score)
	}
}

// --- DB/SB scoring ---

func TestCricket_SB_OneMark(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("SB"))
	if g.Players[0].Marks[25] != 1 {
		t.Fatalf("expected 1 mark on 25, got %d", g.Players[0].Marks[25])
	}
}

func TestCricket_DB_TwoMarks(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("DB"))
	if g.Players[0].Marks[25] != 2 {
		t.Fatalf("expected 2 marks on 25, got %d", g.Players[0].Marks[25])
	}
}

func TestCricket_SBDB_Close25(t *testing.T) {
	g := makeTestCricketGame(1)
	g.Throw(seg("SB")) // 1 mark
	g.Throw(seg("DB")) // 2 marks = 3 total, close
	if !g.Players[0].Opens[25] {
		t.Fatal("SB+DB should close 25")
	}
}
