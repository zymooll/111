import type { Dish, Merchant, Review, TreeOption, User } from '../types'

export const categoryTree: TreeOption[] = [
  {
    id: 'staple', label: '主食', icon: '🍚', children: [
      { id: 'rice', label: '米饭套餐', icon: '🍱' },
      { id: 'noodle', label: '面食粉类', icon: '🍜' },
      { id: 'burger', label: '汉堡简餐', icon: '🍔' }
    ]
  },
  {
    id: 'snack', label: '小吃', icon: '🥟', children: [
      { id: 'street', label: '街头小吃', icon: '🥠' },
      { id: 'bakery', label: '烘焙点心', icon: '🥐' },
      { id: 'late-night', label: '夜宵烧烤', icon: '🍢' }
    ]
  },
  {
    id: 'drink', label: '饮品', icon: '🧋', children: [
      { id: 'tea', label: '茶饮咖啡', icon: '☕' },
      { id: 'juice', label: '果汁酸奶', icon: '🥤' }
    ]
  },
  {
    id: 'healthy', label: '轻食', icon: '🥗', children: [
      { id: 'salad', label: '沙拉轻食', icon: '🥗' },
      { id: 'vegetarian', label: '素食窗口', icon: '🥬' }
    ]
  }
]

export const areaTree: TreeOption[] = [
  {
    id: 'east-zone', label: '东园餐饮区', icon: '🏫', children: [
      { id: 'linhai-canteen', label: '林海餐厅', icon: '①' },
      { id: 'linyu-canteen', label: '林语餐厅', icon: '②' }
    ]
  },
  {
    id: 'west-zone', label: '西园餐饮区', icon: '🌳', children: [
      { id: 'linyuan-canteen', label: '林苑餐厅', icon: '③' },
      { id: 'lintao-canteen', label: '林涛餐厅', icon: '④' },
      { id: 'linguan-canteen', label: '林冠餐厅', icon: '⑤' },
      { id: 'student-five-canteen', label: '学生五食堂', icon: '⑥' }
    ]
  },
  {
    id: 'campus-gates', label: '校门生活圈', icon: '🚪', children: [
      { id: 'west-backstreet', label: '西园后街', icon: '🍜' },
      { id: 'campus-shops', label: '校内商业点', icon: '☕' }
    ]
  }
]

export const merchants: Merchant[] = [
  { id: 'm1', isDemo: true, name: '中南林业科技大学林海餐厅', areaId: 'linhai-canteen', area: '青园路357号东北80米', categoryId: 'rice', category: '米饭套餐', priceLevel: 1, averagePrice: 16, rating: 4.8, reviewCount: 32, openUntil: '21:00', distance: 26, latitude: 28.131782, longitude: 112.995009, position: { x: 82, y: 42 }, tags: ['综合食堂', '东园'] },
  { id: 'm2', isDemo: true, name: '林语餐厅', areaId: 'linyu-canteen', area: '林大路105号（近常青公寓）', categoryId: 'noodle', category: '面食粉类', priceLevel: 1, averagePrice: 14, rating: 4.7, reviewCount: 24, openUntil: '21:00', distance: 201, latitude: 28.133125, longitude: 112.993875, position: { x: 66, y: 25 }, tags: ['粉面', '东园'] },
  { id: 'm3', isDemo: true, name: '中南林业科技大学林苑餐厅', areaId: 'linyuan-canteen', area: '中南林业科技大学北门南220米', categoryId: 'salad', category: '轻食汤品', priceLevel: 1, averagePrice: 16, rating: 4.8, reviewCount: 28, openUntil: '21:00', distance: 235, latitude: 28.130286, longitude: 112.993001, position: { x: 55, y: 62 }, tags: ['综合食堂', '西园'] },
  { id: 'm4', isDemo: true, name: '林涛餐厅', areaId: 'lintao-canteen', area: '中南林业科技大学西园14栋', categoryId: 'rice', category: '米饭套餐', priceLevel: 1, averagePrice: 15, rating: 4.6, reviewCount: 21, openUntil: '21:00', distance: 502, latitude: 28.129644, longitude: 112.990275, position: { x: 18, y: 71 }, tags: ['综合食堂', '西园'] },
  { id: 'm5', isDemo: true, name: '林冠餐厅', areaId: 'linguan-canteen', area: '韶山南路498号中南林业科技大学', categoryId: 'late-night', category: '火锅烧烤', priceLevel: 1, averagePrice: 16, rating: 4.5, reviewCount: 19, openUntil: '21:00', distance: 503, latitude: 28.129298, longitude: 112.990471, position: { x: 21, y: 76 }, tags: ['综合食堂', '西园'] },
  { id: 'm6', isDemo: true, name: '中南林业科技大学学生五食堂', areaId: 'student-five-canteen', area: '韶山南路498号中南林业科技大学', categoryId: 'street', category: '校园简餐', priceLevel: 1, averagePrice: 14, rating: 4.6, reviewCount: 18, openUntil: '21:00', distance: 255, latitude: 28.130124, longitude: 112.992881, position: { x: 53, y: 64 }, tags: ['校园食堂', '西园'] }
]

export const dishes: Dish[] = [
  { id: 'd1', isDemo: true, merchantId: 'm1', name: '番茄牛腩饭', subtitle: '依据综合食堂类型生成的演示菜品，实际供应以现场为准', image: '/dishes/rice-bowl.svg', gallery: ['/dishes/rice-bowl.svg', '/dishes/energy-bowl.svg'], price: 18, rating: 4.8, reviewCount: 18, categoryId: 'rice', category: '米饭套餐', tags: ['酸甜', '高蛋白'], reason: '符合你的米饭与高蛋白偏好', match: 96, calories: 680, waitMinutes: 8, ingredients: ['牛腩', '番茄', '时蔬', '米饭'] },
  { id: 'd2', isDemo: true, merchantId: 'm2', name: '菌菇鸡汤面', subtitle: '依据粉面档口类型生成的演示菜品，实际供应以现场为准', image: '/dishes/noodles.svg', gallery: ['/dishes/noodles.svg', '/dishes/rice-bowl.svg'], price: 14, rating: 4.7, reviewCount: 15, categoryId: 'noodle', category: '面食粉类', tags: ['清淡', '热汤'], reason: '清淡暖胃，适合日常午餐', match: 94, calories: 560, waitMinutes: 6, ingredients: ['鸡肉', '菌菇', '面条', '青菜'] },
  { id: 'd3', isDemo: true, merchantId: 'm3', name: '鸡胸时蔬能量碗', subtitle: '依据综合餐饮类型生成的演示菜品，实际供应以现场为准', image: '/dishes/energy-bowl.svg', gallery: ['/dishes/energy-bowl.svg', '/dishes/rice-bowl.svg'], price: 18, rating: 4.8, reviewCount: 16, categoryId: 'salad', category: '轻食汤品', tags: ['高蛋白', '清淡'], reason: '匹配你的清淡与高蛋白偏好', match: 91, calories: 468, waitMinutes: 10, ingredients: ['鸡胸肉', '杂粮', '西兰花', '南瓜'] },
  { id: 'd4', isDemo: true, merchantId: 'm4', name: '新奥尔良鸡扒饭', subtitle: '依据校园食堂类型生成的演示菜品，实际供应以现场为准', image: '/dishes/rice-bowl.svg', gallery: ['/dishes/rice-bowl.svg', '/dishes/energy-bowl.svg'], price: 16, rating: 4.6, reviewCount: 13, categoryId: 'rice', category: '米饭套餐', tags: ['微辣', '高蛋白'], reason: '预算适中，适合赶课前快速用餐', match: 89, calories: 650, waitMinutes: 8, ingredients: ['鸡扒', '时蔬', '米饭'] },
  { id: 'd5', isDemo: true, merchantId: 'm5', name: '林冠骨汤麻辣烫', subtitle: '依据餐厅类型生成的演示菜品，实际供应以现场为准', image: '/dishes/skewers.svg', gallery: ['/dishes/skewers.svg', '/dishes/noodles.svg'], price: 18, rating: 4.5, reviewCount: 12, categoryId: 'late-night', category: '火锅烧烤', tags: ['香辣', '暖胃'], reason: '适合偏好香辣和自由搭配的用餐场景', match: 86, calories: 720, waitMinutes: 12, ingredients: ['时蔬', '豆制品', '丸类', '骨汤'] },
  { id: 'd6', isDemo: true, merchantId: 'm6', name: '五食堂番茄鸡蛋面', subtitle: '依据校园食堂类型生成的演示菜品，实际供应以现场为准', image: '/dishes/noodles.svg', gallery: ['/dishes/noodles.svg', '/dishes/rice-bowl.svg'], price: 11, rating: 4.6, reviewCount: 11, categoryId: 'noodle', category: '面食粉类', tags: ['清淡', '实惠'], reason: '符合你的日常预算和清淡口味', match: 84, calories: 520, waitMinutes: 6, ingredients: ['番茄', '鸡蛋', '面条', '青菜'] }
]

export const initialReviews: Review[] = [
  { id: 'r1', dishId: 'd1', userId: 'u2', userName: '演示同学甲', avatarText: '甲', rating: 5, content: '演示评价（非真实用户评价）：番茄风味浓，牛腩口感软，适合作为午餐示例。', images: ['/dishes/rice-bowl.svg'], createdAt: '演示数据', likes: 8, status: 'published' },
  { id: 'r2', dishId: 'd1', userId: 'u3', userName: '演示同学乙', avatarText: '乙', rating: 4, content: '演示评价（非真实用户评价）：分量设定适中，配菜结构适合功能展示。', images: [], createdAt: '演示数据', likes: 5, status: 'published' },
  { id: 'r3', dishId: 'd2', userId: 'u4', userName: '演示同学丙', avatarText: '丙', rating: 5, content: '演示评价（非真实用户评价）：汤面清淡暖胃，出餐时间为模拟值。', images: [], createdAt: '演示数据', likes: 4, status: 'published' },
  { id: 'r4', dishId: 'd3', userId: 'u5', userName: '演示同学丁', avatarText: '丁', rating: 5, content: '演示评价（非真实用户评价）：蛋白质和蔬菜搭配用于展示偏好匹配。', images: [], createdAt: '演示数据', likes: 3, status: 'published' }
]

export const demoUser: User = {
  id: 'u1', username: 'foodie', email: 'demo@campus-foodie.local', displayName: '演示用户', publishedReviews: 12, views: 2864
}

export function findTreeLabel(tree: TreeOption[], id?: string) {
  if (!id) return undefined
  for (const parent of tree) {
    if (parent.id === id) return parent.label
    const child = parent.children?.find((item) => item.id === id)
    if (child) return child.label
  }
  return undefined
}
