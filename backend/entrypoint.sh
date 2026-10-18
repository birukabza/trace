#!/bin/sh
set -eu
# A newly attached Railway volume starts owned by root. Give the application
# access to its data, then run the HTTP server without root privileges.
mkdir -p /data
chown -R node:node /data
exec gosu node "$@"
