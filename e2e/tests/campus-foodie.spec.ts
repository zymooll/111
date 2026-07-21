import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import path from 'node:path'

const apiOrigin = 'http://127.0.0.1:18000'
const userOrigin = 'http://127.0.0.1:5173'
const adminOrigin = 'http://127.0.0.1:5174'
const campusId = '00000000-0000-0000-0000-000000000001'
const areaId = '00000000-0000-0000-0000-000000000011'
const categoryId = '00000000-0000-0000-0000-000000000021'
const seededItemId = '00000000-0000-0000-0000-000000000041'

interface TokenPair {
  access_token: string
}

function matchesApi(responseUrl: string, method: string, pathname: string, actualMethod: string) {
  return actualMethod === method && new URL(responseUrl).pathname === pathname
}

async function loginUser(page: Page) {
  await page.goto(`${userOrigin}/login`)
  await page.getByLabel('账号或邮箱').fill('demo')
  await page.getByPlaceholder('至少 8 位密码').fill('Demo123!')
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
      identifier: scope === 'admin' ? 'admin' : 'demo',
      password: scope === 'admin' ? 'Admin123!' : 'Demo123!',
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as TokenPair
}

async function chooseAntOption(page: Page, scope: Locator, label: string, option: string) {
  const formItem = scope.locator('.ant-form-item').filter({ hasText: label }).first()
  await formItem.locator('.ant-select').click()
  await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
}

test('评价图片提交、管理审核、游客阅读和作者阅读量形成完整闭环', async ({ browser }) => {
  const reviewText = 'E2E 图片评价：牛腩软烂，番茄味浓，分量也很适合午餐。'
  const authorContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const authorPage = await authorContext.newPage()
  await loginUser(authorPage)

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
  await adminPage.getByPlaceholder('搜索评价内容、用户或菜品').fill(reviewText)
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
  await expect(guestPage.getByText(reviewText, { exact: true })).toBeVisible()
  await expect(guestPage.getByAltText('评价配图')).toBeVisible()
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

test('示意地图同时呈现普通收藏星标和含收藏商家的聚合星标', async ({ browser, request }) => {
  const admin = await apiLogin(request, 'admin')
  const user = await apiLogin(request, 'user')
  const adminHeaders = { Authorization: `Bearer ${admin.access_token}` }
  const userHeaders = { Authorization: `Bearer ${user.access_token}` }
  const merchantNames = ['E2E 聚合咖啡 A', 'E2E 聚合咖啡 B', 'E2E 独立收藏餐厅']

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
        gcj02_latitude: clustered ? 28.131567 : 28.129644,
        gcj02_longitude: clustered ? 112.994905 : 112.990275,
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
  await loginUser(page)
  await page.goto(`${userOrigin}/map`)

  const clusterMarkers = page.getByTestId('merchant-cluster-marker').filter({ hasText: '2' })
  await expect(clusterMarkers.first()).toBeVisible()
  let cluster = clusterMarkers.first()
  let foundTargetCluster = false
  for (let index = 0; index < await clusterMarkers.count(); index += 1) {
    const candidate = clusterMarkers.nth(index)
    await candidate.click()
    if (await page.getByText(merchantNames[0], { exact: true }).isVisible()) {
      cluster = candidate
      foundTargetCluster = true
      break
    }
    await page.locator('.merchant-drawer header button').click()
  }
  expect(foundTargetCluster).toBeTruthy()
  await expect(cluster).toHaveClass(/has-star/)
  await expect(cluster).toHaveAttribute('aria-label', /含收藏商家/)

  const favoritePin = page.getByRole('button', { name: merchantNames[2] })
  await expect(favoritePin).toHaveClass(/is-favorite/)

  for (const name of merchantNames.slice(0, 2)) await expect(page.getByText(name, { exact: true })).toBeVisible()
  const favoriteCard = page.locator('.merchant-mini-card').filter({ hasText: merchantNames[0] })
  await expect(favoriteCard.getByRole('button', { name: '收藏商家' })).toHaveClass(/is-favorite/)

  await page.locator('.merchant-drawer header button').click()
  await page.getByRole('button', { name: '已收藏' }).click()
  await expect(page.getByRole('button', { name: merchantNames[0] })).toHaveClass(/is-favorite/)
  await expect(page.getByRole('button', { name: merchantNames[1] })).toHaveCount(0)
  await context.close()
})

test('管理端完成商家、菜品、标签 CRUD、CSV 导入并可查询审计日志', async ({ page, request }) => {
  test.slow()
  const tagName = 'E2E 清香'
  const updatedTagName = 'E2E 清香微甜'
  const merchantName = 'E2E 管理测试档口'
  const updatedMerchantName = 'E2E 管理测试档口·已编辑'
  const itemName = 'E2E 清香鸡肉饭'
  const updatedItemName = 'E2E 清香鸡肉套餐'
  const csvMerchantName = 'E2E CSV 导入商家'

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
  await row.locator('button').first().click()
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
  await row.locator('button').first().click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('如：林海餐厅·风味档口').fill(updatedMerchantName)
  await dialog.getByPlaceholder('用于地图定位和地点筛选').fill('东园餐饮区 E2E 02 号')
  const updateMerchant = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', `/admin/api/v1/merchants/${merchant.id}`, response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  expect((await updateMerchant).ok()).toBeTruthy()
  await expect(page.getByRole('row').filter({ hasText: updatedMerchantName })).toBeVisible()

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
  await row.locator('button').first().click()
  dialog = page.locator('.ant-modal:visible')
  await dialog.getByPlaceholder('菜品或套餐名称').fill(updatedItemName)
  await dialog.locator('.ant-form-item').filter({ hasText: '价格' }).getByRole('spinbutton').fill('19.9')
  await dialog.locator('.ant-select-selection-item-remove').click()
  const updateItem = page.waitForResponse((response) => matchesApi(response.url(), 'PATCH', `/admin/api/v1/menu-items/${item.id}`, response.request().method()))
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  expect((await updateItem).ok()).toBeTruthy()
  row = page.getByRole('row').filter({ hasText: updatedItemName })
  await expect(row).toBeVisible()

  const deleteItem = page.waitForResponse((response) => matchesApi(response.url(), 'DELETE', `/admin/api/v1/menu-items/${item.id}`, response.request().method()))
  await row.locator('button').nth(2).click()
  await page.locator('.ant-modal:visible .ant-btn-primary').last().click()
  expect((await deleteItem).ok()).toBeTruthy()

  await page.getByRole('tab', { name: '标签字典' }).click()
  row = page.getByRole('row').filter({ hasText: updatedTagName })
  const deleteTag = page.waitForResponse((response) => matchesApi(response.url(), 'DELETE', `/admin/api/v1/tags/${tag.id}`, response.request().method()))
  await row.locator('button').nth(1).click()
  await page.locator('.ant-modal:visible .ant-btn-primary').last().click()
  expect((await deleteTag).ok()).toBeTruthy()
  await expect(page.getByRole('row').filter({ hasText: updatedTagName })).toHaveCount(0)

  await page.getByRole('tab', { name: '商家管理' }).click()
  row = page.getByRole('row').filter({ hasText: updatedMerchantName })
  const deleteMerchant = page.waitForResponse((response) => matchesApi(response.url(), 'DELETE', `/admin/api/v1/merchants/${merchant.id}`, response.request().method()))
  await row.locator('button').nth(2).click()
  await page.locator('.ant-modal:visible .ant-btn-primary').last().click()
  expect((await deleteMerchant).ok()).toBeTruthy()

  await page.goto(`${adminOrigin}/imports`)
  const csv = [
    'campus_id,area_id,category_id,name,description,address,latitude,longitude,gcj02_latitude,gcj02_longitude,price_level,business_hours',
    `${campusId},${areaId},${categoryId},${csvMerchantName},CSV E2E,东园 CSV 01 号,28.134945,112.989306,28.131567,112.994905,2,09:00-21:00`,
  ].join('\n')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e-merchants.csv',
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
  await expect(page.getByRole('row').filter({ hasText: 'e2e-merchants.csv' })).toContainText('成功 1')

  await page.goto(`${adminOrigin}/audit-logs`)
  await page.getByPlaceholder('搜索操作人、操作或对象').fill('import.merchants')
  await expect(page.getByRole('row').filter({ hasText: 'import.merchants' })).toBeVisible()
  await page.getByPlaceholder('搜索操作人、操作或对象').fill('tag.update')
  await expect(page.getByRole('row').filter({ hasText: 'tag.update' })).toBeVisible()

  const adminToken = await page.evaluate(() => sessionStorage.getItem('campus-foodie-admin-access-token'))
  expect(adminToken).toBeTruthy()
  const auditResponse = await request.get(`${apiOrigin}/admin/api/v1/audit-logs?campus_id=${campusId}&limit=100`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(auditResponse.ok(), await auditResponse.text()).toBeTruthy()
  const auditBody = await auditResponse.json() as { items: Array<{ action: string }> }
  const actions = new Set(auditBody.items.map((entry) => entry.action))
  for (const action of [
    'tag.create', 'tag.update', 'tag.delete',
    'merchant.create', 'merchant.update', 'merchant.deactivate',
    'menu_item.create', 'menu_item.update', 'menu_item.deactivate',
    'import.merchants',
  ]) expect(actions.has(action), `缺少审计动作 ${action}`).toBeTruthy()

  const importedMerchant = await request.get(`${apiOrigin}/admin/api/v1/merchants?campus_id=${campusId}&search=${encodeURIComponent(csvMerchantName)}&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(importedMerchant.ok(), await importedMerchant.text()).toBeTruthy()
  expect((await importedMerchant.json() as { items: Array<{ name: string }> }).items.map((entry) => entry.name)).toContain(csvMerchantName)

  const tagsResponse = await request.get(`${apiOrigin}/admin/api/v1/tags?campus_id=${campusId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(tagsResponse.ok(), await tagsResponse.text()).toBeTruthy()
  expect((await tagsResponse.json() as Array<{ id: string }>).some((entry) => entry.id === tag.id)).toBeFalsy()
})
