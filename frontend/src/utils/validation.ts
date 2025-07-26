// Frontend validation utilities
// TODO: Import from shared package once it's properly configured
// import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, validateEmail, validateProjectName } from 'chicken-scratch-shared';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateProjectName(name: string): boolean {
  return name.length >= 1 && name.length <= 100;
}



export function validateFile(file: File): { isValid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    return {
      isValid: false,
      error: `File type ${file.type} is not supported. Please use JPEG, PNG, or HEIC files.`
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    };
  }

  return { isValid: true };
}

export function validateFiles(files: File[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const file of files) {
    const validation = validateFile(file);
    if (!validation.isValid && validation.error) {
      errors.push(`${file.name}: ${validation.error}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}