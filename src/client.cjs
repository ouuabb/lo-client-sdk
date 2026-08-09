/**
 * client.cjs —— LoClient 主类
 *
 * 聚合：
 *   - 请求管线（attach token、可注入 transport）
 *   - 认证（AuthClient）
 *   - 端点模块（notes/search/schemas/views/workflows/automations/evolution/admin/sync）
 *
 * 使用纯 CJS、零运行时依赖,可被 lo-agent 主进程直接 require,
 * 或经由 contextBridge 暴露给渲染进程。
 */
const http = require('./http.cjs');
const { AuthClient, signWithSshKeygen } = require('./auth.cjs');
const LoApiError = http.LoApiError;
const LoHttpError = http.LoHttpError;

const DEFAULT_OPTS = {
  host: '127.0.0.1',
  port: 8765,
  protocol: 'http',
  timeout: 15000,
};

class LoClient {
  /**
   * @param {object} [options]
   * @param {string} [options.host]
   * @param {number} [options.port]
   * @param {'http'|'https'} [options.protocol]
   * @param {number} [options.timeout]
   * @param {string} [options.adminToken] — LO_ADMIN_TOKEN;仅访问 /api/admin/* 时使用
   * @param {object} [options.transport] — 注入 { request(method,url,opts) } 便于测试
   */
  constructor(options = {}) {
    const opts = { ...DEFAULT_OPTS, ...options };
    this._opts = opts;
    if (opts.transport) {
      this._transport = opts.transport;
    } else {
      this._transport = function transport(ctx) {
        return http.request(ctx.method, ctx.url, ctx.requestOpts);
      };
    }
    this.auth = new AuthClient(this, { signer: opts.signer });
    this._adminToken = opts.adminToken || null;
    this._token = null;

    // 端点命名空间
    this.notes = createNotesApi(this);
    this.search = createSearchApi(this);
    this.schemas = createSchemasApi(this);
    this.views = createViewsApi(this);
    this.workflows = createWorkflowsApi(this);
    this.automations = createAutomationsApi(this);
    this.evolution = createEvolutionApi(this);
    this.admin = createAdminApi(this);
    this.sync = createSyncApi(this);
    this.health = createHealthApi(this);
  }

  get baseUrl() {
    return `${this._opts.protocol}://${this._opts.host}:${this._opts.port}`;
  }

  setAdminToken(token) {
    this._adminToken = token;
  }

  /**
   * 发起请求(自动加 token / admin 头)
   * @param {string} method
   * @param {string} path — 如 '/api/notes'
   * @param {object} [query]
   * @param {object} [options] — { body, headers, skipAuth }
   * @returns {Promise<{ status, body, headers }>}
   */
  async request(method, path, query, options = {}) {
    const body = options.body;
    const url = this.baseUrl + path + http.buildQuery(query);

    const headers = { ...(options.headers || {}) };
    const isAdmin = path.startsWith('/api/admin/');
    if (isAdmin && this._adminToken) {
      headers.Authorization = `Bearer ${this._adminToken}`;
    } else if (!options.skipAuth && this.auth.authenticated) {
      headers.Authorization = `Bearer ${this.auth.token}`;
    } else if (this._token) {
      headers.Authorization = `Bearer ${this._token}`;
    }

    const res = await this._transport({
      method,
      url,
      requestOpts: {
        body,
        headers,
        timeout: options.timeout || this._opts.timeout,
      },
      client: this,
    });

    if (this._opts.validateStatus === false) {
      return res;
    }
    if (res && res.status >= 400) {
      const body = res.body;
      const message =
        body && typeof body === 'object' && body.error ? body.error : `HTTP ${res.status}`;
      throw new LoApiError(message, {
        status: res.status,
        body,
        code: body && body.code,
      });
    }
    return res;
  }

  /**
   * 便捷:GET
   */
  async get(path, query, options) {
    return this.request('GET', path, query, options);
  }

  /**
   * 便捷:POST
   */
  async post(path, body, query, options) {
    return this.request('POST', path, query, {
      body,
      ...options,
    });
  }

  /**
   * 便捷:PUT
   */
  async put(path, body, query, options) {
    return this.request('PUT', path, query, { body, ...options });
  }

  /**
   * 便捷:DELETE
   */
  async del(path, query, options) {
    return this.request('DELETE', path, query, options);
  }

  /********** 认证 **********/

  /** 获取 SSH 挑战 */
  async challenge() {
    return this.auth.challenge();
  }

  /**
   * SSH 签名登录
   * @param {object} params — { privateKeyPath?, signature?, fingerprint?, publicKey? }
   */
  async login(params) {
    return this.auth.login(params);
  }

  logout() {
    this.auth.logout();
  }
}

/** ========== 端点实现(factory 返回对象,持有 client 引用) ========== */

function createHealthApi(client) {
  return {
    /** GET /api/health */
    ping() {
      return client.get('/api/health').then((r) => r.body);
    },
    /** GET /api/stats */
    stats() {
      return client.get('/api/stats').then((r) => r.body);
    },
    /** GET /api/tags */
    tags() {
      return client.get('/api/tags').then((r) => r.body);
    },
  };
}

function createNotesApi(client) {
  return {
    /**
     * 列出资源
     * @param {object} [query] — { type, schema, limit, offset }
     */
    list(query) {
      return client.get('/api/notes', query).then((r) => r.body);
    },
    /** 获取单个资源(含 content) */
    get(rid) {
      return client.get(`/api/notes/${encodeURIComponent(rid)}`).then((r) => r.body);
    },
    /**
     * 创建资源
     * @param {object} body — { type?, content?, metadata?, filename?, title? }
     */
    create(body) {
      return client.post('/api/notes', body).then((r) => r.body);
    },
    /**
     * 更新资源(content/metadata/title/tags/category)
     */
    update(rid, body) {
      return client.put(`/api/notes/${encodeURIComponent(rid)}`, body).then((r) => r.body);
    },
    /** 删除资源(默认软删,query.hard=true 硬删) */
    remove(rid, query) {
      return client.del(`/api/notes/${encodeURIComponent(rid)}`, query).then((r) => r.body);
    },
  };
}

function createSearchApi(client) {
  return {
    /**
     * 搜索
     * @param {string} q
     */
    search(q) {
      return client.get('/api/search', { q }).then((r) => r.body);
    },
  };
}

function createSchemasApi(client) {
  const encode = (id) => encodeURIComponent(id);
  return {
    list(query) {
      return client.get('/api/schemas', query).then((r) => r.body);
    },
    get(id) {
      return client.get(`/api/schemas/${encode(id)}`).then((r) => r.body);
    },
    create(body) {
      return client.post('/api/schemas', body).then((r) => r.body);
    },
    update(id, body) {
      return client.put(`/api/schemas/${encode(id)}`, body).then((r) => r.body);
    },
    remove(id) {
      return client.del(`/api/schemas/${encode(id)}`).then((r) => r.body);
    },
    attach(id, rid) {
      return client.post(`/api/schemas/${encode(id)}/attach`, { rid }).then((r) => r.body);
    },
    detach(id, rid) {
      return client.post(`/api/schemas/${encode(id)}/detach`, { rid }).then((r) => r.body);
    },
  };
}

function createViewsApi(client) {
  const encode = (id) => encodeURIComponent(id);
  return {
    list(query) {
      return client.get('/api/views', query).then((r) => r.body);
    },
    get(id) {
      return client.get(`/api/views/${encode(id)}`).then((r) => r.body);
    },
    create(body) {
      return client.post('/api/views', body).then((r) => r.body);
    },
    update(id, body) {
      return client.put(`/api/views/${encode(id)}`, body).then((r) => r.body);
    },
    remove(id) {
      return client.del(`/api/views/${encode(id)}`).then((r) => r.body);
    },
    run(id, body) {
      return client.post(`/api/views/${encode(id)}/run`, body || {}).then((r) => r.body);
    },
    export(id) {
      return client.get(`/api/views/${encode(id)}/export`).then((r) => r.body);
    },
    importDef(body) {
      return client.post('/api/views/import', body).then((r) => r.body);
    },
  };
}

function createWorkflowsApi(client) {
  const encode = (id) => encodeURIComponent(id);
  return {
    list() {
      return client.get('/api/workflows').then((r) => r.body);
    },
    get(id) {
      return client.get(`/api/workflows/${encode(id)}`).then((r) => r.body);
    },
    create(body) {
      return client.post('/api/workflows', body).then((r) => r.body);
    },
    update(id, body) {
      return client.put(`/api/workflows/${encode(id)}`, body).then((r) => r.body);
    },
    remove(id, query) {
      return client.del(`/api/workflows/${encode(id)}`, query).then((r) => r.body);
    },
    versions(id, query) {
      return client.get(`/api/workflows/${encode(id)}/versions`, query).then((r) => r.body);
    },
    attach(id, body) {
      return client.post(`/api/workflows/${encode(id)}/attach`, body).then((r) => r.body);
    },
    detach(id, body) {
      return client.post(`/api/workflows/${encode(id)}/detach`, body).then((r) => r.body);
    },
    resume(id, body) {
      return client.post(`/api/workflows/${encode(id)}/resume`, body).then((r) => r.body);
    },
    transition(id, body) {
      return client.post(`/api/workflows/${encode(id)}/transition`, body).then((r) => r.body);
    },
    canTransition(id, body) {
      return client.post(`/api/workflows/${encode(id)}/can`, body).then((r) => r.body);
    },
    instances(query) {
      return client.get('/api/workflow/instances', query).then((r) => r.body);
    },
    instance(id) {
      return client.get(`/api/workflow/instances/${encode(id)}`).then((r) => r.body);
    },
    history(query) {
      return client.get('/api/workflows/history', query).then((r) => r.body);
    },
  };
}

function createAutomationsApi(client) {
  const encode = (id) => encodeURIComponent(id);
  return {
    list() {
      return client.get('/api/automations').then((r) => r.body);
    },
    get(id) {
      return client.get(`/api/automations/${encode(id)}`).then((r) => r.body);
    },
    create(body) {
      return client.post('/api/automations', body).then((r) => r.body);
    },
    update(id, body) {
      return client.put(`/api/automations/${encode(id)}`, body).then((r) => r.body);
    },
    remove(id) {
      return client.del(`/api/automations/${encode(id)}`).then((r) => r.body);
    },
    enable(id) {
      return client.post(`/api/automations/${encode(id)}/enable`).then((r) => r.body);
    },
    disable(id) {
      return client.post(`/api/automations/${encode(id)}/disable`).then((r) => r.body);
    },
    run(id, body) {
      return client.post(`/api/automations/${encode(id)}/run`, body || {}).then((r) => r.body);
    },
    history(query) {
      return client.get('/api/automations/history', query).then((r) => r.body);
    },
  };
}

function createEvolutionApi(client) {
  return {
    status() {
      return client.get('/api/evolution/status').then((r) => r.body);
    },
    observe() {
      return client.get('/api/evolution/observe').then((r) => r.body);
    },
    health() {
      return client.get('/api/evolution/health').then((r) => r.body);
    },
    detect() {
      return client.get('/api/evolution/detect').then((r) => r.body);
    },
    plan() {
      return client.get('/api/evolution/plan').then((r) => r.body);
    },
    execute() {
      return client.post('/api/evolution/execute').then((r) => r.body);
    },
    history(query) {
      return client.get('/api/evolution/history', query).then((r) => r.body);
    },
    rollback() {
      return client.post('/api/evolution/rollback').then((r) => r.body);
    },
  };
}

function createSyncApi(client) {
  return {
    /** 同步仓库(可选 full) */
    sync(query) {
      return client.post('/api/sync', {}, query).then((r) => r.body);
    },
    push(params) {
      return client.post('/api/sync/push', params).then((r) => r.body);
    },
    pull(params) {
      return client.post('/api/sync/pull', params).then((r) => r.body);
    },
  };
}

function createAdminApi(client) {
  const encode = (id) => encodeURIComponent(id);
  return {
    stats() {
      return client.get('/api/admin/stats').then((r) => r.body);
    },
    resources(query) {
      return client.get('/api/admin/resources', query).then((r) => r.body);
    },
    getResource(rid) {
      return client.get(`/api/admin/resources/${encode(rid)}`).then((r) => r.body);
    },
    createResource(body) {
      return client.post('/api/admin/resources', body).then((r) => r.body);
    },
    updateResource(rid, body) {
      return client.put(`/api/admin/resources/${encode(rid)}`, body).then((r) => r.body);
    },
    deleteResource(rid, query) {
      return client.del(`/api/admin/resources/${encode(rid)}`, query).then((r) => r.body);
    },
    link(rid, body) {
      return client.post(`/api/admin/resources/${encode(rid)}/link`, body).then((r) => r.body);
    },
    unlink(rid, target, query) {
      return client
        .del(`/api/admin/resources/${encode(rid)}/link/${encode(target)}`, query)
        .then((r) => r.body);
    },
    setTags(rid, tags) {
      return client.put(`/api/admin/resources/${encode(rid)}/tags`, { tags }).then((r) => r.body);
    },
    removeTag(rid, tag) {
      return client
        .del(`/api/admin/resources/${encode(rid)}/tags/${encode(tag)}`)
        .then((r) => r.body);
    },
    graph(query) {
      return client.get('/api/admin/graph', query).then((r) => r.body);
    },
    graphPath(query) {
      return client.get('/api/admin/graph/path', query).then((r) => r.body);
    },
    containers() {
      return client.get('/api/admin/containers').then((r) => r.body);
    },
    getContainer(id) {
      return client.get(`/api/admin/containers/${encode(id)}`).then((r) => r.body);
    },
    containerPromote(id, body) {
      return client
        .post(`/api/admin/containers/${encode(id)}/members/promote`, body)
        .then((r) => r.body);
    },
    containerDemote(id, body) {
      return client
        .post(`/api/admin/containers/${encode(id)}/members/demote`, body)
        .then((r) => r.body);
    },
    containerScan(id) {
      return client.post(`/api/admin/containers/${encode(id)}/scan`).then((r) => r.body);
    },
    containerSync(id, body) {
      return client
        .post(`/api/admin/containers/${encode(id)}/sync`, body || {})
        .then((r) => r.body);
    },
    containerDiff(id) {
      return client.get(`/api/admin/containers/${encode(id)}/diff`).then((r) => r.body);
    },
    containerStats(id) {
      return client.get(`/api/admin/containers/${encode(id)}/stats`).then((r) => r.body);
    },
    relations(query) {
      return client.get('/api/admin/relations', query).then((r) => r.body);
    },
    deleteRelation(id) {
      return client.del(`/api/admin/relations/${id}`).then((r) => r.body);
    },
    audit(query) {
      return client.get('/api/admin/audit', query).then((r) => r.body);
    },
    importFiles(paths) {
      return client.post('/api/admin/import', { paths }).then((r) => r.body);
    },
    commit(message) {
      return client.post('/api/admin/commit', { message }).then((r) => r.body);
    },
    status() {
      return client.get('/api/admin/status').then((r) => r.body);
    },
    suggestions() {
      return client.get('/api/admin/suggestions').then((r) => r.body);
    },
    acceptSuggestion(id) {
      return client.post(`/api/admin/suggestions/${encode(id)}/accept`).then((r) => r.body);
    },
    rejectSuggestion(id) {
      return client.post(`/api/admin/suggestions/${encode(id)}/reject`).then((r) => r.body);
    },
    executeSuggestion(id) {
      return client.post(`/api/admin/suggestions/${encode(id)}/execute`).then((r) => r.body);
    },
    types() {
      return client.get('/api/admin/types').then((r) => r.body);
    },
    renameType(name, newType) {
      return client.put(`/api/admin/types/${encode(name)}`, { newType }).then((r) => r.body);
    },
    categories() {
      return client.get('/api/admin/categories').then((r) => r.body);
    },
    renameCategory(name, newCategory) {
      return client
        .put(`/api/admin/categories/${encode(name)}`, { newCategory })
        .then((r) => r.body);
    },
    deleteCategory(name) {
      return client.del(`/api/admin/categories/${encode(name)}`).then((r) => r.body);
    },
    tagsList() {
      return client.get('/api/admin/tags').then((r) => r.body);
    },
    renameTag(name, newTag) {
      return client.put(`/api/admin/tags/${encode(name)}`, { newTag }).then((r) => r.body);
    },
    deleteTag(name) {
      return client.del(`/api/admin/tags/${encode(name)}`).then((r) => r.body);
    },
  };
}

module.exports = { LoClient, LoApiError, LoHttpError, signWithSshKeygen, DEFAULT_OPTS };
