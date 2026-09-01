#!/usr/bin/env bash
#
# تازه‌سازی فهرست بازه‌های کلادفلر برای nginx.
#
# کلادفلر گاهی بازه تازه اضافه می‌کند. اگر فهرست کهنه بماند، ترافیکی که از
# بازه تازه می‌آید دیگر real_ip نمی‌گیرد و برنامه نشانی لبه کلادفلر را به‌جای
# نشانی کاربر می‌بیند — همان چیزی که محدودکننده نرخ را خراب می‌کند.
#
# اجرای دستی:
#   sudo bash /opt/ethiclens/deploy/update-cloudflare-ips.sh
#
# اجرای ماهانه با cron:
#   sudo crontab -e
#   17 4 1 * * bash /opt/ethiclens/deploy/update-cloudflare-ips.sh >> /var/log/cf-ips.log 2>&1

set -euo pipefail

OUT=/etc/nginx/cloudflare-realip.conf
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "[cf] گرفتن بازه‌ها از کلادفلر…"

V4="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)"
V6="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"

# اگر پاسخ خالی یا بی‌ربط بود، فایل موجود را دست‌نخورده بگذار.
# نوشتن یک فایل خالی، real_ip را کاملاً از کار می‌اندازد.
if [ -z "$V4" ] || [ -z "$V6" ]; then
  echo "[cf] خطا: پاسخ خالی بود. فایل فعلی تغییر نکرد." >&2
  exit 1
fi

{
  echo "# این فایل را ویرایش نکنید — با deploy/update-cloudflare-ips.sh ساخته می‌شود."
  echo "# ساخته‌شده در: $(date -Is)"
  echo
  echo "# ---- IPv4 ----"
  echo "$V4" | while read -r cidr; do
    [ -n "$cidr" ] && echo "set_real_ip_from $cidr;"
  done
  echo
  echo "# ---- IPv6 ----"
  echo "$V6" | while read -r cidr; do
    [ -n "$cidr" ] && echo "set_real_ip_from $cidr;"
  done
  echo
  echo "real_ip_header    CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} > "$TMP"

COUNT="$(grep -c set_real_ip_from "$TMP")"
if [ "$COUNT" -lt 10 ]; then
  echo "[cf] خطا: فقط $COUNT بازه پیدا شد — کمتر از حد انتظار. لغو شد." >&2
  exit 1
fi

install -m 0644 "$TMP" "$OUT"
echo "[cf] $COUNT بازه در $OUT نوشته شد."

# پیش از reload آزمایش کن، وگرنه یک فایل خراب nginx را می‌خواباند.
if nginx -t; then
  systemctl reload nginx
  echo "[cf] nginx بازخوانی شد."
else
  echo "[cf] پیکربندی nginx ایراد دارد — بازخوانی انجام نشد." >&2
  exit 1
fi
