#!/usr/bin/env bash
# EM Lumen - kiosk launcher for Linux / Raspberry Pi (Chromium).
# Add to the desktop session autostart, e.g. ~/.config/autostart/emtv.desktop:
#   [Desktop Entry]
#   Type=Application
#   Exec=/home/kiosk/EM-Lumen/kiosk/linux-kiosk.sh
PLAYER_URL="${PLAYER_URL:-https://lumen.example.com/player/PUT-SCREEN-KEY-HERE}"
PROFILE="$HOME/.config/emtv-kiosk"
BROWSER="$(command -v chromium-browser || command -v chromium || command -v google-chrome)"
[ -z "$BROWSER" ] && { echo "Chromium not found"; exit 1; }

xset s off 2>/dev/null; xset -dpms 2>/dev/null; xset s noblank 2>/dev/null
command -v unclutter >/dev/null && unclutter -idle 0.5 -root &

while true; do
  # Clear "restore pages" state after a crash
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PROFILE/Default/Preferences" 2>/dev/null
  "$BROWSER" --kiosk "$PLAYER_URL" --user-data-dir="$PROFILE" --no-first-run --noerrdialogs \
    --disable-session-crashed-bubble --disable-infobars --autoplay-policy=no-user-gesture-required \
    --disable-features=Translate,TranslateUI --overscroll-history-navigation=0 \
    --disable-background-timer-throttling --disable-renderer-backgrounding --check-for-update-interval=31536000
  sleep 5
done
