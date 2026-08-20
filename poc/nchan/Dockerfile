FROM ubuntu:24.04 AS builder

ARG NGINX_VERSION=1.27.4
ARG NCHAN_VERSION=1.3.8

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpcre3-dev libssl-dev zlib1g-dev \
    libcurl4-openssl-dev libyajl-dev \
    curl ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# Download Nginx source
RUN cd /tmp && \
    wget -q http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
    tar xzf nginx-${NGINX_VERSION}.tar.gz

# Download Nchan source
RUN cd /tmp && \
    curl -fsSL https://github.com/slact/nchan/archive/refs/tags/v${NCHAN_VERSION}.tar.gz \
    | tar xz

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
        --add-module=/tmp/nchan-${NCHAN_VERSION} && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/nginx-${NGINX_VERSION} /tmp/nchan-${NCHAN_VERSION}

# Runtime stage
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcre3 libssl3 zlib1g libcurl4 libyajl2 \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx
COPY --from=builder /etc/nginx/ /etc/nginx/

COPY nchan.conf /etc/nginx/nginx.conf
COPY nchan-2.conf /etc/nginx/nchan-2.conf

EXPOSE 8080 8081 18080 18081

CMD ["nginx", "-c", "/etc/nginx/nginx.conf", "-g", "daemon off;"]
