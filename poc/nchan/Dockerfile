FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517 AS builder

ARG NGINX_VERSION=1.27.4
ARG NCHAN_VERSION=1.3.8
# §4.22: Pinned SHA-256 checksums for reproducible builds
# To compute: curl -sL <url> | sha256sum | awk '{print $1}'
# NGINX: https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz
# NCHAN: https://github.com/slact/nchan/archive/refs/tags/v${NCHAN_VERSION}.tar.gz
ARG NGINX_SHA256=294816f879b300e621fa4edd5353dd1ec00badb056399eceb30de7db64b753b2
ARG NCHAN_SHA256=86e40f97bf380cb81d62c279aa0f992c2d8c93ebcfe242cf0be95e5b6ade9a98

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpcre3-dev libssl-dev zlib1g-dev \
    libcurl4-openssl-dev libyajl-dev \
    curl ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# §4.22: Download Nginx source with SHA-256 verification
RUN cd /tmp && \
    wget -q https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
    echo "${NGINX_SHA256}  nginx-${NGINX_VERSION}.tar.gz" | sha256sum -c - && \
    tar xzf nginx-${NGINX_VERSION}.tar.gz

# §4.22: Download Nchan source with SHA-256 verification
RUN cd /tmp && \
    curl -fsSL https://github.com/slact/nchan/archive/refs/tags/v${NCHAN_VERSION}.tar.gz -o nchan-${NCHAN_VERSION}.tar.gz && \
    echo "${NCHAN_SHA256}  nchan-${NCHAN_VERSION}.tar.gz" | sha256sum -c - && \
    tar xzf nchan-${NCHAN_VERSION}.tar.gz

# Build Nginx with Nchan module
RUN cd /tmp/nginx-${NGINX_VERSION} && \
    ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --modules-path=/usr/lib64/nginx/modules \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --pid-path=/var/run/nginx.pid \
        --lock-path=/var/run/nginx.lock \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_stub_status_module \
        --with-debug \
        --add-module=/tmp/nchan-${NCHAN_VERSION} && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/nginx-${NGINX_VERSION} /tmp/nchan-${NCHAN_VERSION}

# §E/§6.7: Extract Node.js binary for the test-only restart control server.
# The control server is a small isolated process inside the Nchan container
# that allows the runner to trigger a literal Nginx/Nchan process restart
# without mounting the Docker socket.
FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS nodejs

# Runtime stage
FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcre3 libssl3 zlib1g libcurl4 libyajl2 \
    curl ca-certificates bash procps gdb && \
    rm -rf /var/lib/apt/lists/*
# TEMP-DIAG: gdb ships so a mid-run attach can capture the userspace
# backtrace of the livelocked worker (SYS_PTRACE granted in compose).
# Remove once the burst-onset spin root cause is fixed.

COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx
COPY --from=builder /etc/nginx/ /etc/nginx/

# §E: Copy Node.js for the test-only restart control server
COPY --from=nodejs /usr/local/bin/node /usr/local/bin/node

COPY nchan.conf /etc/nginx/nginx.conf
# §M3-R: partition nodes select their config via NGINX_CONF; p0's compose env
# points at /etc/nginx/nchan.conf, so the canonical config ships under that
# name as well (identical content, explicit per-node file set).
COPY nchan.conf /etc/nginx/nchan.conf
COPY nchan-2.conf /etc/nginx/nchan-2.conf
COPY nchan-3.conf /etc/nginx/nchan-3.conf
COPY nchan-4.conf /etc/nginx/nchan-4.conf
COPY nchan-spare.conf /etc/nginx/nchan-spare.conf
COPY nchan-portable.conf /etc/nginx/nchan-portable.conf

# §E/§6.7: Test-only restart control server and script
COPY control-server.js /usr/local/bin/control-server.js
COPY nchan-restart.sh /usr/local/bin/nchan-restart.sh
COPY livelock-watcher.sh /usr/local/bin/livelock-watcher.sh
RUN chmod +x /usr/local/bin/nchan-restart.sh /usr/local/bin/livelock-watcher.sh

# §M3-R: All node ports (partition nodes p0-p3 + spare) — informational only;
# the evidence topology uses host networking.
EXPOSE 8080 8081 18080 18081 28080 28081 38080 38081 48080 48081 18888 18889 28888 38889 48888

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
