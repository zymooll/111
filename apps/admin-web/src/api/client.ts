import { mockApi } from './mockApi';
import { CAMPUS_CENTER_WGS84, CAMPUS_NAME } from '../constants/campus';
import type {
  AuditLog,
  AuditQuery,
  CatalogMetadata,
  CampusUser,
  DashboardData,
  EntityStatus,
  ImportJob,
  ImportValidation,
  ListQuery,
  LoginResult,
  MenuItem,
  Merchant,
  PageResult,
  PublishStatus,
  Review,
  ReviewQuery,
  ReviewStatus,
  TagDefinition,
} from '../types';

const baseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://127.0.0.1:7993/admin/api/v1').replace(/\/$/, '');
const apiOrigin = new URL(baseUrl, window.location.origin).origin;
export const apiMode = import.meta.env.VITE_API_MODE || 'remote';
export const adminTokenKey = 'campus-foodie-admin-access-token';

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

function queryString(query: object) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem(adminTokenKey);
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as { detail?: unknown; title?: string; message?: string };
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((item) => stringValue(object(item).msg, '参数无效')).join('；');
      else message = body.message || body.title || message;
    } catch {
      // Keep the HTTP status fallback message.
    }
    throw new HttpError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T | { data: T };
  if (typeof body === 'object' && body !== null && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as { data: T }).data;
  }
  return body as T;
}

async function execute<T>(remote: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (apiMode === 'mock') return mock();
  if (apiMode === 'remote') return remote();
  try {
    return await remote();
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) throw error;
    console.warn('[Admin API] Remote request failed, using mock fallback.', error);
    return mock();
  }
}

type JsonObject = Record<string, unknown>;

const defaultCampusId = '00000000-0000-0000-0000-000000000001';
const trafficLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? value as JsonObject : {};
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function assetUrl(value: string) {
  return value.startsWith('/media/') ? new URL(value, apiOrigin).toString() : value;
}

function collectionValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : listValue(object(value).items);
}

function displayDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
}

function localPage<T>(items: T[], query: ListQuery): PageResult<T> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length };
}

function includesKeyword(values: unknown[], keyword?: string) {
  const normalized = keyword?.trim().toLowerCase();
  return !normalized || values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
}

function normalizeLogin(value: unknown): LoginResult {
  const raw = object(value);
  const rawUser = object(raw.user);
  const roleValue = stringValue(rawUser.role, 'campus_admin');
  const role = roleValue === 'super_admin'
    ? 'super_admin'
    : roleValue === 'reviewer' || roleValue === 'review_moderator'
      ? 'review_moderator'
      : 'campus_admin';
  const username = stringValue(rawUser.username, '管理员');
  return {
    accessToken: stringValue(raw.access_token ?? raw.accessToken),
    user: {
      id: stringValue(rawUser.id, 'admin'),
      username,
      name: username,
      role,
      campusId: defaultCampusId,
      campusName: CAMPUS_NAME,
    },
  };
}

function normalizeDashboard(value: unknown): DashboardData {
  const raw = object(value);
  return {
    users: numberValue(raw.users),
    merchants: numberValue(raw.active_merchants ?? raw.merchants),
    menuItems: numberValue(raw.active_menu_items ?? raw.menuItems),
    pendingReviews: numberValue(raw.pending_reviews ?? raw.pendingReviews),
    userGrowth: 0,
    merchantGrowth: 0,
    weeklyTraffic: trafficLabels.map((date) => ({ date, views: 0, recommendations: 0 })),
    categoryShare: [
      { name: '米饭快餐', value: 0, color: '#1677ff' }, { name: '面食', value: 0, color: '#52c41a' },
      { name: '轻食', value: 0, color: '#13c2c2' }, { name: '饮品', value: 0, color: '#faad14' },
      { name: '其他', value: 0, color: '#b37feb' },
    ],
    recentReviews: [],
    popularItems: [],
  };
}

function normalizeUser(value: unknown): CampusUser {
  const raw = object(value);
  const active = booleanValue(raw.is_active, raw.status !== 'frozen');
  return {
    id: stringValue(raw.id),
    username: stringValue(raw.username, '未命名用户'),
    email: stringValue(raw.email, '—'),
    status: active ? (booleanValue(raw.email_verified, true) ? 'active' : 'unverified') : 'frozen',
    reviewCount: numberValue(raw.review_count ?? raw.reviewCount),
    impactViews: numberValue(raw.impact_views ?? raw.impactViews),
    favoriteCount: numberValue(raw.favorite_count ?? raw.favoriteCount),
    createdAt: displayDate(raw.created_at ?? raw.createdAt),
    lastActive: displayDate(raw.last_active ?? raw.lastActive ?? raw.created_at),
    dietaryTags: listValue(raw.dietary_tags ?? raw.dietaryTags).map((item) => stringValue(item)).filter(Boolean),
  };
}

function normalizeMerchant(value: unknown): Merchant {
  const raw = object(value);
  const statusValue = stringValue(raw.status);
  const status: PublishStatus = statusValue === 'draft' ? 'draft' : booleanValue(raw.is_active, statusValue === 'online') ? 'online' : 'offline';
  return {
    id: stringValue(raw.id),
    campusId: stringValue(raw.campus_id ?? raw.campusId, defaultCampusId),
    areaId: stringValue(raw.area_id ?? raw.areaId) || undefined,
    categoryId: stringValue(raw.category_id ?? raw.categoryId) || undefined,
    name: stringValue(raw.name, '未命名商家'),
    description: stringValue(raw.description),
    area: stringValue(raw.area_name ?? raw.area, '未分区'),
    category: stringValue(raw.category_name ?? raw.category, '未分类'),
    address: stringValue(raw.address, '—'),
    latitude: numberValue(raw.latitude),
    longitude: numberValue(raw.longitude),
    priceLevel: numberValue(raw.price_level ?? raw.priceLevel, 2),
    status,
    rating: numberValue(raw.rating_avg ?? raw.rating),
    dishCount: numberValue(raw.dish_count ?? raw.dishCount),
    favoriteCount: numberValue(raw.favorite_count ?? raw.favoriteCount),
    openingHours: stringValue(raw.business_hours ?? raw.openingHours, '—'),
    contact: stringValue(raw.contact, '—'),
    updatedAt: displayDate(raw.updated_at ?? raw.updatedAt),
  };
}

function normalizeMenuItem(value: unknown): MenuItem {
  const raw = object(value);
  const statusValue = stringValue(raw.status);
  const status: PublishStatus = statusValue === 'draft' ? 'draft' : booleanValue(raw.is_active, statusValue === 'online') ? 'online' : 'offline';
  return {
    id: stringValue(raw.id),
    campusId: stringValue(raw.campus_id ?? raw.campusId, defaultCampusId),
    name: stringValue(raw.name, '未命名菜品'),
    description: stringValue(raw.description),
    merchantId: stringValue(raw.merchant_id ?? raw.merchantId),
    merchantName: stringValue(raw.merchant_name ?? raw.merchantName, '未知商家'),
    type: stringValue(raw.item_type ?? raw.type) === 'combo' ? 'combo' : 'dish',
    categoryId: stringValue(raw.category_id ?? raw.categoryId) || undefined,
    category: stringValue(raw.category_name ?? raw.category, '未分类'),
    price: numberValue(raw.price_cents, numberValue(raw.price) * 100) / 100,
    rating: numberValue(raw.rating_avg ?? raw.rating),
    reviewCount: numberValue(raw.review_count ?? raw.reviewCount),
    status,
    tags: listValue(raw.tags).map((item) => stringValue(item)).filter(Boolean),
    imageUrl: stringValue(raw.image_url ?? raw.imageUrl),
    updatedAt: displayDate(raw.updated_at ?? raw.updatedAt),
  };
}

function normalizeTag(value: unknown): TagDefinition {
  const raw = object(value);
  const rawUsageCount = raw.usage_count ?? raw.usageCount;
  return {
    id: stringValue(raw.id),
    campusId: stringValue(raw.campus_id ?? raw.campusId, defaultCampusId),
    name: stringValue(raw.name),
    kind: stringValue(raw.kind, 'taste'),
    usageCount: typeof rawUsageCount === 'number' && Number.isFinite(rawUsageCount)
      ? rawUsageCount
      : undefined,
    updatedAt: displayDate(raw.updated_at ?? raw.updatedAt),
  };
}

function normalizeReview(value: unknown): Review {
  const raw = object(value);
  const statusValue = stringValue(raw.status, 'pending_manual');
  const status: ReviewStatus = ['pending_machine', 'pending_manual', 'published', 'rejected', 'hidden'].includes(statusValue)
    ? statusValue as ReviewStatus
    : 'pending_manual';
  return {
    id: stringValue(raw.id),
    userName: stringValue(raw.username ?? raw.userName, '匿名用户'),
    userId: stringValue(raw.user_id ?? raw.userId),
    itemName: stringValue(raw.menu_item_name ?? raw.itemName, '未知菜品'),
    merchantName: stringValue(raw.merchant_name ?? raw.merchantName, '—'),
    rating: numberValue(raw.rating),
    content: stringValue(raw.text ?? raw.content),
    images: listValue(raw.images).map((item) => stringValue(item)).filter(Boolean).map(assetUrl),
    status,
    riskLevel: status === 'rejected' ? 'high' : status === 'pending_manual' ? 'medium' : 'low',
    createdAt: displayDate(raw.created_at ?? raw.createdAt),
    reason: stringValue(raw.moderation_reason ?? raw.reason) || undefined,
  };
}

function normalizeAudit(value: unknown): AuditLog {
  const raw = object(value);
  const targetType = stringValue(raw.target_type);
  const modules: Record<string, AuditLog['module']> = { user: '用户', merchant: '商家', menu_item: '菜品', tag: '标签', review: '评价', import: '导入' };
  const rawModule = stringValue(raw.module);
  const knownModules: AuditLog['module'][] = ['用户', '商家', '菜品', '标签', '评价', '导入', '系统'];
  const moduleName = knownModules.includes(rawModule as AuditLog['module']) ? rawModule as AuditLog['module'] : modules[targetType] ?? '系统';
  const detail = raw.detail;
  return {
    id: stringValue(raw.id),
    actor: stringValue(raw.actor ?? raw.admin_user_id, '系统'),
    role: stringValue(raw.role, '管理员'),
    module: moduleName,
    action: stringValue(raw.action, '系统操作'),
    target: stringValue(raw.target ?? raw.target_id, '—'),
    ip: stringValue(raw.ip, '—'),
    createdAt: displayDate(raw.created_at ?? raw.createdAt),
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? {}, null, 2),
  };
}

function normalizeImportJob(value: unknown): ImportJob {
  const raw = object(value);
  const typeValue = stringValue(raw.type, 'merchants');
  const statusValue = stringValue(raw.status, 'failed');
  return {
    id: stringValue(raw.id),
    fileName: stringValue(raw.file_name ?? raw.fileName, 'import.csv'),
    type: ['areas', 'merchants', 'menu_items'].includes(typeValue) ? typeValue as ImportJob['type'] : 'merchants',
    status: ['validating', 'processing', 'completed', 'failed'].includes(statusValue) ? statusValue as ImportJob['status'] : 'failed',
    progress: numberValue(raw.progress),
    total: numberValue(raw.total),
    success: numberValue(raw.success),
    failed: numberValue(raw.failed),
    createdBy: stringValue(raw.created_by ?? raw.createdBy, '管理员'),
    createdAt: displayDate(raw.created_at ?? raw.createdAt),
  };
}

function merchantPayload(input: Partial<Merchant> & Pick<Merchant, 'name'>) {
  const common: JsonObject = {
    name: input.name,
    description: input.description ?? '',
    address: input.address ?? '待补充',
    latitude: input.latitude ?? CAMPUS_CENTER_WGS84.latitude,
    longitude: input.longitude ?? CAMPUS_CENTER_WGS84.longitude,
    price_level: input.priceLevel ?? 2,
    business_hours: input.openingHours ?? '10:00-20:00',
    is_active: input.status === 'online',
  };
  if (input.areaId) common.area_id = input.areaId;
  if (input.categoryId) common.category_id = input.categoryId;
  if (!input.id) common.campus_id = input.campusId ?? defaultCampusId;
  return common;
}

function menuItemPayload(input: Partial<MenuItem> & Pick<MenuItem, 'name' | 'merchantId'>) {
  const payload: JsonObject = {
    merchant_id: input.merchantId,
    name: input.name,
    description: input.description ?? '',
    item_type: input.type ?? 'dish',
    price_cents: Math.round((input.price ?? 0) * 100),
    image_url: input.imageUrl || '/images/dish-placeholder.webp',
    tags: input.tags ?? [],
    is_active: input.status === 'online',
  };
  if (!input.id) payload.campus_id = input.campusId ?? defaultCampusId;
  if (input.categoryId) payload.category_id = input.categoryId;
  return payload;
}

export const adminApi = {
  login(username: string, password: string) {
    return execute(
      () => request<unknown>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: username, username, password }) }).then(normalizeLogin),
      () => mockApi.login(username, password),
    );
  },
  dashboard() {
    return execute(async () => {
      const dashboard = normalizeDashboard(await request<unknown>(`/dashboard${queryString({ campus_id: defaultCampusId })}`));
      const reviews = await request<unknown>(`/reviews${queryString({ campus_id: defaultCampusId, limit: 4 })}`).catch(() => ({ items: [] }));
      dashboard.recentReviews = listValue(object(reviews).items).map(normalizeReview).slice(0, 4);
      return dashboard;
    }, () => mockApi.dashboard());
  },
  users(query: ListQuery) {
    return execute(async () => {
      const active = query.status === 'active' ? true : query.status === 'frozen' ? false : undefined;
      const raw = await request<unknown>(`/users${queryString({ campus_id: defaultCampusId, search: query.keyword, active, limit: 100 })}`);
      let items = collectionValue(raw).map(normalizeUser);
      if (query.status) items = items.filter((item) => item.status === query.status);
      return localPage(items, query);
    }, () => mockApi.users(query));
  },
  updateUser(id: string, status: EntityStatus): Promise<CampusUser> {
    return execute(
      () => request<unknown>(`/users/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status !== 'frozen' }) }).then(normalizeUser),
      () => mockApi.updateUser(id, status),
    );
  },
  resetPassword(id: string) {
    return execute(
      () => request<void>(`/users/${id}/password-reset${queryString({ campus_id: defaultCampusId })}`, { method: 'POST' }),
      () => mockApi.resetPassword(id),
    );
  },
  catalogMetadata(): Promise<CatalogMetadata> {
    return execute(async () => {
      const [areasRaw, categoriesRaw, tagsRaw] = await Promise.all([
        request<unknown>(`/areas${queryString({ campus_id: defaultCampusId })}`),
        request<unknown>(`/categories${queryString({ campus_id: defaultCampusId })}`),
        request<unknown>(`/tags${queryString({ campus_id: defaultCampusId })}`),
      ]);
      return {
        areas: listValue(areasRaw).map((entry) => object(entry)).map((entry) => ({ id: stringValue(entry.id), name: stringValue(entry.name) })).filter((entry) => entry.id && entry.name),
        categories: listValue(categoriesRaw).map((entry) => object(entry)).map((entry) => ({ id: stringValue(entry.id), name: stringValue(entry.name) })).filter((entry) => entry.id && entry.name),
        tags: collectionValue(tagsRaw).map(normalizeTag).filter((entry) => entry.id && entry.name),
      };
    }, () => mockApi.catalogMetadata());
  },
  tags(): Promise<TagDefinition[]> {
    return execute(
      () => request<unknown>(`/tags${queryString({ campus_id: defaultCampusId })}`).then((value) => collectionValue(value).map(normalizeTag)),
      () => mockApi.tags(),
    );
  },
  saveTag(input: Partial<TagDefinition> & Pick<TagDefinition, 'name' | 'kind'>): Promise<TagDefinition> {
    const body = input.id
      ? { name: input.name, kind: input.kind }
      : { campus_id: input.campusId || defaultCampusId, name: input.name, kind: input.kind };
    return execute(
      () => request<unknown>(input.id ? `/tags/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/tags', {
        method: input.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }).then(normalizeTag),
      () => mockApi.saveTag(input),
    );
  },
  deleteTag(id: string) {
    return execute(
      () => request<void>(`/tags/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'DELETE' }),
      () => mockApi.deleteTag(id),
    );
  },
  merchants(query: ListQuery) {
    return execute(async () => {
      const active = query.status === 'online' ? true : query.status === 'offline' ? false : undefined;
      const raw = await request<unknown>(`/merchants${queryString({ campus_id: defaultCampusId, search: query.keyword, active, limit: 100 })}`);
      let items = collectionValue(raw).map(normalizeMerchant);
      if (query.status) items = items.filter((item) => item.status === query.status);
      return localPage(items, query);
    }, () => mockApi.merchants(query));
  },
  saveMerchant(input: Partial<Merchant> & Pick<Merchant, 'name'>) {
    return execute(
      () => request<unknown>(input.id ? `/merchants/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/merchants', { method: input.id ? 'PATCH' : 'POST', body: JSON.stringify(merchantPayload(input)) }).then(normalizeMerchant),
      () => mockApi.saveMerchant(input),
    );
  },
  updateMerchantStatus(id: string, status: PublishStatus) {
    return execute(
      () => request<void>(`/merchants/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status === 'online' }) }),
      () => mockApi.updateMerchantStatus(id, status),
    );
  },
  deleteMerchant(id: string) {
    return execute(
      () => request<void>(`/merchants/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'DELETE' }),
      () => mockApi.deleteMerchant(id),
    );
  },
  menuItems(query: ListQuery) {
    return execute(async () => {
      const active = query.status === 'online' ? true : query.status === 'offline' ? false : undefined;
      const raw = await request<unknown>(`/menu-items${queryString({ campus_id: defaultCampusId, active, limit: 100 })}`);
      let items = collectionValue(raw).map(normalizeMenuItem)
        .filter((item) => includesKeyword([item.name, item.merchantName, item.category], query.keyword));
      if (query.status) items = items.filter((item) => item.status === query.status);
      return localPage(items, query);
    }, () => mockApi.menuItems(query));
  },
  saveMenuItem(input: Partial<MenuItem> & Pick<MenuItem, 'name' | 'merchantId'>) {
    return execute(
      () => request<unknown>(input.id ? `/menu-items/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/menu-items', { method: input.id ? 'PATCH' : 'POST', body: JSON.stringify(menuItemPayload(input)) }).then(normalizeMenuItem),
      () => mockApi.saveMenuItem(input),
    );
  },
  updateMenuItemStatus(id: string, status: PublishStatus) {
    return execute(
      () => request<void>(`/menu-items/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status === 'online' }) }),
      () => mockApi.updateMenuItemStatus(id, status),
    );
  },
  deleteMenuItem(id: string) {
    return execute(
      () => request<void>(`/menu-items/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'DELETE' }),
      () => mockApi.deleteMenuItem(id),
    );
  },
  reviews(query: ReviewQuery) {
    return execute(async () => {
      const needsClientFilter = Boolean(query.keyword || query.riskLevel || query.rating);
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 10;
      const raw = object(await request<unknown>(`/reviews${queryString({
        campus_id: defaultCampusId,
        status: query.status,
        offset: needsClientFilter ? 0 : (page - 1) * pageSize,
        limit: needsClientFilter ? 100 : pageSize,
      })}`));
      let items = listValue(raw.items).map(normalizeReview).filter((item) =>
        includesKeyword([item.content, item.userName, item.itemName], query.keyword) &&
        (!query.riskLevel || item.riskLevel === query.riskLevel) &&
        (!query.rating || item.rating === query.rating),
      );
      if (query.status) items = items.filter((item) => item.status === query.status);
      return needsClientFilter ? localPage(items, query) : { items, total: numberValue(raw.total, items.length) };
    }, () => mockApi.reviews(query));
  },
  reviewAction(id: string, status: ReviewStatus, reason?: string) {
    const action = status === 'published' ? 'publish' : status === 'hidden' ? 'hide' : 'reject';
    return execute(
      () => request<void>(`/reviews/${id}/moderate${queryString({ campus_id: defaultCampusId })}`, { method: 'POST', body: JSON.stringify({ action, reason: reason ?? '' }) }),
      () => mockApi.reviewAction(id, status, reason),
    );
  },
  validateImport(file: File, type: ImportJob['type']): Promise<ImportValidation> {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('campus_id', defaultCampusId);
    return execute(
      () => request<ImportValidation>('/imports/validate', { method: 'POST', body: form }),
      () => mockApi.validateImport(file, type),
    );
  },
  startImport(file: File, type: ImportJob['type'], validation: ImportValidation) {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('campus_id', defaultCampusId);
    return execute(
      () => request<unknown>('/imports', { method: 'POST', body: form }).then(normalizeImportJob),
      () => mockApi.startImport(file, type, validation),
    );
  },
  importJobs() {
    return execute(() => request<unknown>(`/imports${queryString({ campus_id: defaultCampusId })}`).then((value) => collectionValue(value).map(normalizeImportJob)), () => mockApi.importJobs());
  },
  auditLogs(query: AuditQuery) {
    return execute(async () => {
      const raw = await request<unknown>(`/audit-logs${queryString({ campus_id: defaultCampusId, limit: 100 })}`);
      let items = collectionValue(raw).map(normalizeAudit).filter((item) => includesKeyword([item.actor, item.action, item.target], query.keyword));
      if (query.module) items = items.filter((item) => item.module === query.module);
      return localPage(items, query);
    }, () => mockApi.auditLogs(query));
  },
};
