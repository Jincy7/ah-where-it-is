import { z } from 'zod'
import { VisionError } from '@/lib/ai/gemini'
import { errorResponse, privateJson } from '@/lib/ai/http'
import { getStorageItemDetail } from '@/lib/storage/item-detail-service'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!z.uuid().safeParse(id).success) throw new VisionError('올바른 물품을 선택해주세요', 400)
    return privateJson(await getStorageItemDetail(id))
  } catch (error) { return errorResponse(error) }
}
