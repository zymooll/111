import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const runtimeDir = path.join(root, 'runtime', 'e2e', 'api')
const relativeRuntime = path.relative(root, runtimeDir)

if (relativeRuntime.startsWith('..') || path.isAbsolute(relativeRuntime)) {
  throw new Error(`Refusing to prepare E2E runtime outside the repository: ${runtimeDir}`)
}

if (process.env.PW_E2E_KEEP_DATA !== '1') rmSync(runtimeDir, { recursive: true, force: true })
mkdirSync(path.join(runtimeDir, 'uploads'), { recursive: true })

const bundledPython = path.join(root, '.venv', 'Scripts', 'python.exe')
const configuredPython = process.env.E2E_PYTHON
const python = configuredPython
  || (existsSync(bundledPython) ? bundledPython : undefined)
  || (process.platform === 'win32' && existsSync('C:\\Python313\\python.exe') ? 'C:\\Python313\\python.exe' : 'python')

const databasePath = path.join(runtimeDir, 'campus_foodie_e2e.db').replaceAll('\\', '/')
const uploadDir = path.join(runtimeDir, 'uploads')
const child = spawn(python, [
  '-m', 'uvicorn', 'app.main:app',
  '--app-dir', path.join(root, 'backend'),
  '--host', '127.0.0.1',
  '--port', '18000',
  '--log-level', 'warning',
], {
  cwd: root,
  env: {
    ...process.env,
    APP_NAME: 'Campus Foodie E2E API',
    ENVIRONMENT: 'e2e',
    DATABASE_URL: `sqlite:///${databasePath}`,
    UPLOAD_DIR: uploadDir,
    AUTO_SEED: 'true',
    SECRET_KEY: 'e2e-only-secret-key-with-enough-randomness',
    DEEPSEEK_API_KEY: '',
    CORS_ORIGINS: 'http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174',
    USER_WEB_ORIGIN: 'http://127.0.0.1:5173',
  },
  stdio: 'inherit',
})

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  if (child.exitCode === null) child.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('error', (error) => {
  console.error(`Unable to start E2E API with ${python}:`, error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (code !== null) process.exit(code)
  process.exit(signal ? 0 : 1)
})
