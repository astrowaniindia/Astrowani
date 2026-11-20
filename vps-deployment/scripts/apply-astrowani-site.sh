#!/usr/bin/env bash
# Install the astrowani.com website on the VPS, or retire the /test-site/ preview.
# Run as root by .github/workflows/apply-astrowani-site.yml, never by hand-copying.
#
#   bash apply-astrowani-site.sh install           <dir with the uploaded files>
#   bash apply-astrowani-site.sh retire-test-site
#
# install — writes the Cloudflare Origin Certificate (if the workflow uploaded
#   one), installs nginx/astrowani-site.conf and nginx/wordpress-redirects.conf,
#   runs `nginx -t`, and RESTORES the previous state if the test fails. Safe to
#   run BEFORE the DNS moves: until the @/www records point here, no request for
#   astrowani.com ever reaches this server, so nothing a visitor sees changes.
#   Re-runnable: it replaces its own two files and nothing else.
#
# retire-test-site — adds ONE line to the shop's live server block so
#   shop.astrowani.com/test-site/<anything> 301s to astrowani.com/<anything>.
#   Run it only AFTER astrowani.com is serving the site, or every preview link
#   redirects to WordPress. The shop's nginx file is hand-maintained (Certbot
#   edited it in place), so this inserts a line rather than copying a file over
#   it — the same rule as apply-blog-locations.sh. Idempotent.
set -euo pipefail

MODE="${1:-}"
TS="$(date +%Y%m%d%H%M%S)"

reload_or_restore() {
  # $@ = pairs of "<live file>|<backup or NONE>"
  if nginx -t; then
    systemctl reload nginx
    echo "nginx reloaded"
    return 0
  fi
  echo "nginx -t FAILED - restoring the previous files"
  for pair in "$@"; do
    live="${pair%%|*}"; bak="${pair#*|}"
    if [ "$bak" = "NONE" ]; then rm -f "$live"; else cp "$bak" "$live"; fi
  done
  nginx -t && systemctl reload nginx || true
  exit 1
}

case "$MODE" in
  install)
    SRC="${2:?usage: install <dir>}"
    CERT_DIR=/etc/ssl/astrowani
    SITE_AV=/etc/nginx/sites-available/astrowani-site
    SITE_EN=/etc/nginx/sites-enabled/astrowani-site
    MAP=/etc/nginx/conf.d/astrowani-wordpress-redirects.conf

    # ── Certificate ──────────────────────────────────────────────────────────
    if [ -s "$SRC/origin.pem" ] && [ -s "$SRC/origin.key" ]; then
      install -d -m 700 "$CERT_DIR"
      install -m 644 "$SRC/origin.pem" "$CERT_DIR/origin.pem"
      install -m 600 "$SRC/origin.key" "$CERT_DIR/origin.key"
      echo "certificate written"
    fi
    [ -s "$CERT_DIR/origin.pem" ] && [ -s "$CERT_DIR/origin.key" ] || {
      echo "ERROR: no certificate at $CERT_DIR. Set the ASTROWANI_ORIGIN_CERT and"
      echo "ASTROWANI_ORIGIN_KEY GitHub secrets (Cloudflare -> SSL/TLS -> Origin Server)."
      exit 1
    }
    # A key that does not belong to the certificate makes nginx -t fail with an
    # unhelpful message; say it plainly instead.
    cert_pub="$(openssl x509 -in "$CERT_DIR/origin.pem" -noout -pubkey | sha256sum)"
    key_pub="$(openssl pkey -in "$CERT_DIR/origin.key" -pubout | sha256sum)"
    [ "$cert_pub" = "$key_pub" ] || { echo "ERROR: origin.key does not match origin.pem"; exit 1; }
    openssl x509 -in "$CERT_DIR/origin.pem" -noout -subject -enddate -ext subjectAltName || true

    # ── The site's files must already be there (the workflow rsyncs them first).
    [ -f /var/www/astrowani/site/index.html ] || { echo "ERROR: /var/www/astrowani/site is empty"; exit 1; }

    # ── nginx ────────────────────────────────────────────────────────────────
    bak_site=NONE; bak_map=NONE
    [ -f "$SITE_AV" ] && { bak_site="$SITE_AV.bak-$TS"; cp "$SITE_AV" "$bak_site"; }
    [ -f "$MAP" ] && { bak_map="$MAP.bak-$TS"; cp "$MAP" "$bak_map"; }
    had_link=yes; [ -e "$SITE_EN" ] || had_link=no

    cp "$SRC/astrowani-site.conf" "$SITE_AV"
    cp "$SRC/wordpress-redirects.conf" "$MAP"
    ln -sf "$SITE_AV" "$SITE_EN"

    if [ "$had_link" = no ]; then
      reload_or_restore "$SITE_AV|$bak_site" "$MAP|$bak_map" "$SITE_EN|NONE"
    else
      reload_or_restore "$SITE_AV|$bak_site" "$MAP|$bak_map"
    fi
    echo "astrowani.com installed. It serves nothing to visitors until the DNS points here."
    ;;

  retire-test-site)
    SHOP=/etc/nginx/sites-available/astrowani-shop
    MARK='# astrowani-website moved to astrowani.com'
    if grep -qF "$MARK" "$SHOP"; then echo "already retired - nothing to do"; exit 0; fi
    ANCHOR='include snippets/astrowani-cloudflare-only.conf;'
    [ "$(grep -cF "$ANCHOR" "$SHOP")" -ge 1 ] || { echo "ERROR: anchor line not found in $SHOP"; exit 1; }
    cp "$SHOP" "$SHOP.bak-$TS"
    # A server-level `if` runs before any location is chosen, so it catches every
    # /test-site/ path, including the exact and regex blog locations. $request_uri
    # keeps the query string, so blog-post.html?slug=x lands on the same article.
    # Inserted after the FIRST anchor only: that is the shop's main server block.
    LINE='    if ($request_uri ~ "^/test-site(?:/(.*))?$") { return 301 https://astrowani.com/$1; }   '"$MARK"
    awk -v line="$LINE" -v anchor="$ANCHOR" '
      { print }
      !done && index($0, anchor) { print line; done = 1 }
    ' "$SHOP.bak-$TS" > "$SHOP"
    reload_or_restore "$SHOP|$SHOP.bak-$TS"
    echo "shop.astrowani.com/test-site/ now 301s to astrowani.com"
    ;;

  *)
    echo "usage: $0 install <dir> | retire-test-site"; exit 2 ;;
esac
