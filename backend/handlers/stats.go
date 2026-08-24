package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/ken/darts-backend/db"
)

func GetPlayerStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	gameType := r.URL.Query().Get("type")
	stats, err := db.GetPlayerLifetimeStats(id, gameType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func GetPlayerHeatmap(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	gameType := r.URL.Query().Get("type")
	heatmap, err := db.GetPlayerHeatmapFromHistory(id, gameType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"player_id": id,
		"heatmap":   heatmap,
	})
}

func GetPlayerDifficultyStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	stats, err := db.GetPlayerDifficultyStats(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func GetPlayerLifetimeMPR(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	gameType := r.URL.Query().Get("type")
	mpr, err := db.GetPlayerLifetimeMPR(id, gameType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"player_id": id,
		"mpr":       mpr,
	})
}

func GetPlayerWinsMatrix(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	gameType := r.URL.Query().Get("type")
	matrix, err := db.GetPlayerWinsMatrix(id, gameType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(matrix)
}

func GetPlayerTimeline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	gameType := r.URL.Query().Get("type")
	timeline, err := db.GetPlayerTimeline(id, gameType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timeline)
}
