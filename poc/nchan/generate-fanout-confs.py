#!/usr/bin/env python3
"""Generate 16 match-aware Nchan fan-out instance configs.

Each instance owns ONE (match, shard) pair and uses LOCAL in-memory storage
(no Redis in the delivery hot path). This is the architecture-revision
topology: 8 matches x 2 fan-out shards = 16 independent delivery domains,
each with 1 worker. It replaces the 4-partition topology where every
partition received every event via Redis broadcast.

Port scheme (instance k = match*2 + shard, 0..15):
  pub  = 11080 + k*100
  sub  = 11081 + k*100
  ctrl = 11088 + k*100   (node control-server.js, not nginx)
"""
import os

NCHAN_DIR = os.path.dirname(os.path.abspath(__file__))

TEMPLATE = """# Architecture-revision match-aware fan-out instance (auto-generated).
# §ARCH: one (match, shard) delivery domain, 1 worker, local storage.
worker_processes 1;
error_log /dev/stderr info;
pid /tmp/nginx.pid;

events {
    worker_connections 65536;
    # multi_accept off: one worker swallows dial waves on connect storms.
    multi_accept off;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    log_format main '$remote_addr - [$time_local] "$request" $status $body_bytes_sent rt=$request_time urt=$upstream_response_time';
    # Disable per-client/per-event access logging at evidence scale.
    access_log off;

    # No Redis upstream: local in-memory storage only. The architecture
    # revision routes each event directly to the two owning instances, so
    # Redis is removed from the delivery hot path (no cross-instance
    # broadcast, no PUBSUB amplification).
    nchan_shared_memory_size 64m;

    # Publisher server (port __PUB__)
    server {
        listen __PUB__;

        location = /pub/healthcheck {
            return 200 'ok';
        }

        location = /nginx_status {
            stub_status;
            allow 127.0.0.1;
            allow ::1;
            deny all;
        }

        # Lobby: latest-state-only semantics (buffer=1).
        location = /pub/lobby {
            nchan_publisher;
            nchan_channel_id "lobby";
            nchan_message_timeout 2h;
            nchan_message_buffer_length 1;
        }

        # Match channels: 5000-message buffer for late-join history replay.
        location ~ ^/pub/(.+)$ {
            nchan_publisher;
            nchan_channel_id $1;
            nchan_message_timeout 2h;
            nchan_message_buffer_length 5000;
        }
    }

    # Subscriber server (port __SUB__)
    server {
        listen __SUB__ reuseport;

        location = /nchan_stub_status {
            nchan_stub_status;
            allow all;
        }

        location ~ ^/sub/(.+)$ {
            nchan_subscriber eventsource;
            nchan_channel_id $1;
            nchan_subscriber_first_message newest;
            nchan_eventsource_ping_interval 15;
            nchan_eventsource_ping_comment "keepalive";
            nchan_eventsource_ping_data "";
        }

        # Late-join / history replay subscriber (oldest).
        location ~ ^/history/(.+)$ {
            nchan_subscriber eventsource;
            nchan_channel_id $1;
            nchan_subscriber_first_message oldest;
            nchan_eventsource_event "update";
        }

        location = /sub/lobby {
            nchan_subscriber eventsource;
            nchan_channel_id "lobby";
            nchan_subscriber_first_message oldest;
            nchan_message_buffer_length 1;
            nchan_eventsource_ping_interval 15;
            nchan_eventsource_ping_comment "keepalive";
            nchan_eventsource_ping_data "";
            nchan_eventsource_event "lobby";
        }
    }
}
"""


def instance_ports(k: int):
    return (11080 + k * 100, 11081 + k * 100, 11088 + k * 100)


def main():
    for m in range(8):
        for s in range(2):
            k = m * 2 + s
            pub, sub, ctrl = instance_ports(k)
            suffix = "a" if s == 0 else "b"
            name = f"fanout-{m}{suffix}"
            conf = TEMPLATE.replace("__PUB__", str(pub)).replace("__SUB__", str(sub))
            out = os.path.join(NCHAN_DIR, f"{name}.conf")
            with open(out, "w") as f:
                f.write(conf)
            print(f"{name}.conf pub={pub} sub={sub} ctrl={ctrl}")


if __name__ == "__main__":
    main()
