export type AdminRole = 'super_admin' | 'campus_admin' | 'review_moderator';
export type EntityStatus = 'active' | 'frozen' | 'unverified';
export type PublishStatus = 'online' | 'offline';
export type ReviewStatus = 'pending_machine' | 'pending_manual' | 'published' | 'rejected' | 'hidden';
export type ReviewAction = 'publish' | 'reject' | 'hide' | 'restore';
export type RiskLevel = 'low' | 'medium' | 'high';

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
  refreshToken: string;
  user: AdminUser;
}

export interface DashboardData {
  users: number;
  merchants: number;
  menuItems: number;
  pendingReviews: number;
  recentReviews: Review[];
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
  riskLevel: RiskLevel;
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
  actorId: string;
  targetType: string;
  action: string;
  target: string;
  createdAt: string;
  detail: string;
}

export interface CatalogMetadata {
  areas: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  tags: TagDefinition[];
}

/** Keyset page shape shared by every admin list endpoint; `total` only exists where the API reports it. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface CursorQuery {
  cursor?: string | null;
  limit?: number;
}

export interface UserListQuery extends CursorQuery {
  search?: string;
  active?: boolean;
}

export interface MerchantListQuery extends CursorQuery {
  search?: string;
  active?: boolean;
}

export interface MenuItemListQuery extends CursorQuery {
  merchantId?: string;
  active?: boolean;
}

export interface ReviewListQuery extends CursorQuery {
  status?: ReviewStatus;
}
