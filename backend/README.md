# 跑团回顾后端

Cloudflare Worker：保管 Anthropic API 密钥，检查 App 密钥，限制每天用量，把这一场的全文和战役记录交给 Claude，生成回顾并更新记录。接口说明见 `docs/api.md`。

## 本地测试

```bash
cd backend
npm install
npm test
```

## 第一次部署（在 Mac Studio 上，只需做一次）

需要两个账号：Cloudflare（免费）和 Anthropic API（console.anthropic.com，先充 5 到 10 美元）。

1. **在 Anthropic 后台**：创建一个 API 密钥。再设一个每月花费上限（比如 20 美元），防止意外花超。
2. **登录 Cloudflare**：
   ```bash
   cd backend
   npx wrangler@4 login
   ```
3. **建用量计数器**，把输出里的 id 填进 `wrangler.toml` 的 `REPLACE_WITH_KV_NAMESPACE_ID`：
   ```bash
   npx wrangler@4 kv namespace create RATE
   ```
4. **放入 Anthropic 密钥**（命令会让你粘贴，密钥不会出现在任何文件里）：
   ```bash
   npx wrangler@4 secret put ANTHROPIC_API_KEY
   ```
5. **生成 App 密钥并放入后端**：
   ```bash
   openssl rand -hex 24
   npx wrangler@4 secret put APP_SHARED_KEY
   ```
   粘贴第一条命令生成的那串字符。同一串字符还要写进 `ios/App/Config/Secrets.xcconfig`（这个文件不进 Git）。
6. **部署**：
   ```bash
   npx wrangler@4 deploy
   ```
   记下输出的网址（`https://tabletop-recap-api.<你的子域>.workers.dev`），写进 `ios/App/Config/Secrets.xcconfig` 的 `BACKEND_URL`。
7. **检查**：
   ```bash
   curl https://tabletop-recap-api.<你的子域>.workers.dev/health
   ```
   返回 `{"ok":true}` 就成功了。

## 换 AI 模型

在 `wrangler.toml` 里改 `CLAUDE_MODEL`，然后重新运行 `npx wrangler@4 deploy`。

| 模型 | 每场 4 小时的团大约 | 说明 |
|---|---|---|
| `claude-opus-5-5` | 0.30 到 0.50 美元 | 质量最好，现在的默认值 |
| `claude-haiku-5-5` | 约 0.01 美元 | 便宜约 40 倍，质量需要用真实录音比较 |

## 用量上限

`wrangler.toml` 里有两个上限：每台设备每天 3 次，整个服务每天 100 次。整个服务的上限决定了最坏情况下每天花多少钱：用 Opus 约 50 美元一天，用 Haiku 约 1 美元一天。用户多起来以后再调高。
