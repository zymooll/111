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
    id: 'north', label: '北校区', icon: '🏫', children: [
      { id: 'north-canteen', label: '北苑食堂', icon: '①' },
      { id: 'library', label: '图书馆周边', icon: '📚' },
      { id: 'north-gate', label: '北门商业街', icon: '🚪' }
    ]
  },
  {
    id: 'south', label: '南校区', icon: '🌳', children: [
      { id: 'south-canteen', label: '南苑食堂', icon: '②' },
      { id: 'dormitory', label: '学生宿舍区', icon: '🛏️' },
      { id: 'south-gate', label: '南门生活区', icon: '🚪' }
    ]
  },
  {
    id: 'east', label: '东校区', icon: '🌅', children: [
      { id: 'sports', label: '体育馆周边', icon: '🏀' },
      { id: 'east-canteen', label: '东区食堂', icon: '③' }
    ]
  }
]

export const merchants: Merchant[] = [
  { id: 'm1', name: '南苑一楼 · 川味窗口', areaId: 'south-canteen', area: '南苑食堂 1F', categoryId: 'rice', category: '米饭套餐', priceLevel: 1, averagePrice: 16, rating: 4.8, reviewCount: 328, openUntil: '21:00', distance: 180, latitude: 31.2292, longitude: 121.4762, position: { x: 25, y: 36 }, tags: ['麻辣', '下饭', '高性价比'] },
  { id: 'm2', name: '北苑 · 一碗好面', areaId: 'north-canteen', area: '北苑食堂 2F', categoryId: 'noodle', category: '面食粉类', priceLevel: 1, averagePrice: 14, rating: 4.7, reviewCount: 206, openUntil: '20:30', distance: 420, latitude: 31.22922, longitude: 121.47622, position: { x: 31, y: 33 }, tags: ['酸辣', '热汤', '出餐快'] },
  { id: 'm3', name: '图书馆咖啡角', areaId: 'library', area: '图书馆西侧', categoryId: 'tea', category: '茶饮咖啡', priceLevel: 2, averagePrice: 22, rating: 4.9, reviewCount: 152, openUntil: '22:30', distance: 560, latitude: 31.2295, longitude: 121.479, position: { x: 49, y: 47 }, tags: ['安静', '低糖', '学习搭子'] },
  { id: 'm4', name: '元气碗轻食实验室', areaId: 'sports', area: '体育馆南门', categoryId: 'salad', category: '沙拉轻食', priceLevel: 2, averagePrice: 27, rating: 4.6, reviewCount: 96, openUntil: '20:00', distance: 760, latitude: 31.226, longitude: 121.482, position: { x: 77, y: 62 }, tags: ['高蛋白', '低卡', '清爽'] },
  { id: 'm5', name: '北门深夜食堂', areaId: 'north-gate', area: '北门商业街', categoryId: 'late-night', category: '夜宵烧烤', priceLevel: 2, averagePrice: 34, rating: 4.5, reviewCount: 411, openUntil: '次日 02:00', distance: 890, latitude: 31.224, longitude: 121.4765, position: { x: 31, y: 69 }, tags: ['夜宵', '烟火气', '朋友聚餐'] },
  { id: 'm6', name: '南门 · 麦香烘焙', areaId: 'south-gate', area: '南门生活区', categoryId: 'bakery', category: '烘焙点心', priceLevel: 1, averagePrice: 12, rating: 4.8, reviewCount: 184, openUntil: '22:00', distance: 1040, latitude: 31.222, longitude: 121.474, position: { x: 19, y: 79 }, tags: ['早餐', '现烤', '微甜'] }
]

export const dishes: Dish[] = [
  { id: 'd1', merchantId: 'm1', name: '招牌藤椒鸡双拼饭', subtitle: '藤椒鲜香 × 酥脆小酥肉，一份满足两种快乐', image: '/dishes/rice-bowl.svg', gallery: ['/dishes/rice-bowl.svg', '/dishes/energy-bowl.svg'], price: 18.8, originalPrice: 22, rating: 4.9, reviewCount: 186, categoryId: 'rice', category: '米饭套餐', tags: ['微辣', '高蛋白', '招牌'], reason: '你喜欢微辣和丰富口感，这份双拼刚刚好', match: 96, calories: 680, waitMinutes: 8, ingredients: ['藤椒鸡', '小酥肉', '时蔬', '米饭'] },
  { id: 'd2', merchantId: 'm2', name: '酸汤肥牛米线', subtitle: '酸香开胃，汤底每天现熬', image: '/dishes/noodles.svg', gallery: ['/dishes/noodles.svg', '/dishes/rice-bowl.svg'], price: 15.8, rating: 4.8, reviewCount: 141, categoryId: 'noodle', category: '面食粉类', tags: ['酸辣', '热汤', '暖胃'], reason: '今天降温，来一碗你常点的酸辣热汤吧', match: 94, calories: 590, waitMinutes: 6, ingredients: ['肥牛', '米线', '番茄', '金针菇'] },
  { id: 'd3', merchantId: 'm3', name: '海盐青提冷萃', subtitle: '清甜果香，默认三分糖', image: '/dishes/cold-brew.svg', gallery: ['/dishes/cold-brew.svg', '/dishes/bagel.svg'], price: 19, rating: 4.9, reviewCount: 89, categoryId: 'tea', category: '茶饮咖啡', tags: ['低糖', '清爽', '冷萃'], reason: '适合下午自习的轻负担饮品，离图书馆仅 2 分钟', match: 91, calories: 126, waitMinutes: 4, ingredients: ['冷萃茶', '青提', '海盐奶盖'] },
  { id: 'd4', merchantId: 'm4', name: '香煎鸡腿能量碗', subtitle: '足量蛋白和五色蔬菜，饱腹不犯困', image: '/dishes/energy-bowl.svg', gallery: ['/dishes/energy-bowl.svg', '/dishes/rice-bowl.svg'], price: 26, rating: 4.7, reviewCount: 73, categoryId: 'salad', category: '沙拉轻食', tags: ['高蛋白', '低卡', '健身'], reason: '匹配你的健身目标，蛋白质约 42g', match: 89, calories: 468, waitMinutes: 10, ingredients: ['鸡腿肉', '藜麦', '西兰花', '南瓜'] },
  { id: 'd5', merchantId: 'm5', name: '炭火烤串双人套餐', subtitle: '12 串荤素搭配，加赠冰粉', image: '/dishes/skewers.svg', gallery: ['/dishes/skewers.svg', '/dishes/noodles.svg'], price: 49.9, originalPrice: 62, rating: 4.6, reviewCount: 238, categoryId: 'late-night', category: '夜宵烧烤', tags: ['夜宵', '双人', '炭烤'], reason: '今晚适合和室友分享，收藏用户复购率很高', match: 86, calories: 920, waitMinutes: 18, ingredients: ['牛肉串', '鸡翅', '豆皮', '蔬菜串'] },
  { id: 'd6', merchantId: 'm6', name: '流心芝士贝果', subtitle: '外韧内软，早餐 8 点前第二件半价', image: '/dishes/bagel.svg', gallery: ['/dishes/bagel.svg', '/dishes/cold-brew.svg'], price: 9.9, rating: 4.8, reviewCount: 112, categoryId: 'bakery', category: '烘焙点心', tags: ['早餐', '现烤', '芝士'], reason: '符合你的早餐预算，步行到教学楼顺路可取', match: 84, calories: 320, waitMinutes: 2, ingredients: ['高筋面粉', '奶油芝士', '牛奶'] }
]

export const initialReviews: Review[] = [
  { id: 'r1', dishId: 'd1', userId: 'u2', userName: '不想早八', avatarText: '八', rating: 5, content: '藤椒香很足但不会呛，酥肉还是脆的。窗口阿姨打菜也很大方，赶课的时候八分钟拿到。', images: ['/dishes/rice-bowl.svg'], createdAt: '今天 12:26', likes: 48, status: 'published' },
  { id: 'r2', dishId: 'd1', userId: 'u3', userName: '橘子汽水', avatarText: '橘', rating: 4, content: '建议米饭少一点、青菜多一点，整体很下饭。微辣对我正合适。', images: [], createdAt: '昨天 18:42', likes: 21, status: 'published' },
  { id: 'r3', dishId: 'd2', userId: 'u4', userName: '汤汤水水', avatarText: '汤', rating: 5, content: '酸度很舒服，冬天下课来一碗特别治愈。', images: [], createdAt: '07-16', likes: 16, status: 'published' },
  { id: 'r4', dishId: 'd3', userId: 'u5', userName: '图书馆常驻', avatarText: '书', rating: 5, content: '三分糖清爽不腻，自习带着喝很合适。', images: [], createdAt: '07-15', likes: 11, status: 'published' }
]

export const demoUser: User = {
  id: 'u1', username: 'foodie', email: 'foodie@campus.edu', displayName: '蓝莓同学', publishedReviews: 12, views: 2864
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
