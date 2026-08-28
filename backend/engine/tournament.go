package engine

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
)

type TournamentPlayer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsBot      bool   `json:"is_bot"`
	Difficulty string `json:"difficulty,omitempty"`
	Seed       int    `json:"seed"`
}

type BracketSlot struct {
	ID       string            `json:"id"`
	Round    int               `json:"round"`
	Position int               `json:"position"`
	Player1  *TournamentPlayer `json:"player1,omitempty"`
	Player2  *TournamentPlayer `json:"player2,omitempty"`
	Winner   *TournamentPlayer `json:"winner,omitempty"`
	MatchID  string            `json:"match_id,omitempty"`
	NextSlot string            `json:"next_slot,omitempty"`
	// LoserSlot is where the loser of this WB match drops (for WB slots).
	LoserSlot string `json:"loser_slot,omitempty"`
	// ResetSlot: if set, and Player2 wins, populate this slot for bracket reset.
	ResetSlot string `json:"reset_slot,omitempty"`
	// Phase: "wb", "lb", or "gf"
	Phase  string `json:"phase,omitempty"`
	Status string `json:"status"`
}

type TournamentStanding struct {
	Player *TournamentPlayer `json:"player"`
	Wins   int               `json:"wins"`
	Losses int               `json:"losses"`
	// HeadToHeadWins tracks wins against each opponent ID.
	HeadToHeadWins map[string]int `json:"-"`
}

type TournamentState struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	Type          string              `json:"type"`
	GameType      string              `json:"game_type"`
	StartingScore int                 `json:"starting_score,omitempty"`
	MatchLength   int                 `json:"match_length"`
	Status        string              `json:"status"`
	Players       []*TournamentPlayer `json:"players"`
	Bracket       []*BracketSlot      `json:"bracket"`
	// Standings is only used for round_robin.
	Standings []*TournamentStanding `json:"standings,omitempty"`
	Winner    *TournamentPlayer     `json:"winner,omitempty"`
	CreatedAt time.Time             `json:"created_at"`
}

// -------------------------------------------------------
// Single Elimination
// -------------------------------------------------------

func NewSingleEliminationTournament(name, gameType string, startingScore, matchLength int, entrants []*TournamentPlayer) *TournamentState {
	if matchLength != 3 && matchLength != 5 && matchLength != 7 {
		matchLength = 1
	}
	n := len(entrants)
	p := nextPowerOfTwo(n)
	rounds := int(math.Log2(float64(p)))

	t := newBase(name, "single_elimination", gameType, startingScore, matchLength, entrants)

	slotMap := make(map[string]*BracketSlot)
	for r := 0; r < rounds; r++ {
		slotCount := p / int(math.Pow(2, float64(r+1)))
		for pos := 0; pos < slotCount; pos++ {
			s := &BracketSlot{ID: uuid.New().String(), Round: r, Position: pos, Phase: "wb", Status: "pending"}
			t.Bracket = append(t.Bracket, s)
			slotMap[slotKey(r, pos)] = s
		}
	}
	for _, s := range t.Bracket {
		if s.Round < rounds-1 {
			s.NextSlot = slotMap[slotKey(s.Round+1, s.Position/2)].ID
		}
	}
	seedRound0(slotMap, p, entrants)
	t.advanceByes()
	return t
}

// -------------------------------------------------------
// Round Robin
// -------------------------------------------------------

func NewRoundRobinTournament(name, gameType string, startingScore, matchLength int, entrants []*TournamentPlayer) *TournamentState {
	if matchLength != 3 && matchLength != 5 && matchLength != 7 {
		matchLength = 1
	}
	t := newBase(name, "round_robin", gameType, startingScore, matchLength, entrants)

	// Generate fixtures using circle method for even rounds.
	n := len(entrants)
	players := make([]*TournamentPlayer, n)
	copy(players, entrants)
	// Pad to even.
	if n%2 == 1 {
		players = append(players, nil)
		n++
	}
	rounds := n - 1
	matchesPerRound := n / 2

	slotMap := make(map[string]*BracketSlot)
	for round := 0; round < rounds; round++ {
		for pos := 0; pos < matchesPerRound; pos++ {
			p1 := players[pos]
			p2 := players[n-1-pos]
			if p1 == nil || p2 == nil {
				continue // bye
			}
			s := &BracketSlot{
				ID:       uuid.New().String(),
				Round:    round,
				Position: pos,
				Phase:    "rr",
				Player1:  p1,
				Player2:  p2,
				Status:   "pending",
			}
			t.Bracket = append(t.Bracket, s)
			slotMap[slotKey(round, pos)] = s
		}
		// Rotate: fix first, rotate rest.
		rotated := make([]*TournamentPlayer, n)
		rotated[0] = players[0]
		rotated[1] = players[n-1]
		for i := 2; i < n; i++ {
			rotated[i] = players[i-1]
		}
		copy(players, rotated)
	}

	// Initialize standings.
	t.Standings = make([]*TournamentStanding, len(entrants))
	for i, p := range entrants {
		t.Standings[i] = &TournamentStanding{Player: p, HeadToHeadWins: make(map[string]int)}
	}
	return t
}

// ComputeStandings recalculates standings from completed bracket slots.
func (t *TournamentState) ComputeStandings() {
	if t.Type != "round_robin" {
		return
	}
	type playerStats struct {
		wins   int
		losses int
		h2h    map[string]int
	}
	stats := make(map[string]*playerStats)
	for _, p := range t.Players {
		stats[p.ID] = &playerStats{h2h: make(map[string]int)}
	}
	for _, s := range t.Bracket {
		if s.Winner == nil || s.Player1 == nil || s.Player2 == nil {
			continue
		}
		loserID := ""
		if s.Winner.ID == s.Player1.ID {
			loserID = s.Player2.ID
		} else {
			loserID = s.Player1.ID
		}
		if ws, ok := stats[s.Winner.ID]; ok {
			ws.wins++
			ws.h2h[loserID]++
		}
		if ls, ok := stats[loserID]; ok {
			ls.losses++
		}
	}
	t.Standings = make([]*TournamentStanding, 0, len(stats))
	for _, p := range t.Players {
		if st, ok := stats[p.ID]; ok {
			t.Standings = append(t.Standings, &TournamentStanding{
				Player:         p,
				Wins:           st.wins,
				Losses:         st.losses,
				HeadToHeadWins: st.h2h,
			})
		}
	}
	sort.Slice(t.Standings, func(i, j int) bool {
		if t.Standings[i].Wins != t.Standings[j].Wins {
			return t.Standings[i].Wins > t.Standings[j].Wins
		}
		// Head-to-head.
		ii, jj := t.Standings[i].Player.ID, t.Standings[j].Player.ID
		return t.Standings[i].HeadToHeadWins[jj] > t.Standings[j].HeadToHeadWins[ii]
	})
	if len(t.Standings) > 0 {
		t.Winner = t.Standings[0].Player
	}
}

// IsRRComplete returns true if all round-robin matches are done.
func (t *TournamentState) IsRRComplete() bool {
	for _, s := range t.Bracket {
		if s.Winner == nil {
			return false
		}
	}
	return true
}

// -------------------------------------------------------
// Double Elimination
// -------------------------------------------------------

func NewDoubleEliminationTournament(name, gameType string, startingScore, matchLength int, entrants []*TournamentPlayer) *TournamentState {
	if matchLength != 3 && matchLength != 5 && matchLength != 7 {
		matchLength = 1
	}
	n := len(entrants)
	p := nextPowerOfTwo(n)
	if p < 2 {
		p = 2
	}
	R := int(math.Log2(float64(p)))

	t := newBase(name, "double_elimination", gameType, startingScore, matchLength, entrants)

	slotMap := make(map[string]*BracketSlot)

	// --- Winners Bracket ---
	for r := 0; r < R; r++ {
		slotCount := p / int(math.Pow(2, float64(r+1)))
		for pos := 0; pos < slotCount; pos++ {
			s := &BracketSlot{ID: uuid.New().String(), Round: r, Position: pos, Phase: "wb", Status: "pending"}
			t.Bracket = append(t.Bracket, s)
			slotMap[wbKey(r, pos)] = s
		}
	}
	for r := 0; r < R; r++ {
		slotCount := p / int(math.Pow(2, float64(r+1)))
		for pos := 0; pos < slotCount; pos++ {
			s := slotMap[wbKey(r, pos)]
			if r < R-1 {
				s.NextSlot = slotMap[wbKey(r+1, pos/2)].ID
			}
		}
	}
	seedRound0(slotMapAsRound0(slotMap, p), p, entrants)

	// Seed WB round 0 directly.
	for i := 0; i < p/2; i++ {
		s := slotMap[wbKey(0, i)]
		if s == nil {
			continue
		}
		if i < n {
			s.Player1 = entrants[i]
		}
		oppIdx := p - 1 - i
		if oppIdx < n && oppIdx != i {
			s.Player2 = entrants[oppIdx]
		}
	}

	// --- Losers Bracket ---
	lbRounds := 0
	if R >= 2 {
		lbRounds = 2*R - 2
	}
	lbSize := make([]int, lbRounds)
	for k := 0; k < lbRounds; k++ {
		lbSize[k] = p / int(math.Pow(2, float64(k/2+2)))
	}

	for k := 0; k < lbRounds; k++ {
		for pos := 0; pos < lbSize[k]; pos++ {
			s := &BracketSlot{ID: uuid.New().String(), Round: k, Position: pos, Phase: "lb", Status: "pending"}
			t.Bracket = append(t.Bracket, s)
			slotMap[lbKey(k, pos)] = s
		}
	}
	// Wire LB next slots.
	for k := 0; k < lbRounds-1; k++ {
		for pos := 0; pos < lbSize[k]; pos++ {
			s := slotMap[lbKey(k, pos)]
			nextSize := lbSize[k+1]
			if nextSize >= lbSize[k] {
				s.NextSlot = slotMap[lbKey(k+1, pos)].ID
			} else {
				s.NextSlot = slotMap[lbKey(k+1, pos/2)].ID
			}
		}
	}

	// Wire WB losers to LB.
	// WB round 0 losers -> LB round 0: WB slot i -> LB slot i/2, Player1 for even, Player2 for odd.
	if lbRounds > 0 {
		for pos := 0; pos < p/2; pos++ {
			wbSlot := slotMap[wbKey(0, pos)]
			lbSlot := slotMap[lbKey(0, pos/2)]
			wbSlot.LoserSlot = lbSlot.ID
		}
	}
	// WB round r (r>=1) losers -> LB round 2*r-1: WB slot i -> LB slot i.
	for r := 1; r < R; r++ {
		lbRound := 2*r - 1
		if lbRound >= lbRounds {
			continue
		}
		slotCount := p / int(math.Pow(2, float64(r+1)))
		for pos := 0; pos < slotCount; pos++ {
			wbSlot := slotMap[wbKey(r, pos)]
			if lbRound < lbRounds {
				lbSlot := slotMap[lbKey(lbRound, pos)]
				wbSlot.LoserSlot = lbSlot.ID
			}
		}
	}

	// Grand Final.
	gf := &BracketSlot{ID: uuid.New().String(), Round: 0, Position: 0, Phase: "gf", Status: "pending"}
	t.Bracket = append(t.Bracket, gf)
	slotMap[gfKey()] = gf

	// WB final winner -> GF Player1.
	if R > 0 {
		wbFinal := slotMap[wbKey(R-1, 0)]
		wbFinal.NextSlot = gf.ID
	}

	// LB final winner -> GF Player2.
	if lbRounds > 0 {
		lbFinal := slotMap[lbKey(lbRounds-1, 0)]
		lbFinal.NextSlot = gf.ID
	}

	// Grand Final bracket reset: second GF slot.
	gf2 := &BracketSlot{ID: uuid.New().String(), Round: 1, Position: 0, Phase: "gf", Status: "pending"}
	t.Bracket = append(t.Bracket, gf2)
	slotMap[gfResetKey()] = gf2
	gf.ResetSlot = gf2.ID

	return t
}

// AdvanceWinner records the winner of a slot and propagates them forward.
func (t *TournamentState) AdvanceWinner(slotID string, winner *TournamentPlayer) {
	s := t.slotByID(slotID)
	if s == nil || winner == nil {
		return
	}
	s.Winner = winner
	s.Status = "completed"

	// Round robin: check if all matches done.
	if t.Type == "round_robin" && t.IsRRComplete() {
		t.ComputeStandings()
		t.Status = "completed"
		return
	}

	if s.Phase == "gf" && s.Round == 1 {
		// Final GF2 — tournament complete.
		t.Winner = winner
		t.Status = "completed"
		return
	}
	if s.Phase == "gf" && s.Round == 0 {
		// GF1: if Player2 (LB winner) wins, bracket reset.
		if s.Player2 != nil && winner.ID == s.Player2.ID && s.ResetSlot != "" {
			reset := t.slotByID(s.ResetSlot)
			if reset != nil {
				reset.Player1 = s.Player1
				reset.Player2 = s.Player2
				reset.Status = "pending"
			}
		} else {
			t.Winner = winner
			t.Status = "completed"
		}
		return
	}

	if s.NextSlot == "" {
		if t.Type == "single_elimination" {
			t.Winner = winner
			t.Status = "completed"
		}
		return
	}
	next := t.slotByID(s.NextSlot)
	if next == nil {
		return
	}

	if s.Phase == "wb" {
		// Winner goes forward in WB, loser goes to LB.
		if s.Position%2 == 0 {
			next.Player1 = winner
		} else {
			next.Player2 = winner
		}
		if s.LoserSlot != "" {
			loser := s.Player1
			if loser == nil || loser.ID == winner.ID {
				loser = s.Player2
			}
			if loser != nil {
				lbSlot := t.slotByID(s.LoserSlot)
				if lbSlot != nil {
					if lbSlot.Phase == "lb" && lbSlot.Round == 0 {
						// LB round 0: WB round 0 losers pair up.
						if lbSlot.Player1 == nil {
							lbSlot.Player1 = loser
						} else {
							lbSlot.Player2 = loser
						}
					} else {
						// LB round >=1: loser is Player2, Player1 comes from previous LB round.
						lbSlot.Player2 = loser
					}
				}
			}
		}
	} else if s.Phase == "lb" {
		if s.Position%2 == 0 {
			next.Player1 = winner
		} else {
			next.Player2 = winner
		}
	}
	t.advanceByes()
}

// ReadySlots returns bracket slots that are ready for a match to be created.
func (t *TournamentState) ReadySlots() []*BracketSlot {
	var ready []*BracketSlot
	for _, s := range t.Bracket {
		if s.Status != "pending" || s.MatchID != "" {
			continue
		}
		if s.Player1 != nil && s.Player2 != nil {
			ready = append(ready, s)
		}
	}
	return ready
}

// AssignMatch records the match ID for a slot.
func (t *TournamentState) AssignMatch(slotID, matchID string) {
	if s := t.slotByID(slotID); s != nil {
		s.MatchID = matchID
		s.Status = "active"
	}
}

func (t *TournamentState) slotByID(id string) *BracketSlot {
	for _, s := range t.Bracket {
		if s.ID == id {
			return s
		}
	}
	return nil
}

func (t *TournamentState) advanceByes() {
	changed := true
	for changed {
		changed = false
		for _, s := range t.Bracket {
			if s.Round != 0 || s.Status != "pending" || s.MatchID != "" {
				continue
			}
			var winner *TournamentPlayer
			if s.Player1 != nil && s.Player2 == nil {
				winner = s.Player1
			} else if s.Player1 == nil && s.Player2 != nil {
				winner = s.Player2
			}
			if winner != nil {
				t.AdvanceWinner(s.ID, winner)
				changed = true
			}
		}
	}
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

func newBase(name, ttype, gameType string, startingScore, matchLength int, entrants []*TournamentPlayer) *TournamentState {
	return &TournamentState{
		ID:            uuid.New().String(),
		Name:          name,
		Type:          ttype,
		GameType:      gameType,
		StartingScore: startingScore,
		MatchLength:   matchLength,
		Status:        "active",
		Players:       entrants,
		Bracket:       make([]*BracketSlot, 0),
		CreatedAt:     time.Now(),
	}
}

func seedRound0(slotMap map[string]*BracketSlot, p int, entrants []*TournamentPlayer) {
	n := len(entrants)
	for i := 0; i < p/2; i++ {
		s := slotMap[slotKey(0, i)]
		if s == nil {
			continue
		}
		if i < n {
			s.Player1 = entrants[i]
		}
		oppIdx := p - 1 - i
		if oppIdx < n && oppIdx != i {
			s.Player2 = entrants[oppIdx]
		}
	}
}

func slotMapAsRound0(slotMap map[string]*BracketSlot, p int) map[string]*BracketSlot {
	return slotMap
}

func wbKey(r, pos int) string {
	return fmt.Sprintf("wb:%d:%d", r, pos)
}

func lbKey(k, pos int) string {
	return fmt.Sprintf("lb:%d:%d", k, pos)
}

func gfKey() string {
	return "gf:0:0"
}

func gfResetKey() string {
	return "gf:1:0"
}

func slotKey(round, position int) string {
	return fmt.Sprintf("%d:%d", round, position)
}

func nextPowerOfTwo(n int) int {
	if n <= 1 {
		return 1
	}
	p := 1
	for p < n {
		p <<= 1
	}
	return p
}
