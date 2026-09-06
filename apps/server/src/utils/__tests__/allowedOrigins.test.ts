import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseAllowedOrigins,
  getPreviewOriginRegex,
  getOriginRules,
  isOriginAllowed,
} from '../allowedOrigins'

const DEFAULT_ORIGIN = 'http://localhost:5173'

describe('parseAllowedOrigins', () => {
  it('returns a single exact origin', () => {
    expect(parseAllowedOrigins('https://app.labanda.com')).toEqual([
      'https://app.labanda.com',
    ])
  })

  it('parses a comma-separated list of origins', () => {
    expect(
      parseAllowedOrigins('https://app.labanda.com,https://www.labanda.com'),
    ).toEqual(['https://app.labanda.com', 'https://www.labanda.com'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(
      parseAllowedOrigins('  https://a.com ,, https://b.com ,  '),
    ).toEqual(['https://a.com', 'https://b.com'])
  })

  it('falls back to the dev origin when undefined', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([DEFAULT_ORIGIN])
  })

  it('falls back to the dev origin when the string is empty / only separators', () => {
    expect(parseAllowedOrigins('   ')).toEqual([DEFAULT_ORIGIN])
    expect(parseAllowedOrigins(',,')).toEqual([DEFAULT_ORIGIN])
  })

  it('reads process.env.FRONTEND_URL by default', () => {
    const original = process.env.FRONTEND_URL
    process.env.FRONTEND_URL = 'https://env-origin.com'
    expect(parseAllowedOrigins()).toEqual(['https://env-origin.com'])
    process.env.FRONTEND_URL = original
  })
})

describe('getPreviewOriginRegex', () => {
  it('returns null when not set', () => {
    expect(getPreviewOriginRegex(undefined)).toBeNull()
  })

  it('returns null when set to an empty / whitespace string', () => {
    expect(getPreviewOriginRegex('   ')).toBeNull()
  })

  it('compiles a valid pattern to a RegExp', () => {
    const regex = getPreviewOriginRegex('^https://.*\\.vercel\\.app$')
    expect(regex).toBeInstanceOf(RegExp)
    expect(regex?.test('https://la-banda-git-feat.vercel.app')).toBe(true)
    expect(regex?.test('https://evil.com')).toBe(false)
  })

  it('reads process.env.CORS_PREVIEW_ORIGIN_REGEX by default', () => {
    const original = process.env.CORS_PREVIEW_ORIGIN_REGEX
    process.env.CORS_PREVIEW_ORIGIN_REGEX = '\\.vercel\\.app$'
    expect(getPreviewOriginRegex()).toBeInstanceOf(RegExp)
    process.env.CORS_PREVIEW_ORIGIN_REGEX = original
  })
})

describe('getOriginRules', () => {
  const originalFrontend = process.env.FRONTEND_URL
  const originalPreview = process.env.CORS_PREVIEW_ORIGIN_REGEX

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontend
    process.env.CORS_PREVIEW_ORIGIN_REGEX = originalPreview
  })

  it('builds rules from the environment', () => {
    process.env.FRONTEND_URL = 'https://a.com,https://b.com'
    process.env.CORS_PREVIEW_ORIGIN_REGEX = '\\.vercel\\.app$'

    const rules = getOriginRules()
    expect(rules.allowList).toEqual(['https://a.com', 'https://b.com'])
    expect(rules.previewRegex).toBeInstanceOf(RegExp)
  })

  it('leaves previewRegex null when the env var is absent', () => {
    process.env.FRONTEND_URL = 'https://a.com'
    delete process.env.CORS_PREVIEW_ORIGIN_REGEX

    const rules = getOriginRules()
    expect(rules.previewRegex).toBeNull()
  })
})

describe('isOriginAllowed', () => {
  const exactRules = {
    allowList: ['https://app.labanda.com'],
    previewRegex: null,
  }

  it('allows requests without an Origin header (curl, health checks)', () => {
    expect(isOriginAllowed(undefined, exactRules)).toBe(true)
    expect(isOriginAllowed('', exactRules)).toBe(true)
  })

  it('allows an exact match against the allowlist', () => {
    expect(isOriginAllowed('https://app.labanda.com', exactRules)).toBe(true)
  })

  it('rejects an origin that is not in the allowlist when no regex is set', () => {
    expect(isOriginAllowed('https://app.labanda.com.evil.com', exactRules)).toBe(
      false,
    )
    expect(isOriginAllowed('https://preview.vercel.app', exactRules)).toBe(false)
  })

  it('allows an origin that matches the preview regex', () => {
    const rules = {
      allowList: ['https://app.labanda.com'],
      previewRegex: /^https:\/\/.*\.vercel\.app$/,
    }
    expect(isOriginAllowed('https://la-banda-abc123.vercel.app', rules)).toBe(
      true,
    )
  })

  it('rejects an origin that does not match the preview regex', () => {
    const rules = {
      allowList: ['https://app.labanda.com'],
      previewRegex: /^https:\/\/.*\.vercel\.app$/,
    }
    expect(isOriginAllowed('https://not-vercel.example.com', rules)).toBe(false)
  })

  it('resolves rules from the environment when none are passed', () => {
    const originalFrontend = process.env.FRONTEND_URL
    const originalPreview = process.env.CORS_PREVIEW_ORIGIN_REGEX

    process.env.FRONTEND_URL = 'https://app.labanda.com'
    delete process.env.CORS_PREVIEW_ORIGIN_REGEX

    expect(isOriginAllowed('https://app.labanda.com')).toBe(true)
    expect(isOriginAllowed('https://other.com')).toBe(false)

    process.env.FRONTEND_URL = originalFrontend
    process.env.CORS_PREVIEW_ORIGIN_REGEX = originalPreview
  })
})

describe('isOriginAllowed — CSV + regex integration', () => {
  let originalFrontend: string | undefined
  let originalPreview: string | undefined

  beforeEach(() => {
    originalFrontend = process.env.FRONTEND_URL
    originalPreview = process.env.CORS_PREVIEW_ORIGIN_REGEX
    process.env.FRONTEND_URL =
      'https://app.labanda.com, https://www.labanda.com'
    process.env.CORS_PREVIEW_ORIGIN_REGEX = '^https://la-banda-[a-z0-9-]+\\.vercel\\.app$'
  })

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontend
    process.env.CORS_PREVIEW_ORIGIN_REGEX = originalPreview
  })

  it('accepts every exact origin from the CSV', () => {
    expect(isOriginAllowed('https://app.labanda.com')).toBe(true)
    expect(isOriginAllowed('https://www.labanda.com')).toBe(true)
  })

  it('accepts a matching Vercel preview origin', () => {
    expect(isOriginAllowed('https://la-banda-git-feat-x.vercel.app')).toBe(true)
  })

  it('still rejects unrelated origins', () => {
    expect(isOriginAllowed('https://malicious.vercel.app.evil.com')).toBe(false)
  })
})
