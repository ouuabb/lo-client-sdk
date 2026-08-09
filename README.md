# @lo/client — lo 知识库 API 客户端 SDK

> 面向 `log serve` HTTP 协议的类型化客户端。纯 CommonJS、零运行时依赖。

## 特性

- 完整覆盖 `log serve` 公开 API：health / notes / search / schemas / views / workflows / automations / evolution / sync / admin
- 内置 SSH 挑战-应答认证：`challenge()` → 签名 → `login()` 拿 token
- 统一错误类型：`LoApiError`(业务错误,带 status/code)、`LoHttpError`(网络/超时)
- 自动重定向跟随、超时控制、JSON 序列化
- 可选注入自定义 `transport` 便于测试与代理
- 附带 TypeScript 类型声明(`types/index.d.ts`)

## 安装

```bash
npm install @lo/client
```

## 快速开始

```js
const { LoClient } = require('@lo/client');

const client = new LoClient({ host: '127.0.0.1', port: 8765 });

// 方式一:SSH 私钥挑战-应答登录
await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });

// 业务调用
await client.notes.create({ title: '笔记', content: '正文', tags: ['技术'] });
const list = await client.notes.list({ query: 'lo', limit: 20 });
await client.search.search('知识库');

// 管理端(需要 admin token)
client.setAdminToken(process.env.LO_ADMIN_TOKEN);
const stats = await client.admin.stats();
```

## 认证

两种登录方式:

```js
// 1) SSH 私钥(需本机有 ssh-keygen,服务端注册过该公钥指纹)
await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });

// 2) 手动签名 + 指纹
await client.auth.challenge();           // 先拿 nonce
await client.login({ nonce, signature, fingerprint });
```

登录后 `client.auth.token` 将自动附加到后续请求的 `Authorization` 头;`client.auth.logout()` 清除。

## 配置项

| 选项 | 默认 | 说明 |
|---|---|---|
| `host` | `127.0.0.1` | 服务地址 |
| `port` | `8765` | 服务端口 |
| `protocol` | `http` | `http`/`https` |
| `timeout` | `15000` | 单请求超时 ms |
| `signer` | `signWithSshKeygen` | 自定义签名函数 |
| `transport` | node http(s) | 自定义传输层,用于测试/代理 |

## API 一览

```
LOClient
├── health   : ping / stats / tags
├── notes    : list / get / create / update / remove
├── search   : search
├── schemas  : list / get / create / update / remove / attach / detach
├── views    : list / get / create / update / remove / run / export / importDef
├── workflows: list / get / create / update / remove / versions / attach / detach / resume / transition / can / instances / instance / history
├── automations: list / get / create / update / remove / enable / disable / run / history
├── evolution: status / observe / health / detect / plan / execute / history / rollback
├── sync     : sync / push / pull
└── admin    : stats / resources / link / tags / graph / containers / relations / audit / import / commit / suggestions / types / categories / tags
```

## 错误处理

```js
const { LoApiError, LoHttpError } = require('@lo/client');

try {
  await client.notes.get('nonexistent');
} catch (e) {
  if (e instanceof LoApiError) {
    // 业务错误: e.status(404) / e.body / e.code
  } else if (e instanceof LoHttpError) {
    // 网络错误: 请求失败/超时/重定向超限
  }
}
```

## 开发

```bash
npm install
npm test       # Jest + 覆盖率
npm run lint   # ESLint
npm run format # Prettier
```

## 与 lo-plugins-sdk 的关系

- **@lo/client**:面向服务端 API 消费者(桌面端/脚本),直接调用 HTTP 协议。
- **lo-plugins-sdk**:面向插件作者,编译为 WASM 插件,跨平台(移动/桌面)。

两者互补,不重复;SDK 类型声明允许现有 API 被两个世界共享。

## License

MIT