import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// El health check vive inline en server.ts. Importamos la app real pero
// neutralizamos la conexión a Mongo (connectDB corre a nivel de módulo).
vi.mock('../config/db', () => ({ connectDB: vi.fn() }))

let server: http.Server
let baseUrl = ''

beforeAll(async () => {
  const { default: app } = await import('../server')

  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Health test server did not expose a TCP address')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

describe('GET /health', () => {
  it('responds 200 with a JSON liveness payload', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.dbState).toBe('number')
  })
})
