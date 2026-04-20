.PHONY: build frontend release app dev dev-frontend clean

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

# macOS .app bundle (double-clickable, shows in Dock)
app: build
	@rm -rf R2D2.app
	@mkdir -p R2D2.app/Contents/MacOS R2D2.app/Contents/Resources
	@cp r2d2 R2D2.app/Contents/MacOS/r2d2
	@printf '<?xml version="1.0" encoding="UTF-8"?>\n\
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n\
<plist version="1.0">\n\
<dict>\n\
	<key>CFBundleExecutable</key>\n\
	<string>r2d2</string>\n\
	<key>CFBundleIdentifier</key>\n\
	<string>com.r2d2.controller</string>\n\
	<key>CFBundleName</key>\n\
	<string>R2-D2 Controller</string>\n\
	<key>CFBundleDisplayName</key>\n\
	<string>R2-D2 Controller</string>\n\
	<key>CFBundleVersion</key>\n\
	<string>1.0</string>\n\
	<key>CFBundleShortVersionString</key>\n\
	<string>1.0</string>\n\
	<key>CFBundlePackageType</key>\n\
	<string>APPL</string>\n\
	<key>CFBundleIconFile</key>\n\
	<string>AppIcon</string>\n\
</dict>\n\
</plist>' > R2D2.app/Contents/Info.plist
	@if command -v sips >/dev/null && command -v iconutil >/dev/null; then \
		mkdir -p /tmp/r2d2icon.iconset; \
		if command -v rsvg-convert >/dev/null; then \
			rsvg-convert -w 1024 -h 1024 web/frontend/public/favicon.svg -o /tmp/r2d2_1024.png; \
		elif command -v magick >/dev/null; then \
			magick -background none -density 300 web/frontend/public/favicon.svg -resize 1024x1024 /tmp/r2d2_1024.png; \
		else \
			echo "No SVG converter found, skipping icon"; \
			touch /tmp/r2d2_skip_icon; \
		fi; \
		if [ ! -f /tmp/r2d2_skip_icon ] && [ -f /tmp/r2d2_1024.png ]; then \
			for size in 16 32 128 256 512; do \
				sips -z $$size $$size /tmp/r2d2_1024.png --out /tmp/r2d2icon.iconset/icon_$${size}x$${size}.png >/dev/null 2>&1; \
				double=$$((size * 2)); \
				sips -z $$double $$double /tmp/r2d2_1024.png --out /tmp/r2d2icon.iconset/icon_$${size}x$${size}@2x.png >/dev/null 2>&1; \
			done; \
			iconutil -c icns /tmp/r2d2icon.iconset -o R2D2.app/Contents/Resources/AppIcon.icns 2>/dev/null || true; \
		fi; \
		rm -rf /tmp/r2d2icon.iconset /tmp/r2d2_1024.png /tmp/r2d2_skip_icon; \
	fi
	@echo "Built R2D2.app — double-click to launch"

clean:
	rm -f r2d2 r2d2.exe
	rm -rf dist/
	rm -rf R2D2.app
	rm -rf web/frontend/dist
