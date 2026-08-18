# 阿里云部署文件

生产环境由 Nginx 托管网站静态文件，并把 `/api/` 转发给本地 Node 服务。

首次部署可在 Ubuntu 24.04 的 Workbench 中执行：

```bash
git clone --branch aliyun-deployment --single-branch https://github.com/Hanpei0918/nice-study-geo-site.git /tmp/nice-education
sudo bash /tmp/nice-education/deploy/bootstrap.sh
```

关键目录：

- `/var/www/nice-education`：网页和图片。
- `/opt/nice-education/server`：Node API 服务。
- `/var/lib/nice-education/leads.db`：咨询线索 SQLite 数据库。
- `/etc/nice-education/api.env`：DeepSeek、Resend 和后台密码，权限必须为 `600`。

部署完成后：

- 健康检查：`https://niceeducationcn.com/api/health`
- 线索后台：`https://niceeducationcn.com/api/admin`
