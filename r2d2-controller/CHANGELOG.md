# Changelog

## 1.1.3

- Fix run.sh shebang: use `with-contenv bashio` for s6 environment access
- Fix s6-overlay startup: add `init: false` to prevent tini from stealing PID 1

## 1.1.0

- Initial Home Assistant add-on release
- WebSocket proxy for remote access via Nabu Casa
- Ingress support (sidebar integration)
- Host networking for UDP robot discovery
