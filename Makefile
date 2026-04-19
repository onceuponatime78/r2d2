.PHONY: build frontend release dev dev-frontend clean

# Build frontend then compile Go binary
build: frontend
	go build -o r2d2 .

# Build frontend only
frontend:
	cd web/frontend && npm run build

# Dev: run Go server (requires frontend already built)
dev:
	go run . -port 8000

# Dev: frontend with Vite HMR
dev-frontend:
	cd web/frontend && npm run dev

# Cross-platform release builds
release: frontend
	@mkdir -p dist
	GOOS=darwin  GOARCH=arm64 go build -o dist/r2d2-macos-arm64 .
	GOOS=darwin  GOARCH=amd64 go build -o dist/r2d2-macos-amd64 .
	GOOS=linux   GOARCH=amd64 go build -o dist/r2d2-linux-amd64 .
	GOOS=linux   GOARCH=arm64 go build -o dist/r2d2-linux-arm64 .
	GOOS=windows GOARCH=amd64 go build -o dist/r2d2-windows-amd64.exe .

clean:
	rm -f r2d2 r2d2.exe
	rm -rf dist/
	rm -rf web/frontend/dist
