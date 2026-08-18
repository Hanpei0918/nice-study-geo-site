#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 sudo bash deploy/bootstrap.sh 执行。" >&2
  exit 1
fi

APP_DIR=/opt/nice-education
WEB_DIR=/var/www/nice-education
REPOSITORY=https://github.com/Hanpei0918/nice-study-geo-site.git
BRANCH=aliyun-deployment

apt-get update
apt-get install -y ca-certificates curl git nginx rsync build-essential python3-certbot-nginx

# Ubuntu 24.04 自带的 Node 版本可能偏旧；官网 API 使用 Node 22 LTS。
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [[ "${SKIP_GIT_SYNC:-0}" != "1" ]]; then
  if [[ -d "${APP_DIR}/.git" ]]; then
    git -C "${APP_DIR}" fetch origin "${BRANCH}"
    git -C "${APP_DIR}" checkout -B "${BRANCH}" "origin/${BRANCH}"
  else
    git clone --branch "${BRANCH}" --single-branch "${REPOSITORY}" "${APP_DIR}"
  fi
elif [[ ! -f "${APP_DIR}/server/package.json" ]]; then
  echo "本地部署包不完整：缺少 ${APP_DIR}/server/package.json" >&2
  exit 1
fi

cd "${APP_DIR}/server"
npm ci --omit=dev

install -d -o www-data -g www-data -m 0750 /var/lib/nice-education
install -d -o root -g root -m 0755 "${WEB_DIR}"
rsync -a --delete \
  --exclude '.git' --exclude 'server' --exclude 'functions' --exclude 'deploy' \
  --exclude 'node_modules' --exclude '.env' --exclude '.env.*' \
  "${APP_DIR}/" "${WEB_DIR}/"
chown -R root:root "${WEB_DIR}"

install -d -o root -g root -m 0750 /etc/nice-education
if [[ ! -f /etc/nice-education/api.env ]]; then
  install -m 0600 "${APP_DIR}/server/.env.example" /etc/nice-education/api.env
  echo
  echo "下一步：编辑 /etc/nice-education/api.env，填入 DeepSeek、Resend 和后台密码后重启服务。"
fi

install -m 0644 "${APP_DIR}/deploy/nice-education-api.service" /etc/systemd/system/nice-education-api.service
install -m 0644 "${APP_DIR}/deploy/niceeducationcn.com.nginx.conf" /etc/nginx/sites-available/niceeducationcn.com
ln -sfn /etc/nginx/sites-available/niceeducationcn.com /etc/nginx/sites-enabled/niceeducationcn.com
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
nginx -t
systemctl enable nginx
systemctl restart nginx

echo
echo "基础部署完成。HTTP 就绪后再配置 DNS 和 HTTPS。"
echo "API 密钥填好后运行：sudo systemctl enable --now nice-education-api"
