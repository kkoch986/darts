package engine

import (
	"testing"
)

func makePlayers(n int) []*TournamentPlayer {
	p := make([]*TournamentPlayer, n)
	for i := 0; i < n; i++ {
		p[i] = &TournamentPlayer{ID: string(rune('A' + i)), Name: string(rune('A' + i))}
	}
	return p
}

func TestRoundRobinFourPlayers(t *testing.T) {
	tour := NewRoundRobinTournament("rr", "x01", 501, 1, makePlayers(4))
	if len(tour.Bracket) != 6 {
		t.Fatalf("expected 6 fixtures, got %d", len(tour.Bracket))
	}
	ready := tour.ReadySlots()
	if len(ready) != 6 {
		t.Fatalf("expected 6 ready slots, got %d", len(ready))
	}
	for _, s := range ready {
		tour.AdvanceWinner(s.ID, s.Player1)
	}
	if tour.Status != "completed" {
		t.Fatalf("expected tournament completed, got %s", tour.Status)
	}
	if tour.Winner == nil {
		t.Fatal("expected winner")
	}
	if len(tour.Standings) != 4 {
		t.Fatalf("expected 4 standings, got %d", len(tour.Standings))
	}
}

func TestRoundRobinThreePlayers(t *testing.T) {
	tour := NewRoundRobinTournament("rr", "x01", 501, 1, makePlayers(3))
	// 3 players: 3 matches.
	if len(tour.Bracket) != 3 {
		t.Fatalf("expected 3 fixtures, got %d", len(tour.Bracket))
	}
	for _, s := range tour.Bracket {
		tour.AdvanceWinner(s.ID, s.Player1)
	}
	if tour.Status != "completed" {
		t.Fatalf("expected completed, got %s", tour.Status)
	}
}

func TestDoubleEliminationFourPlayers(t *testing.T) {
	tour := NewDoubleEliminationTournament("de", "x01", 501, 1, makePlayers(4))
	if tour.Status != "active" {
		t.Fatalf("expected active, got %s", tour.Status)
	}
	ready := tour.ReadySlots()
	if len(ready) != 2 {
		t.Fatalf("expected 2 first-round WB slots, got %d", len(ready))
	}
	// Simulate all matches by always picking Player1 to win.
	seen := make(map[string]bool)
	for {
		ready := tour.ReadySlots()
		if len(ready) == 0 {
			break
		}
		for _, s := range ready {
			if seen[s.ID] {
				continue
			}
			seen[s.ID] = true
			tour.AdvanceWinner(s.ID, s.Player1)
		}
	}
	if tour.Status != "completed" {
		t.Fatalf("expected completed, got %s", tour.Status)
	}
	if tour.Winner == nil {
		t.Fatal("expected winner")
	}
}
