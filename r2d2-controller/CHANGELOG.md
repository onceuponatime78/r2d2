# Changelog

## 1.1.7

- Fix WebSocket proxy race condition: await server config before connecting (fixes "send() dropped" in HA mode)
- Add Import/Export Pairing feature: transfer paired robot credentials between standalone app and HA add-on

## 1.1.6

- Fix white screen in HA ingress: use relative asset paths (`base: './'`) so `<base>` tag resolves correctly

## 1.1.5

- Replace HA base image with plain Alpine — eliminates s6-overlay PID 1 conflict
- Query Supervisor API directly for ingress path (no more bashio/s6 dependency)
- Single static Go binary as container entrypoint — no service supervision needed

## 1.1.4

- Fix add-on startup: restore CMD in Dockerfile, add hassio_api access
- Shared robot storage across devices via /api/robots (persists in /data)
- Remove invalid `init: false` config option

## 1.1.0

- Initial Home Assistant add-on release
- WebSocket proxy for remote access via Nabu Casa
- Ingress support (sidebar integration)
- Host networking for UDP robot discovery
