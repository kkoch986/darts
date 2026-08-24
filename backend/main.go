package main

import (
	"log"
	"net/http"

	"github.com/ken/darts-backend/api"
	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/handlers"
)

func main() {
	db.InitDB("./darts.db")
	defer db.DB.Close()

	handlers.LoadActiveGames()

	router := api.Setup()

	log.Println("Darts API server starting on :8080")
	if err := http.ListenAndServe(":8080", router); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
