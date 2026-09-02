import { cloudinary } from '../config/cloudinary'

type ImageAssetType = 'group-avatars' | 'bar-logos' | 'bar-covers' | 'user-avatars'

/**
 * Sube un buffer de imagen a Cloudinary usando un `public_id` determinístico
 * (`${CLOUDINARY_FOLDER}/<tipo>/<entityId>`). `overwrite: true` + `invalidate: true`
 * hacen que cada entidad tenga un único asset que se reemplaza in-place, sin huérfanos
 * y sin necesidad de `destroy()`. Devuelve el `secure_url` (URL HTTPS absoluta).
 *
 * El product environment de Cloudinary está en **dynamic folders mode**: en ese
 * modo las barras dentro del `public_id` NO determinan la carpeta visible del
 * asset (iría a la raíz del Media Library). Hay que pasar `asset_folder`
 * explícito con el mismo path base que el `public_id` para que quede organizado
 * bajo `${CLOUDINARY_FOLDER}/<tipo>/`. El parámetro `folder` está deprecado para
 * código nuevo en dynamic mode, por eso no se usa.
 */
function uploadImage(buffer: Buffer, assetType: ImageAssetType, entityId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                public_id: `${process.env.CLOUDINARY_FOLDER}/${assetType}/${entityId}`,
                asset_folder: `${process.env.CLOUDINARY_FOLDER}/${assetType}`,
                overwrite: true,
                invalidate: true,
                resource_type: 'image',
            },
            (error, result) => {
                if (error || !result) {
                    reject(error ?? new Error('Cloudinary no devolvió un resultado de subida'))
                    return
                }
                resolve(result.secure_url)
            },
        )
        stream.end(buffer)
    })
}

export async function saveGroupAvatar(buffer: Buffer, entityId: string): Promise<string> {
    return uploadImage(buffer, 'group-avatars', entityId)
}

export async function saveBarLogo(buffer: Buffer, entityId: string): Promise<string> {
    return uploadImage(buffer, 'bar-logos', entityId)
}

export async function saveBarCover(buffer: Buffer, entityId: string): Promise<string> {
    return uploadImage(buffer, 'bar-covers', entityId)
}

export async function saveUserAvatar(buffer: Buffer, entityId: string): Promise<string> {
    return uploadImage(buffer, 'user-avatars', entityId)
}

/**
 * Borra el asset de una entidad en Cloudinary usando el MISMO `public_id`
 * determinístico que `uploadImage` (`${CLOUDINARY_FOLDER}/<tipo>/<entityId>`).
 * Es idempotente: si Cloudinary responde `{ result: 'not found' }` (el asset ya
 * no existe) se resuelve normal, sin lanzar. Solo propaga un error real de
 * red/SDK (la promesa de `destroy` rechaza por su cuenta en ese caso).
 */
export async function deleteImage(assetType: ImageAssetType, entityId: string): Promise<void> {
    const publicId = `${process.env.CLOUDINARY_FOLDER}/${assetType}/${entityId}`

    const result: unknown = await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
        resource_type: 'image',
    })

    if (
        typeof result === 'object' &&
        result !== null &&
        'result' in result &&
        (result as { result: unknown }).result === 'not found'
    ) {
        return
    }
}
