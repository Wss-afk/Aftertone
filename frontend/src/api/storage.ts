export interface StorageStatus {
  libraryBytes: number
  diskTotalBytes: number
  diskUsableBytes: number
  reserveBytes: number
  requiredUploadFreeBytes: number
  uploadAllowed: boolean
  volumeRoot: string
}

export async function getStorageStatus(): Promise<StorageStatus> {
  try {
    const response = await fetch('/api/v1/storage')
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      throw Object.assign(new Error(problem?.detail ?? '容量信息暂不可用，请重试。'), { status: response.status, code: problem?.code })
    }
    return await response.json() as StorageStatus
  } catch (error) {
    if (error instanceof TypeError) throw new Error('容量信息暂不可用，请重试。')
    throw error
  }
}
