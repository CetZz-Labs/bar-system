import { vi, describe, it, expect, beforeEach } from 'vitest'

// LB-101: storage.ts uploads image buffers to Cloudinary via
// cloudinary.uploader.upload_stream. The SDK is fully mocked here — no network.
const { mockUploadStream, mockCloudinaryConfig } = vi.hoisted(() => ({
  mockUploadStream: vi.fn(),
  mockCloudinaryConfig: vi.fn(),
}))

vi.mock('cloudinary', () => ({
  v2: {
    config: mockCloudinaryConfig,
    uploader: { upload_stream: mockUploadStream },
  },
}))

import {
  saveGroupAvatar,
  saveBarLogo,
  saveBarCover,
  saveUserAvatar,
} from '../storage'

const ENTITY_ID = '64b7f0c2e1a2b3c4d5e6f7a8'

type Case = {
  name: string
  fn: (buffer: Buffer, entityId: string) => Promise<string>
  assetType: string
}

const cases: Case[] = [
  { name: 'saveGroupAvatar', fn: saveGroupAvatar, assetType: 'group-avatars' },
  { name: 'saveBarLogo', fn: saveBarLogo, assetType: 'bar-logos' },
  { name: 'saveBarCover', fn: saveBarCover, assetType: 'bar-covers' },
  { name: 'saveUserAvatar', fn: saveUserAvatar, assetType: 'user-avatars' },
]

describe('utils/storage — Cloudinary upload', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_FOLDER = 'labanda/test'
    mockUploadStream.mockReset()
    mockUploadStream.mockImplementation((options: any, callback: any) => ({
      end: (_buffer: Buffer) =>
        callback(undefined, {
          secure_url: `https://res.cloudinary.com/test-cloud/image/upload/${options.public_id}`,
          public_id: options.public_id,
        }),
    }))
  })

  it.each(cases)(
    '$name sends a deterministic public_id (folder from env), overwrite+invalidate, and returns secure_url',
    async ({ fn, assetType }) => {
      const buffer = Buffer.from('fake-image-bytes')

      const url = await fn(buffer, ENTITY_ID)

      expect(mockUploadStream).toHaveBeenCalledTimes(1)
      const [options] = mockUploadStream.mock.calls[0]
      expect(options.public_id).toBe(`labanda/test/${assetType}/${ENTITY_ID}`)
      // Dynamic folders mode: asset_folder (not the public_id slashes, not the
      // deprecated `folder` param) is what places the asset under a real folder.
      expect(options.asset_folder).toBe(`labanda/test/${assetType}`)
      expect(options).not.toHaveProperty('folder')
      expect(options.overwrite).toBe(true)
      expect(options.invalidate).toBe(true)
      expect(options.resource_type).toBe('image')
      // folder segment is driven by process.env.CLOUDINARY_FOLDER
      expect(options.public_id.startsWith(`${process.env.CLOUDINARY_FOLDER}/`)).toBe(true)
      expect(options.asset_folder.startsWith(`${process.env.CLOUDINARY_FOLDER}/`)).toBe(true)
      expect(url).toBe(
        `https://res.cloudinary.com/test-cloud/image/upload/labanda/test/${assetType}/${ENTITY_ID}`
      )
    }
  )

  it('honours a different CLOUDINARY_FOLDER at call time', async () => {
    process.env.CLOUDINARY_FOLDER = 'labanda/prod'

    await saveBarLogo(Buffer.from('x'), ENTITY_ID)

    const [options] = mockUploadStream.mock.calls[0]
    expect(options.public_id).toBe(`labanda/prod/bar-logos/${ENTITY_ID}`)
    expect(options.asset_folder).toBe('labanda/prod/bar-logos')
  })

  it('rejects when Cloudinary returns an error', async () => {
    mockUploadStream.mockImplementation((_options: any, callback: any) => ({
      end: () => callback(new Error('Cloudinary is down'), undefined),
    }))

    await expect(saveUserAvatar(Buffer.from('x'), ENTITY_ID)).rejects.toThrow(
      'Cloudinary is down'
    )
  })

  it('rejects when Cloudinary returns no result and no error', async () => {
    mockUploadStream.mockImplementation((_options: any, callback: any) => ({
      end: () => callback(undefined, undefined),
    }))

    await expect(saveGroupAvatar(Buffer.from('x'), ENTITY_ID)).rejects.toThrow(
      'Cloudinary no devolvió un resultado de subida'
    )
  })

  it('pipes the buffer into the upload stream via stream.end(buffer)', async () => {
    const endSpy = vi.fn()
    mockUploadStream.mockImplementation((options: any, callback: any) => ({
      end: (buffer: Buffer) => {
        endSpy(buffer)
        callback(undefined, { secure_url: 'https://res.cloudinary.com/x', public_id: options.public_id })
      },
    }))

    const buffer = Buffer.from('payload')
    await saveBarCover(buffer, ENTITY_ID)

    expect(endSpy).toHaveBeenCalledWith(buffer)
  })
})
