import sharp from 'sharp';
import { logger } from '../utils/logger.js';

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  progressive?: boolean;
  stripMetadata?: boolean;
}

export interface OptimizedImage {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
  originalSize: number;
  compressionRatio: number;
}

export class ImageOptimizationService {
  private static readonly DEFAULT_OPTIONS: ImageOptimizationOptions = {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 85,
    format: 'jpeg',
    progressive: true,
    stripMetadata: true
  };

  /**
   * Optimize image for storage
   */
  static async optimizeImage(
    inputBuffer: Buffer,
    options: ImageOptimizationOptions = {}
  ): Promise<OptimizedImage> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const originalSize = inputBuffer.length;

    try {
      let pipeline = sharp(inputBuffer);

      // Get original image metadata
      const metadata = await pipeline.metadata();
      logger.debug('Original image metadata:', {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: originalSize
      });

      // Resize if necessary
      if (opts.maxWidth || opts.maxHeight) {
        pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Strip metadata if requested
      if (opts.stripMetadata) {
        pipeline = pipeline.withMetadata({
          exif: {},
          icc: undefined,
          iptc: undefined,
          xmp: undefined
        });
      }

      // Apply format-specific optimizations
      switch (opts.format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality: opts.quality,
            progressive: opts.progressive,
            mozjpeg: true // Use mozjpeg encoder for better compression
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: 9,
            progressive: opts.progressive
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({
            quality: opts.quality,
            effort: 6 // Higher effort for better compression
          });
          break;
      }

      const optimizedBuffer = await pipeline.toBuffer();
      const optimizedMetadata = await sharp(optimizedBuffer).metadata();

      const result: OptimizedImage = {
        buffer: optimizedBuffer,
        format: opts.format!,
        width: optimizedMetadata.width!,
        height: optimizedMetadata.height!,
        size: optimizedBuffer.length,
        originalSize,
        compressionRatio: originalSize / optimizedBuffer.length
      };

      logger.info('Image optimization completed:', {
        originalSize: originalSize,
        optimizedSize: result.size,
        compressionRatio: result.compressionRatio.toFixed(2),
        format: result.format
      });

      return result;
    } catch (error) {
      logger.error('Image optimization failed:', error);
      throw new Error(`Image optimization failed: ${error.message}`);
    }
  }

  /**
   * Create multiple sizes for responsive images
   */
  static async createResponsiveSizes(
    inputBuffer: Buffer,
    sizes: Array<{ width: number; height?: number; suffix: string }>
  ): Promise<Array<OptimizedImage & { suffix: string }>> {
    const results: Array<OptimizedImage & { suffix: string }> = [];

    for (const size of sizes) {
      try {
        const optimized = await this.optimizeImage(inputBuffer, {
          maxWidth: size.width,
          maxHeight: size.height,
          format: 'webp', // Use WebP for responsive images
          quality: 80
        });

        results.push({
          ...optimized,
          suffix: size.suffix
        });
      } catch (error) {
        logger.error(`Failed to create responsive size ${size.suffix}:`, error);
      }
    }

    return results;
  }

  /**
   * Generate thumbnail
   */
  static async generateThumbnail(
    inputBuffer: Buffer,
    size: number = 200
  ): Promise<OptimizedImage> {
    return this.optimizeImage(inputBuffer, {
      maxWidth: size,
      maxHeight: size,
      quality: 75,
      format: 'webp'
    });
  }

  /**
   * Optimize for OCR processing
   */
  static async optimizeForOCR(inputBuffer: Buffer): Promise<OptimizedImage> {
    try {
      let pipeline = sharp(inputBuffer);
      const metadata = await pipeline.metadata();

      // Enhance image for better OCR results
      pipeline = pipeline
        .resize(null, 1200, { // Increase height for better text recognition
          fit: 'inside',
          withoutEnlargement: true
        })
        .sharpen() // Enhance edges
        .normalize() // Normalize contrast
        .grayscale() // Convert to grayscale for better OCR
        .png({ compressionLevel: 6 }); // Use PNG to preserve quality

      const optimizedBuffer = await pipeline.toBuffer();
      const optimizedMetadata = await sharp(optimizedBuffer).metadata();

      return {
        buffer: optimizedBuffer,
        format: 'png',
        width: optimizedMetadata.width!,
        height: optimizedMetadata.height!,
        size: optimizedBuffer.length,
        originalSize: inputBuffer.length,
        compressionRatio: inputBuffer.length / optimizedBuffer.length
      };
    } catch (error) {
      logger.error('OCR optimization failed:', error);
      throw new Error(`OCR optimization failed: ${error.message}`);
    }
  }

  /**
   * Validate image format and size
   */
  static async validateImage(inputBuffer: Buffer): Promise<{
    isValid: boolean;
    format?: string;
    width?: number;
    height?: number;
    size: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const size = inputBuffer.length;

    try {
      const metadata = await sharp(inputBuffer).metadata();

      // Check format
      const supportedFormats = ['jpeg', 'png', 'webp', 'heic'];
      if (!metadata.format || !supportedFormats.includes(metadata.format)) {
        errors.push(`Unsupported format: ${metadata.format}`);
      }

      // Check dimensions
      if (!metadata.width || !metadata.height) {
        errors.push('Invalid image dimensions');
      } else {
        if (metadata.width > 4096 || metadata.height > 4096) {
          errors.push('Image dimensions too large (max 4096x4096)');
        }
        if (metadata.width < 100 || metadata.height < 100) {
          errors.push('Image dimensions too small (min 100x100)');
        }
      }

      // Check file size (max 10MB)
      if (size > 10 * 1024 * 1024) {
        errors.push('File size too large (max 10MB)');
      }

      return {
        isValid: errors.length === 0,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size,
        errors
      };
    } catch (error) {
      errors.push(`Invalid image file: ${error.message}`);
      return {
        isValid: false,
        size,
        errors
      };
    }
  }

  /**
   * Calculate optimal compression settings based on image characteristics
   */
  static async calculateOptimalSettings(inputBuffer: Buffer): Promise<ImageOptimizationOptions> {
    try {
      const metadata = await sharp(inputBuffer).metadata();
      const stats = await sharp(inputBuffer).stats();

      const settings: ImageOptimizationOptions = {
        maxWidth: 2048,
        maxHeight: 2048,
        progressive: true,
        stripMetadata: true
      };

      // Determine optimal format
      if (metadata.hasAlpha) {
        settings.format = 'png';
        settings.quality = 90;
      } else if (stats.isOpaque) {
        settings.format = 'jpeg';
        settings.quality = 85;
      } else {
        settings.format = 'webp';
        settings.quality = 80;
      }

      // Adjust quality based on image characteristics
      const pixelCount = (metadata.width || 0) * (metadata.height || 0);
      if (pixelCount > 2000000) { // Large images
        settings.quality = Math.max((settings.quality || 85) - 10, 70);
      }

      // For images with low entropy (simple graphics), use higher compression
      if (stats.entropy && stats.entropy < 6) {
        settings.quality = Math.max((settings.quality || 85) - 15, 60);
      }

      return settings;
    } catch (error) {
      logger.error('Failed to calculate optimal settings:', error);
      return this.DEFAULT_OPTIONS;
    }
  }
}