package main

import (
	"log"
	"net/http"
	"os"

	"github.com/ken/darts-backend/api"
	"github.com/ken/darts-backend/db"
	"github.com/ken/darts-backend/handlers"
)

func main() {
	dbPath := os.Getenv("DARTS_DB_PATH")
	if dbPath == "" {
		dbPath = "./darts.db"
	}
	db.InitDB(dbPath)
	defer db.DB.Close()

	handlers.LoadActiveGames()

	router := api.Setup()

	log.Println("Darts API server starting on :8080")
	if err := http.ListenAndServe(":8080", router); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
