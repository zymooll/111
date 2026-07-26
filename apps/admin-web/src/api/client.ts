import { mockApi } from './mockApi';
import { CAMPUS_CENTER_WGS84, CAMPUS_NAME } from '../constants/campus';
import type {
  AuditLog,
  CatalogMetadata,
  CampusUser,
  CursorPage,
  CursorQuery,
  DashboardData,
  EntityStatus,
  ImportJob,
  ImportValidation,
  LoginResult,
  MenuItem,
  MenuItemListQuery,
  Merchant,
  MerchantListQuery,
  PublishStatus,
  Review,
  ReviewAction,
  ReviewListQuery,
  RiskLevel,
  TagDefinition,
  UserListQuery,
} from '../types';

const baseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://127.0.0.1:7993/admin/api/v1').replace(/\/$/, '');
const apiOrigin = new URL(baseUrl, window.location.origin).origin;
export const apiMode = import.meta.env.VITE_API_MODE || 'remote';
export const adminTokenKey = 'campus-foodie-admin-access-token';
export const adminRefreshTokenKey = 'campus-foodie-admin-refresh-token';

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

export function storeSession(tokens: { accessToken: string; refreshToken: string }) {
  sessionStorage.setItem(adminTokenKey, tokens.accessToken);
  sessionStorage.setItem(adminRefreshTokenKey, tokens.refreshToken);
}

export function clearSession() {
  sessionStorage.removeItem(adminTokenKey);
  sessionStorage.removeItem(adminRefreshTokenKey);
}

const sessionListeners = new Set<() => void>();

/** Notifies the auth layer that renewal failed and the operator has to sign in again. */
export function onSessionExpired(listener: () => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

const fallbackListeners = new Set<(active: boolean) => void>();
let fallbackActive = false;

export function onFallbackChange(listener: (active: boolean) => void) {
  fallbackListeners.add(listener);
  return () => {
    fallbackListeners.delete(listener);
  };
}

export function isFallbackActive() {
  return fallbackActive;
}

function setFallback(active: boolean) {
  if (fallbackActive === active) return;
  fallbackActive = active;
  fallbackListeners.forEach((listener) => listener(active));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function send(path: string, init: RequestInit | undefined, token: string | null) {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

let renewal: Promise<string> | null = null;

async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const expired = new HttpError('登录状态已过期，请重新登录', 401);
  const response = await send('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, null);
  if (!response.ok) throw expired;
  const body = object(await response.json());
  const accessToken = stringValue(body.access_token ?? body.accessToken);
  if (!accessToken) throw expired;
  storeSession({ accessToken, refreshToken: stringValue(body.refresh_token ?? body.refreshToken, refreshToken) });
  return accessToken;
}

/** Exchanges the stored refresh token once, even when several requests hit 401 at the same time. */
function renewAccessToken(refreshToken: string): Promise<string> {
  if (!renewal) {
    renewal = exchangeRefreshToken(refreshToken).catch((error) => {
      clearSession();
      sessionListeners.forEach((listener) => listener());
      throw error;
    });
    void renewal.catch(() => undefined).then(() => { renewal = null; });
  }
  return renewal;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await send(path, init, sessionStorage.getItem(adminTokenKey));
  const refreshToken = sessionStorage.getItem(adminRefreshTokenKey);
  if (response.status === 401 && refreshToken && !path.startsWith('/auth/')) {
    response = await send(path, init, await renewAccessToken(refreshToken));
  }
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

/** Read-only data may degrade to the bundled demo set; the layout surfaces that state to the operator. */
async function read<T>(remote: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (apiMode === 'mock') return mock();
  if (apiMode === 'remote') return remote();
  try {
    const value = await remote();
    setFallback(false);
    return value;
  } catch (error) {
    if (isAbortError(error) || (error instanceof HttpError && error.status < 500)) throw error;
    console.warn('[Admin API] 只读接口不可用，已改用演示数据。', error);
    setFallback(true);
    return mock();
  }
}

/** Writes never degrade: a failed save has to reach the operator as a failure. */
function write<T>(remote: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  return apiMode === 'mock' ? mock() : remote();
}

type JsonObject = Record<string, unknown>;

const defaultCampusId = '00000000-0000-0000-0000-000000000001';

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

function cursorPage<T>(value: unknown, normalize: (entry: unknown) => T): CursorPage<T> {
  const raw = object(value);
  const total = raw.total;
  return {
    items: listValue(raw.items).map(normalize),
    nextCursor: stringValue(raw.next_cursor ?? raw.nextCursor) || null,
    hasMore: booleanValue(raw.has_more ?? raw.hasMore),
    total: typeof total === 'number' && Number.isFinite(total) ? total : undefined,
  };
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
    refreshToken: stringValue(raw.refresh_token ?? raw.refreshToken),
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
    recentReviews: [],
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
    status: booleanValue(raw.is_active, true) ? 'online' : 'offline',
    rating: numberValue(raw.rating_avg ?? raw.rating),
    dishCount: numberValue(raw.dish_count ?? raw.dishCount),
    favoriteCount: numberValue(raw.favorite_count ?? raw.favoriteCount),
    openingHours: stringValue(raw.business_hours ?? raw.openingHours, '—'),
    updatedAt: displayDate(raw.updated_at ?? raw.updatedAt),
  };
}

function normalizeMenuItem(value: unknown): MenuItem {
  const raw = object(value);
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
    status: booleanValue(raw.is_active, true) ? 'online' : 'offline',
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
  const status = ['pending_machine', 'pending_manual', 'published', 'rejected', 'hidden'].includes(statusValue)
    ? statusValue as Review['status']
    : 'pending_manual';
  const riskValue = stringValue(raw.risk_level ?? raw.riskLevel);
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
    riskLevel: ['low', 'medium', 'high'].includes(riskValue) ? riskValue as RiskLevel : 'low',
    createdAt: displayDate(raw.created_at ?? raw.createdAt),
    reason: stringValue(raw.moderation_reason ?? raw.reason) || undefined,
  };
}

function normalizeAudit(value: unknown): AuditLog {
  const raw = object(value);
  const detail = raw.detail;
  return {
    id: stringValue(raw.id),
    actorId: stringValue(raw.admin_user_id ?? raw.adminUserId, '—'),
    targetType: stringValue(raw.target_type ?? raw.targetType),
    action: stringValue(raw.action, '—'),
    target: stringValue(raw.target_id ?? raw.targetId, '—'),
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

/** The server owns the WGS-84 → GCJ-02 conversion, so the admin only ever submits the picked coordinates. */
function merchantPayload(input: Partial<Merchant> & Pick<Merchant, 'name'>) {
  const common: JsonObject = {
    name: input.name,
    description: input.description ?? '',
    address: input.address ?? '待补充',
    latitude: input.latitude ?? CAMPUS_CENTER_WGS84.latitude,
    longitude: input.longitude ?? CAMPUS_CENTER_WGS84.longitude,
    price_level: input.priceLevel ?? 2,
    business_hours: input.openingHours ?? '10:00-20:00',
    is_active: input.status !== 'offline',
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
    is_active: input.status !== 'offline',
  };
  if (!input.id) payload.campus_id = input.campusId ?? defaultCampusId;
  if (input.categoryId) payload.category_id = input.categoryId;
  return payload;
}

export const adminApi = {
  login(username: string, password: string) {
    return write(
      () => request<unknown>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: username, username, password }) }).then(normalizeLogin),
      () => mockApi.login(username, password),
    );
  },
  dashboard(signal?: AbortSignal) {
    return read(async () => {
      const dashboard = normalizeDashboard(await request<unknown>(`/dashboard${queryString({ campus_id: defaultCampusId })}`, { signal }));
      const reviews = await request<unknown>(`/reviews${queryString({ campus_id: defaultCampusId, limit: 4 })}`, { signal }).catch(() => ({ items: [] }));
      dashboard.recentReviews = listValue(object(reviews).items).map(normalizeReview);
      return dashboard;
    }, () => mockApi.dashboard());
  },
  users(query: UserListQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/users${queryString({
        campus_id: defaultCampusId,
        search: query.search,
        active: query.active,
        cursor: query.cursor,
        limit: query.limit,
      })}`, { signal }).then((value) => cursorPage(value, normalizeUser)),
      () => mockApi.users(query),
    );
  },
  updateUser(id: string, status: EntityStatus): Promise<CampusUser> {
    return write(
      () => request<unknown>(`/users/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status !== 'frozen' }) }).then(normalizeUser),
      () => mockApi.updateUser(id, status),
    );
  },
  resetPassword(id: string) {
    return write(
      () => request<void>(`/users/${id}/password-reset${queryString({ campus_id: defaultCampusId })}`, { method: 'POST' }),
      () => mockApi.resetPassword(id),
    );
  },
  catalogMetadata(signal?: AbortSignal): Promise<CatalogMetadata> {
    return read(async () => {
      const [areasRaw, categoriesRaw, tagsRaw] = await Promise.all([
        request<unknown>(`/areas${queryString({ campus_id: defaultCampusId })}`, { signal }),
        request<unknown>(`/categories${queryString({ campus_id: defaultCampusId })}`, { signal }),
        request<unknown>(`/tags${queryString({ campus_id: defaultCampusId })}`, { signal }),
      ]);
      return {
        areas: listValue(areasRaw).map((entry) => object(entry)).map((entry) => ({ id: stringValue(entry.id), name: stringValue(entry.name) })).filter((entry) => entry.id && entry.name),
        categories: listValue(categoriesRaw).map((entry) => object(entry)).map((entry) => ({ id: stringValue(entry.id), name: stringValue(entry.name) })).filter((entry) => entry.id && entry.name),
        tags: collectionValue(tagsRaw).map(normalizeTag).filter((entry) => entry.id && entry.name),
      };
    }, () => mockApi.catalogMetadata());
  },
  tags(signal?: AbortSignal): Promise<TagDefinition[]> {
    return read(
      () => request<unknown>(`/tags${queryString({ campus_id: defaultCampusId })}`, { signal }).then((value) => collectionValue(value).map(normalizeTag)),
      () => mockApi.tags(),
    );
  },
  saveTag(input: Partial<TagDefinition> & Pick<TagDefinition, 'name' | 'kind'>): Promise<TagDefinition> {
    const body = input.id
      ? { name: input.name, kind: input.kind }
      : { campus_id: input.campusId || defaultCampusId, name: input.name, kind: input.kind };
    return write(
      () => request<unknown>(input.id ? `/tags/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/tags', {
        method: input.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }).then(normalizeTag),
      () => mockApi.saveTag(input),
    );
  },
  deleteTag(id: string) {
    return write(
      () => request<void>(`/tags/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'DELETE' }),
      () => mockApi.deleteTag(id),
    );
  },
  merchants(query: MerchantListQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/merchants${queryString({
        campus_id: defaultCampusId,
        search: query.search,
        active: query.active,
        cursor: query.cursor,
        limit: query.limit,
      })}`, { signal }).then((value) => cursorPage(value, normalizeMerchant)),
      () => mockApi.merchants(query),
    );
  },
  saveMerchant(input: Partial<Merchant> & Pick<Merchant, 'name'>) {
    return write(
      () => request<unknown>(input.id ? `/merchants/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/merchants', { method: input.id ? 'PATCH' : 'POST', body: JSON.stringify(merchantPayload(input)) }).then(normalizeMerchant),
      () => mockApi.saveMerchant(input),
    );
  },
  updateMerchantStatus(id: string, status: PublishStatus) {
    return write(
      () => request<void>(`/merchants/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status === 'online' }) }),
      () => mockApi.updateMerchantStatus(id, status),
    );
  },
  menuItems(query: MenuItemListQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/menu-items${queryString({
        campus_id: defaultCampusId,
        merchant_id: query.merchantId,
        active: query.active,
        cursor: query.cursor,
        limit: query.limit,
      })}`, { signal }).then((value) => cursorPage(value, normalizeMenuItem)),
      () => mockApi.menuItems(query),
    );
  },
  saveMenuItem(input: Partial<MenuItem> & Pick<MenuItem, 'name' | 'merchantId'>) {
    return write(
      () => request<unknown>(input.id ? `/menu-items/${input.id}${queryString({ campus_id: input.campusId || defaultCampusId })}` : '/menu-items', { method: input.id ? 'PATCH' : 'POST', body: JSON.stringify(menuItemPayload(input)) }).then(normalizeMenuItem),
      () => mockApi.saveMenuItem(input),
    );
  },
  updateMenuItemStatus(id: string, status: PublishStatus) {
    return write(
      () => request<void>(`/menu-items/${id}${queryString({ campus_id: defaultCampusId })}`, { method: 'PATCH', body: JSON.stringify({ is_active: status === 'online' }) }),
      () => mockApi.updateMenuItemStatus(id, status),
    );
  },
  reviews(query: ReviewListQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/reviews${queryString({
        campus_id: defaultCampusId,
        status: query.status,
        cursor: query.cursor,
        limit: query.limit,
      })}`, { signal }).then((value) => cursorPage(value, normalizeReview)),
      () => mockApi.reviews(query),
    );
  },
  moderateReview(id: string, action: ReviewAction, reason?: string) {
    return write(
      () => request<void>(`/reviews/${id}/moderate${queryString({ campus_id: defaultCampusId })}`, { method: 'POST', body: JSON.stringify({ action, reason: reason ?? '' }) }),
      () => mockApi.moderateReview(id, action, reason),
    );
  },
  validateImport(file: File, type: ImportJob['type']): Promise<ImportValidation> {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('campus_id', defaultCampusId);
    return write(
      () => request<ImportValidation>('/imports/validate', { method: 'POST', body: form }),
      () => mockApi.validateImport(file, type),
    );
  },
  startImport(file: File, type: ImportJob['type'], validation: ImportValidation) {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('campus_id', defaultCampusId);
    return write(
      () => request<unknown>('/imports', { method: 'POST', body: form }).then(normalizeImportJob),
      () => mockApi.startImport(file, type, validation),
    );
  },
  importJobs(query: CursorQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/imports${queryString({ campus_id: defaultCampusId, cursor: query.cursor, limit: query.limit })}`, { signal })
        .then((value) => cursorPage(value, normalizeImportJob)),
      () => mockApi.importJobs(query),
    );
  },
  auditLogs(query: CursorQuery, signal?: AbortSignal) {
    return read(
      () => request<unknown>(`/audit-logs${queryString({ campus_id: defaultCampusId, cursor: query.cursor, limit: query.limit })}`, { signal })
        .then((value) => cursorPage(value, normalizeAudit)),
      () => mockApi.auditLogs(query),
    );
  },
};
