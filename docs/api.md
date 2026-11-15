# 后端接口：讲道总结

后端是 `backend/` 里的 Cloudflare Worker。iOS 只调用这一个接口。

## 请求

`POST {backendURL}/v1/summarize`

请求头：

| 名称 | 值 |
|---|---|
| `Content-Type` | `application/json` |
| `X-App-Key` | 和后端密钥 `APP_SHARED_KEY` 相同的值。放在 `ios/App/Config/Secrets.xcconfig`，这个文件不进 Git。 |

请求体：

```json
{
  "transcript": "讲道全文，300 到 150000 个字符",
  "deviceId": "UIDevice.identifierForVendor 的 UUID 字符串",
  "title": "可选，用户自己填的标题",
  "date": "可选，YYYY-MM-DD"
}
```

## 成功：200

```json
{
  "summary": {
    "isSermon": true,
    "title": "Loved Before We Loved",
    "bigIdea": "God's love comes first, and our love is a response to it.",
    "outline": [
      { "point": "God so loved the world", "details": ["Love that gives", "Love for everyone"] }
    ],
    "scriptures": ["John 3:16-18", "Romans 8"],
    "applications": ["Thank God each morning this week."],
    "questions": ["Recall question", "Reflection question", "Action question"],
    "prayer": "Lord, help me receive your love and pass it on."
  },
  "model": "claude-opus-5-5"
}
```

后端保证：`outline` 有 1 到 6 项，每项最多 4 条 `details`；`questions` 最多 3 个；`applications` 最多 4 条；`scriptures` 最多 20 条，格式是 `Book Chapter:Verse`。

## 失败

返回 `{ "error": "代码" }`。App 根据代码显示提示，只有 200 才算用掉一次。

| 状态 | 代码 | App 怎么处理 |
|---|---|---|
| 400 | `invalid_json`、`invalid_device_id`、`transcript_too_short` | 录音太短或数据有误：提示用户，不重试 |
| 401 | `unauthorized` | App 的密钥不对：提示更新 App |
| 413 | `transcript_too_long` | 超过约两个半小时：提示用户 |
| 422 | `not_a_sermon` | 录音里没找到讲道：提示检查录音 |
| 422 | `refused` | AI 拒绝处理：提示用户，不重试 |
| 429 | `device_daily_limit`、`service_daily_limit` | 今天用量到上限：提示明天再试 |
| 500 | `server_not_configured`、`server_error` | 服务端问题：提示稍后再试 |
| 502 | `model_unavailable`、`bad_output`、`truncated` | 等 3 秒自动重试一次，再失败就显示重试按钮 |
| 503 | `busy_retry_later` | 同上 |

请求超时设为 120 秒，AI 处理一篇讲道通常需要几十秒。

## 其他

`GET /health` 返回 `{ "ok": true }`，用来检查服务是否在线。
