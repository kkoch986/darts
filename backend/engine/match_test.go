package engine

import "testing"

func TestRecordLegWin_Cricket(t *testing.T) {
	p1 := &MatchPlayer{ID: "p1", Name: "Ken"}
	p2 := &MatchPlayer{ID: "p2", Name: "Bot"}
	m, err := NewMatch("cricket", 0, 1, []*MatchPlayer{p1, p2}, 0)
	if err != nil {
		t.Fatal(err)
	}
	g := m.CurrentGameState.(*CricketGameState)
	// Force a winner.
	g.IsOver = true
	g.Winner = g.Players[0]
	if m.RecordLegWin(g.Winner.ID) != true {
		t.Fatal("expected match to end")
	}
	if m.Status != "completed" {
		t.Fatalf("expected completed, got %s", m.Status)
	}
}

func TestRecordLegWin_X01(t *testing.T) {
	p1 := &MatchPlayer{ID: "p1", Name: "Ken"}
	p2 := &MatchPlayer{ID: "p2", Name: "Bot"}
	m, err := NewMatch("x01", 501, 1, []*MatchPlayer{p1, p2}, 0)
	if err != nil {
		t.Fatal(err)
	}
	g := m.CurrentGameState.(*X01GameState)
	g.IsOver = true
	g.Winner = g.Players[0]
	if m.RecordLegWin(g.Winner.ID) != true {
		t.Fatal("expected match to end")
	}
	if m.Status != "completed" {
		t.Fatalf("expected completed, got %s", m.Status)
	}
}
