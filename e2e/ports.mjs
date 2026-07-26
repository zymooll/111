// E2E 端口的唯一事实来源，供 playwright.config.ts、e2e/start-api.mjs 和用例共同引用。
// 与开发端口（用户端 7991、管理端 7992、API 7993）完全隔离，两套服务可同时运行。
export const apiPort = 18000
export const userWebPort = 18001
export const adminWebPort = 18002

export const apiOrigin = `http://127.0.0.1:${apiPort}`
export const userOrigin = `http://127.0.0.1:${userWebPort}`
export const adminOrigin = `http://127.0.0.1:${adminWebPort}`

export const corsOrigins = [
  userOrigin,
  adminOrigin,
  `http://localhost:${userWebPort}`,
  `http://localhost:${adminWebPort}`,
]
