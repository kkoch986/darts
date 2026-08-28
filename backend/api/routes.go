package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/ken/darts-backend/handlers"
)

func Setup() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Route("/api", func(r chi.Router) {
		r.Route("/games", func(r chi.Router) {
			r.Post("/", handlers.CreateGame)
			r.Get("/", handlers.ListGames)
			r.Get("/active", handlers.ListActiveGames)
			r.Get("/history", handlers.ListGamesWithDetails)
			r.Get("/{id}", handlers.GetGame)
			r.Delete("/{id}", handlers.DeleteGame)
			r.Post("/{id}/throw", handlers.Throw)
			r.Post("/{id}/end-turn", handlers.EndTurn)
			r.Post("/{id}/undo", handlers.UndoLastThrow)
		})

		r.Route("/players", func(r chi.Router) {
			r.Post("/", handlers.CreatePlayer)
			r.Get("/", handlers.ListPlayers)
			r.Delete("/{id}", handlers.DeletePlayer)
			r.Delete("/{id}/stats", handlers.ResetPlayerStats)
		})

		r.Route("/stats", func(r chi.Router) {
			r.Get("/player/{id}", handlers.GetPlayerStats)
			r.Get("/player/{id}/heatmap", handlers.GetPlayerHeatmap)
			r.Get("/player/{id}/difficulty", handlers.GetPlayerDifficultyStats)
			r.Get("/player/{id}/mpr", handlers.GetPlayerLifetimeMPR)
			r.Get("/player/{id}/wins", handlers.GetPlayerWinsMatrix)
			r.Get("/player/{id}/timeline", handlers.GetPlayerTimeline)
		})

		r.Route("/matches", func(r chi.Router) {
			r.Post("/", handlers.CreateMatch)
			r.Get("/", handlers.ListMatches)
			r.Get("/{id}", handlers.GetMatchState)
			r.Get("/{id}/stats", handlers.GetMatchStats)
			r.Post("/{id}/throw", handlers.ThrowInMatch)
			r.Post("/{id}/end-turn", handlers.EndTurnInMatch)
			r.Post("/{id}/undo", handlers.UndoInMatch)
			r.Delete("/{id}", handlers.DeleteMatch)
		})

		r.Route("/practice", func(r chi.Router) {
			r.Post("/checkout", handlers.StartCheckoutPractice)
			r.Post("/checkout/{id}/throw", handlers.CheckoutPracticeThrow)
		})

		r.Route("/tournaments", func(r chi.Router) {
			r.Post("/", handlers.CreateTournament)
			r.Get("/", handlers.ListTournaments)
			r.Get("/{id}", handlers.GetTournament)
		})
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
