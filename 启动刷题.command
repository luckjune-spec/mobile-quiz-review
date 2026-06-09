#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "正在整理题库数据..."
npm run build:data

PORT=4173
APP_PATH="/quiz/"
LOCAL_URL="http://127.0.0.1:${PORT}${APP_PATH}"
PHONE_URL=""

OLD_PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$OLD_PIDS" ]]; then
  echo "检测到旧的刷题服务，正在关闭..."
  echo "$OLD_PIDS" | xargs kill
  sleep 1
fi

LAN_IP=""
for iface in en0 en1; do
  current_ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [[ -n "$current_ip" ]]; then
    LAN_IP="$current_ip"
    break
  fi
done

echo ""
echo "电脑打开：${LOCAL_URL}"
if [[ -n "$LAN_IP" ]]; then
  PHONE_URL="http://${LAN_IP}:${PORT}${APP_PATH}"
  echo "手机打开：${PHONE_URL}"
  echo "请确保手机和电脑在同一个 Wi-Fi 下。"
else
  echo "没有检测到局域网 IP，手机访问地址请按电脑当前网络情况确认。"
fi
echo ""

rm -rf "$WORKSPACE_DIR/quiz"
mkdir -p "$WORKSPACE_DIR/quiz"
rsync -a --delete "$SCRIPT_DIR/app/" "$WORKSPACE_DIR/quiz/"

python3 -m http.server "${PORT}" --directory "$WORKSPACE_DIR" > /tmp/quiz-review-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..50}; do
  if curl -sf "${LOCAL_URL}" > /dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

open "${LOCAL_URL}"

POPUP_MESSAGE="电脑打开：
${LOCAL_URL}"

if [[ -n "$PHONE_URL" ]]; then
  printf "%s" "$PHONE_URL" | pbcopy
  POPUP_MESSAGE="${POPUP_MESSAGE}

手机打开：
${PHONE_URL}

手机地址已经帮你复制好了。"
else
  POPUP_MESSAGE="${POPUP_MESSAGE}

没有检测到当前局域网地址，手机地址这次没有自动显示。"
fi

osascript <<APPLEDIALOG
display dialog "${POPUP_MESSAGE}" buttons {"知道了"} default button "知道了" with title "副高刷题网页已启动"
APPLEDIALOG

echo "服务已启动，关闭这个窗口后网页服务会一起停止。"
echo ""
wait "$SERVER_PID"
