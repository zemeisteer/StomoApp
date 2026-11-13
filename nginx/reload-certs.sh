#!/bin/sh
# Runs from the nginx image entrypoint (/docker-entrypoint.d) before nginx starts.
# Reload every 6h so certificates renewed by the certbot service are picked up.
# (Overriding the container command instead would skip template rendering.)
(
  while :; do
    sleep 21600
    nginx -s reload
  done
) &
