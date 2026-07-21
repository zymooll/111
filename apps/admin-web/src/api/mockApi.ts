import type {
  AdminUser,
  AuditLog,
  AuditQuery,
  CampusUser,
  CatalogMetadata,
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
  { id: 'M001', areaId: 'mock-area-linhai', categoryId: 'mock-category-campus', name: '中南林业科技大学林海餐厅', description: '高德 POI B0FFK85GDN；菜单与评分为演示生成。', area: '林海餐厅及周边档口', category: '校园食堂', address: '青园路357号东北80米', latitude: 28.135160, longitude: 112.989410, status: 'online', rating: 4.8, dishCount: 1, favoriteCount: 48, openingHours: '07:00-21:00', contact: '待现场核验', updatedAt: '2026-07-22 12:00' },
  { id: 'M002', areaId: 'mock-area-east', categoryId: 'mock-category-campus', name: '林语餐厅', description: '高德 POI B0FFHS6IE6；菜单与评分为演示生成。', area: '东园餐饮区', category: '校园食堂', address: '中南林业科技大学林大路105号(近常青公寓)', latitude: 28.136507, longitude: 112.988280, status: 'online', rating: 4.7, dishCount: 2, favoriteCount: 36, openingHours: '07:00-21:00', contact: '待现场核验', updatedAt: '2026-07-22 12:00' },
  { id: 'M003', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '中南林业科技大学林苑餐厅', description: '高德 POI B0FFH6K3IJ；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '中南林业科技大学北门南220米', latitude: 28.133670, longitude: 112.987409, status: 'online', rating: 4.8, dishCount: 1, favoriteCount: 41, openingHours: '07:00-21:00', contact: '待现场核验', updatedAt: '2026-07-22 12:00' },
  { id: 'M004', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '林涛餐厅', description: '高德 POI B0FFIIUFLZ；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '中南林业科技大学西园14栋', latitude: 28.133036, longitude: 112.984693, status: 'online', rating: 4.6, dishCount: 1, favoriteCount: 29, openingHours: '07:00-21:00', contact: '待现场核验', updatedAt: '2026-07-22 12:00' },
  { id: 'M005', areaId: 'mock-area-west', categoryId: 'mock-category-campus', name: '林冠餐厅', description: '高德 POI B0FFIZQWMY；菜单与评分为演示生成。', area: '西园及后街餐饮区', category: '校园食堂', address: '韶山南路498号中南林业科技大学', latitude: 28.132689, longitude: 112.984888, status: 'online', rating: 4.5, dishCount: 1, favoriteCount: 27, openingHours: '07:00-21:00', contact: '待现场核验', updatedAt: '2026-07-22 12:00' },
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
  { id: 'R26072201', userName: '演示同学甲', userId: 'U10001', itemName: '番茄牛腩饭', merchantName: '中南林业科技大学林海餐厅', rating: 5, content: '演示评价（非真实用户评价）：番茄风味和牛腩口感用于展示推荐结果。', images: [], status: 'pending_manual', riskLevel: 'low', createdAt: '2026-07-22 12:10' },
  { id: 'R26072202', userName: '演示同学乙', userId: 'U10003', itemName: '菌菇鸡汤面', merchantName: '林语餐厅', rating: 4, content: '演示评价（非真实用户评价）：清淡汤面用于展示口味标签和审核流程。', images: [], status: 'pending_manual', riskLevel: 'low', createdAt: '2026-07-22 12:08' },
  { id: 'R26072203', userName: '演示同学丙', userId: 'U10002', itemName: '鸡胸时蔬能量碗', merchantName: '中南林业科技大学林苑餐厅', rating: 5, content: '演示评价（非真实用户评价）：蛋白质和蔬菜搭配用于展示偏好匹配。', images: [], status: 'published', riskLevel: 'low', createdAt: '2026-07-22 12:06' },
  { id: 'R26072204', userName: '演示同学丁', userId: 'U10006', itemName: '新奥尔良鸡扒饭', merchantName: '林涛餐厅', rating: 4, content: '演示评价（非真实用户评价）：价格、分量和出餐时间均为模拟值。', images: [], status: 'published', riskLevel: 'low', createdAt: '2026-07-22 12:04' },
  { id: 'R26072205', userName: '匿名用户', userId: 'U10007', itemName: '菌菇鸡汤面', merchantName: '林语餐厅', rating: 1, content: '演示评价（非真实用户评价）：该审核样本包含疑似广告联系方式，需要人工复核。', images: [], status: 'rejected', riskLevel: 'high', reason: '包含营销及联系方式', createdAt: '2026-07-22 12:02' },
  { id: 'R26072206', userName: '演示同学戊', userId: 'U10005', itemName: '番茄牛腩饭', merchantName: '中南林业科技大学林海餐厅', rating: 4, content: '演示评价（非真实用户评价）：用于展示隐藏和申诉状态。', images: [], status: 'hidden', riskLevel: 'low', reason: '演示申诉处理中', createdAt: '2026-07-22 12:00' },
];

const seedImports: ImportJob[] = [
  { id: 'IMP-260722-01', fileName: '中南林餐饮POI候选.csv', type: 'merchants', status: 'completed', progress: 100, total: 11, success: 11, failed: 0, createdBy: '林老师', createdAt: '2026-07-22 11:20' },
  { id: 'IMP-260722-02', fileName: '演示菜品目录.csv', type: 'menu_items', status: 'completed', progress: 100, total: 96, success: 96, failed: 0, createdBy: '林老师', createdAt: '2026-07-22 11:35' },
];

const seedAudits: AuditLog[] = [
  { id: 'A001', actor: '林老师', role: '超级管理员', module: '评价', action: '通过评价', target: 'R26071718', ip: '10.12.8.21', createdAt: '2026-07-18 10:18', detail: '人工复核后通过，评价已公开展示。' },
  { id: 'A002', actor: '周审核员', role: '评价审核员', module: '评价', action: '驳回评价', target: 'R26071709', ip: '10.12.8.34', createdAt: '2026-07-18 09:45', detail: '驳回原因：包含无关营销信息。' },
  { id: 'A003', actor: '林老师', role: '超级管理员', module: '商家', action: '更新商家', target: '林语餐厅', ip: '10.12.8.21', createdAt: '2026-07-22 11:56', detail: '更新高德 POI 名称、地址和两套坐标。' },
  { id: 'A004', actor: '陈管理员', role: '校园管理员', module: '菜品', action: '更新菜品', target: '新奥尔良鸡扒饭', ip: '10.12.9.17', createdAt: '2026-07-22 11:52', detail: '标记为演示生成菜单，实际供应以现场为准。' },
  { id: 'A005', actor: '林老师', role: '超级管理员', module: '导入', action: '执行 CSV 导入', target: '中南林餐饮POI候选.csv', ip: '10.12.8.21', createdAt: '2026-07-22 11:20', detail: '共 11 行，成功 11 行，失败 0 行。' },
  { id: 'A006', actor: '系统', role: '系统任务', module: '系统', action: '重算商家评分', target: '中南林业科技大学林海餐厅', ip: '127.0.0.1', createdAt: '2026-07-22 11:40', detail: '演示评价写入后完成贝叶斯评分重算。' },
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

const storageKey = 'campus-foodie-admin-mock-state-v3';

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

function paginate<T>(items: T[], query: ListQuery): PageResult<T> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length };
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

function currentCategoryShare(): DashboardData['categoryShare'] {
  const counts = new Map<string, number>();
  state.items.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
  const total = Math.max(1, state.items.length);
  const colors = ['#1677ff', '#52c41a', '#13c2c2', '#faad14', '#b37feb'];
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .map(([name, count], index) => ({
      name,
      value: Math.round(count / total * 100),
      color: colors[index % colors.length],
    }));
}

function audit(module: AuditLog['module'], action: string, target: string, detail: string) {
  state.audits.unshift({
    id: `A${Date.now()}`,
    actor: admin.name,
    role: '超级管理员',
    module,
    action,
    target,
    ip: '127.0.0.1',
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-'),
    detail,
  });
}

export const mockApi = {
  async login(username: string, password: string): Promise<LoginResult> {
    await wait(320);
    if (username !== 'admin' || password !== 'admin123') throw new Error('账号或密码错误，请使用演示账号登录');
    return { accessToken: `mock-admin-token-${Date.now()}`, user: admin };
  },

  async dashboard(): Promise<DashboardData> {
    await wait();
    const pending = state.reviews.filter((item) => item.status === 'pending_manual').length;
    return {
      users: state.users.length,
      merchants: state.merchants.length,
      menuItems: state.items.length,
      pendingReviews: pending,
      userGrowth: 0,
      merchantGrowth: 0,
      weeklyTraffic: [
        { date: '周一', views: 8420, recommendations: 5210 }, { date: '周二', views: 9120, recommendations: 5680 },
        { date: '周三', views: 10540, recommendations: 6240 }, { date: '周四', views: 9860, recommendations: 6010 },
        { date: '周五', views: 12680, recommendations: 7560 }, { date: '周六', views: 11240, recommendations: 6980 },
        { date: '周日', views: 10890, recommendations: 6740 },
      ],
      categoryShare: currentCategoryShare(),
      recentReviews: state.reviews.slice(0, 4),
      popularItems: [
        { name: '番茄牛腩饭', merchant: '中南林业科技大学林海餐厅', views: 5280, rating: 4.8 },
        { name: '菌菇鸡汤面', merchant: '林语餐厅', views: 4310, rating: 4.7 },
        { name: '鸡胸时蔬能量碗', merchant: '中南林业科技大学林苑餐厅', views: 2980, rating: 4.8 },
        { name: '新奥尔良鸡扒饭', merchant: '林涛餐厅', views: 2150, rating: 4.6 },
      ],
    };
  },

  async users(query: ListQuery): Promise<PageResult<CampusUser>> {
    await wait();
    const keyword = query.keyword?.trim() ?? '';
    const filtered = state.users.filter((item) =>
      (!keyword || includes(item.username, keyword) || includes(item.email, keyword) || includes(item.id, keyword)) &&
      (!query.status || item.status === query.status),
    );
    return paginate(filtered, query);
  },

  async updateUser(id: string, status: EntityStatus): Promise<CampusUser> {
    await wait();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error('用户不存在');
    user.status = status;
    audit('用户', status === 'frozen' ? '冻结用户' : '恢复用户', user.username, `账号状态更新为 ${status}。`);
    saveState();
    return structuredClone(user);
  },

  async resetPassword(id: string): Promise<void> {
    await wait();
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new Error('用户不存在');
    audit('用户', '触发密码重置', user.username, `密码重置邮件已发送至 ${user.email}。`);
    saveState();
  },

  async merchants(query: ListQuery): Promise<PageResult<Merchant>> {
    await wait();
    const keyword = query.keyword?.trim() ?? '';
    const filtered = state.merchants.filter((item) =>
      (!keyword || includes(item.name, keyword) || includes(item.area, keyword) || includes(item.category, keyword)) &&
      (!query.status || item.status === query.status),
    );
    return paginate(filtered, query);
  },

  async saveMerchant(input: Partial<Merchant> & Pick<Merchant, 'name'>): Promise<Merchant> {
    await wait();
    const existing = input.id ? state.merchants.find((item) => item.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) });
      audit('商家', '更新商家', existing.name, '更新商家基本信息。');
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
      status: input.status ?? 'draft',
      rating: 0,
      dishCount: 0,
      favoriteCount: 0,
      openingHours: input.openingHours ?? '10:00-20:00',
      contact: input.contact ?? '',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.merchants.unshift(merchant);
    audit('商家', '新增商家', merchant.name, '创建商家草稿。');
    saveState();
    return structuredClone(merchant);
  },

  async updateMerchantStatus(id: string, status: PublishStatus): Promise<void> {
    await wait();
    const merchant = state.merchants.find((item) => item.id === id);
    if (!merchant) throw new Error('商家不存在');
    merchant.status = status;
    audit('商家', status === 'online' ? '上架商家' : '下架商家', merchant.name, `商家状态更新为 ${status}。`);
    saveState();
  },

  async deleteMerchant(id: string): Promise<void> {
    await wait();
    const merchant = state.merchants.find((item) => item.id === id);
    if (!merchant) throw new Error('商家不存在');
    if (merchant.status === 'online') throw new Error('请先下架商家再删除');
    state.merchants = state.merchants.filter((item) => item.id !== id);
    state.items = state.items.filter((item) => item.merchantId !== id);
    audit('商家', '删除商家', merchant.name, '商家档案已软删除，关联菜品同步停止展示。');
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
      audit('标签', '更新标签', existing.name, `标签类型更新为 ${existing.kind}。`);
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
    audit('标签', '新增标签', tag.name, `标签类型：${tag.kind}。`);
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
    audit('标签', '删除标签', tag.name, '标签已从校园字典中删除。');
    saveState();
  },

  async menuItems(query: ListQuery): Promise<PageResult<MenuItem>> {
    await wait();
    const keyword = query.keyword?.trim() ?? '';
    const filtered = state.items.filter((item) =>
      (!keyword || includes(item.name, keyword) || includes(item.merchantName, keyword) || includes(item.category, keyword)) &&
      (!query.status || item.status === query.status),
    );
    return paginate(filtered, query);
  },

  async saveMenuItem(input: Partial<MenuItem> & Pick<MenuItem, 'name' | 'merchantId'>): Promise<MenuItem> {
    await wait();
    const merchant = state.merchants.find((item) => item.id === input.merchantId);
    if (!merchant) throw new Error('请选择有效商家');
    const existing = input.id ? state.items.find((item) => item.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input, { merchantName: merchant.name, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) });
      audit('菜品', '更新菜品', existing.name, '更新菜品或套餐信息。');
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
      status: input.status ?? 'draft',
      tags: input.tags ?? [],
      imageUrl: input.imageUrl,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.items.unshift(item);
    merchant.dishCount += 1;
    audit('菜品', '新增菜品', item.name, `归属商家：${merchant.name}。`);
    saveState();
    return structuredClone(item);
  },

  async updateMenuItemStatus(id: string, status: PublishStatus): Promise<void> {
    await wait();
    const item = state.items.find((entry) => entry.id === id);
    if (!item) throw new Error('菜品不存在');
    item.status = status;
    audit('菜品', status === 'online' ? '上架菜品' : '下架菜品', item.name, `菜品状态更新为 ${status}。`);
    saveState();
  },

  async deleteMenuItem(id: string): Promise<void> {
    await wait();
    const item = state.items.find((entry) => entry.id === id);
    if (!item) throw new Error('菜品不存在');
    if (item.status === 'online') throw new Error('请先下架菜品再删除');
    state.items = state.items.filter((entry) => entry.id !== id);
    const merchant = state.merchants.find((entry) => entry.id === item.merchantId);
    if (merchant) merchant.dishCount = Math.max(0, merchant.dishCount - 1);
    audit('菜品', '删除菜品', item.name, '菜品档案已软删除，历史评价和审计记录继续保留。');
    saveState();
  },

  async reviews(query: ReviewQuery): Promise<PageResult<Review>> {
    await wait();
    const keyword = query.keyword?.trim() ?? '';
    const filtered = state.reviews.filter((item) =>
      (!keyword || includes(item.content, keyword) || includes(item.userName, keyword) || includes(item.itemName, keyword)) &&
      (!query.status || item.status === query.status) &&
      (!query.riskLevel || item.riskLevel === query.riskLevel) &&
      (!query.rating || item.rating === query.rating),
    );
    return paginate(filtered, query);
  },

  async reviewAction(id: string, status: ReviewStatus, reason?: string): Promise<void> {
    await wait();
    const review = state.reviews.find((item) => item.id === id);
    if (!review) throw new Error('评价不存在');
    review.status = status;
    review.reason = reason;
    const action = status === 'published' ? '通过评价' : status === 'hidden' ? '下架评价' : '驳回评价';
    audit('评价', action, review.id, reason || '人工复核完成。');
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
        { row: 4, field: type === 'menu_items' ? 'price' : 'address', message: type === 'menu_items' ? '价格必须为非负数字' : '地址不能为空' },
        { row: 7, field: 'category', message: '未找到对应分类，请检查字典值' },
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
      createdBy: admin.name,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    state.imports.unshift(job);
    audit('导入', '执行 CSV 导入', file.name, `共 ${job.total} 行，成功 ${job.success} 行，失败 ${job.failed} 行。`);
    saveState();
    return structuredClone(job);
  },

  async importJobs(): Promise<ImportJob[]> {
    await wait();
    return structuredClone(state.imports);
  },

  async auditLogs(query: AuditQuery): Promise<PageResult<AuditLog>> {
    await wait();
    const keyword = query.keyword?.trim() ?? '';
    const filtered = state.audits.filter((item) =>
      (!keyword || includes(item.actor, keyword) || includes(item.action, keyword) || includes(item.target, keyword)) &&
      (!query.module || item.module === query.module),
    );
    return paginate(filtered, query);
  },
};
