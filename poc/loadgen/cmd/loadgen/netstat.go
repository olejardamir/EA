package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// readTcpExt parses /proc/net/netstat's TcpExt block into a flat counter map.
// The containers share the host kernel, so these counters are host-wide TCP
// health: retransmission storms, listen overflows and timeouts attribute
// transport-era delivery stalls to packet loss versus queueing.
func readTcpExt() (map[string]int64, error) {
	f, err := os.Open("/proc/net/netstat")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := map[string]int64{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "TcpExt:") {
			continue
		}
		if !sc.Scan() {
			break
		}
		values := sc.Text()
		if !strings.HasPrefix(values, "TcpExt:") {
			continue
		}
		headers := strings.Fields(strings.TrimPrefix(line, "TcpExt:"))
		fields := strings.Fields(strings.TrimPrefix(values, "TcpExt:"))
		for i, h := range headers {
			if i >= len(fields) {
				break
			}
			v, err := strconv.ParseInt(fields[i], 10, 64)
			if err != nil {
				continue
			}
			out[h] = v
		}
	}
	return out, sc.Err()
}

// readSockstatParses /proc/net/sockstat's TCP line into a flat map (inuse,
// orphan, tw, alloc, mem). mem is the host-wide TCP memory footprint in PAGES;
// compared against /proc/sys/net/ipv4/tcp_mem pressure thresholds it answers
// whether 100k concurrent sockets squeeze the host's global TCP buffer pool
// (windows close server-side, writers buffer and drain in waves) during the
// target era.
func readSockstatTCP() (map[string]int64, error) {
	f, err := os.Open("/proc/net/sockstat")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := map[string]int64{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "TCP:") {
			continue
		}
		for _, field := range strings.Fields(strings.TrimPrefix(line, "TCP:")) {
			kv := strings.SplitN(field, " ", 2)
			if len(kv) != 2 {
				continue
			}
			v, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				continue
			}
			out["tcp_"+kv[0]] = v
		}
	}
	return out, sc.Err()
}
