# AGENTS.md — lo-client-sdk

本文件供 AI 编码助手(opencode 等)理解本项目规范。

## 项目是什么

`@lo/client` 是 **lo 知识库 API 的 HTTP 客户端 SDK**。它消费 `log serve` 提供的 REST/JSON 协议,
供桌面端/脚本等进程内消费者使用,与面向插件作者的 `lo-sdk`(WASM)互补。

## 技术栈与约束

- **纯 CommonJS**(`.cjs`),无 ES modules、无 TypeScript 源码(仅有 `types/index.d.ts` 声明)。
- **零运行时依赖**(`peerDependencies` 为空,`dependencies` 为空)。
- devDependencies: jest / eslint / prettier / husky / commitlint。
- Node >= 20。代码风格:双空格缩进、单引号、分号、100 列上限(由 .prettierrc / .eslintrc 约束)。

## 常用命令

```bash
npm test       # Jest(jest.config.cjs,覆盖率默认开启)
npm run lint   # ESLint: src/**/*.cjs 与 test/**/*.cjs
npm run format # Prettier 全部格式化
```

## 架构

```
src/
  index.cjs   # 统一出口,导出 LoClient / AuthClient / LoApiError / LoHttpError / SDK_VERSION
  client.cjs  # LoClient:request 管线(URL 拼接/query/错误转换/token 注入)+ 各资源命名空间
  http.cjs    # 底层请求:超时、重定向跟随、JSON 解析、LoApiError/LoHttpError
  auth.cjs    # 认证域:signWithSshKeygen + AuthClient(SSH 挑战-应答)
test/
  client.test.cjs  # URL/方法/query/headers/body 注入 transport 验证
  auth.test.cjs    # 认证流程(含自定义 signer 注入)
  http.test.cjs    # 真实本地 http server 验证请求管线
types/
  index.d.ts  # 类型声明(由 package.json types 字段指向)
```

## 关键约定

- 所有 API 方法返回 `res.body`(业务数据),不抛业务异常。
- 错误统一由 `http.cjs` 转成 `LoApiError`(带 status/code/body)或 `LoHttpError`(请求失败/超时/重定向超限)。
- `transport` 可在构造时注入,签名:`(ctx) => Promise<{status, body, headers}>`,用于测试无需真实网络。
- 认证通过 `client.auth.login()` 后,token 自动以 `Authorization: Bearer <token>` 附加;admin token(`setAdminToken`)优先。
- 不要加第三方依赖;需要新能力的 HTTP 特性直接在 `http.cjs` 里实现。

## 变更前必读

- `/api/auth/*` 端点避免携带认证 token:内部使用 `skipAuth` 选项,不走 `Authorization` 注入。
- 新增资源:在 `client.cjs` 建命名空间对象(参考 notes),补 `types/index.d.ts` 类型与 `test/client.test.cjs` 用例。
- 提交信息遵循 Conventional Commits(type 英文小写 + subject 中文),husky pre-commit 自动跑测试/commitlint。