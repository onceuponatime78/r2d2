# R2-D2 Web Controller v1.0

A locally-hosted web application to control the DeAgostini "Build Your Own R2-D2" robot. Single binary, zero dependencies, runs on macOS, Linux, and Windows.

## Features

- **Full robot control** — joystick, head rotation, animations, sound playback, hardware toggles
- **Live video feed** — snapshot and video recording
- **WiFi management** — scan and connect to networks
- **Device management** — view/unpair paired devices, rename robot
- **AP mode pairing** — pair new robots via direct WiFi
- **Multi-robot support** — manage multiple robots with auto-reconnect
- **Single binary** — Go backend with embedded React frontend, no runtime dependencies
- **Cross-platform** — macOS (arm64/amd64), Linux (amd64/arm64), Windows (amd64)

## Quick Start

Download the binary for your platform from the [Releases](../../releases) page, then run it:

```bash
./r2d2              # serves on http://localhost:8000, auto-opens browser
./r2d2 -port 3000   # custom port
./r2d2 --no-browser  # don't auto-open browser
```

On macOS, a `.app` bundle is also available — double-click to launch.

## Building from Source

Requires: [Go](https://go.dev/) 1.21+ and [Node.js](https://nodejs.org/) 18+

```bash
make build      # build frontend + Go binary → ./r2d2
make app        # macOS .app bundle → R2D2.app
make release    # cross-platform binaries → dist/
```

## Architecture

The browser connects **directly** to the robot via WebSocket for both control (`ws://<ip>:8887`) and video (`ws://<ip>:12121`). The Go server only handles UDP robot discovery and serves the static frontend — no proxying.

```
┌─────────┐         ┌──────────┐         ┌─────────┐
│ Browser  │◄──ws──►│  Robot    │         │ Go      │
│ (React)  │  8887  │  R2-D2   │         │ Server  │
│          │◄──ws──►│          │         │         │
│          │ 12121  │          │◄──udp──►│ :8000   │
│          │◄──────────────────────http──►│         │
└─────────┘         └──────────┘         └─────────┘
```

## Protocol

The reverse-engineered protocol is documented in [`docs/protocol.md`](docs/protocol.md).

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui
- **Backend:** Go stdlib (net/http, embed, net), zero external dependencies
- **Communication:** WebSocket (direct browser ↔ robot), UDP broadcast (discovery)

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This project is an unofficial, community-built tool for personal use. It is not affiliated with, endorsed by, or sponsored by Lucasfilm Ltd., The Walt Disney Company, or De Agostini S.p.A. "R2-D2", "Star Wars", and "Astromech" are trademarks of Lucasfilm Ltd. "Lightsaber" is a trademark of Lucasfilm Ltd. All trademarks are the property of their respective owners. This project is provided for educational and interoperability purposes.
