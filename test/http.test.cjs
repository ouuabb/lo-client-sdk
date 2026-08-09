const http = require('http');
const { get, post, put, del } = require('../src/http.cjs');

/** 起一个临时 http server,返回 { url, close } */
async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe('http.cjs 真实请求', () => {
  it('GET 解析 JSON 响应', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world', status: 'ok' }));
    });
    try {
      const res = await get(`${srv.url}/api/health`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hello: 'world', status: 'ok' });
    } finally {
      await srv.close();
    }
  });

  it('POST 发送 JSON body 且服务端能读到', async () => {
    let received = null;
    const srv = await startServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        received = JSON.parse(data || '{}');
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, echo: received }));
      });
    });
    try {
      const res = await post(`${srv.url}/api/notes`, { title: 'hi', tags: ['a'] });
      expect(res.status).toBe(201);
      expect(res.body.echo.title).toBe('hi');
      expect(received.tags).toEqual(['a']);
    } finally {
      await srv.close();
    }
  });

  it('PUT 与 DELETE 方法正确', async () => {
    const methods = [];
    const srv = await startServer((req, res) => {
      methods.push(req.method);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    try {
      await put(`${srv.url}/r`, { a: 1 });
      await del(`${srv.url}/r`);
      expect(methods).toEqual(['PUT', 'DELETE']);
    } finally {
      await srv.close();
    }
  });

  it('非 2xx 抛 LoApiError 且带 error 消息', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'already exists', code: 'RESOURCE_EXISTS' }));
    });
    try {
      const promise = post(`${srv.url}/api/notes`, {});
      await expect(promise).rejects.toThrow(/already exists/);
      await promise.catch((e) => {
        expect(e.name).toBe('LoApiError');
        expect(e.status).toBe(409);
        expect(e.code).toBe('RESOURCE_EXISTS');
      });
    } finally {
      await srv.close();
    }
  });

  it('跟随重定向(302 → 200)', async () => {
    const srv = await startServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/target' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"final":true}');
    });
    try {
      const res = await get(`${srv.url}/redirect`);
      expect(res.status).toBe(200);
      expect(res.body.final).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it('网络拒绝抛 LoHttpError', async () => {
    // 连接一个未监听端口
    await expect(get('http://127.0.0.1:1/api')).rejects.toThrow(
      /请求失败|connect|ECONNREFUSED/i,
    );
  });
});