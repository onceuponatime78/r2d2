#!/usr/bin/with-contenv bashio

# Home Assistant add-on entrypoint for R2-D2 Controller

export PORT=8099
export INGRESS_PATH="$(bashio::addon.ingress_entry)"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN}"

bashio::log.info "Starting R2-D2 Controller on port ${PORT}"
bashio::log.info "Ingress path: ${INGRESS_PATH}"

exec /usr/bin/r2d2 --no-browser
