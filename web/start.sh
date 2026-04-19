#!/bin/bash
# R2-D2 Web Controller - Start Script
# Builds frontend and starts the backend server

set -e
cd "$(dirname "$0")"

echo "==> Building frontend..."
cd frontend
npm install --silent
npm run build
cp -r dist/* ../backend/static/
cd ..

echo "==> Starting backend on http://localhost:8000"
cd backend
python3 server.py
