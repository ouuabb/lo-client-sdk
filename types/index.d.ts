/**
 * @lo/client —— TypeScript 类型声明
 */

export interface LoClientOptions {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  timeout?: number;
  adminToken?: string;
  signer?: (nonce: string, privateKeyPath: string) => string;
  transport?: (ctx: {
    method: string;
    url: string;
    requestOpts: {
      body?: unknown;
      headers: Record<string, string>;
      timeout: number;
    };
    client: LoClient;
  }) => Promise<{ status: number; body: any; headers: Record<string, string> }>;
}

export interface ApiResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export interface ResourceBody {
  rid?: string;
  type?: string;
  name?: string;
  path?: string;
  content?: string;
  metadata?: Record<string, any>;
  encrypted?: boolean;
  deleted?: number;
  created?: string;
  updated?: string;
}

export interface ListResult {
  total?: number;
  limit?: number;
  offset?: number;
  data: any[];
}

export interface AuthChallengeResult {
  nonce: string;
  namespace: string;
  registeredKeys: Array<{ fingerprint: string; label?: string; keyType?: string }>;
}

export interface LoginResult {
  token: string;
  fingerprint: string;
  label?: string;
}

export class LoApiError extends Error {
  status: number;
  body: any;
  code?: string;
}

export class LoHttpError extends Error {
  code: string;
}

export class LoClient {
  constructor(options?: LoClientOptions);
  readonly baseUrl: string;
  readonly auth: AuthClient;
  notes: NotesApi;
  search: SearchApi;
  schemas: SchemasApi;
  views: ViewsApi;
  workflows: WorkflowsApi;
  automations: AutomationsApi;
  evolution: EvolutionApi;
  admin: AdminApi;
  sync: SyncApi;
  health: HealthApi;
  setAdminToken(token: string): void;
  request(method: string, path: string, query?: object, options?: object): Promise<ApiResponse>;
  get(path: string, query?: object, options?: object): Promise<ApiResponse>;
  post(path: string, body?: unknown, query?: object, options?: object): Promise<ApiResponse>;
  put(path: string, body?: unknown, query?: object, options?: object): Promise<ApiResponse>;
  del(path: string, query?: object, options?: object): Promise<ApiResponse>;
  challenge(): Promise<AuthChallengeResult>;
  login(params: LoginParams): Promise<LoginResult>;
  logout(): void;
}

export interface LoginParams {
  privateKeyPath?: string;
  signature?: string;
  fingerprint?: string;
  publicKey?: string;
  nonce?: string;
}

export class AuthClient {
  constructor(client: RestClient, options?: { signer?: Function; namespace?: string });
  readonly authenticated: boolean;
  readonly token: string | null;
  readonly fingerprint: string | null;
  challenge(): Promise<AuthChallengeResult>;
  login(params: LoginParams): Promise<LoginResult>;
  logout(): void;
}

export interface NotesApi {
  list(query?: object): Promise<ListResult>;
  get(rid: string): Promise<LoBody>;
  create(body: object): Promise<LoBody>;
  update(rid: string, body: object): Promise<LoBody>;
  remove(rid: string, query?: object): Promise<LoBody>;
}

export interface SearchApi {
  search(q: string): Promise<ListResult>;
}

export interface SchemasApi {
  list(query?: object): Promise<ListResult>;
  get(id: string): Promise<LoBody>;
  create(body: object): Promise<LoBody>;
  update(id: string, body: object): Promise<LoBody>;
  remove(id: string): Promise<LoBody>;
  attach(id: string, rid: string): Promise<LoBody>;
  detach(id: string, rid: string): Promise<LoBody>;
}

export interface ViewsApi {
  list(query?: object): Promise<ListResult>;
  get(id: string): Promise<LoBody>;
  create(body: object): Promise<LoBody>;
  update(id: string, body: object): Promise<LoBody>;
  remove(id: string): Promise<LoBody>;
  run(id: string, body?: object): Promise<LoBody>;
  export(id: string): Promise<LoBody>;
  importDef(body: object): Promise<LoBody>;
}

export interface WorkflowsApi {
  list(): Promise<ListResult>;
  get(id: string): Promise<LoBody>;
  create(body: object): Promise<LoBody>;
  update(id: string, body: object): Promise<LoBody>;
  remove(id: string, query?: object): Promise<LoBody>;
  versions(id: string, query?: object): Promise<LoBody>;
  attach(id: string, body: object): Promise<LoBody>;
  detach(id: string, body: object): Promise<LoBody>;
  resume(id: string, body: object): Promise<LoBody>;
  transition(id: string, body: object): Promise<LoBody>;
  canTransition(id: string, body: object): Promise<LoBody>;
  instances(query?: object): Promise<ListResult>;
  instance(id: string): Promise<LoBody>;
  history(query?: object): Promise<ListResult>;
}

export interface AutomationsApi {
  list(): Promise<ListResult>;
  get(id: string): Promise<LoBody>;
  create(body: object): Promise<LoBody>;
  update(id: string, body: object): Promise<LoBody>;
  remove(id: string): Promise<LoBody>;
  enable(id: string): Promise<LoBody>;
  disable(id: string): Promise<LoBody>;
  run(id: string, body?: object): Promise<LoBody>;
  history(query?: object): Promise<ListResult>;
}

export interface EvolutionApi {
  status(): Promise<LoBody>;
  observe(): Promise<LoBody>;
  health(): Promise<LoBody>;
  detect(): Promise<ListResult>;
  plan(): Promise<LoBody>;
  execute(): Promise<LoBody>;
  history(query?: object): Promise<ListResult>;
  rollback(): Promise<LoBody>;
}

export interface SyncApi {
  sync(query?: object): Promise<LoBody>;
  push(params: object): Promise<LoBody>;
  pull(params: object): Promise<LoBody>;
}

export interface AdminApi {
  stats(): Promise<LoBody>;
  resources(query?: object): Promise<ListResult>;
  getResource(rid: string): Promise<LoBody>;
  createResource(body: object): Promise<LoBody>;
  updateResource(rid: string, body: object): Promise<LoBody>;
  deleteResource(rid: string, query?: object): Promise<LoBody>;
  link(rid: string, body: object): Promise<LoBody>;
  unlink(rid: string, target: string, query?: object): Promise<LoBody>;
  setTags(rid: string, tags: string[]): Promise<LoBody>;
  removeTag(rid: string, tag: string): Promise<LoBody>;
  graph(query?: object): Promise<LoBody>;
  graphPath(query?: object): Promise<LoBody>;
  containers(): Promise<ListResult>;
  getContainer(id: string): Promise<LoBody>;
  containerPromote(id: string, body: object): Promise<LoBody>;
  containerDemote(id: string, body: object): Promise<LoBody>;
  containerScan(id: string): Promise<LoBody>;
  containerSync(id: string, body?: object): Promise<LoBody>;
  containerDiff(id: string): Promise<LoBody>;
  containerStats(id: string): Promise<LoBody>;
  relations(query?: object): Promise<ListResult>;
  deleteRelation(id: number): Promise<LoBody>;
  audit(query?: object): Promise<ListResult>;
  importFiles(paths: string[]): Promise<LoBody>;
  commit(message: string): Promise<LoBody>;
  status(): Promise<LoBody>;
  suggestions(): Promise<ListResult>;
  acceptSuggestion(id: string): Promise<LoBody>;
  rejectSuggestion(id: string): Promise<LoBody>;
  executeSuggestion(id: string): Promise<LoBody>;
  types(): Promise<LoBody>;
  renameType(name: string, newType: string): Promise<LoBody>;
  categories(): Promise<LoBody>;
  renameCategory(name: string, newCategory: string): Promise<LoBody>;
  deleteCategory(name: string): Promise<LoBody>;
  tagsList(): Promise<LoBody>;
  renameTag(name: string, newTag: string): Promise<LoBody>;
  deleteTag(name: string): Promise<LoBody>;
}

export interface HealthApi {
  ping(): Promise<LoBody>;
  stats(): Promise<LoBody>;
  tags(): Promise<LoBody>;
}

type LoBody = any;

export declare function signWithSshKeygen(
  nonce: string,
  privateKeyPath: string,
  namespace?: string,
): string;

export declare function buildQuery(params: object): string;

export declare const SDK_VERSION: string;