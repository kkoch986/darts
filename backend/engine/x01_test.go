package engine

import (
	"testing"
)

func makeTestGame(startingScore int, numPlayers int) *X01GameState {
	players := make([]*X01Player, numPlayers)
	for i := 0; i < numPlayers; i++ {
		players[i] = &X01Player{
			ID:   "p" + string(rune('0'+i)),
			Name: "Player" + string(rune('0'+i)),
		}
	}
	return NewX01Game(X01Config{StartingScore: startingScore}, players)
}

func seg(label string) Segment {
	s, _ := ParseSegment(label)
	return s
}

// --- Basic throw mechanics ---

func TestThrow_DecrementsScore(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	if g.Players[0].Score != 41 {
		t.Fatalf("expected 41, got %d", g.Players[0].Score)
	}
}

func TestThrow_TurnScoreAccumulates(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("S1"))
	if g.Players[0].TurnScore != 61 {
		t.Fatalf("expected turn score 61, got %d", g.Players[0].TurnScore)
	}
}

func TestThrow_DartsUsedIncrements(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("S20"))
	g.Throw(seg("S1"))
	g.Throw(seg("S5"))
	if g.Players[0].DartsUsed != 3 {
		t.Fatalf("expected 3 darts used, got %d", g.Players[0].DartsUsed)
	}
}

func TestThrow_RejectsAfter3Darts(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	g.Throw(seg("S20"))
	err := g.Throw(seg("S1"))
	if err == nil {
		t.Fatal("expected error after 3 darts")
	}
}

func TestThrow_RejectsAfterGameOver(t *testing.T) {
	g := makeTestGame(40, 1)
	g.Throw(seg("D20"))
	if !g.IsOver {
		t.Fatal("game should be over")
	}
	err := g.Throw(seg("S1"))
	if err == nil {
		t.Fatal("expected error after game over")
	}
}

// --- Bust conditions ---

func TestBust_ScoreGoesBelowZero(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 101 -> 41
	g.Throw(seg("T20")) // 41 -> bust (-19), reverts to turn start (101)
	if !g.Players[0].Busted {
		t.Fatal("expected busted=true")
	}
	if g.Players[0].Score != 101 {
		t.Fatalf("expected score reverted to 101, got %d", g.Players[0].Score)
	}
}

func TestBust_ScoreGoesToOne(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 101 -> 41
	g.Throw(seg("D20")) // 41 -> 1, reverts to turn start (101)
	if !g.Players[0].Busted {
		t.Fatal("expected busted=true")
	}
	if g.Players[0].Score != 101 {
		t.Fatalf("expected score reverted to 101, got %d", g.Players[0].Score)
	}
}

func TestBust_ZeroWithoutDouble(t *testing.T) {
	g := makeTestGame(20, 1)
	g.Throw(seg("S20")) // 20 -> 0 with single
	if !g.Players[0].Busted {
		t.Fatal("expected busted=true — must finish on double")
	}
	if g.Players[0].Score != 20 {
		t.Fatalf("expected score reverted to 20, got %d", g.Players[0].Score)
	}
}

func TestBust_TurnDartsPreserved(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 101 -> 41
	g.Throw(seg("T20")) // 41 -> bust
	if len(g.Players[0].TurnDarts) != 2 {
		t.Fatalf("expected 2 turn darts, got %d", len(g.Players[0].TurnDarts))
	}
	last := g.Players[0].TurnDarts[1]
	if !last.Busted || last.Label != "BUST" {
		t.Fatalf("expected bust dart, got label=%s busted=%v", last.Label, last.Busted)
	}
}

func TestBust_PreviousDartsZeroScored(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // normal dart
	g.Throw(seg("T20")) // bust dart
	// First dart should have score=0 now (zeroed during bust)
	if g.Players[0].TurnDarts[0].Score != 0 {
		t.Fatalf("expected first dart score=0 after bust, got %d", g.Players[0].TurnDarts[0].Score)
	}
}

func TestBust_PreviousDartsKeepLabels(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20"))
	if g.Players[0].TurnDarts[0].Label != "T20" {
		t.Fatalf("expected T20 label preserved, got %s", g.Players[0].TurnDarts[0].Label)
	}
}

func TestBust_RejectsNewThrow(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	err := g.Throw(seg("S1"))
	if err == nil {
		t.Fatal("expected error: can't throw after bust")
	}
}

// --- Valid checkout ---

func TestCheckout_DoubleOut(t *testing.T) {
	g := makeTestGame(40, 1)
	g.Throw(seg("D20"))
	if !g.IsOver {
		t.Fatal("game should be over")
	}
	if g.Winner == nil || g.Winner.ID != g.Players[0].ID {
		t.Fatal("expected player 0 to win")
	}
}

func TestCheckout_BullseyeOut(t *testing.T) {
	g := makeTestGame(50, 1)
	g.Throw(seg("DB"))
	if !g.IsOver {
		t.Fatal("game should be over")
	}
	if g.Winner == nil {
		t.Fatal("expected winner")
	}
}

func TestCheckout_SingleDoesNotEnd(t *testing.T) {
	g := makeTestGame(20, 1)
	g.Throw(seg("S20"))
	if g.IsOver {
		t.Fatal("single to 0 should not end game")
	}
	if !g.Players[0].Busted {
		t.Fatal("single to 0 should bust")
	}
}

func TestCheckout_TripleDoesNotEnd(t *testing.T) {
	g := makeTestGame(60, 1)
	g.Throw(seg("T20")) // 60 -> 0, but triple not double
	if g.IsOver {
		t.Fatal("triple to 0 should not end game")
	}
}

// --- EndTurn ---

func TestEndTurn_AdvancesPlayer(t *testing.T) {
	g := makeTestGame(101, 2)
	g.Throw(seg("S1"))
	g.EndTurn()
	if g.CurrentPlayer != 1 {
		t.Fatalf("expected player 1, got %d", g.CurrentPlayer)
	}
}

func TestEndTurn_IncrementsRound(t *testing.T) {
	g := makeTestGame(101, 2)
	g.Throw(seg("S1"))
	g.EndTurn() // player 0 -> player 1
	g.Throw(seg("S1"))
	g.EndTurn() // player 1 -> player 0, round++
	if g.Round != 2 {
		t.Fatalf("expected round 2, got %d", g.Round)
	}
}

func TestEndTurn_MovesDartsToHistory(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("S1"))
	g.EndTurn()
	if len(g.Players[0].History) != 2 {
		t.Fatalf("expected 2 history entries, got %d", len(g.Players[0].History))
	}
	if len(g.Players[0].TurnDarts) != 0 {
		t.Fatal("TurnDarts should be empty after EndTurn")
	}
}

func TestEndTurn_ResetsTurnState(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.EndTurn()
	p := g.Players[0]
	if p.TurnScore != 0 || p.DartsUsed != 0 || p.Busted {
		t.Fatal("turn state should be reset")
	}
}

func TestEndTurn_SetsScoreAtTurnStart(t *testing.T) {
	g := makeTestGame(101, 2)
	g.Throw(seg("T20")) // 101 -> 41
	g.EndTurn()
	next := g.Players[1]
	if next.ScoreAtTurnStart != 101 {
		t.Fatalf("expected ScoreAtTurnStart=101, got %d", next.ScoreAtTurnStart)
	}
}

func TestEndTurn_BustClearsFlag(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	g.EndTurn()
	if g.Players[0].Busted {
		t.Fatal("Busted should be cleared after EndTurn")
	}
}

// --- Undo ---

func TestUndo_RestoresScore(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 101 -> 41
	g.UndoLastThrow()
	if g.Players[0].Score != 101 {
		t.Fatalf("expected score=101 after undo, got %d", g.Players[0].Score)
	}
}

func TestUndo_EmptyTurn(t *testing.T) {
	g := makeTestGame(101, 1)
	err := g.UndoLastThrow()
	if err == nil {
		t.Fatal("expected error on empty undo")
	}
}

func TestUndo_RestoresTurnScore(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("S5"))
	g.UndoLastThrow()
	if g.Players[0].TurnScore != 60 {
		t.Fatalf("expected turn score 60, got %d", g.Players[0].TurnScore)
	}
}

func TestUndo_DecrementsDartsUsed(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("S1"))
	g.Throw(seg("S1"))
	g.UndoLastThrow()
	if g.Players[0].DartsUsed != 1 {
		t.Fatalf("expected 1 dart used, got %d", g.Players[0].DartsUsed)
	}
}

func TestUndo_AfterBust_ClearsBusted(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	// Undo the bust dart
	g.UndoLastThrow()
	if g.Players[0].Busted {
		t.Fatal("Busted should be cleared after undoing bust dart")
	}
}

func TestUndo_AfterBust_RestoresDartScores(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // score=60
	g.Throw(seg("T20")) // bust
	// Undo the bust dart
	g.UndoLastThrow()
	// First dart should have score restored
	if g.Players[0].TurnDarts[0].Score != 60 {
		t.Fatalf("expected first dart score=60 after undo bust, got %d", g.Players[0].TurnDarts[0].Score)
	}
}

func TestUndo_AfterBust_CanThrowAgain(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	g.UndoLastThrow()
	// Should be able to throw again
	err := g.Throw(seg("S1"))
	if err != nil {
		t.Fatalf("should be able to throw after undo bust, got: %v", err)
	}
}

// --- RecomputeScores ---

func TestRecomputeScores_Normal(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("S1"))
	g.EndTurn()
	// Manually corrupt score
	g.Players[0].Score = 999
	g.RecomputeScores()
	// T20(60) + S1(1) = 61 thrown; 101 - 61 = 40
	if g.Players[0].Score != 40 {
		t.Fatalf("expected recomputed score=40, got %d", g.Players[0].Score)
	}
}

func TestRecomputeScores_AfterBust(t *testing.T) {
	g := makeTestGame(101, 2)
	// Player 0 throws T20 (60) then busts with T20
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	g.EndTurn()
	// Player 1 throws S1
	g.Throw(seg("S1"))
	g.EndTurn()
	// Manually corrupt both scores
	g.Players[0].Score = 999
	g.Players[1].Score = 999
	g.RecomputeScores()
	// Player 0: bust turn should contribute 0, so score = 101
	// Player 1: S1 = 1 thrown, so score = 100
	if g.Players[0].Score != 101 {
		t.Fatalf("expected player 0 score=101, got %d", g.Players[0].Score)
	}
	if g.Players[1].Score != 100 {
		t.Fatalf("expected player 1 score=100, got %d", g.Players[1].Score)
	}
}

// --- Multi-player ---

func TestMultiPlayer_TurnAlternation(t *testing.T) {
	g := makeTestGame(101, 3)
	g.Throw(seg("S1"))
	g.EndTurn() // p0 -> p1
	if g.CurrentPlayer != 1 {
		t.Fatalf("expected player 1, got %d", g.CurrentPlayer)
	}
	g.Throw(seg("S1"))
	g.EndTurn() // p1 -> p2
	if g.CurrentPlayer != 2 {
		t.Fatalf("expected player 2, got %d", g.CurrentPlayer)
	}
	g.Throw(seg("S1"))
	g.EndTurn() // p2 -> p0, round++
	if g.CurrentPlayer != 0 {
		t.Fatalf("expected player 0, got %d", g.CurrentPlayer)
	}
	if g.Round != 2 {
		t.Fatalf("expected round 2, got %d", g.Round)
	}
}

// --- Edge cases ---

func TestThrow_FirstDartBust(t *testing.T) {
	g := makeTestGame(20, 1)
	g.Throw(seg("T20")) // 20 -> bust (-40)
	if !g.Players[0].Busted {
		t.Fatal("expected busted on first dart")
	}
	if g.Players[0].Score != 20 {
		t.Fatalf("expected score=20, got %d", g.Players[0].Score)
	}
	if len(g.Players[0].TurnDarts) != 1 {
		t.Fatalf("expected 1 turn dart, got %d", len(g.Players[0].TurnDarts))
	}
}

func TestThrow_ThirdDartCheckout(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 101 -> 41
	g.Throw(seg("S1"))  // 41 -> 40
	g.Throw(seg("D20")) // 40 -> 0, wins
	if !g.IsOver {
		t.Fatal("game should be over on third dart checkout")
	}
	if g.Winner.ID != g.Players[0].ID {
		t.Fatal("expected player 0 to win")
	}
}

func TestBust_TurnScoreReset(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // turn score = 60
	g.Throw(seg("T20")) // bust
	if g.Players[0].TurnScore != 0 {
		t.Fatalf("expected turn score reset to 0, got %d", g.Players[0].TurnScore)
	}
}

func TestBust_DartCountIncludesBust(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust, dart 2
	if g.Players[0].DartsUsed != 2 {
		t.Fatalf("expected 2 darts used including bust, got %d", g.Players[0].DartsUsed)
	}
}

func TestThrow_DoublesIn(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("D20")) // 101 -> 61
	g.Throw(seg("D20")) // 61 -> 21
	g.Throw(seg("D10")) // 21 -> 1 — BUST
	if !g.Players[0].Busted {
		t.Fatal("should bust going to 1")
	}
	if g.Players[0].Score != 101 {
		t.Fatalf("score should revert to 101, got %d", g.Players[0].Score)
	}
}

// --- Undo after bust: multi-dart turns ---

func TestUndo_AfterBust_ThreeDartsRestoreCorrectly(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 60
	g.Throw(seg("S1"))  // 1, total 61, score=40
	g.Throw(seg("T20")) // bust (-20), score reverts to 101
	// Undo the bust
	g.UndoLastThrow()
	p := g.Players[0]
	if p.Busted {
		t.Fatal("should not be busted")
	}
	if p.Score != 40 {
		t.Fatalf("expected score=40, got %d", p.Score)
	}
	if p.TurnScore != 61 {
		t.Fatalf("expected turn score=61, got %d", p.TurnScore)
	}
	if len(p.TurnDarts) != 2 {
		t.Fatalf("expected 2 darts remaining, got %d", len(p.TurnDarts))
	}
	if p.TurnDarts[0].Score != 60 {
		t.Fatalf("expected dart 1 score=60, got %d", p.TurnDarts[0].Score)
	}
	if p.TurnDarts[1].Score != 1 {
		t.Fatalf("expected dart 2 score=1, got %d", p.TurnDarts[1].Score)
	}
}

func TestUndo_AfterBust_ThenThrowAgain(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 60, score=41
	g.Throw(seg("T20")) // bust
	g.UndoLastThrow()
	// Score is 41. Throw S1 to get to 40, then D20 to finish
	err := g.Throw(seg("S1"))
	if err != nil {
		t.Fatalf("S1 should not bust, got: %v", err)
	}
	if g.Players[0].Score != 40 {
		t.Fatalf("expected score=40, got %d", g.Players[0].Score)
	}
	err = g.Throw(seg("D20"))
	if err != nil {
		t.Fatalf("D20 from 40 should checkout, got: %v", err)
	}
	if !g.IsOver {
		t.Fatal("game should be over")
	}
}

func TestUndo_AfterBust_CompleteRedo(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20")) // 60
	g.Throw(seg("T20")) // bust
	g.UndoLastThrow()   // back to score=40
	g.UndoLastThrow()   // back to score=101
	if g.Players[0].Score != 101 {
		t.Fatalf("expected score=101 after full undo, got %d", g.Players[0].Score)
	}
	if g.Players[0].TurnScore != 0 {
		t.Fatalf("expected turn score=0, got %d", g.Players[0].TurnScore)
	}
	if g.Players[0].DartsUsed != 0 {
		t.Fatalf("expected 0 darts used, got %d", g.Players[0].DartsUsed)
	}
}

// --- Bust then EndTurn then undo is impossible ---

func TestBust_EndTurnThenNewTurn(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.Throw(seg("T20")) // bust
	g.EndTurn()
	// Score should be 101, new turn
	if g.Players[0].Score != 101 {
		t.Fatalf("expected score=101, got %d", g.Players[0].Score)
	}
	g.Throw(seg("T20")) // 101 -> 41
	if g.Players[0].Score != 41 {
		t.Fatalf("expected score=41, got %d", g.Players[0].Score)
	}
}

// --- Game over blocks undo ---

func TestUndo_RejectedAfterWin(t *testing.T) {
	g := makeTestGame(40, 1)
	g.Throw(seg("D20"))
	err := g.UndoLastThrow()
	if err == nil {
		t.Fatal("can't undo after game over")
	}
}

// --- Stats correctness ---

func TestStats_IncrementOnThrow(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	stats := g.Stats[g.Players[0].ID]
	if stats.ThrowCount != 1 {
		t.Fatalf("expected throw count 1, got %d", stats.ThrowCount)
	}
	if stats.TotalScore != 60 {
		t.Fatalf("expected total score 60, got %d", stats.TotalScore)
	}
}

func TestStats_DecrementOnUndo(t *testing.T) {
	g := makeTestGame(101, 1)
	g.Throw(seg("T20"))
	g.UndoLastThrow()
	stats := g.Stats[g.Players[0].ID]
	if stats.ThrowCount != 0 {
		t.Fatalf("expected throw count 0, got %d", stats.ThrowCount)
	}
	if stats.TotalScore != 0 {
		t.Fatalf("expected total score 0, got %d", stats.TotalScore)
	}
}

// --- First dart checkout ---

func TestCheckout_FirstDartD10(t *testing.T) {
	g := makeTestGame(20, 1)
	g.Throw(seg("D10"))
	if !g.IsOver {
		t.Fatal("should be over")
	}
	if g.Winner.ID != g.Players[0].ID {
		t.Fatal("player 0 should win")
	}
}

func TestCheckout_FirstDartD25(t *testing.T) {
	g := makeTestGame(50, 1)
	g.Throw(seg("DB"))
	if !g.IsOver {
		t.Fatal("should be over on DB")
	}
}
