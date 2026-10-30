package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/ken/darts-backend/db"
)

// Dev single-user mode. Every profile is owned by this user id; swap this for a
// real authenticated user id when auth lands.
const devUserID = "local-dev"

const (
	maxBodyBytes   = 1 << 20
	maxPlayers     = 500
	maxActiveGames = 200
	maxRecentRows  = 40
)

var (
	profileIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)
	allowedResources = map[string]bool{"players": true, "active": true, "recent": true}
	dataMu           sync.Mutex
)

type Profile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Initials string `json:"initials"`
}

type ProfileList struct {
	List     []Profile `json:"list"`
	ActiveID string    `json:"activeId"`
}

func nowMs() int64 { return time.Now().UnixMilli() }

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func readLimited(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, fmt.Errorf("request body too large or unreadable (max %d bytes)", maxBodyBytes)
	}
	return body, nil
}

func validProfileID(id string) bool { return profileIDPattern.MatchString(id) }

func cleanDisplayName(name string) (string, bool) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "", false
	}
	runes := []rune(name)
	if len(runes) > 40 {
		runes = runes[:40]
	}
	return string(runes), true
}

func initialsFor(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "P"
	}
	out := make([]rune, 0, 2)
	for _, p := range parts {
		r := []rune(p)
		if len(r) == 0 {
			continue
		}
		out = append(out, unicode.ToUpper(r[0]))
		if len(out) == 2 {
			break
		}
	}
	return string(out)
}

func newProfileRecord(name, initials string) Profile {
	id := "p-" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	if strings.TrimSpace(initials) == "" {
		initials = initialsFor(name)
	}
	return Profile{ID: id, Name: name, Initials: initials}
}

func getOwnedProfile(id string) (Profile, error) {
	var p Profile
	err := db.DB.QueryRow(
		"SELECT id, name, initials FROM profiles WHERE id = ? AND user_id = ?",
		id, devUserID,
	).Scan(&p.ID, &p.Name, &p.Initials)
	return p, err
}

func loadProfileList() (ProfileList, error) {
	rows, err := db.DB.Query(
		"SELECT id, name, initials FROM profiles WHERE user_id = ? ORDER BY created_at ASC, id ASC",
		devUserID,
	)
	if err != nil {
		return ProfileList{}, err
	}
	defer rows.Close()

	list := make([]Profile, 0)
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Initials); err != nil {
			return ProfileList{}, err
		}
		list = append(list, p)
	}
	if err := rows.Err(); err != nil {
		return ProfileList{}, err
	}

	var activeID string
	err = db.DB.QueryRow("SELECT active_id FROM profile_state WHERE user_id = ?", devUserID).Scan(&activeID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return ProfileList{}, err
	}
	if activeID == "" || !containsProfile(list, activeID) {
		if len(list) > 0 {
			activeID = list[0].ID
			_, _ = db.DB.Exec(
				`INSERT INTO profile_state (user_id, active_id) VALUES (?, ?)
				 ON CONFLICT(user_id) DO UPDATE SET active_id = excluded.active_id`,
				devUserID, activeID,
			)
		} else {
			activeID = ""
		}
	}
	return ProfileList{List: list, ActiveID: activeID}, nil
}

func containsProfile(list []Profile, id string) bool {
	for _, p := range list {
		if p.ID == id {
			return true
		}
	}
	return false
}

func setActiveProfile(id string) error {
	_, err := db.DB.Exec(
		`INSERT INTO profile_state (user_id, active_id) VALUES (?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET active_id = excluded.active_id`,
		devUserID, id,
	)
	return err
}

// GetMe returns the dev user and their profile metadata.
func GetMe(w http.ResponseWriter, r *http.Request) {
	list, err := loadProfileList()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load profiles")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":     map[string]string{"id": devUserID},
		"profiles": list,
	})
}

func ListProfiles(w http.ResponseWriter, r *http.Request) {
	list, err := loadProfileList()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load profiles")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func CreateProfile(w http.ResponseWriter, r *http.Request) {
	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Initials string `json:"initials"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	name, ok := cleanDisplayName(req.Name)
	if !ok {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	initials := strings.TrimSpace(req.Initials)
	if initials == "" {
		initials = initialsFor(name)
	}
	if runes := []rune(initials); len(runes) > 4 {
		initials = string(runes[:4])
	}

	if strings.TrimSpace(req.ID) != "" {
		if !validProfileID(req.ID) {
			writeError(w, http.StatusBadRequest, "invalid profile id")
			return
		}
		var owner string
		err := db.DB.QueryRow("SELECT user_id FROM profiles WHERE id = ?", req.ID).Scan(&owner)
		switch {
		case err == nil:
			if owner != devUserID {
				writeError(w, http.StatusConflict, "profile id already in use")
				return
			}
			p, err := getOwnedProfile(req.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not load profile")
				return
			}
			writeJSON(w, http.StatusOK, p)
			return
		case !errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusInternalServerError, "could not check profile")
			return
		}
	}

	record := newProfileRecord(name, initials)
	if strings.TrimSpace(req.ID) != "" {
		record.ID = req.ID
	}
	now := nowMs()
	_, err = db.DB.Exec(
		"INSERT INTO profiles (id, user_id, name, initials, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		record.ID, devUserID, record.Name, record.Initials, now, now,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create profile")
		return
	}

	defaultPlayer, err := json.Marshal([]map[string]interface{}{
		{
			"id":       record.ID,
			"name":     record.Name,
			"short":    record.Name,
			"initials": record.Initials,
			"kind":     "known",
		},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create profile")
		return
	}
	if _, err := db.DB.Exec(
		`INSERT INTO profile_data (profile_id, resource, body, rev, updated_at) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(profile_id, resource) DO UPDATE SET body = excluded.body, rev = excluded.rev, updated_at = excluded.updated_at`,
		record.ID, "players", string(defaultPlayer), 1, nowMs(),
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create profile")
		return
	}

	// First profile becomes active automatically.
	var current string
	if err := db.DB.QueryRow("SELECT active_id FROM profile_state WHERE user_id = ?", devUserID).Scan(&current); errors.Is(err, sql.ErrNoRows) || current == "" {
		_ = setActiveProfile(record.ID)
	}

	writeJSON(w, http.StatusCreated, record)
}

func PatchProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validProfileID(id) {
		writeError(w, http.StatusBadRequest, "invalid profile id")
		return
	}
	if _, err := getOwnedProfile(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "profile not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load profile")
		}
		return
	}

	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		Name     string `json:"name"`
		Initials string `json:"initials"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	name, ok := cleanDisplayName(req.Name)
	if !ok {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	initials := strings.TrimSpace(req.Initials)
	if initials == "" {
		initials = initialsFor(name)
	}
	if runes := []rune(initials); len(runes) > 4 {
		initials = string(runes[:4])
	}
	if _, err := db.DB.Exec(
		"UPDATE profiles SET name = ?, initials = ?, updated_at = ? WHERE id = ? AND user_id = ?",
		name, initials, nowMs(), id, devUserID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update profile")
		return
	}
	p, err := getOwnedProfile(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load profile")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func SetActiveProfile(w http.ResponseWriter, r *http.Request) {
	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		ActiveID string `json:"activeId"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if !validProfileID(req.ActiveID) {
		writeError(w, http.StatusBadRequest, "invalid activeId")
		return
	}
	if _, err := getOwnedProfile(req.ActiveID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "profile not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load profile")
		}
		return
	}
	if err := setActiveProfile(req.ActiveID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update active profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"activeId": req.ActiveID})
}

func DeleteProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validProfileID(id) {
		writeError(w, http.StatusBadRequest, "invalid profile id")
		return
	}
	if _, err := getOwnedProfile(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "profile not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load profile")
		}
		return
	}

	var activeID string
	_ = db.DB.QueryRow("SELECT active_id FROM profile_state WHERE user_id = ?", devUserID).Scan(&activeID)

	dataMu.Lock()
	_, drErr := db.DB.Exec("DELETE FROM profile_data WHERE profile_id = ?", id)
	_, prErr := db.DB.Exec("DELETE FROM profiles WHERE id = ? AND user_id = ?", id, devUserID)
	dataMu.Unlock()
	if drErr != nil || prErr != nil {
		writeError(w, http.StatusInternalServerError, "could not delete profile")
		return
	}

	if activeID == id {
		var next string
		_ = db.DB.QueryRow(
			"SELECT id FROM profiles WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
			devUserID,
		).Scan(&next)
		if next == "" {
			_, _ = db.DB.Exec("DELETE FROM profile_state WHERE user_id = ?", devUserID)
		} else {
			_ = setActiveProfile(next)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func currentRev(profileID, resource string) (int, error) {
	var rev int
	err := db.DB.QueryRow(
		"SELECT rev FROM profile_data WHERE profile_id = ? AND resource = ?",
		profileID, resource,
	).Scan(&rev)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return rev, err
}

func etagFor(rev int) string { return fmt.Sprintf("\"rev-%d\"", rev) }

func GetProfileData(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	resource := chi.URLParam(r, "resource")
	if !validProfileID(id) || !allowedResources[resource] {
		writeError(w, http.StatusBadRequest, "invalid profile or resource")
		return
	}
	if _, err := getOwnedProfile(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "profile not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load profile")
		}
		return
	}

	var body string
	var rev int
	err := db.DB.QueryRow(
		"SELECT body, rev FROM profile_data WHERE profile_id = ? AND resource = ?",
		id, resource,
	).Scan(&body, &rev)
	if errors.Is(err, sql.ErrNoRows) {
		body = "[]"
		rev = 0
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load data")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("ETag", etagFor(rev))
	_, _ = io.WriteString(w, body)
}

func PutProfileData(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	resource := chi.URLParam(r, "resource")
	if !validProfileID(id) || !allowedResources[resource] {
		writeError(w, http.StatusBadRequest, "invalid profile or resource")
		return
	}
	if _, err := getOwnedProfile(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "profile not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not load profile")
		}
		return
	}

	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	normalized, err := normalizeResource(resource, body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	dataMu.Lock()
	defer dataMu.Unlock()

	rev, err := currentRev(id, resource)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load revision")
		return
	}
	if im := strings.TrimSpace(r.Header.Get("If-Match")); im != "" && im != "*" {
		want := strings.Trim(im, "\"")
		if want != fmt.Sprintf("rev-%d", rev) && want != strconv.Itoa(rev) {
			writeError(w, http.StatusConflict, "stale write")
			return
		}
	}

	next := rev + 1
	_, err = db.DB.Exec(
		`INSERT INTO profile_data (profile_id, resource, body, rev, updated_at) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(profile_id, resource) DO UPDATE SET body = excluded.body, rev = excluded.rev, updated_at = excluded.updated_at`,
		id, resource, string(normalized), next, nowMs(),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save data")
		return
	}
	w.Header().Set("ETag", etagFor(next))
	w.WriteHeader(http.StatusNoContent)
}

func normalizeResource(resource string, body []byte) ([]byte, error) {
	if resource == "recent" {
		return normalizeRecent(body)
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("%s must be a JSON array", resource)
	}
	limit := maxPlayers
	if resource == "active" {
		limit = maxActiveGames
	}
	if len(rows) > limit {
		return nil, fmt.Errorf("too many %s entries (max %d)", resource, limit)
	}
	return json.Marshal(rows)
}

func normalizeRecent(body []byte) ([]byte, error) {
	var rows []map[string]interface{}
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("recent must be a JSON array")
	}
	now := nowMs()
	for i := range rows {
		if !validAt(rows[i]["at"]) {
			rows[i]["at"] = now - int64(i)*6*3600*1000
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		return atValue(rows[i]) > atValue(rows[j])
	})
	if len(rows) > maxRecentRows {
		rows = rows[:maxRecentRows]
	}
	return json.Marshal(rows)
}

func validAt(v interface{}) bool {
	switch n := v.(type) {
	case float64:
		return n > 0
	case int64:
		return n > 0
	case int:
		return n > 0
	case json.Number:
		f, err := n.Float64()
		return err == nil && f > 0
	default:
		return false
	}
}

func atValue(row map[string]interface{}) float64 {
	switch n := row["at"].(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

type importReport struct {
	ID       string   `json:"id"`
	Imported []string `json:"imported"`
	Skipped  []string `json:"skipped"`
	Errors   []string `json:"errors"`
}

// ImportLocal takes a profiles blob plus per-profile resources and imports them
// idempotently. Existing non-empty resources are left alone unless force=true.
func ImportLocal(w http.ResponseWriter, r *http.Request) {
	body, err := readLimited(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		Profiles ProfileList                           `json:"profiles"`
		Data     map[string]map[string]json.RawMessage `json:"data"`
		Force    bool                                  `json:"force"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	reports := make([]importReport, 0, len(req.Profiles.List))
	for _, p := range req.Profiles.List {
		report := importReport{ID: p.ID, Imported: []string{}, Skipped: []string{}, Errors: []string{}}
		if !validProfileID(p.ID) {
			report.Errors = append(report.Errors, "invalid profile id")
			reports = append(reports, report)
			continue
		}
		name, ok := cleanDisplayName(p.Name)
		if !ok {
			name = "Player"
		}
		initials := strings.TrimSpace(p.Initials)
		if initials == "" {
			initials = initialsFor(name)
		}

		var owner string
		err := db.DB.QueryRow("SELECT user_id FROM profiles WHERE id = ?", p.ID).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) {
			now := nowMs()
			if _, err := db.DB.Exec(
				"INSERT INTO profiles (id, user_id, name, initials, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				p.ID, devUserID, name, initials, now, now,
			); err != nil {
				report.Errors = append(report.Errors, "could not create profile")
				reports = append(reports, report)
				continue
			}
		} else if err != nil {
			report.Errors = append(report.Errors, "could not check profile")
			reports = append(reports, report)
			continue
		} else if owner != devUserID {
			report.Errors = append(report.Errors, "profile id already in use")
			reports = append(reports, report)
			continue
		}

		resources := req.Data[p.ID]
		for resource, raw := range resources {
			if !allowedResources[resource] {
				report.Errors = append(report.Errors, "unknown resource: "+resource)
				continue
			}
			normalized, err := normalizeResource(resource, raw)
			if err != nil {
				report.Errors = append(report.Errors, resource+": "+err.Error())
				continue
			}

			dataMu.Lock()
			var existing string
			var rev int
			err = db.DB.QueryRow(
				"SELECT body, rev FROM profile_data WHERE profile_id = ? AND resource = ?",
				p.ID, resource,
			).Scan(&existing, &rev)
			hasRow := err == nil
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				dataMu.Unlock()
				report.Errors = append(report.Errors, resource+": could not read")
				continue
			}
			nonEmpty := hasRow && strings.TrimSpace(existing) != "" && strings.TrimSpace(existing) != "[]"
			if nonEmpty && !req.Force {
				dataMu.Unlock()
				report.Skipped = append(report.Skipped, resource)
				continue
			}
			_, err = db.DB.Exec(
				`INSERT INTO profile_data (profile_id, resource, body, rev, updated_at) VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(profile_id, resource) DO UPDATE SET body = excluded.body, rev = excluded.rev, updated_at = excluded.updated_at`,
				p.ID, resource, string(normalized), rev+1, nowMs(),
			)
			dataMu.Unlock()
			if err != nil {
				report.Errors = append(report.Errors, resource+": could not save")
				continue
			}
			report.Imported = append(report.Imported, resource)
		}
		reports = append(reports, report)
	}

	// Preserve the imported active profile only when nothing is active yet.
	if validProfileID(req.Profiles.ActiveID) && containsProfile(req.Profiles.List, req.Profiles.ActiveID) {
		var current string
		_ = db.DB.QueryRow("SELECT active_id FROM profile_state WHERE user_id = ?", devUserID).Scan(&current)
		if current == "" || req.Force {
			_ = setActiveProfile(req.Profiles.ActiveID)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"profiles": reports})
}

// Health is a lightweight readiness/liveness endpoint.
func Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
