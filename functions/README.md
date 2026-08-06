# 奈斯教育 Firebase 后端

该 Firebase Functions 后端提供：

- `POST /api/chat`：DeepSeek V4 Flash 非思考模式流式客服。
- `POST /api/leads`：接收官网表单和聊天预约，写入 Firestore。
- `GET /api/admin`：受账号密码保护的线索后台。
- `retryLeadEmails`：Resend 通知失败后，每 5 分钟重试，最多 5 次。

客户资料不能由浏览器直接读写；`firestore.rules` 默认拒绝全部客户端访问，只有 Firebase Admin SDK 可以访问。

## Firebase 控制台准备

1. 创建或选择一个 Firebase 项目。
2. 将项目升级至 Blaze 方案。Cloud Functions 需要 Blaze，但低流量仍可使用其免费用量额度。
3. 在 Build → Firestore Database 中创建数据库。建议位置选择离主要客户较近且符合公司数据要求的区域；Functions 当前部署在 `asia-east1`。
4. 建议在 Google Cloud Billing 中设置较低的预算提醒。

## 本地关联项目

安装依赖后登录 Firebase CLI：

```bash
cd functions
npm install
npx firebase login
cd ..
npx firebase use --add
```

选择刚才的 Firebase 项目并设为 `default`。CLI 会生成不会提交到 Git 的 `.firebaserc`。

把项目 ID 写入 `index.html` 中的：

```js
const NICE_FIREBASE_PROJECT_ID = window.NICE_FIREBASE_PROJECT_ID || '你的项目ID';
```

## 安全配置 Secret

不要把密钥写入 `.env`、`index.html` 或 Git。分别执行以下命令，然后在终端提示出现时粘贴对应值：

```bash
npx firebase functions:secrets:set DEEPSEEK_API_KEY
npx firebase functions:secrets:set RESEND_API_KEY
npx firebase functions:secrets:set ADMIN_PASSWORD
```

`ADMIN_PASSWORD` 请使用新的长随机密码。后台账号固定为 `niceadmin`。

在 Resend 中验证 `notify.niceeducationglobal.com` 发件子域名，并按页面说明配置 DNS。验证完成后，线索邮件会发送到：

```text
wangbing3526@163.com
```

## 部署

在项目根目录执行：

```bash
npx firebase deploy --only functions,firestore
```

部署后地址：

```text
API：https://asia-east1-项目ID.cloudfunctions.net/api
健康检查：https://asia-east1-项目ID.cloudfunctions.net/api/health
线索后台：https://asia-east1-项目ID.cloudfunctions.net/api/admin
后台账号：niceadmin
```

## 本地模拟器

首次本地运行前创建 `.firebaserc` 并关联项目，然后执行：

```bash
cd functions
npm run serve
```

另开终端运行网站：

```bash
python3 -m http.server 8080
```

本地前端会访问：

```text
http://127.0.0.1:5001/项目ID/asia-east1/api
```

## 上线检查

1. 健康检查返回 `{"ok":true,...}`。
2. 官网底部表单提交测试信息，Firestore 的 `leads` 集合出现记录。
3. `wangbing3526@163.com` 收到 Resend 通知。
4. 登录 `/api/admin`，可以查看线索和更新跟进状态。
5. 聊天窗口能够逐字显示 DeepSeek 回复。

密钥已经出现在聊天记录中，完成部署后建议到 DeepSeek 和 Resend 控制台各生成一把新密钥，并销毁旧密钥。
