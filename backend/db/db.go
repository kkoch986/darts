package db

import (
	"database/sql"
	"log"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB(path string) {
	var err error
	DB, err = sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	migrations := []string{
		`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS games (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			config_json TEXT,
			state_json TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			completed_at DATETIME,
			winner_id TEXT,
			FOREIGN KEY (winner_id) REFERENCES players(id)
		)`,
		`CREATE TABLE IF NOT EXISTS game_players (
			id TEXT PRIMARY KEY,
			game_id TEXT NOT NULL,
			player_id TEXT NOT NULL,
			is_bot BOOLEAN DEFAULT FALSE,
			difficulty TEXT,
			final_score INTEGER DEFAULT 0,
			FOREIGN KEY (game_id) REFERENCES games(id),
			FOREIGN KEY (player_id) REFERENCES players(id)
		)`,
		`CREATE TABLE IF NOT EXISTS game_throws (
			id TEXT PRIMARY KEY,
			game_id TEXT NOT NULL,
			player_id TEXT NOT NULL,
			round_num INTEGER NOT NULL,
			dart_num INTEGER NOT NULL,
			segment_label TEXT NOT NULL,
			score INTEGER NOT NULL,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (game_id) REFERENCES games(id),
			FOREIGN KEY (player_id) REFERENCES players(id)
		)`,
		`CREATE TABLE IF NOT EXISTS matches (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			starting_score INTEGER DEFAULT 0,
			total_games INTEGER NOT NULL,
			status TEXT DEFAULT 'active',
			winner_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			completed_at DATETIME,
			FOREIGN KEY (winner_id) REFERENCES players(id)
		)`,
		`CREATE TABLE IF NOT EXISTS match_players (
			id TEXT PRIMARY KEY,
			match_id TEXT NOT NULL,
			player_id TEXT NOT NULL,
			is_bot BOOLEAN DEFAULT FALSE,
			difficulty TEXT,
			FOREIGN KEY (match_id) REFERENCES matches(id),
			FOREIGN KEY (player_id) REFERENCES players(id)
		)`,
	}

	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			// Ignore "duplicate column" errors from ALTER TABLE
			if !strings.Contains(err.Error(), "duplicate column") {
				log.Fatalf("migration failed: %v", err)
			}
		}
	}

	// Ensure state_json column exists (idempotent)
	_, _ = DB.Exec("ALTER TABLE games ADD COLUMN state_json TEXT")

	// Ensure match_id column exists on games (idempotent)
	_, _ = DB.Exec("ALTER TABLE games ADD COLUMN match_id TEXT")

	// Ensure match_game_index column exists on games (idempotent)
	_, _ = DB.Exec("ALTER TABLE games ADD COLUMN match_game_index INTEGER DEFAULT 0")

	// Ensure is_bot column exists on players (idempotent)
	_, _ = DB.Exec("ALTER TABLE players ADD COLUMN is_bot BOOLEAN DEFAULT FALSE")

	// Ensure match_states table exists (idempotent)
	_, _ = DB.Exec(`CREATE TABLE IF NOT EXISTS match_states (
		match_id TEXT PRIMARY KEY,
		state_json TEXT,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (match_id) REFERENCES matches(id)
	)`)

	mergeDuplicatePlayers()
	fixBotPlayers()
}

func mergeDuplicatePlayers() {
	rows, err := DB.Query("SELECT name, GROUP_CONCAT(id) AS ids FROM players GROUP BY name HAVING COUNT(*) > 1")
	if err != nil {
		return
	}
	defer rows.Close()

	type dupeGroup struct {
		name string
		ids  []string
	}
	var groups []dupeGroup
	for rows.Next() {
		var g dupeGroup
		var idsCSV string
		if err := rows.Scan(&g.name, &idsCSV); err != nil {
			continue
		}
		for _, id := range strings.Split(idsCSV, ",") {
			g.ids = append(g.ids, id)
		}
		groups = append(groups, g)
	}

	for _, g := range groups {
		// Pick the oldest as canonical
		var canonical string
		var oldest time.Time
		for _, id := range g.ids {
			var t time.Time
			DB.QueryRow("SELECT created_at FROM players WHERE id = ?", id).Scan(&t)
			if canonical == "" || t.Before(oldest) {
				canonical = id
				oldest = t
			}
		}

		// Point all references to canonical, skip the canonical itself
		for _, id := range g.ids {
			if id == canonical {
				continue
			}
			DB.Exec("UPDATE game_players SET player_id = ? WHERE player_id = ?", canonical, id)
			DB.Exec("UPDATE game_throws SET player_id = ? WHERE player_id = ?", canonical, id)
			DB.Exec("UPDATE games SET winner_id = ? WHERE winner_id = ?", canonical, id)
			DB.Exec("DELETE FROM players WHERE id = ?", id)
		}
	}
}

func fixBotPlayers() {
	// Mark any players created as bots (name starts with "Bot (") with is_bot = TRUE
	DB.Exec("UPDATE players SET is_bot = TRUE WHERE name LIKE 'Bot (%' AND is_bot = 0")
}
