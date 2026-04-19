package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
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

	// Strip the web/frontend/dist prefix so files serve from /
	distFS, err := fs.Sub(frontendFS, "web/frontend/dist")
	if err != nil {
		log.Fatalf("Failed to access embedded frontend: %v", err)
	}

	mux := http.NewServeMux()

	// API: robot discovery
	mux.HandleFunc("/api/discover", handleDiscover)

	// Static files with SPA fallback
	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file directly
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Check if file exists in embedded FS
		f, err := distFS.Open(path[1:]) // strip leading /
		if err != nil {
			// File not found — serve index.html for SPA routing
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()
		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%d", port)
	url := fmt.Sprintf("http://localhost:%d", port)

	fmt.Println("┌─────────────────────────────────────────┐")
	fmt.Println("│  R2-D2 Astromech Control Interface       │")
	fmt.Println("├─────────────────────────────────────────┤")
	fmt.Printf("│  Server: %-31s│\n", url)
	fmt.Println("│  Press Ctrl+C to stop                    │")
	fmt.Println("└─────────────────────────────────────────┘")

	if !*noBrowser {
		time.AfterFunc(500*time.Millisecond, func() {
			openBrowser(url)
		})
	}

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleDiscover(w http.ResponseWriter, r *http.Request) {
	robots := discoverRobots()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(robots)
}

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

	// Collect our own IPs to filter echo
	ownIPs := getOwnIPs()

	found := make(map[string]Robot)
	buf := make([]byte, 4096)

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			break // timeout or error
		}

		// Skip our own broadcasts
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

	// Method 1: dial out to find primary IP
	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err == nil {
		if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
			ips[addr.IP.String()] = struct{}{}
		}
		conn.Close()
	}

	// Method 2: enumerate interfaces
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
