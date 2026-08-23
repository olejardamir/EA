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
