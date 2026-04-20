ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM golang:1.23-alpine AS go-builder

RUN apk add --no-cache nodejs npm git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY web/frontend/package.json web/frontend/package-lock.json web/frontend/
RUN cd web/frontend && npm ci
COPY . .
RUN cd web/frontend && npm run build
RUN CGO_ENABLED=0 go build -o /app/r2d2 .

FROM ${BUILD_FROM}
COPY --from=go-builder /app/r2d2 /usr/bin/r2d2
COPY r2d2-controller/run.sh /
RUN chmod a+x /run.sh /usr/bin/r2d2

CMD [ "/run.sh" ]

LABEL io.hass.version="1.1.0" \
      io.hass.type="addon" \
      io.hass.arch="aarch64|amd64"
