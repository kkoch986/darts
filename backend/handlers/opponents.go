package handlers

import (
	"encoding/json"
	"math"
	"math/rand"
	"net/http"
	"strconv"
)

type OpponentProfile struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Rank       int    `json:"rank"`
	Desc       string `json:"desc"`
	Difficulty string `json:"difficulty"`
}

var opponentRoster = []OpponentProfile{
	{ID: "beginner", Label: "Beginner", Rank: 1, Desc: "Loose grouping, misses doubles", Difficulty: "beginner"},
	{ID: "casual", Label: "Casual", Rank: 2, Desc: "Finds singles, occasional treble", Difficulty: "casual"},
	{ID: "steady", Label: "Steady", Rank: 3, Desc: "Reliable scoring, closes methodically", Difficulty: "steady"},
	{ID: "sharp", Label: "Sharp", Rank: 4, Desc: "Heavy T20 scoring, confident doubles", Difficulty: "sharp"},
	{ID: "expert", Label: "Expert", Rank: 5, Desc: "Pinpoint trebles, clinical checkouts", Difficulty: "expert"},
}

type opponentSkill struct {
	miss float64
	t20  float64
	t19  float64
	dbl  float64
}

var opponentSkills = map[string]opponentSkill{
	"beginner": {miss: 0.34, t20: 0.03, t19: 0.02, dbl: 0.16},
	"casual":   {miss: 0.22, t20: 0.08, t19: 0.05, dbl: 0.34},
	"steady":   {miss: 0.12, t20: 0.18, t19: 0.10, dbl: 0.55},
	"sharp":    {miss: 0.07, t20: 0.30, t19: 0.15, dbl: 0.72},
	"expert":   {miss: 0.04, t20: 0.42, t19: 0.18, dbl: 0.88},
}

var atwHitChance = map[string]float64{
	"beginner": 0.32,
	"casual":   0.46,
	"steady":   0.60,
	"sharp":    0.72,
	"expert":   0.84,
}

var cricketKeys = []string{"20", "19", "18", "17", "16", "15", "b"}

type opponentView struct {
	Game       string               `json:"game"`
	Turn       int                  `json:"turn"`
	Difficulty string               `json:"difficulty"`
	Opponent   string               `json:"opponent"`
	Scores     []float64            `json:"scores"`
	Starting   float64              `json:"starting"`
	Points     []float64            `json:"points"`
	Marks      []map[string]float64 `json:"marks"`
	Progress   []float64            `json:"progress"`
	AtwMarks   []float64            `json:"atwMarks"`
	MarksPer   int                  `json:"marksPer"`
}

type opponentDart struct {
	V     int    `json:"v"`
	Label string `json:"label"`
	Dbl   bool   `json:"dbl"`
}

func ListOpponents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"opponents": opponentRoster})
}

func OpponentThrow(w http.ResponseWriter, r *http.Request) {
	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var view opponentView
	if err := json.Unmarshal(body, &view); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	difficulty := view.Difficulty
	if _, ok := opponentSkills[difficulty]; !ok {
		if _, ok := opponentSkills[view.Opponent]; ok {
			difficulty = view.Opponent
		} else {
			difficulty = "steady"
		}
	}
	if view.Game == "" {
		view.Game = "01"
	}

	var dart opponentDart
	switch view.Game {
	case "cricket":
		dart = throwCricket(view, difficulty)
	case "atw":
		dart = throwAtw(view, difficulty)
	default:
		dart = throw01(view, difficulty)
	}
	writeJSON(w, http.StatusOK, dart)
}

func throw01(view opponentView, difficulty string) opponentDart {
	sk := opponentSkills[difficulty]
	turn := clampTurn(view.Turn, len(view.Scores))
	rem := 0
	if turn >= 0 && turn < len(view.Scores) {
		rem = int(math.Round(view.Scores[turn]))
	}
	rnd := rand.Float64()

	if rem%2 == 0 && rem >= 2 && rem <= 40 {
		if rnd < sk.dbl {
			return opponentDart{V: rem, Label: "D" + strconv.Itoa(rem/2), Dbl: true}
		}
		if rnd < sk.dbl+0.4 && rem/2 <= 20 && rem/2 >= 1 {
			return opponentDart{V: rem / 2, Label: strconv.Itoa(rem / 2)}
		}
		return opponentDart{Label: "Miss"}
	}
	if rem == 50 {
		if rnd < sk.dbl {
			return opponentDart{V: 50, Label: "Double bull", Dbl: true}
		}
		return opponentDart{V: 20, Label: "20"}
	}

	if rnd < sk.miss {
		return opponentDart{Label: "Miss"}
	}
	if rnd < sk.miss+sk.t20 && rem >= 62 {
		return opponentDart{V: 60, Label: "T20"}
	}
	if rnd < sk.miss+sk.t20+sk.t19 && rem >= 59 {
		return opponentDart{V: 57, Label: "T19"}
	}
	hi := rem - 2
	if hi > 20 {
		hi = 20
	}
	if hi < 1 {
		hi = 1
	}
	lo := 10
	if lo > hi {
		lo = hi
	}
	s := lo
	if hi-lo > 0 {
		s = lo + rand.Intn(hi-lo+1)
	}
	if rem-s == 1 {
		s--
		if s < 1 {
			s = 1
		}
	}
	return opponentDart{V: s, Label: strconv.Itoa(s)}
}

func throwCricket(view opponentView, difficulty string) opponentDart {
	sk := opponentSkills[difficulty]
	turn := clampTurn(view.Turn, len(view.Marks))
	other := 1 - turn

	closed := func(player int, key string) bool {
		if player < 0 || player >= len(view.Marks) || view.Marks[player] == nil {
			return false
		}
		return view.Marks[player][key] >= 3
	}

	target := ""
	for _, key := range cricketKeys {
		if closed(other, key) && !closed(turn, key) {
			target = key
			break
		}
	}
	if target == "" {
		for _, key := range cricketKeys {
			if !closed(turn, key) {
				target = key
				break
			}
		}
	}
	if target == "" {
		for _, key := range cricketKeys {
			if !closed(other, key) {
				target = key
				break
			}
		}
	}
	if target == "" {
		target = "20"
	}

	if rand.Float64() < sk.miss {
		return opponentDart{Label: "Miss"}
	}
	if target == "b" {
		r := rand.Float64()
		if r < sk.dbl {
			return opponentDart{V: 50, Label: "Double bull", Dbl: true}
		}
		if r < sk.dbl+0.5 {
			return opponentDart{V: 25, Label: "Single bull"}
		}
		return opponentDart{Label: "Miss"}
	}

	n, _ := strconv.Atoi(target)
	r := rand.Float64()
	if r < sk.t20 {
		return opponentDart{V: n * 3, Label: "T" + target}
	}
	if r < sk.t20+sk.t19 {
		return opponentDart{V: n * 2, Label: "D" + target, Dbl: true}
	}
	return opponentDart{V: n, Label: target}
}

func throwAtw(view opponentView, difficulty string) opponentDart {
	sk := opponentSkills[difficulty]
	chance := atwHitChance[difficulty]
	if chance == 0 {
		chance = 0.6
	}
	if rand.Float64() >= chance {
		return opponentDart{Label: "Miss"}
	}

	turn := clampTurn(view.Turn, len(view.Progress))
	step := 0
	if turn >= 0 && turn < len(view.Progress) {
		step = int(math.Round(view.Progress[turn]))
	}
	marksMode := view.MarksPer == 3
	if step >= 20 {
		if marksMode {
			return opponentDart{V: 50, Label: "Double bull", Dbl: true}
		}
		if rand.Float64() < sk.dbl*0.5 {
			return opponentDart{V: 50, Label: "Double bull", Dbl: true}
		}
		return opponentDart{V: 25, Label: "Single bull"}
	}
	n := step + 1
	if marksMode {
		return opponentDart{V: n * 3, Label: "T" + strconv.Itoa(n)}
	}
	return opponentDart{V: n, Label: strconv.Itoa(n)}
}

func clampTurn(turn, length int) int {
	if turn < 0 || turn > 1 {
		return 0
	}
	if length > 0 && turn >= length {
		return 0
	}
	return turn
}
