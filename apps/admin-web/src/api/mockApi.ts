import type {
  AdminUser,
  AuditLog,
  CampusUser,
  CatalogMetadata,
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
  TagDefinition,
  UserListQuery,
} from '../types';
import { CAMPUS_NAME } from '../constants/campus';

const admin: AdminUser = {
  id: 'admin-001',
  username: 'admin',
  name: '林老师',
  role: 'super_admin',
  campusId: 'campus-main',
  campusName: CAMPUS_NAME,
};

const mockCatalogAreas: CatalogMetadata['areas'] = [
  { id: 'mock-area-east', name: '东园餐饮区' },
  { id: 'mock-area-linhai', name: '林海餐厅及周边档口' },
  { id: 'mock-area-west', name: '西园及后街餐饮区' },
];

const mockCatalogCategories: CatalogMetadata['categories'] = [
  { id: 'mock-category-campus', name: '校园食堂' },
  { id: 'mock-category-fast-food', name: '中式快餐' },
  { id: 'mock-category-rice', name: '米饭' },
  { id: 'mock-category-noodle', name: '面食' },
  { id: 'mock-category-light', name: '轻食' },
  { id: 'mock-category-hot-food', name: '热食' },
  { id: 'mock-category-drink', name: '饮品' },
  { id: 'mock-category-snack', name: '小吃' },
  { id: 'mock-category-combo', name: '套餐' },
  { id: 'mock-category-other', name: '其他' },
];

const seedUsers: CampusUser[] = [
  { id: 'U10001', username: '小林今天吃什么', email: 'lin@example.edu.cn', status: 'active', reviewCount: 18, impactViews: 3240, favoriteCount: 12, createdAt: '2026-05-12 09:20', lastActive: '2026-07-18 10:42', dietaryTags: ['微辣', '低糖'] },
  { id: 'U10002', username: '早八也要吃饱', email: 'zao8@example.edu.cn', status: 'active', reviewCount: 6, impactViews: 875, favoriteCount: 21, createdAt: '2026-05-19 14:30', lastActive: '2026-07-18 09:13', dietaryTags: ['性价比', '清淡'] },
  { id: 'U10003', username: '西园干饭王', email: 'fanwang@example.edu.cn', status: 'frozen', reviewCount: 32, impactViews: 9120, favoriteCount: 8, createdAt: '2026-04-03 11:08', lastActive: '2026-07-16 22:01', dietaryTags: ['重辣', '大份'] },
  { id: 'U10004', username: '一杯冰美式', email: 'coffee@example.edu.cn', status: 'unverified', reviewCount: 0, impactViews: 0, favoriteCount: 3, createdAt: '2026-07-17 18:36', lastActive: '2026-07-17 18:36', dietaryTags: ['咖啡', '低脂'] },
  { id: 'U10005', username: '图书馆常驻', email: 'library@example.edu.cn', status: 'active', reviewCount: 11, impactViews: 1860, favoriteCount: 14, createdAt: '2026-06-01 08:45', lastActive: '2026-07-18 08:05', dietaryTags: ['素食友好'] },
  { id: 'U10006', username: '林苑小队长', email: 'linyuan@example.edu.cn', status: 'active', reviewCount: 9, impactViews: 2310, favoriteCount: 19, createdAt: '2026-06-08 12:15', lastActive: '2026-07-17 20:54', dietaryTags: ['酸甜', '面食'] },
];

const seedMerchants: Merchant[] = [
  { id: 'M001', areaId: 'mock-area-linhai', categoryId: 'mock-category-campus', name: '中南林业科技大学林海餐厅', description: '高德 POI B0FFK85GDN；菜单与评分为演示生成。', area: '林海餐厅及周边档口', category: '校园食堂', address: '青园路357号东北80米', latitude: 28.135160, longitude: 112.989410, status: 'online', rating: 4.8, dishCount: 1, favoriteCount: 48, openingHours: '07:00-21:00', updatedAt: '2026-07-22 12:00' },
  { id: 'M002', areaId: 'mock-area-east', categoryId: 'mock-category-campus', name: '林语餐厅', description: '高德 POI B0FFHS6IE6；菜单与评分为演示生成。', area: '东园餐饮区', category: '校园食堂', address: '中南林业科技大学林大路105号(近常青公寓)', latitude: 28.136507, longitude: 112.988280, status: 'online', rating: 4.7, dishCount: 2, favoriteCount: 36, openingHours: '07:00-21:00', updatedAt: '2026-07-22 12:00' },
  { id: 'M003', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '中南林业科技大学林苑餐厅', description: '高德 POI B0FFH6K3IJ；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '中南林业科技大学北门南220米', latitude: 28.133670, longitude: 112.987409, status: 'online', rating: 4.8, dishCount: 1, favoriteCount: 41, openingHours: '07:00-21:00', updatedAt: '2026-07-22 12:00' },
  { id: 'M004', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '林涛餐厅', description: '高德 POI B0FFIIUFLZ；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '中南林业科技大学西园14栋', latitude: 28.133036, longitude: 112.984693, status: 'online', rating: 4.6, dishCount: 1, favoriteCount: 29, openingHours: '07:00-21:00', updatedAt: '2026-07-22 12:00' },
  { id: 'M005', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '林冠餐厅', description: '高德 POI B0FFIZQWMY；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '韶山南路498号中南林业科技大学', latitude: 28.132689, longitude: 112.984888, status: 'online', rating: 4.5, dishCount: 1, favoriteCount: 27, openingHours: '07:00-21:00', updatedAt: '2026-07-22 12:00' },
];

const seedItems: MenuItem[] = [
  { id: 'D001', categoryId: 'mock-category-rice', name: '番茄牛腩饭', description: '演示生成，非门店实测菜单。', merchantId: 'M001', merchantName: '中南林业科技大学林海餐厅', type: 'dish', category: '米饭', price: 18, rating: 4.8, reviewCount: 18, status: 'online', tags: ['酸甜', '高蛋白'], updatedAt: '2026-07-22 12:00' },
  { id: 'D002', categoryId: 'mock-category-noodle', name: '菌菇鸡汤面', description: '演示生成，非门店实测菜单。', merchantId: 'M002', merchantName: '林语餐厅', type: 'dish', category: '面食', price: 14, rating: 4.7, reviewCount: 15, status: 'online', tags: ['清淡', '暖胃'], updatedAt: '2026-07-22 12:00' },
  { id: 'D003', categoryId: 'mock-category-light', name: '鸡胸时蔬能量碗', description: '演示生成，非门店实测菜单。', merchantId: 'M003', merchantName: '中南林业科技大学林苑餐厅', type: 'dish', category: '轻食', price: 18, rating: 4.8, reviewCount: 16, status: 'online', tags: ['高蛋白', '清淡'], updatedAt: '2026-07-22 12:00' },
  { id: 'D004', categoryId: 'mock-category-rice', name: '新奥尔良鸡扒饭', description: '演示生成，非门店实测菜单。', merchantId: 'M004', merchantName: '林涛餐厅', type: 'dish', category: '米饭', price: 16, rating: 4.6, reviewCount: 13, status: 'online', tags: ['微辣', '高蛋白'], updatedAt: '2026-07-22 12:00' },
  { id: 'D005', categoryId: 'mock-category-hot-food', name: '林冠骨汤麻辣烫', description: '演示生成，非门店实测菜单。', merchantId: 'M005', merchantName: '林冠餐厅', type: 'dish', category: '热食', price: 18, rating: 4.5, reviewCount: 12, status: 'online', tags: ['香辣', '暖胃'], updatedAt: '2026-07-22 12:00' },
  { id: 'D006', categoryId: 'mock-category-noodle', name: '林语酸辣粉', description: '演示生成，非门店实测菜单。', merchantId: 'M002', merchantName: '林语餐厅', type: 'dish', category: '面食', price: 11, rating: 4.6, reviewCount: 10, status: 'online', tags: ['酸辣', '实惠'], updatedAt: '2026-07-22 12:00' },
];

const seedTags: TagDefinition[] = [
  { id: 'T001', campusId: 'campus-main', name: '微辣', kind: 'taste', usageCount: 0 },
  { id: 'T002', campusId: 'campus-main', name: '酸甜', kind: 'taste', usageCount: 0 },
  { id: 'T003', campusId: 'campus-main', name: '清淡', kind: 'taste', usageCount: 0 },
  { id: 'T004', campusId: 'campus-main', name: '高蛋白', kind: 'diet', usageCount: 0 },
  { id: 'T005', campusId: 'campus-main', name: '素食友好', kind: 'diet', usageCount: 0 },
  { id: 'T006', campusId: 'campus-main', name: '暖胃', kind: 'taste', usageCount: 0 },
  { id: 'T007', campusId: 'campus-main', name: '香辣', kind: 'taste', usageCount: 0 },
  { id: 'T008', campusId: 'campus-main', name: '酸辣', kind: 'taste', usageCount: 0 },
  { id: 'T009', campusId: 'campus-main', name: '实惠', kind: 'taste', usageCount: 0 },
];

const seedReviews: Review[] = [
  { id: 'R26072201', userName: '演示同学甲', userId: 'U10001', itemName: '番茄牛腩饭', merchantName: '中南林业科技大学林海餐厅', rating: 5, content: '演示评价（非真实用户评价）：番茄风味和牛腩口感用于展示推荐结果。', images: [], status: 'pending_manual', riskLevel: 'medium', createdAt: '2026-07-22 12:10' },
  { id: 'R26072202', userName: '演示同学乙', userId: 'U10003', itemName: '菌菇鸡汤面', merchantName: '林语餐厅', rating: 4, content: '演示评价（非真实用户评价）：清淡汤面用于展示口味标签和审核流程。', images: [], status: 'pending_manual', riskLevel: 'medium', createdAt: '2026-07-22 12:08' },
  { id: 'R26072203', userName: '演示同学丙', userId: 'U10002', itemName: '鸡胸时蔬能量碗', merchantName: '中南林业科技大学林苑餐厅', rating: 5, content: '演示评价（非真实用户评价）：蛋白质和蔬菜搭配用于展示偏好匹配。', images: [], status: 'published', riskLevel: 'low', createdAt: '2026-07-22 12:06' },
  { id: 'R26072204', userName: '演示同学丁', userId: 'U10006', itemName: '新奥尔良鸡扒饭', merchantName: '林涛餐厅', rating: 4, content: '演示评价（非真实用户评价）：价格、分量和出餐时间均为模拟值。', images: [], status: 'published', riskLevel: 'low', createdAt: '2026-07-22 12:04' },
  { id: 'R26072205', userName: '匿名用户', userId: 'U10007', itemName: '菌菇鸡汤面', merchantName: '林语餐厅', rating: 1, content: '演示评价（非真实用户评价）：该审核样本包含疑似广告联系方式，需要人工复核。', images: [], status: 'rejected', riskLevel: 'high', reason: '包含营销及联系方式', createdAt: '2026-07-22 12:02' },
  { id: 'R26072206', userName: '演示同学戊', userId: 'U10005', itemName: '番茄牛腩饭', merchantName: '中南林业科技大学林海餐厅', rating: 4, content: '演示评价（非真实用户评价）：用于展示隐藏和恢复状态。', images: [], status: 'hidden', riskLevel: 'low', reason: '演示申诉处理中', createdAt: '2026-07-22 12:00' },
];

const seedImports: ImportJob[] = [
  { id: 'IMP-260722-01', fileName: '中南林餐饮POI候选.csv', type: 'merchants', status: 'completed', progress: 100, total: 11, success: 11, failed: 0, createdBy: '林老师', createdAt: '2026-07-22 11:20' },
  { id: 'IMP-260722-02', fileName: '演示菜品目录.csv', type: 'menu_items', status: 'completed', progress: 100, total: 96, success: 96, failed: 0, createdBy: '林老师', createdAt: '2026-07-22 11:35' },
];

const seedAudits: AuditLog[] = [
  { id: 'A001', actorId: 'admin-001', targetType: 'review', action: 'review.publish', target: 'R26071718', createdAt: '2026-07-18 10:18', detail: '{\n  "reason": "人工复核后通过"\n}' },
  { id: 'A002', actorId: 'admin-002', targetType: 'review', action: 'review.reject', target: 'R26071709', createdAt: '2026-07-18 09:45', detail: '{\n  "reason": "包含无关营销信息"\n}' },
  { id: 'A003', actorId: 'admin-001', targetType: 'merchant', action: 'merchant.update', target: 'M002', createdAt: '2026-07-22 11:56', detail: '{\n  "fields": ["address", "latitude", "longitude", "name"]\n}' },
  { id: 'A004', actorId: 'admin-003', targetType: 'menu_item', action: 'menu_item.update', target: 'D004', createdAt: '2026-07-22 11:52', detail: '{\n  "fields": ["description"]\n}' },
  { id: 'A005', actorId: 'admin-001', targetType: 'import', action: 'import.merchants', target: 'IMP-260722-01', createdAt: '2026-07-22 11:20', detail: '{\n  "success": 11,\n  "failed": 0\n}' },
  { id: 'A006', actorId: 'admin-001', targetType: 'menu_item', action: 'menu_item.status.online', target: 'D001', createdAt: '2026-07-22 11:40', detail: '{}' },
];

interface MockState {
  users: CampusUser[];
  merchants: Merchant[];
  items: MenuItem[];
  tags: TagDefinition[];
  reviews: Review[];
  imports: ImportJob[];
  audits: AuditLog[];
}

const storageKey = 'campus-foodie-admin-mock-state-v4';

function createSeedState(): MockState {
  return {
    users: structuredClone(seedUsers),
    merchants: structuredClone(seedMerchants),
    items: structuredClone(seedItems),
    tags: structuredClone(seedTags),
    reviews: structuredClone(seedReviews),
    imports: structuredClone(seedImports),
    audits: structuredClone(seedAudits),
  };
}

function loadState(): MockState {
  if (typeof localStorage === 'undefined') return createSeedState();
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return createSeedState();
    const parsed = JSON.parse(value) as Partial<MockState>;
    const seed = createSeedState();
    return {
      users: Array.isArray(parsed.users) ? parsed.users : seed.users,
      merchants: Array.isArray(parsed.merchants) ? parsed.merchants : seed.merchants,
      items: Array.isArray(parsed.items) ? parsed.items : seed.items,
      tags: Array.isArray(parsed.tags) ? parsed.tags : seed.tags,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : seed.reviews,
      imports: Array.isArray(parsed.imports) ? parsed.imports : seed.imports,
      audits: Array.isArray(parsed.audits) ? parsed.audits : seed.audits,
    };
  } catch {
    return createSeedState();
  }
}

let state = loadState();

function saveState() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(state));
}

function wait(ms = 180) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mirrors the server keyset contract with a positional cursor so the UI exercises the same paging path. */
function cursorSlice<T>(items: T[], query: CursorQuery, total?: number): CursorPage<T> {
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);
  const start = Number.parseInt(query.cursor ?? '', 10) || 0;
  const visible = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return {
    items: structuredClone(visible),
    nextCursor: hasMore ? String(start + limit) : null,
    hasMore,
    total,
  };
}

function includes(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function currentTags() {
  return state.tags.map((tag) => ({
    ...tag,
    usageCount: state.items.filter((item) => item.tags.includes(tag.name)).length,
  }));
}

function audit(targetType: string, action: string, target: string, detail: Record<string, unknown>) {
  state.audits.unshift({
    id: `A${Date.now()}`,
    actorId: admin.id,
    targetType,
    action,
    target,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-'),
    detail: JSON.stringify(detail, null, 2),
  });
}

export const mockApi = {
  async login(username: string, password: string): Promise<LoginResult> {
    await wait(320);
    if (username !== 'admin' || password !== 'admin123') throw new Error('账号或密码错误，请使用演示账号登录');
    return {
      accessToken: `mock-admin-access-${Date.now()}`,
      refreshToken: `mock-admin-refresh-${Date.now()}`,
      user: admin,
    };
  },

  async dashboard(): Promise<DashboardData> {
    await wait();
    return {
      users: state.users.length,
      merchants: state.merchants.filter((item) => item.status === 'online').length,
      menuItems: state.items.filter((item) => item.status === 'online').length,
      pendingReviews: state.reviews.filter((item) => item.status === 'pending_manual').length,
      recentReviews: structuredClone(state.reviews.slice(0, 4)),
    };
  },

  async users(query: UserListQuery): Promise<CursorPage<CampusUser>> {
    await wait();
    const keyword = query.search?.trim() ?? '';
    const filtered = state.users.filter((item) =>
      (!keyword || includes(item.username, keyword) || includes(item.email, keyword)) &&
      (query.active === undefined || (item.status !== 'frozen') === query.active),
    );
    return cursorSlice(filtered, query);
  },

  async updateUser(id: string, status: EntityStatus): Promise<CampusUser> {
    await wait();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error('用户不存在');
    user.status = status;
    audit('user', status === 'frozen' ? 'user.deactivate' : 'user.activate', user.id, {});
    saveState();
    return structuredClone(user);
  },

  async resetPassword(id: string): Promise<void> {
    await wait();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error('用户不存在');
    audit('user', 'user.password_reset_requested', user.id, { email: user.email });
    saveState();
  },

  async merchants(query: MerchantListQuery): Promise<CursorPage<Merchant>> {
    await wait();
    const keyword = query.search?.trim() ?? '';
    const filtered = state.merchants.filter((item) =>
      (!keyword || includes(item.name, keyword)) &&
      (query.active === undefined || (item.status === 'online') === query.active),
    );
    return cursorSlice(filtered, query);
  },

  async saveMerchant(input: Partial<Merchant> & Pick<Merchant, 'name'>): Promise<Merchant> {
    await wait();
    const existing = input.id ? state.merchants.find((item) => item.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) });
      audit('merchant', 'merchant.update', existing.id, { fields: Object.keys(input).sort() });
      saveState();
      return structuredClone(existing);
    }
    const merchant: Merchant = {
      id: `M${String(Date.now()).slice(-6)}`,
      campusId: input.campusId,
      areaId: input.areaId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      area: input.area ?? '未分区',
      category: input.category ?? '其他',
      address: input.address ?? '',
      latitude: input.latitude,
      longitude: input.longitude,
      priceLevel: input.priceLevel,
      status: input.status ?? 'offline',
      rating: 0,
      dishCount: 0,
      favoriteCount: 0,
      openingHours: input.openingHours ?? '10:00-20:00',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.merchants.unshift(merchant);
    audit('merchant', 'merchant.create', merchant.id, {});
    saveState();
    return structuredClone(merchant);
  },

  async updateMerchantStatus(id: string, status: PublishStatus): Promise<void> {
    await wait();
    const merchant = state.merchants.find((item) => item.id === id);
    if (!merchant) throw new Error('商家不存在');
    merchant.status = status;
    audit('merchant', `merchant.status.${status}`, merchant.id, {});
    saveState();
  },

  async tags(): Promise<TagDefinition[]> {
    await wait();
    return structuredClone(currentTags());
  },

  async catalogMetadata(): Promise<CatalogMetadata> {
    await wait();
    return {
      areas: structuredClone(mockCatalogAreas),
      categories: structuredClone(mockCatalogCategories),
      tags: structuredClone(currentTags()),
    };
  },

  async saveTag(input: Partial<TagDefinition> & Pick<TagDefinition, 'name' | 'kind'>): Promise<TagDefinition> {
    await wait();
    const duplicate = state.tags.find((tag) =>
      tag.id !== input.id && tag.kind === input.kind && tag.name === input.name.trim(),
    );
    if (duplicate) throw new Error('同一类型下已存在同名标签');
    const existing = input.id ? state.tags.find((tag) => tag.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, { name: input.name.trim(), kind: input.kind });
      audit('tag', 'tag.update', existing.id, { fields: ['kind', 'name'] });
      saveState();
      return structuredClone(existing);
    }
    const tag: TagDefinition = {
      id: `T${String(Date.now()).slice(-6)}`,
      campusId: input.campusId || admin.campusId,
      name: input.name.trim(),
      kind: input.kind,
      usageCount: 0,
    };
    state.tags.unshift(tag);
    audit('tag', 'tag.create', tag.id, { kind: tag.kind });
    saveState();
    return structuredClone(tag);
  },

  async deleteTag(id: string): Promise<void> {
    await wait();
    const tag = state.tags.find((entry) => entry.id === id);
    if (!tag) throw new Error('标签不存在');
    if (state.items.some((item) => item.tags.includes(tag.name))) {
      throw new Error('标签正被菜品使用，不能删除');
    }
    state.tags = state.tags.filter((entry) => entry.id !== id);
    audit('tag', 'tag.delete', tag.id, {});
    saveState();
  },

  async menuItems(query: MenuItemListQuery): Promise<CursorPage<MenuItem>> {
    await wait();
    const filtered = state.items.filter((item) =>
      (!query.merchantId || item.merchantId === query.merchantId) &&
      (query.active === undefined || (item.status === 'online') === query.active),
    );
    return cursorSlice(filtered, query);
  },

  async saveMenuItem(input: Partial<MenuItem> & Pick<MenuItem, 'name' | 'merchantId'>): Promise<MenuItem> {
    await wait();
    const merchant = state.merchants.find((item) => item.id === input.merchantId);
    if (!merchant) throw new Error('请选择有效商家');
    const existing = input.id ? state.items.find((item) => item.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { merchantName: merchant.name, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) });
      audit('menu_item', 'menu_item.update', existing.id, { fields: Object.keys(input).sort() });
      saveState();
      return structuredClone(existing);
    }
    const item: MenuItem = {
      id: `D${String(Date.now()).slice(-6)}`,
      campusId: input.campusId || admin.campusId,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      merchantId: merchant.id,
      merchantName: merchant.name,
      type: input.type ?? 'dish',
      category: input.category ?? '其他',
      price: input.price ?? 0,
      rating: 0,
      reviewCount: 0,
      status: input.status ?? 'offline',
      tags: input.tags ?? [],
      imageUrl: input.imageUrl,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.items.unshift(item);
    merchant.dishCount += 1;
    audit('menu_item', 'menu_item.create', item.id, { merchant_id: merchant.id });
    saveState();
    return structuredClone(item);
  },

  async updateMenuItemStatus(id: string, status: PublishStatus): Promise<void> {
    await wait();
    const item = state.items.find((entry) => entry.id === id);
    if (!item) throw new Error('菜品不存在');
    item.status = status;
    audit('menu_item', `menu_item.status.${status}`, item.id, {});
    saveState();
  },

  async reviews(query: ReviewListQuery): Promise<CursorPage<Review>> {
    await wait();
    const filtered = state.reviews.filter((item) => !query.status || item.status === query.status);
    return cursorSlice(filtered, query, filtered.length);
  },

  async moderateReview(id: string, action: ReviewAction, reason?: string): Promise<void> {
    await wait();
    const review = state.reviews.find((item) => item.id === id);
    if (!review) throw new Error('评价不存在');
    if (action === 'restore' && review.status !== 'hidden') throw new Error('只有已隐藏的评价可以恢复发布');
    if ((action === 'reject' || action === 'hide') && !reason?.trim()) throw new Error('驳回或下架必须填写原因');
    review.status = action === 'reject' ? 'rejected' : action === 'hide' ? 'hidden' : 'published';
    review.riskLevel = review.status === 'rejected' ? 'high' : 'low';
    review.reason = reason?.trim() || undefined;
    audit('review', `review.${action}`, review.id, { reason: reason ?? '' });
    saveState();
  },

  async validateImport(file: File, type: ImportJob['type']): Promise<ImportValidation> {
    await wait(500);
    if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('仅支持 CSV 文件');
    const total = Math.max(8, Math.round(file.size / 120));
    return {
      total,
      valid: Math.max(0, total - 2),
      invalid: Math.min(2, total),
      errors: [
        { row: 4, field: type === 'menu_items' ? 'price_cents' : 'address', message: type === 'menu_items' ? '必须是整数' : '必填字段不能为空' },
        { row: 7, field: 'category_id', message: '品类不属于当前校园' },
      ],
    };
  },

  async startImport(file: File, type: ImportJob['type'], validation: ImportValidation): Promise<ImportJob> {
    await wait(400);
    const job: ImportJob = {
      id: `IMP-${Date.now()}`,
      fileName: file.name,
      type,
      status: 'completed',
      progress: 100,
      total: validation.total,
      success: validation.valid,
      failed: validation.invalid,
      createdBy: admin.username,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.imports.unshift(job);
    audit('import', `import.${type}`, job.id, { success: job.success, failed: job.failed });
    saveState();
    return structuredClone(job);
  },

  async importJobs(query: CursorQuery): Promise<CursorPage<ImportJob>> {
    await wait();
    return cursorSlice(state.imports, query);
  },

  async auditLogs(query: CursorQuery): Promise<CursorPage<AuditLog>> {
    await wait();
    return cursorSlice(state.audits, query);
  },
};
