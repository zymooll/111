import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test'
import path from 'node:path'
import { adminOrigin, apiOrigin, userOrigin } from '../ports.mjs'

const campusId = '00000000-0000-0000-0000-000000000001'
const areaId = '00000000-0000-0000-0000-000000000011'
const categoryId = '00000000-0000-0000-0000-000000000021'
const seededItemId = '00000000-0000-0000-0000-000000000041'
const demoAccount = { username: 'demo', password: 'Demo123!' }

interface TokenPair {
  access_token: string
}

interface Account {
  username: string
  password: string
}

interface CursorPage<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
}

// 同一次 run 里 webServer 只启动一次，重试会复用上一轮留下的数据；实体名和评价文本必须逐次唯一。
function uniqueSuffix(testInfo: TestInfo) {
  return `${Date.now().toString(36)}-${testInfo.retry}`
}

function matchesApi(responseUrl: string, method: string, pathname: string, actualMethod: string) {
  return actualMethod === method && new URL(responseUrl).pathname === pathname
}

async function loginUser(page: Page, account: Account) {
  await page.goto(`${userOrigin}/login`)
  await page.getByLabel('账号或邮箱').fill(account.username)
  await page.getByPlaceholder('至少 8 位密码').fill(account.password)
  await Promise.all([
    page.waitForURL(`${userOrigin}/mine`),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
}

async function loginAdmin(page: Page) {
  await page.goto(`${adminOrigin}/login`)
  await page.getByLabel('管理员账号').fill('admin')
  await page.getByLabel('密码').fill('Admin123!')
  await Promise.all([
    page.waitForURL(`${adminOrigin}/dashboard`),
    page.getByRole('button', { name: '登录管理后台' }).click(),
  ])
}

async function apiLogin(request: APIRequestContext, scope: 'user' | 'admin') {
  const prefix = scope === 'admin' ? '/admin/api/v1' : '/api/v1'
  const response = await request.post(`${apiOrigin}${prefix}/auth/login`, {
    data: {
      identifier: scope === 'admin' ? 'admin' : demoAccount.username,
      password: scope === 'admin' ? 'Admin123!' : demoAccount.password,
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as TokenPair
}

// 每次评价都用新账号，避免“同一用户重复评价同一菜品”在重试时返回 409。
async function registerVerifiedUser(request: APIRequestContext, testInfo: TestInfo): Promise<Account> {
  const username = `e2e-${uniqueSuffix(testInfo)}`
  const account = { username, password: 'E2ePass123!' }
  const registered = await request.post(`${apiOrigin}/api/v1/auth/register`, {
    data: { username, email: `${username}@example.com`, password: account.password },
  })
  expect(registered.status(), await registered.text()).toBe(201)
  const headers = { Authorization: `Bearer ${(await registered.json() as TokenPair).access_token}` }

  const requested = await request.post(`${apiOrigin}/api/v1/auth/email-verification/request`, { headers })
  expect(requested.ok(), await requested.text()).toBeTruthy()
  const { debug_token: token } = await requested.json() as { debug_token: string | null }
  expect(token, '需要 EXPOSE_DEBUG_TOKENS=true 才能在 E2E 中取回验证令牌').toBeTruthy()
  const confirmed = await request.post(`${apiOrigin}/api/v1/auth/email-verification/confirm`, { data: { token } })
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy()
  return account
}

// 重试会保留上一轮创建的商家，地图聚合数量断言必须先清掉同前缀的历史数据。
async function deactivateMerchants(request: APIRequestContext, headers: Record<string, string>, search: string) {
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ campus_id: campusId, search, active: 'true', limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const response = await request.get(`${apiOrigin}/admin/api/v1/merchants?${query}`, { headers })
    expect(response.ok(), await response.text()).toBeTruthy()
    const page = await response.json() as CursorPage<{ id: string }>
    for (const merchant of page.items) {
      const removed = await request.delete(`${apiOrigin}/admin/api/v1/merchants/${merchant.id}?campus_id=${campusId}`, { headers })
      expect(removed.ok(), await removed.text()).toBeTruthy()
    }
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
}

// 表格操作列是纯图标按钮，可访问名来自 Ant Design 图标的 aria-label，比按位置取 nth 更稳。
async function switchPublishStatus(page: Page, row: Locator, next: 'online' | 'offline', pathname: string) {
  const updated = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', pathname, response.request().method()))
  await row.getByRole('button', { name: next === 'online' ? 'upload' : 'stop' }).click()
  await page.locator('.ant-modal:visible .ant-btn-primary').last().click()
  expect((await updated).ok()).toBeTruthy()
  await expect(row).toContainText(next === 'online' ? '已上架' : '已下架')
}

async function chooseAntOption(page: Page, scope: Locator, label: string, option: string) {
  const formItem = scope.locator('.ant-form-item').filter({ hasText: label }).first()
  await formItem.locator('.ant-select').click()
  await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
}

test('评价图片提交、管理审核、游客阅读和作者阅读量形成完整闭环', async ({ browser, request }, testInfo) => {
  const author = await registerVerifiedUser(request, testInfo)
  const reviewText = `E2E 图片评价 ${author.username}：牛腩软烂，番茄味浓，分量也很适合午餐。`
  const authorContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const authorPage = await authorContext.newPage()
  await loginUser(authorPage, author)

  await authorPage.goto(`${userOrigin}/dish/${seededItemId}/review`)
  await expect(authorPage.getByText('番茄牛腩饭', { exact: true })).toBeVisible()
  await authorPage.getByRole('radio', { name: '5 星' }).click()
  await authorPage.getByPlaceholder('真实、具体的体验最能帮助到同学……').fill(reviewText)
  await authorPage.locator('input[type="file"]').setInputFiles(
    path.join(process.cwd(), 'assets', 'merchant-images', 'canteen-lintao.jpeg'),
  )
  await expect(authorPage.getByAltText('待上传图片 1')).toBeVisible()

  const createReview = authorPage.waitForResponse((response) => matchesApi(
    response.url(),
    'POST',
    `/api/v1/menu-items/${seededItemId}/reviews`,
    response.request().method(),
  ))
  await authorPage.getByRole('button', { name: '发布评价', exact: true }).click()
  const createdResponse = await createReview
  expect(createdResponse.status(), await createdResponse.text()).toBe(201)
  const review = await createdResponse.json() as { id: string; status: string; images: string[] }
  expect(review.status).toBe('pending_manual')
  expect(review.images).toHaveLength(1)
  await authorPage.waitForURL(`${userOrigin}/dish/${seededItemId}`)

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const adminPage = await adminContext.newPage()
  await loginAdmin(adminPage)
  await adminPage.goto(`${adminOrigin}/reviews`)
  // 待人工审核标签页按发表时间倒序，新提交的评价在第一页；服务端没有关键词检索，前端也不做本地过滤。
  const reviewRow = adminPage.getByRole('row').filter({ hasText: reviewText })
  await expect(reviewRow).toBeVisible()
  await reviewRow.getByRole('button', { name: '详情' }).click()

  const moderationImage = adminPage.getByAltText('评价上传图片')
  await expect(moderationImage).toBeVisible()
  await expect.poll(async () => moderationImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await adminPage.locator('.drawer-actions .ant-btn-primary').click()
  const moderateReview = adminPage.waitForResponse((response) => matchesApi(
    response.url(),
    'POST',
    `/admin/api/v1/reviews/${review.id}/moderate`,
    response.request().method(),
  ))
  await adminPage.locator('.ant-modal:visible .ant-btn-primary').last().click()
  const moderatedResponse = await moderateReview
  expect(moderatedResponse.ok(), await moderatedResponse.text()).toBeTruthy()
  expect((await moderatedResponse.json() as { status: string }).status).toBe('published')

  await authorPage.goto(`${userOrigin}/mine`)
  await expect(authorPage.getByTestId('published-review-count')).toHaveText('1')
  await expect(authorPage.getByTestId('total-review-views')).toHaveText('0')

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const guestPage = await guestContext.newPage()
  const reviewViewed = guestPage.waitForResponse((response) => matchesApi(
    response.url(),
    'POST',
    `/api/v1/reviews/${review.id}/view`,
    response.request().method(),
  ))
  await guestPage.goto(`${userOrigin}/dish/${seededItemId}`)
  const guestReviewCard = guestPage.locator('.review-card').filter({ hasText: reviewText })
  await expect(guestReviewCard).toBeVisible()
  await expect(guestReviewCard.getByAltText('评价配图')).toBeVisible()
  expect((await reviewViewed).ok()).toBeTruthy()

  const refreshedStats = authorPage.waitForResponse((response) => matchesApi(
    response.url(),
    'GET',
    '/api/v1/me/stats',
    response.request().method(),
  ))
  await authorPage.bringToFront()
  await authorPage.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect((await refreshedStats).ok()).toBeTruthy()
  await expect(authorPage.getByTestId('total-review-views')).toHaveText('1')

  await Promise.all([guestContext.close(), adminContext.close(), authorContext.close()])
})

test('示意地图同时呈现普通收藏星标和含收藏商家的聚合星标', async ({ browser, request }, testInfo) => {
  const admin = await apiLogin(request, 'admin')
  const user = await apiLogin(request, 'user')
  const adminHeaders = { Authorization: `Bearer ${admin.access_token}` }
  const userHeaders = { Authorization: `Bearer ${user.access_token}` }
  const mapMerchantPrefix = 'E2E 地图'
  await deactivateMerchants(request, adminHeaders, mapMerchantPrefix)

  const suffix = uniqueSuffix(testInfo)
  const merchantNames = [
    `${mapMerchantPrefix}聚合咖啡 A ${suffix}`,
    `${mapMerchantPrefix}聚合咖啡 B ${suffix}`,
    `${mapMerchantPrefix}独立收藏餐厅 ${suffix}`,
  ]

  const merchants = [] as Array<{ id: string; name: string }>
  for (const [index, name] of merchantNames.entries()) {
    const clustered = index < 2
    const response = await request.post(`${apiOrigin}/admin/api/v1/merchants`, {
      headers: adminHeaders,
      data: {
        campus_id: campusId,
        area_id: areaId,
        category_id: categoryId,
        name,
        description: '用于验证地图聚合的 E2E 商家',
        address: 'E2E 地图测试点',
        latitude: clustered ? 28.134945 : 28.133036,
        longitude: clustered ? 112.989306 : 112.984693,
        price_level: 2,
        business_hours: '08:00-22:00',
        is_active: true,
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    merchants.push(await response.json() as { id: string; name: string })
  }

  for (const merchantId of [merchants[0].id, merchants[2].id]) {
    const response = await request.put(`${apiOrigin}/api/v1/favorites/merchants/${merchantId}?campus_id=${campusId}`, { headers: userHeaders })
    expect(response.ok(), await response.text()).toBeTruthy()
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await loginUser(page, demoAccount)
  await page.goto(`${userOrigin}/map`)

  // 用本次唯一后缀搜索，把地图收敛到这三家商家，聚合数量才是可断言的。
  await page.getByPlaceholder('搜索商家或地点').fill(suffix)
  await page.getByPlaceholder('搜索商家或地点').press('Enter')
  await expect(page.locator('.map-summary span')).toHaveText('3 家符合条件')

  const favoritePin = page.getByRole('button', { name: merchantNames[2] })
  await expect(favoritePin).toHaveClass(/is-favorite/)

  const cluster = page.getByTestId('merchant-cluster-marker')
  await expect(cluster).toHaveClass(/has-star/)
  await expect(cluster).toHaveAttribute('aria-label', '附近 2 家商家，含收藏商家')
  await cluster.click()

  for (const name of merchantNames.slice(0, 2)) await expect(page.getByText(name, { exact: true })).toBeVisible()
  const favoriteCard = page.locator('.merchant-mini-card').filter({ hasText: merchantNames[0] })
  await expect(favoriteCard.getByRole('button', { name: '收藏商家' })).toHaveClass(/is-favorite/)

  await page.locator('.merchant-drawer header button').click()
  await page.getByRole('button', { name: '已收藏' }).click()
  await expect(page.getByRole('button', { name: merchantNames[0] })).toHaveClass(/is-favorite/)
  await expect(page.getByRole('button', { name: merchantNames[1] })).toHaveCount(0)
  await context.close()
})

test('管理端完成商家、菜品、标签 CRUD、CSV 导入并可查询审计日志', async ({ page, request }, testInfo) => {
  test.slow()
  const suffix = uniqueSuffix(testInfo)
  const tagName = `E2E 清香 ${suffix}`
  const updatedTagName = `E2E 清香微甜 ${suffix}`
  const merchantName = `E2E 管理测试档口 ${suffix}`
  const updatedMerchantName = `E2E 管理测试档口·已编辑 ${suffix}`
  const itemName = `E2E 清香鸡肉饭 ${suffix}`
  const updatedItemName = `E2E 清香鸡肉套餐 ${suffix}`
  const csvMerchantName = `E2E CSV 导入商家 ${suffix}`
  const csvFileName = `e2e-merchants-${suffix}.csv`

  await loginAdmin(page)
  await page.goto(`${adminOrigin}/catalog`)

  await page.getByRole('tab', { name: '标签字典' }).click()
  await page.getByRole('button', { name: '新增标签' }).click()
  let dialog = page.locator('.ant-modal:visible')
  await dialog.getByLabel('标签名称').fill(tagName)
  const createTag = page.waitForResponse((response) => matchesApi(response.url(), 'POST', '/admin/api/v1/tags', response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  const createTagResponse = await createTag
  expect(createTagResponse.status(), await createTagResponse.text()).toBe(201)
  const tag = await createTagResponse.json() as { id: string }

  let row = page.getByRole('row').filter({ hasText: tagName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'edit' }).click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByLabel('标签名称').fill(updatedTagName)
  const updateTag = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', `/admin/api/v1/tags/${tag.id}`, response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  expect((await updateTag).ok()).toBeTruthy()
  await expect(page.getByRole('row').filter({ hasText: updatedTagName })).toBeVisible()

  await page.getByRole('tab', { name: '商家管理' }).click()
  await page.getByRole('button', { name: '新增商家' }).click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('如：林海餐厅·风味档口').fill(merchantName)
  await chooseAntOption(page, dialog, '所属区域', '东园餐饮区')
  await chooseAntOption(page, dialog, '餐饮类别', '中式餐饮')
  await dialog.getByPlaceholder('用于地图定位和地点筛选').fill('东园餐饮区 E2E 01 号')
  await dialog.getByPlaceholder('介绍主营特色、服务信息等').fill('管理端 CRUD 浏览器测试商家')
  const createMerchant = page.waitForResponse((response) => matchesApi(response.url(), 'POST', '/admin/api/v1/merchants', response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  const createMerchantResponse = await createMerchant
  expect(createMerchantResponse.status(), await createMerchantResponse.text()).toBe(201)
  const merchant = await createMerchantResponse.json() as { id: string }

  row = page.getByRole('row').filter({ hasText: merchantName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'edit' }).click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('如：林海餐厅·风味档口').fill(updatedMerchantName)
  await dialog.getByPlaceholder('用于地图定位和地点筛选').fill('东园餐饮区 E2E 02 号')
  const updateMerchant = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', `/admin/api/v1/merchants/${merchant.id}`, response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  expect((await updateMerchant).ok()).toBeTruthy()
  row = page.getByRole('row').filter({ hasText: updatedMerchantName })
  await expect(row).toBeVisible()
  await switchPublishStatus(page, row, 'online', `/admin/api/v1/merchants/${merchant.id}`)

  await page.getByRole('tab', { name: '菜品 / 套餐管理' }).click()
  await page.getByRole('button', { name: '新增菜品 / 套餐' }).click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('菜品或套餐名称').fill(itemName)
  await chooseAntOption(page, dialog, '所属商家', updatedMerchantName)
  await chooseAntOption(page, dialog, '分类', '米饭套餐')
  await dialog.locator('.ant-form-item').filter({ hasText: '价格' }).getByRole('spinbutton').fill('18.8')
  await chooseAntOption(page, dialog, '口味 / 特征标签', `${updatedTagName} · 口味`)
  const createItem = page.waitForResponse((response) => matchesApi(response.url(), 'POST', '/admin/api/v1/menu-items', response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  const createItemResponse = await createItem
  expect(createItemResponse.status(), await createItemResponse.text()).toBe(201)
  const item = await createItemResponse.json() as { id: string }

  row = page.getByRole('row').filter({ hasText: itemName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'edit' }).click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('菜品或套餐名称').fill(updatedItemName)
  await dialog.locator('.ant-form-item').filter({ hasText: '价格' }).getByRole('spinbutton').fill('19.9')
  await dialog.locator('.ant-select-selection-item-remove').click()
  const updateItem = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', `/admin/api/v1/menu-items/${item.id}`, response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  expect((await updateItem).ok()).toBeTruthy()
  row = page.getByRole('row').filter({ hasText: updatedItemName })
  await expect(row).toBeVisible()
  await switchPublishStatus(page, row, 'online', `/admin/api/v1/menu-items/${item.id}`)
  await switchPublishStatus(page, row, 'offline', `/admin/api/v1/menu-items/${item.id}`)

  await page.getByRole('tab', { name: '标签字典' }).click()
  row = page.getByRole('row').filter({ hasText: updatedTagName })
  const deleteTag = page.waitForResponse((response) => matchesApi(response.url(), 'DELETE', `/admin/api/v1/tags/${tag.id}`, response.request().method()))
  await row.getByRole('button', { name: 'delete' }).click()
  await page.locator('.ant-modal:visible .ant-btn-primary').last().click()
  expect((await deleteTag).ok()).toBeTruthy()
  await expect(page.getByRole('row').filter({ hasText: updatedTagName })).toHaveCount(0)

  await page.getByRole('tab', { name: '商家管理' }).click()
  row = page.getByRole('row').filter({ hasText: updatedMerchantName })
  await switchPublishStatus(page, row, 'offline', `/admin/api/v1/merchants/${merchant.id}`)

  await page.goto(`${adminOrigin}/imports`)
  const csv = [
    'campus_id,area_id,category_id,name,description,address,latitude,longitude,price_level,business_hours',
    `${campusId},${areaId},${categoryId},${csvMerchantName},CSV E2E,东园 CSV 01 号,28.134945,112.989306,2,09:00-21:00`,
  ].join('\n')
  await page.locator('input[type="file"]').setInputFiles({
    name: csvFileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })
  const validateImport = page.waitForResponse((response) => matchesApi(response.url(), 'POST', '/admin/api/v1/imports/validate', response.request().method()))
  await page.getByRole('button', { name: '开始预校验' }).click()
  const validationResponse = await validateImport
  expect(validationResponse.ok(), await validationResponse.text()).toBeTruthy()
  expect(await validationResponse.json()).toMatchObject({ total: 1, valid: 1, invalid: 0 })
  await expect(page.getByText('预校验通过，可以开始导入')).toBeVisible()

  const startImport = page.waitForResponse((response) => matchesApi(response.url(), 'POST', '/admin/api/v1/imports', response.request().method()))
  await page.getByRole('button', { name: '确认并导入有效数据' }).click()
  const importResponse = await startImport
  expect(importResponse.status(), await importResponse.text()).toBe(201)
  expect(await importResponse.json()).toMatchObject({ status: 'completed', success: 1, failed: 0 })
  await expect(page.getByRole('row').filter({ hasText: csvFileName })).toContainText('成功 1')

  // 审计日志按时间倒序，本用例刚写入的动作都在第一页；服务端没有关键词检索能力。
  await page.goto(`${adminOrigin}/audit-logs`)
  await expect(page.getByRole('row').filter({ hasText: 'import.merchants' }).first()).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'merchant.update' }).first()).toBeVisible()

  const adminToken = await page.evaluate(() => sessionStorage.getItem('campus-foodie-admin-access-token'))
  expect(adminToken).toBeTruthy()
  const auditResponse = await request.get(`${apiOrigin}/admin/api/v1/audit-logs?campus_id=${campusId}&limit=100`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(auditResponse.ok(), await auditResponse.text()).toBeTruthy()
  const auditBody = await auditResponse.json() as CursorPage<{ action: string }>
  const actions = new Set(auditBody.items.map((entry) => entry.action))
  for (const action of [
    'tag.create', 'tag.update', 'tag.delete',
    'merchant.create', 'merchant.update',
    'menu_item.create', 'menu_item.update',
    'import.merchants',
  ]) expect(actions.has(action), `缺少审计动作 ${action}`).toBeTruthy()

  const importedMerchant = await request.get(`${apiOrigin}/admin/api/v1/merchants?campus_id=${campusId}&search=${encodeURIComponent(csvMerchantName)}&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(importedMerchant.ok(), await importedMerchant.text()).toBeTruthy()
  expect((await importedMerchant.json() as CursorPage<{ name: string }>).items.map((entry) => entry.name)).toContain(csvMerchantName)

  const tagsResponse = await request.get(`${apiOrigin}/admin/api/v1/tags?campus_id=${campusId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(tagsResponse.ok(), await tagsResponse.text()).toBeTruthy()
  expect((await tagsResponse.json() as Array<{ id: string }>).some((entry) => entry.id === tag.id)).toBeFalsy()
})
