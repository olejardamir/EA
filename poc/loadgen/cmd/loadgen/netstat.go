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
		fields := strings.Fields(strings.TrimPrefix(line, "TCP:"))
		// sockstat lines alternate token pairs: inuse 23 orphan 0 tw 31 ...
		for i := 0; i+1 < len(fields); i += 2 {
			v, err := strconv.ParseInt(fields[i+1], 10, 64)
			if err != nil {
				continue
			}
			out["tcp_"+fields[i]] = v
		}
	}
	return out, sc.Err()
}

// readLocalTcpQueues sums rx/tx socket queues in the LOCAL netns (the loadgen
// container) from /proc/net/tcp[6]. During the target-era stall, large
// rx_queue sums = SSE frames delivered by the DUT but unread by client
// readers — proving the bottleneck is downstream consumption, not DUT egress.
func readLocalTcpQueues() (sockets int64, rxB, txB, rxN, txN int64, err error) {
	for _, tbl := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		f, e := os.Open(tbl)
		if e != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		first := true
		for sc.Scan() {
			if first {
				first = false
				continue
			}
			fields := strings.Fields(sc.Text())
			if len(fields) < 5 {
				continue
			}
			q := strings.Split(fields[4], ":")
			if len(q) != 2 {
				continue
			}
			tx, _ := strconv.ParseInt(q[0], 16, 64)
			rx, _ := strconv.ParseInt(q[1], 16, 64)
			sockets++
			txB += tx
			rxB += rx
			if tx > 0 {
				txN++
			}
			if rx > 0 {
				rxN++
			}
		}
		f.Close()
	}
	return sockets, rxB, txB, rxN, txN, nil
}
