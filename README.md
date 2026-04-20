# R2-D2 Web Controller v1.1

A locally-hosted web application to control the DeAgostini "Build Your Own R2-D2" robot. Single binary, zero dependencies, runs on macOS, Linux, and Windows — or as a Home Assistant add-on.

## Features

- **Full robot control** — joystick, head rotation, animations, sound playback, hardware toggles
- **Live video feed** — snapshot and video recording
- **WiFi management** — scan and connect to networks
- **Device management** — view/unpair paired devices, rename robot
- **AP mode pairing** — pair new robots via direct WiFi
- **Multi-robot support** — manage multiple robots with auto-reconnect
- **Single binary** — Go backend with embedded React frontend, no runtime dependencies
- **Cross-platform** — macOS (arm64/amd64), Linux (amd64/arm64), Windows (amd64)
- **Home Assistant add-on** — sidebar integration with WebSocket proxy for remote access

## Quick Start

### Standalone Binary

Download the binary for your platform from the [Releases](../../releases) page, then run it:

```bash
./r2d2              # serves on http://localhost:8000, auto-opens browser
./r2d2 -port 3000   # custom port
./r2d2 --no-browser  # don't auto-open browser
```

On macOS, a `.app` bundle is also available — double-click to launch.

### Home Assistant Add-on

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fonceuponatime78%2Fr2d2)

Or manually:

1. Go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add: `https://github.com/onceuponatime78/r2d2`
3. Find "R2-D2 Controller" in the store and install
4. Start the add-on — it appears in the sidebar as "R2-D2"

The add-on proxies all WebSocket traffic through the server, so you can control your R2-D2 **remotely** via Nabu Casa or other HA remote access methods.

## Building from Source

Requires: [Go](https://go.dev/) 1.21+ and [Node.js](https://nodejs.org/) 18+

```bash
make build      # build frontend + Go binary → ./r2d2
make app        # macOS .app bundle → R2D2.app
make release    # cross-platform binaries → dist/
make addon      # build HA add-on Docker image locally
```

## Architecture

### Standalone Mode

The browser connects **directly** to the robot via WebSocket for both control (`ws://<ip>:8887`) and video (`ws://<ip>:12121`). The Go server only handles UDP robot discovery and serves the static frontend.

```
┌─────────┐         ┌──────────┐         ┌─────────┐
│ Browser  │◄──ws──►│  Robot    │         │ Go      │
│ (React)  │  8887  │  R2-D2   │         │ Server  │
│          │◄──ws──►│          │         │         │
│          │ 12121  │          │◄──udp──►│ :8000   │
│          │◄──────────────────────http──►│         │
└─────────┘         └──────────┘         └─────────┘
```

### Home Assistant Add-on Mode

All traffic flows through the Go server. WebSocket connections to the robot are proxied, enabling remote access through HA ingress and Nabu Casa.

```
┌─────────┐         ┌──────────┐         ┌──────────┐
│ Browser  │◄─http──►│ HA       │◄─http──►│ Go       │◄──ws──►┌──────┐
│          │  (or    │ Ingress  │         │ Server   │  8887  │Robot │
│          │  Nabu   │          │         │ :8099    │◄──ws──►│R2-D2 │
│          │  Casa)  │          │         │          │ 12121  │      │
└─────────┘         └──────────┘         │          │◄──udp──►      │
                                          └──────────┘         └──────┘
```

## Protocol

The reverse-engineered protocol is documented in [`docs/protocol.md`](docs/protocol.md).

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui
- **Backend:** Go with [gorilla/websocket](https://github.com/gorilla/websocket) for WS proxy
- **Communication:** WebSocket (direct or proxied), UDP broadcast (discovery)

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This project is an unofficial, community-built tool for personal use. It is not affiliated with, endorsed by, or sponsored by Lucasfilm Ltd., The Walt Disney Company, or De Agostini S.p.A. "R2-D2", "Star Wars", and "Astromech" are trademarks of Lucasfilm Ltd. "Lightsaber" is a trademark of Lucasfilm Ltd. All trademarks are the property of their respective owners. This project is provided for educational and interoperability purposes.
