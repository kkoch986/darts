package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/ken/darts-backend/handlers"
)

func Routes() http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		AllowCredentials: true,
	}))

	// API Routes
	r.Route("/api", func(r chi.Router) {
		// Games routes
		r.Route("/games", func(r chi.Router) {
			r.Post("/", handlers.CreateGame)
			r.Get("/{id}", handlers.GetGame)
			r.Post("/{id}/throw", handlers.Throw)
			r.Post("/{id}/end-turn", handlers.EndTurn)
			r.Post("/{id}/undo", handlers.UndoLastThrow)
			
			// Round World specific routes
			r.Post("/round-world", handlers.CreateRoundWorldGame)
			r.Get("/round-world/{id}", handlers.GetRoundWorldGame)
			r.Post("/round-world/{id}/throw", handlers.RoundWorldThrow)
			r.Post("/round-world/{id}/end-turn", handlers.EndRoundWorldTurn)
			r.Post("/round-world/{id}/undo", handlers.UndoLastRoundWorldThrow)
		})

		// Matches routes
		r.Route("/matches", func(r chi.Router) {
			r.Get("/{id}", handlers.GetMatch)
			r.Post("/{id}/next-game", handlers.CreateNextMatchGame)
		})

		// Players routes
		r.Route("/players", func(r chi.Router) {
			r.Get("/", handlers.ListPlayers)
			r.Post("/", handlers.CreatePlayer)
			r.Get("/{id}", handlers.GetPlayer)
		})

		// Stats routes
		r.Route("/stats", func(r chi.Router) {
			r.Get("/players/{id}", handlers.GetPlayerStats)
			r.Get("/games", handlers.ListGamesWithDetails)
		})

		// Practice routes
		r.Route("/practice", func(r chi.Router) {
			r.Post("/checkout", handlers.StartCheckoutPractice)
			r.Post("/checkout/{id}/throw", handlers.CheckoutPracticeThrow)
		})
	})

	return r
}