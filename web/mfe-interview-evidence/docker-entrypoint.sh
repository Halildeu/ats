#!/bin/sh
# Render the nginx config to /tmp and hand off to nginx.
#
# The stock nginx image templates into /etc/nginx/conf.d, which a read-only
# root filesystem forbids. Rendering a complete config into the writable /tmp
# emptyDir instead keeps readOnlyRootFilesystem: true on the deployment.
set -eu

: "${ATS_API_UPSTREAM:=http://ats-interview-evidence:8080}"
export ATS_API_UPSTREAM

# Fail closed on a malformed upstream rather than starting a UI whose every
# API call silently 502s. envsubst would happily paste anything here.
case "$ATS_API_UPSTREAM" in
  http://*|https://*) ;;
  *)
    echo "ATS_API_UPSTREAM must be an http(s) URL, got: $ATS_API_UPSTREAM" >&2
    exit 1
    ;;
esac
case "$ATS_API_UPSTREAM" in
  */) echo "ATS_API_UPSTREAM must not end with '/' (nginx proxy_pass semantics change)" >&2
      exit 1 ;;
esac

# Only the upstream is substituted; a bare envsubst would also eat nginx's own
# $host / $uri variables.
envsubst '${ATS_API_UPSTREAM}' \
  < /etc/nginx/nginx.conf.template \
  > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
