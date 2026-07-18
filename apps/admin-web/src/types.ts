export type AdminRole = 'super_admin' | 'campus_admin' | 'review_moderator';
export type EntityStatus = 'active' | 'frozen' | 'unverified';
export type PublishStatus = 'online' | 'offline' | 'draft';
export type ReviewStatus = 'pending_machine' | 'pending_manual' | 'published' | 'rejected' | 'hidden';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
  campusId: string;
  campusName: string;
}

export interface LoginResult {
  accessToken: string;
  user: AdminUser;
}

export interface DashboardData {
  users: number;
  merchants: number;
  menuItems: number;
  pendingReviews: number;
  userGrowth: number;
  merchantGrowth: number;
  weeklyTraffic: Array<{ date: string; views: number; recommendations: number }>;
  categoryShare: Array<{ name: string; value: number; color: string }>;
  recentReviews: Review[];
  popularItems: Array<{ name: string; merchant: string; views: number; rating: number }>;
}

export interface CampusUser {
  id: string;
  username: string;
  email: string;
  status: EntityStatus;
  reviewCount: number;
  impactViews: number;
  favoriteCount: number;
  createdAt: string;
  lastActive: string;
  dietaryTags: string[];
}

export interface Merchant {
  id: string;
  campusId?: string;
  areaId?: string;
  categoryId?: string;
  name: string;
  description?: string;
  area: string;
  category: string;
  address: string;
  latitude?: number;
  longitude?: number;
  priceLevel?: number;
  status: PublishStatus;
  rating: number;
  dishCount: number;
  favoriteCount: number;
  openingHours: string;
  contact: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  campusId?: string;
  name: string;
  description?: string;
  categoryId?: string;
  imageUrl?: string;
  merchantId: string;
  merchantName: string;
  type: 'dish' | 'combo';
  category: string;
  price: number;
  rating: number;
  reviewCount: number;
  status: PublishStatus;
  tags: string[];
  updatedAt: string;
}

export interface TagDefinition {
  id: string;
  campusId: string;
  name: string;
  kind: string;
  usageCount?: number;
  updatedAt?: string;
}

export interface Review {
  id: string;
  userName: string;
  userId: string;
  itemName: string;
  merchantName: string;
  rating: number;
  content: string;
  images: string[];
  status: ReviewStatus;
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: string;
  reason?: string;
}

export interface ImportValidation {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

export interface ImportJob {
  id: string;
  fileName: string;
  type: 'areas' | 'merchants' | 'menu_items';
  status: 'validating' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  success: number;
  failed: number;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  role: string;
  module: '用户' | '商家' | '菜品' | '标签' | '评价' | '导入' | '系统';
  action: string;
  target: string;
  ip: string;
  createdAt: string;
  detail: string;
}

export interface CatalogMetadata {
  areas: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  tags: TagDefinition[];
}

export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface ListQuery {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReviewQuery extends ListQuery {
  riskLevel?: string;
  rating?: number;
}

export interface AuditQuery extends ListQuery {
  module?: string;
}
