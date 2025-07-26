import { config } from '../config/index.js';
import { AppError, ErrorCode } from './errorHandler.js';

export interface FileValidationOptions {
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  requireImageDimensions?: boolean;
  maxImageWidth?: number;
  maxImageHeight?: number;
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    size: number;
    mimeType: string;
    extension: string;
    dimensions?: {
      width: number;
      height: number;
    };
  };
}

export class FileValidator {
  private static readonly DEFAULT_OPTIONS: FileValidationOptions = {
    maxFileSize: config.maxFileSize,
    allowedMimeTypes: config.allowedFileTypes,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.heic'],
    requireImageDimensions: false,
    maxImageWidth: 4096,
    maxImageHeight: 4096
  };

  /**
   * Comprehensive file validation
   */
  static async validateFile(
    file: Express.Multer.File,
    options: FileValidationOptions = {}
  ): Promise<FileValidationResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic file existence check
    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors, warnings };
    }

    // File size validation
    if (file.size === 0) {
      errors.push('File is empty');
    } else if (opts.maxFileSize && file.size > opts.maxFileSize) {
      errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size of ${this.formatFileSize(opts.maxFileSize)}`);
    }

    // MIME type validation
    if (opts.allowedMimeTypes && !opts.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`File type '${file.mimetype}' is not allowed. Allowed types: ${opts.allowedMimeTypes.join(', ')}`);
    }

    // File extension validation
    const extension = this.getFileExtension(file.originalname);
    if (opts.allowedExtensions && !opts.allowedExtensions.includes(extension.toLowerCase())) {
      errors.push(`File extension '${extension}' is not allowed. Allowed extensions: ${opts.allowedExtensions.join(', ')}`);
    }

    // Filename validation
    const filenameValidation = this.validateFilename(file.originalname);
    if (!filenameValidation.valid) {
      errors.push(...filenameValidation.errors);
      warnings.push(...filenameValidation.warnings);
    }

    // Image-specific validation
    if (file.mimetype.startsWith('image/')) {
      const imageValidation = await this.validateImageFile(file, opts);
      errors.push(...imageValidation.errors);
      warnings.push(...imageValidation.warnings);
    }

    // Security validation
    const securityValidation = this.validateFileSecurity(file);
    errors.push(...securityValidation.errors);
    warnings.push(...securityValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        size: file.size,
        mimeType: file.mimetype,
        extension,
        // Image dimensions would be added by validateImageFile if needed
      }
    };
  }

  /**
   * Validate multiple files
   */
  static async validateFiles(
    files: Express.Multer.File[],
    options: FileValidationOptions = {}
  ): Promise<{ results: FileValidationResult[]; overallValid: boolean }> {
    if (!files || files.length === 0) {
      return {
        results: [{
          valid: false,
          errors: ['No files provided'],
          warnings: []
        }],
        overallValid: false
      };
    }

    const results = await Promise.all(
      files.map(file => this.validateFile(file, options))
    );

    const overallValid = results.every(result => result.valid);

    return { results, overallValid };
  }

  /**
   * Validate filename for security and compatibility
   */
  private static validateFilename(filename: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!filename || filename.trim().length === 0) {
      errors.push('Filename is required');
      return { valid: false, errors, warnings };
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      errors.push('Filename contains invalid characters');
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(filename)) {
      errors.push('Filename uses a reserved system name');
    }

    // Check filename length
    if (filename.length > 255) {
      errors.push('Filename is too long (maximum 255 characters)');
    }

    // Check for hidden files
    if (filename.startsWith('.')) {
      warnings.push('Hidden file detected');
    }

    // Check for unusual extensions
    const extension = this.getFileExtension(filename);
    if (extension.length > 10) {
      warnings.push('Unusual file extension detected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate image-specific properties
   */
  private static async validateImageFile(
    file: Express.Multer.File,
    options: FileValidationOptions
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic image buffer validation
      if (!this.isValidImageBuffer(file.buffer)) {
        errors.push('File does not appear to be a valid image');
        return { errors, warnings };
      }

      // Check for image dimensions if required
      if (options.requireImageDimensions) {
        try {
          const dimensions = await this.getImageDimensions(file.buffer);
          
          if (options.maxImageWidth && dimensions.width > options.maxImageWidth) {
            errors.push(`Image width (${dimensions.width}px) exceeds maximum allowed width of ${options.maxImageWidth}px`);
          }
          
          if (options.maxImageHeight && dimensions.height > options.maxImageHeight) {
            errors.push(`Image height (${dimensions.height}px) exceeds maximum allowed height of ${options.maxImageHeight}px`);
          }

          // Warn about very small images
          if (dimensions.width < 100 || dimensions.height < 100) {
            warnings.push('Image dimensions are very small, OCR quality may be poor');
          }

          // Warn about very large images
          if (dimensions.width > 2048 || dimensions.height > 2048) {
            warnings.push('Large image detected, processing may take longer');
          }
        } catch (error) {
          warnings.push('Could not determine image dimensions');
        }
      }

    } catch (error) {
      errors.push('Error validating image file');
    }

    return { errors, warnings };
  }

  /**
   * Validate file for security concerns
   */
  private static validateFileSecurity(file: Express.Multer.File): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for suspicious file signatures
    if (this.hasSuspiciousSignature(file.buffer)) {
      errors.push('File contains suspicious content');
    }

    // Check for embedded scripts in image files
    if (file.mimetype.startsWith('image/') && this.containsEmbeddedScript(file.buffer)) {
      errors.push('Image file contains embedded script content');
    }

    // Check for polyglot files (files that are valid in multiple formats)
    if (this.isPolyglotFile(file)) {
      warnings.push('File may be valid in multiple formats');
    }

    return { errors, warnings };
  }

  /**
   * Check if buffer contains valid image data
   */
  private static isValidImageBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 8) {
      return false;
    }

    // Check for common image file signatures
    const signatures = [
      [0xFF, 0xD8, 0xFF], // JPEG
      [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
      [0x47, 0x49, 0x46, 0x38], // GIF
      [0x42, 0x4D], // BMP
      [0x49, 0x49, 0x2A, 0x00], // TIFF (little endian)
      [0x4D, 0x4D, 0x00, 0x2A], // TIFF (big endian)
    ];

    return signatures.some(signature => 
      signature.every((byte, index) => buffer[index] === byte)
    );
  }

  /**
   * Get image dimensions (basic implementation)
   */
  private static async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    // This is a simplified implementation
    // In a production environment, you might want to use a library like 'sharp' or 'image-size'
    
    if (buffer.length < 24) {
      throw new Error('Buffer too small to contain image dimensions');
    }

    // PNG dimensions
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG dimensions (simplified - would need more robust parsing in production)
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      // This is a very basic JPEG dimension extraction
      // A proper implementation would parse JPEG segments
      return { width: 1024, height: 768 }; // Placeholder
    }

    throw new Error('Unsupported image format for dimension extraction');
  }

  /**
   * Check for suspicious file signatures
   */
  private static hasSuspiciousSignature(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) {
      return false;
    }

    // Check for executable file signatures
    const suspiciousSignatures = [
      [0x4D, 0x5A], // PE executable
      [0x7F, 0x45, 0x4C, 0x46], // ELF executable
      [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O executable
      [0x50, 0x4B, 0x03, 0x04], // ZIP (could contain executables)
    ];

    return suspiciousSignatures.some(signature => 
      signature.every((byte, index) => buffer[index] === byte)
    );
  }

  /**
   * Check for embedded scripts in image files
   */
  private static containsEmbeddedScript(buffer: Buffer): boolean {
    const scriptPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
    ];

    const bufferString = buffer.toString('utf8');
    return scriptPatterns.some(pattern => pattern.test(bufferString));
  }

  /**
   * Check if file might be a polyglot (valid in multiple formats)
   */
  private static isPolyglotFile(file: Express.Multer.File): boolean {
    // Simple check - in production you might want more sophisticated detection
    const buffer = file.buffer;
    
    // Check if an image file also has ZIP signature
    if (file.mimetype.startsWith('image/') && buffer.length > 4) {
      return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    }

    return false;
  }

  /**
   * Get file extension from filename
   */
  private static getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
  }

  /**
   * Format file size for human readability
   */
  private static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Create validation error from result
   */
  static createValidationError(result: FileValidationResult, filename?: string): AppError {
    const fileRef = filename ? ` for file '${filename}'` : '';
    const message = `File validation failed${fileRef}: ${result.errors.join(', ')}`;
    
    return new AppError(
      ErrorCode.INVALID_INPUT,
      message,
      400,
      false,
      {
        validationErrors: result.errors,
        validationWarnings: result.warnings,
        filename
      }
    );
  }
}