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

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=go-builder /app/r2d2 /usr/bin/r2d2
RUN chmod a+x /usr/bin/r2d2

ENV PORT=8099

CMD [ "/usr/bin/r2d2", "--no-browser" ]

LABEL io.hass.version="1.1.5" \
      io.hass.type="addon" \
      io.hass.arch="aarch64|amd64"
