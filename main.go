package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

//go:embed all:web/frontend/dist
var frontendFS embed.FS

// Robot represents a discovered R2-D2 unit
type Robot struct {
	UUID   string `json:"uuid"`
	Name   string `json:"name"`
	IP     string `json:"ip"`
	APMode bool   `json:"ap_mode"`
}

// ingressPath is set from the INGRESS_PATH env var (Home Assistant add-on mode)
var ingressPath string

// proxyMode indicates we're running inside HA (SUPERVISOR_TOKEN present)
var proxyMode bool

// robotsFile is the path to persistent robot storage
var robotsFile string

// indexHTML holds the (possibly patched) index.html bytes
var indexHTML []byte

// upgrader for WebSocket proxy
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	portFlag := flag.Int("port", 0, "HTTP server port (default 8000, or PORT env)")
	noBrowser := flag.Bool("no-browser", false, "Don't auto-open browser")
	flag.Parse()

	port := *portFlag
	if port == 0 {
		if env := os.Getenv("PORT"); env != "" {
			fmt.Sscanf(env, "%d", &port)
		}
	}
	if port == 0 {
		port = 8000
	}

	// Detect Home Assistant add-on mode
	if token := os.Getenv("SUPERVISOR_TOKEN"); token != "" {
		proxyMode = true
		*noBrowser = true // never auto-open in container
		robotsFile = "/data/robots.json"
		log.Println("Running in Home Assistant add-on mode (proxy enabled)")
		// Query Supervisor API for ingress entry path
		if entry, err := fetchIngressEntry(token); err != nil {
			log.Printf("Warning: could not fetch ingress entry: %v", err)
		} else {
			ingressPath = strings.TrimRight(entry, "/")
			log.Printf("Ingress entry: %s", ingressPath)
		}
	} else {
		robotsFile = "robots.json"
		ingressPath = strings.TrimRight(os.Getenv("INGRESS_PATH"), "/")
	}

	// Strip the web/frontend/dist prefix so files serve from /
	distFS, err := fs.Sub(frontendFS, "web/frontend/dist")
	if err != nil {
		log.Fatalf("Failed to access embedded frontend: %v", err)
	}

	// Read and patch index.html for ingress base path
	rawIndex, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		log.Fatalf("Failed to read embedded index.html: %v", err)
	}
	indexHTML = patchIndexHTML(rawIndex)

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/discover", handleDiscover)
	mux.HandleFunc("/api/config", handleConfig)
	mux.HandleFunc("/api/robots", handleRobots)
	mux.HandleFunc("/api/ws/control", handleWSControl)
	mux.HandleFunc("/api/ws/video", handleWSVideo)

	// Static files with SPA fallback
	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			serveIndex(w)
			return
		}

		// Check if file exists in embedded FS
		f, err := distFS.Open(path[1:]) // strip leading /
		if err != nil {
			// SPA fallback
			serveIndex(w)
			return
		}
		f.Close()
		fileServer.ServeHTTP(w, r)
	})

	// If ingress path is set, also mount under that prefix
	var handler http.Handler = mux
	if ingressPath != "" {
		handler = ingressStripPrefix(ingressPath, mux)
	}

	addr := fmt.Sprintf(":%d", port)
	urlStr := fmt.Sprintf("http://localhost:%d", port)

	fmt.Println("┌─────────────────────────────────────────┐")
	fmt.Println("│  R2-D2 Controller v1.1                  │")
	fmt.Println("├─────────────────────────────────────────┤")
	fmt.Printf("│  Server: %-31s│\n", urlStr)
	if ingressPath != "" {
		fmt.Printf("│  Ingress: %-30s│\n", ingressPath)
	}
	if proxyMode {
		fmt.Println("│  Mode: Home Assistant Add-on             │")
	}
	fmt.Println("│  Press Ctrl+C to stop                    │")
	fmt.Println("└─────────────────────────────────────────┘")

	if !*noBrowser {
		time.AfterFunc(500*time.Millisecond, func() {
			openBrowser(urlStr)
		})
	}

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// patchIndexHTML injects a <base> tag when running behind HA ingress
func patchIndexHTML(raw []byte) []byte {
	if ingressPath == "" {
		return raw
	}
	base := fmt.Sprintf(`<base href="%s/">`, ingressPath)
	return []byte(strings.Replace(string(raw), "<head>", "<head>\n    "+base, 1))
}

func serveIndex(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(indexHTML)
}

// ingressStripPrefix strips the ingress path prefix so routes work normally
func ingressStripPrefix(prefix string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, prefix) {
			r2 := new(http.Request)
			*r2 = *r
			r2.URL = new(url.URL)
			*r2.URL = *r.URL
			r2.URL.Path = strings.TrimPrefix(r.URL.Path, prefix)
			if r2.URL.Path == "" {
				r2.URL.Path = "/"
			}
			next.ServeHTTP(w, r2)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// fetchIngressEntry queries the HA Supervisor API to get the ingress entry path
func fetchIngressEntry(token string) (string, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", "http://supervisor/addons/self/info", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("supervisor API request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("supervisor API returned %d", resp.StatusCode)
	}
	var result struct {
		Data struct {
			IngressEntry string `json:"ingress_entry"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode supervisor response: %w", err)
	}
	return result.Data.IngressEntry, nil
}

// ── API Handlers ──────────────────────────────────────────────────────────────

func handleConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"proxy":       proxyMode,
		"ingressPath": ingressPath,
		"version":     "1.1.0",
	})
}

func handleDiscover(w http.ResponseWriter, r *http.Request) {
	robots := discoverRobots()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(robots)
}

// handleRobots serves GET/PUT for persistent robot storage
func handleRobots(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(robotsFile)
		if err != nil {
			// No file yet — return empty object
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPut:
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB limit
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}
		// Validate JSON
		var check map[string]interface{}
		if err := json.Unmarshal(body, &check); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if err := os.WriteFile(robotsFile, body, 0644); err != nil {
			log.Printf("Failed to write robots file: %v", err)
			http.Error(w, "write error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── WebSocket Proxy ───────────────────────────────────────────────────────────

// handleWSControl proxies browser WS ↔ robot control WS (port 8887)
func handleWSControl(w http.ResponseWriter, r *http.Request) {
	robotIP := r.URL.Query().Get("ip")
	if robotIP == "" {
		http.Error(w, "missing ip parameter", http.StatusBadRequest)
		return
	}
	if !isValidIP(robotIP) {
		http.Error(w, "invalid ip parameter", http.StatusBadRequest)
		return
	}

	// Upgrade browser connection
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS proxy control: upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	// Connect to robot
	robotURL := fmt.Sprintf("ws://%s:8887", robotIP)
	robotConn, _, err := websocket.DefaultDialer.Dial(robotURL, nil)
	if err != nil {
		log.Printf("WS proxy control: robot dial failed: %v", err)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "robot unreachable"))
		return
	}
	defer robotConn.Close()

	log.Printf("WS proxy control: connected to %s", robotIP)
	proxyWebSocket(clientConn, robotConn)
}

// handleWSVideo proxies browser WS ↔ robot video WS (port 12121)
func handleWSVideo(w http.ResponseWriter, r *http.Request) {
	robotIP := r.URL.Query().Get("ip")
	if robotIP == "" {
		http.Error(w, "missing ip parameter", http.StatusBadRequest)
		return
	}
	if !isValidIP(robotIP) {
		http.Error(w, "invalid ip parameter", http.StatusBadRequest)
		return
	}

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS proxy video: upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	robotURL := fmt.Sprintf("ws://%s:12121", robotIP)
	robotConn, _, err := websocket.DefaultDialer.Dial(robotURL, nil)
	if err != nil {
		log.Printf("WS proxy video: robot dial failed: %v", err)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "robot unreachable"))
		return
	}
	defer robotConn.Close()

	log.Printf("WS proxy video: connected to %s", robotIP)
	proxyWebSocket(clientConn, robotConn)
}

// proxyWebSocket does bidirectional frame-level relay between two WebSocket connections
func proxyWebSocket(client, robot *websocket.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)

	// client → robot
	go func() {
		defer wg.Done()
		relay(client, robot)
		robot.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}()

	// robot → client
	go func() {
		defer wg.Done()
		relay(robot, client)
		client.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}()

	wg.Wait()
}

// relay copies WebSocket frames from src to dst
func relay(src, dst *websocket.Conn) {
	for {
		msgType, reader, err := src.NextReader()
		if err != nil {
			return
		}
		writer, err := dst.NextWriter(msgType)
		if err != nil {
			return
		}
		if _, err := io.Copy(writer, reader); err != nil {
			writer.Close()
			return
		}
		writer.Close()
	}
}

// isValidIP checks that the parameter is a valid IPv4 address
func isValidIP(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && ip.To4() != nil
}

// ── Discovery ─────────────────────────────────────────────────────────────────

func discoverRobots() []Robot {
	const (
		broadcastPort = 8090
		listenTimeout = 3 * time.Second
	)

	addr := &net.UDPAddr{Port: broadcastPort}
	conn, err := net.ListenUDP("udp4", addr)
	if err != nil {
		log.Printf("Discovery: failed to bind UDP port %d: %v", broadcastPort, err)
		return []Robot{}
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(listenTimeout))

	ownIPs := getOwnIPs()
	found := make(map[string]Robot)
	buf := make([]byte, 4096)

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			break
		}

		if _, ok := ownIPs[remoteAddr.IP.String()]; ok {
			continue
		}

		var msg struct {
			Cmd    string `json:"cmd"`
			UUID   string `json:"uuid"`
			Name   string `json:"name"`
			IP     string `json:"ip"`
			APMode bool   `json:"ap_mode"`
		}
		if err := json.Unmarshal(buf[:n], &msg); err != nil {
			continue
		}
		if msg.Cmd != "updBroadcast" {
			continue
		}

		uuid := msg.UUID
		if uuid == "" {
			uuid = remoteAddr.IP.String()
		}
		ip := msg.IP
		if ip == "" {
			ip = remoteAddr.IP.String()
		}
		name := msg.Name
		if name == "" {
			name = "R2-D2"
		}

		found[uuid] = Robot{
			UUID:   uuid,
			Name:   name,
			IP:     ip,
			APMode: msg.APMode,
		}
	}

	robots := make([]Robot, 0, len(found))
	for _, r := range found {
		robots = append(robots, r)
	}
	return robots
}

func getOwnIPs() map[string]struct{} {
	ips := make(map[string]struct{})

	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err == nil {
		if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
			ips[addr.IP.String()] = struct{}{}
		}
		conn.Close()
	}

	addrs, err := net.InterfaceAddrs()
	if err == nil {
		for _, a := range addrs {
			if ipnet, ok := a.(*net.IPNet); ok {
				ips[ipnet.IP.String()] = struct{}{}
			}
		}
	}

	return ips
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return
	}
	cmd.Start()
}
