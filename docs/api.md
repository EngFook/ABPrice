# 后端接口：跑团回顾

后端是 `backend/` 里的 Cloudflare Worker。iOS 只调用这一个接口。

## 请求

`POST {backendURL}/v1/recap`

| 请求头 | 值 |
|---|---|
| `Content-Type` | `application/json` |
| `X-App-Key` | 与后端密钥 `APP_SHARED_KEY` 相同的值。放在 `ios/App/Config/Secrets.xcconfig`，这个文件不进 Git。 |

```json
{
  "transcript": "这一场的全文，300 到 600000 个字符",
  "deviceId": "UIDevice.identifierForVendor 的 UUID 字符串",
  "campaignName": "可选，战役名",
  "party": ["可选，角色名，最多 12 个"],
  "previousLog": { "npcs": [], "locations": [], "quests": [], "loot": [] },
  "date": "可选，YYYY-MM-DD"
}
```

`previousLog` 是这个战役当前的记录（上一场返回的那四个列表，加上用户手动改过的内容）。第一场不传。整个对象不能超过 10 万个字符。

## 成功：200

```json
{
  "recap": {
    "isSession": true,
    "title": "Smoke Over Brindle Ford",
    "recap": "Last time, our heroes reached Brindle Ford...",
    "keyMoments": ["Arrived at Brindle Ford", "Rescued Old Marta"],
    "npcs": [{ "name": "Old Marta", "description": "Tavern keeper.", "status": "ally" }],
    "locations": [{ "name": "Brindle Ford", "description": "A river village." }],
    "quests": [{ "name": "Who burned the mill?", "status": "new", "note": "A black feather was left behind." }],
    "loot": [{ "item": "Black feather token", "holder": "Kael" }],
    "openThreads": ["Who leaves black feathers?"]
  },
  "model": "claude-opus-5-5"
}
```

- `npcs`、`locations`、`quests`、`loot` 是这一场结束后的**完整**战役记录，App 直接用它替换原来的记录。
- `quests[].status` 只会是 `new`、`ongoing`、`completed`、`failed` 之一。
- `keyMoments` 最多 10 条，`openThreads` 最多 5 条。

## 失败

返回 `{ "error": "代码" }`。App 根据代码显示提示，只有 200 才算用掉一次。

| 状态 | 代码 | App 怎么处理 |
|---|---|---|
| 400 | `invalid_json`、`invalid_device_id`、`transcript_too_short`、`invalid_previous_log` | 提示用户，不重试 |
| 401 | `unauthorized` | App 的密钥不对：提示更新 App |
| 413 | `transcript_too_long`、`previous_log_too_long` | 提示录音太长或记录太多 |
| 422 | `not_a_session` | 录音里没找到跑团内容：提示检查录音 |
| 422 | `refused` | AI 拒绝处理：提示用户，不重试 |
| 429 | `device_daily_limit`、`service_daily_limit` | 今天的用量到上限了：提示明天再试 |
| 500 | `server_not_configured`、`server_error` | 提示稍后再试 |
| 502 | `model_unavailable`、`bad_output`、`truncated` | 等 3 秒自动重试一次，还是失败就显示重试按钮 |
| 503 | `busy_retry_later` | 同 502 |

请求超时设为 180 秒。长的一场，AI 可能要处理一两分钟。

`GET /health` 返回 `{ "ok": true }`。
