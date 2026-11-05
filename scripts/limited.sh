#!/usr/bin/env bash
# Runs a command with a wall-clock limit and a memory ceiling for its whole process tree.
#
#   scripts/limited.sh <minutes> <command...>
#   LIMIT_MB=4096 scripts/limited.sh 5 pnpm test:unit
#
# macOS `ulimit -v` does not constrain V8/JVM processes, so a watchdog polls the
# summed RSS of the process group and kills it past LIMIT_MB (default 4096).
# Output is mirrored to .artifacts/limited-<timestamp>.log.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <minutes> <command...>" >&2
  exit 64
fi

minutes=$1
shift
limit_mb=${LIMIT_MB:-4096}
root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$root/.artifacts"
log="$root/.artifacts/limited-$(date +%Y%m%d-%H%M%S).log"

# Start the command in its own process group so the whole tree can be killed.
set -m
"$@" > >(tee -a "$log") 2>&1 &
pid=$!
set +m
pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')

deadline=$(( $(date +%s) + minutes * 60 ))
reason=""
while kill -0 "$pid" 2>/dev/null; do
  rss_kb=$(ps -A -o pgid=,rss= | awk -v g="$pgid" '$1 == g { s += $2 } END { print s + 0 }')
  if (( rss_kb / 1024 > limit_mb )); then
    reason="memory $(( rss_kb / 1024 )) MB > ${limit_mb} MB"
    break
  fi
  if (( $(date +%s) > deadline )); then
    reason="time limit ${minutes} min"
    break
  fi
  sleep 2
done

if [[ -n "$reason" ]]; then
  echo "limited.sh: killing process group $pgid ($reason)" | tee -a "$log" >&2
  kill -TERM -- "-$pgid" 2>/dev/null || true
  sleep 3
  kill -KILL -- "-$pgid" 2>/dev/null || true
  exit 137
fi

wait "$pid"
