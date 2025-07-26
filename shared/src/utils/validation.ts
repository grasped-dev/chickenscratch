// Shared validation utilities

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function isValidImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(type as any)
}

export function isValidFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateProjectName(name: string): boolean {
  return name.length >= 1 && name.length <= 100
}