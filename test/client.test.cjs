const { LoClient, LoApiError, LoHttpError } = require('../src/index.cjs');
const http = require('../src/http.cjs');
const httpServer = require('http');

/** 构造注入 mock transport 的 client */
function makeClient(handler, opts = {}) {
  const calls = [];
  const client = new LoClient({
    host: '127.0.0.1',
    port: 8765,
    transport: ({ method, url, requestOpts }) => {
      calls.push({ method, url, requestOpts });
      return handler(method, url, requestOpts);
    },
    ...opts,
  });
  return { client, calls };
}

/** 预置认证 token(绕过 SSH) */
function fakeAuthed(client) {
  client.auth._token = 'tok_123';
  client.auth._fingerprint = 'SHA256:abc';
}

describe('http.cjs buildQuery', () => {
  it('拼接查询参数', () => {
    expect(http.buildQuery({ a: 1, b: 'x y' })).toBe('?a=1&b=x%20y');
  });
  it('跳过 undefined/null', () => {
    expect(http.buildQuery({ a: undefined, b: null, c: 1 })).toBe('?c=1');
  });
  it('空参数返回空串', () => {
    expect(http.buildQuery({})).toBe('');
    expect(http.buildQuery()).toBe('');
  });
  it('数组参数展开为多个', () => {
    expect(http.buildQuery({ tag: ['a', 'b'] })).toBe('?tag=a&tag=b');
  });
});

describe('LoClient 基础', () => {
  it('baseUrl 默认 127.0.0.1:8765', () => {
    const { client } = makeClient({});
    expect(client.baseUrl).toBe('http://127.0.0.1:8765');
  });

  it('支持自定义 protocol/端口', () => {
    const c = new LoClient({
      protocol: 'https',
      host: '127.0.0.1',
      port: 9999,
      transport: () => Promise.resolve({ status: 200, body: {}, headers: {} }),
    });
    expect(c.baseUrl).toBe('https://127.0.0.1:9999');
  });

  it('GET 携带 token', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { ok: 1 }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.health.ping();
    expect(res.ok).toBe(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/health');
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer tok_123');
  });

  it('GET 带 query 并 encode', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.search.search('hello world');
    expect(calls[0].url).toContain('/api/search?q=hello%20world');
  });

  it('POST json body', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.create({ title: 'hi' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/notes');
    expect(calls[0].requestOpts.body).toEqual({ title: 'hi' });
  });

  it('PUT 与 DELETE', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.update('res_a', { content: 'v2' });
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('/api/notes/res_a');
    await client.notes.remove('res_a', { hard: true });
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].url).toContain('?hard=true');
  });

  it('未认证时不带 token,不抛错', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    await client.health.ping();
    expect(calls[0].requestOpts.headers.Authorization).toBeUndefined();
  });

  it('default transport 走真实 http(不注入 transport)', async () => {
    const server = httpServer.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ alive: true }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const client = new LoClient({
        host: '127.0.0.1',
        port,
        protocol: 'http',
      });
      const res = await client.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ alive: true });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('validateStatus:false 不抛错直接返回原始响应', async () => {
    const { client, calls } = makeClient(
      () => Promise.resolve({ status: 500, body: { error: 'boom' }, headers: {} }),
      { validateStatus: false },
    );
    const res = await client.get('/api/x');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
    expect(calls).toHaveLength(1);
  });

  it('setAdminToken 后 admin 请求带 Admin header', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    client.setAdminToken('adm_2');
    await client.admin.stats();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer adm_2');
  });

  it('内部 _token 兜底注入(未认证时)', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    client._token = 'legacy_tok';
    await client.notes.list();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer legacy_tok');
  });

  it('login/logout 委托给 auth', async () => {
    const { client } = makeClient((method, url) =>
      Promise.resolve({
        status: 200,
        body: url.includes('/api/auth/login') ? { token: 'tok_l', fingerprint: 'f' } : {},
        headers: {},
      }),
    );
    // login 需要 signature/nonce 提供则直接走 request,否则 challenge
    // 这里直接验证委托:签名+指纹模式
    await client.login({ nonce: 'n', signature: 's', fingerprint: 'f' });
    expect(client.auth.authenticated).toBe(true);
    client.logout();
    expect(client.auth.authenticated).toBe(false);
  });
});

describe('错误处理', () => {
  it('业务错误抛 LoApiError 并带 status', async () => {
    const { client } = makeClient(() =>
      Promise.resolve({
        status: 409,
        body: { error: 'already exists' },
        headers: {},
      }),
    );
    await expect(client.notes.create({})).rejects.toThrow(LoApiError);
    try {
      await client.notes.create({});
    } catch (e) {
      expect(e.status).toBe(409);
      expect(e.message).toContain('already exists');
    }
  });

  it('传输错误抛 LoHttpError', async () => {
    const handler = () => Promise.reject(new LoHttpError('连接失败', { code: 'ECONNREFUSED' }));
    const client = new LoClient({ transport: handler });
    await expect(client.health.ping()).rejects.toThrow(LoHttpError);
  });

  it('http 层 request/get/post/put/del 均可调用', () => {
    expect(typeof http.request).toBe('function');
    expect(typeof http.get).toBe('function');
    expect(typeof http.post).toBe('function');
    expect(typeof http.put).toBe('function');
    expect(typeof http.del).toBe('function');
  });
});

describe('端点覆盖', () => {
  it('notes list/get/create/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.list({ limit: 5 });
    await client.notes.get('res_1');
    await client.notes.create({ content: 'x' });
    await client.notes.update('res_1', { title: 't' });
    await client.notes.remove('res_1');
    expect(calls).toHaveLength(5);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'POST', 'PUT', 'DELETE']);
  });

  it('search.schemas.views', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.search.search('q');
    await client.schemas.list();
    await client.schemas.attach('sch_1', 'res_1');
    await client.schemas.detach('sch_1', 'res_1');
    await client.views.create({ id: 'v1' });
    await client.views.run('v1');
    await client.views.export('v1');
    await client.views.importDef({ id: 'v2' });
    expect(calls).toHaveLength(8);
  });

  it('workflows/automations/evolution/sync', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.workflows.list();
    await client.workflows.transition('wf1', {
      resourceRid: 'r',
      targetState: 'done',
    });
    await client.workflows.instances({ wf: 'wf1' });
    await client.automations.list();
    await client.automations.run('auto_1', {});
    await client.evolution.status();
    await client.evolution.observe();
    await client.evolution.execute();
    await client.sync.sync();
    await client.sync.push({ remote: 'origin' });
    await client.sync.pull({ remote: 'origin' });
    expect(calls.length).toBeGreaterThanOrEqual(11);
  });

  it('admin endpoints incl. commit/status/tags/types/containers/categories', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.admin.stats();
    await client.admin.resources({ q: 'title' });
    await client.admin.createResource({ name: 'x.md', content: '#' });
    await client.admin.link('res_1', { target: 'res_2' });
    await client.admin.unlink('res_1', 'res_2');
    await client.admin.setTags('res_1', ['a']);
    await client.admin.removeTag('res_1', 'a');
    await client.admin.commit('msg');
    await client.admin.status();
    await client.admin.tagsList();
    await client.admin.renameTag('a', 'b');
    await client.admin.deleteTag('a');
    await client.admin.categories();
    await client.admin.renameCategory('c1', 'c2');
    await client.admin.deleteCategory('c1');
    await client.admin.types();
    await client.admin.renameType('t1', 't2');
    await client.admin.graph();
    await client.admin.graphPath({ from: 'a', to: 'b' });
    await client.admin.containers();
    await client.admin.getContainer('c1');
    await client.admin.containerScan('c1');
    await client.admin.containerPromote('c1', { memberPath: '/p' });
    await client.admin.containerDemote('c1', { memberPath: '/p' });
    await client.admin.containerSync('c1', { dryRun: true });
    await client.admin.containerDiff('c1');
    await client.admin.containerStats('c1');
    await client.admin.relations({ rid: 'r' });
    await client.admin.deleteRelation(42);
    await client.admin.audit({ limit: 10 });
    await client.admin.importFiles(['/tmp/a.md']);
    await client.admin.suggestions();
    await client.admin.acceptSuggestion('s1');
    await client.admin.rejectSuggestion('s1');
    await client.admin.executeSuggestion('s1');
    expect(calls.length).toBe(35);
  });

  it('admin 端点使用 adminToken', async () => {
    const { client, calls } = makeClient(
      () => Promise.resolve({ status: 200, body: {}, headers: {} }),
      { adminToken: 'admintok' },
    );
    await client.admin.stats();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer admintok');
  });

  it('schemas get/create/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.schemas.get('s1');
    await client.schemas.create({ name: 'n' });
    await client.schemas.update('s1', { name: 'n2' });
    await client.schemas.remove('s1');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });

  it('views get/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.views.list({ q: 't' });
    await client.views.get('v1');
    await client.views.update('v1', {});
    await client.views.remove('v1');
    expect(calls).toHaveLength(4);
  });

  it('workflows get/create/update/remove/versions/attach/detach/resume/can/instance/history', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.workflows.get('wf1');
    await client.workflows.create({ name: 'wf' });
    await client.workflows.update('wf1', {});
    await client.workflows.remove('wf1', { force: true });
    await client.workflows.versions('wf1');
    await client.workflows.attach('wf1', { resourceRid: 'r' });
    await client.workflows.detach('wf1', { resourceRid: 'r' });
    await client.workflows.resume('wf1', {});
    await client.workflows.canTransition('wf1', {});
    await client.workflows.instance('wf1');
    await client.workflows.history({ wf: 'wf1' });
    expect(calls).toHaveLength(11);
  });

  it('automations get/create/update/remove/enable/disable/history', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.automations.get('a1');
    await client.automations.create({});
    await client.automations.update('a1', {});
    await client.automations.remove('a1');
    await client.automations.enable('a1');
    await client.automations.disable('a1');
    await client.automations.history({ auto: 'a1' });
    expect(calls).toHaveLength(7);
  });

  it('evolution 全量端点', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.evolution.status();
    await client.evolution.observe();
    await client.evolution.health();
    await client.evolution.detect();
    await client.evolution.plan();
    await client.evolution.execute();
    await client.evolution.history();
    await client.evolution.rollback();
    expect(calls).toHaveLength(8);
  });

  it('health 全量端点', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.health.ping();
    await client.health.stats();
    await client.health.tags();
    expect(calls).toHaveLength(3);
  });

  it('admin getResource/updateResource/deleteResource', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.admin.getResource('r1');
    await client.admin.updateResource('r1', { name: 'x' });
    await client.admin.deleteResource('r1', { hard: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'DELETE']);
    expect(calls[2].url).toContain('?hard=true');
  });
});
