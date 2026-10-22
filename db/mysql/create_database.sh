#!/usr/bin/env bash
# Creates the Uniqo MySQL database (Linux / macOS / WSL).
#   ./create_database.sh                       # local MySQL as root
#   ./create_database.sh --import-data         # also copy the website's current data
#   MYSQL_HOST=db.example.com MYSQL_USER=admin ./create_database.sh --import-data
# Needs the MySQL 8.0.19+ client and Python 3.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOST="${MYSQL_HOST:-127.0.0.1}"; PORT="${MYSQL_PORT:-3306}"; USER="${MYSQL_USER:-root}"
APP_USER="${UNIQO_APP_USER:-uniqo_app}"; APP_HOST="${UNIQO_APP_HOST:-%}"
IMPORT=0; [[ "${1:-}" == "--import-data" ]] && IMPORT=1
PY="$(command -v python3 || command -v python)"
command -v mysql >/dev/null || { echo "mysql client not found"; exit 1; }

read -rsp "MySQL password for '$USER'@$HOST: " ROOT_PW; echo
read -rsp "Password for app user '$APP_USER' (blank = generate): " APP_PW; echo
GENERATED=0
if [[ -z "$APP_PW" ]]; then APP_PW="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"; GENERATED=1; fi

TMP="$(mktemp -d)"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
esc() { printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g"; }
cat >"$TMP/client.cnf" <<EOF
[client]
host=$HOST
port=$PORT
user=$USER
password="$(printf "%s" "$ROOT_PW" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
default-character-set=utf8mb4
EOF
chmod 600 "$TMP/client.cnf"
run() { echo "  -> $2"; mysql --defaults-extra-file="$TMP/client.cnf" --show-warnings <"$1"; }

echo; echo "UNIQO - creating MySQL database on $HOST:$PORT"
run "$HERE/01_schema.sql"         "01 schema (tables, keys, constraints)"
run "$HERE/02_views_routines.sql" "02 views, functions, stored procedures"
"$PY" "$HERE/uniqo_mysql.py" seed >/dev/null
run "$HERE/03_seed_config.sql"    "03 site configuration + Design Lobby catalogue"

cat >"$TMP/04_app_user.sql" <<EOF
CREATE USER IF NOT EXISTS '$APP_USER'@'$APP_HOST' IDENTIFIED BY '$(esc "$APP_PW")';
ALTER USER '$APP_USER'@'$APP_HOST' IDENTIFIED BY '$(esc "$APP_PW")';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON uniqo.* TO '$APP_USER'@'$APP_HOST';
FLUSH PRIVILEGES;
EOF
run "$TMP/04_app_user.sql" "04 least-privilege app user '$APP_USER'"

if [[ $IMPORT -eq 1 ]]; then
  "$PY" "$HERE/uniqo_mysql.py" export
  run "$HERE/05_data.sql" "05 website data (designs, orders, feedback, looks, admin login)"
else
  "$PY" "$HERE/uniqo_mysql.py" admin-sql --user admin >"$TMP/admin.sql"
  run "$TMP/admin.sql" "admin login for the panel"
fi

mysql --defaults-extra-file="$TMP/client.cnf" -t -e "USE uniqo; SELECT (SELECT COUNT(*) FROM designs) designs, (SELECT COUNT(*) FROM orders) orders, (SELECT COUNT(*) FROM lobby_fabrics) fabrics, (SELECT COUNT(*) FROM locations) cities, (SELECT COUNT(*) FROM admin_users) admins;"
echo "Done. Database 'uniqo' is ready."
[[ $GENERATED -eq 1 ]] && echo "App user password (store it safely, shown once): $APP_PW"
