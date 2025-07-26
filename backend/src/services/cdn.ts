import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ImageOptimizationService, OptimizedImage } from './imageOptimization.js';
import { cacheService } from './cache.js';

export interface CDNUploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  generateThumbnail?: boolean;
  generateResponsive?: boolean;
}

export interface CDNAsset {
  key: string;
  url: string;
  thumbnailUrl?: string;
  responsiveSizes?: Array<{
    size: string;
    url: string;
  }>;
  metadata: {
    size: number;
    contentType: string;
    uploadedAt: Date;
    optimized: boolean;
  };
}

export class CDNService {
  private s3Client: S3Client;
  private bucket: string;
  private cloudFrontDomain?: string;

  constructor() {
    this.s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId!,
        secretAccessKey: config.aws.secretAccessKey!
      }
    });
    
    this.bucket = config.aws.s3Bucket;
    this.cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;
  }

  /**
   * Upload optimized asset to CDN
   */
  async uploadAsset(
    buffer: Buffer,
    key: string,
    options: CDNUploadOptions = {}
  ): Promise<CDNAsset> {
    const {
      contentType = 'application/octet-stream',
      cacheControl = 'public, max-age=31536000', // 1 year
      metadata = {},
      generateThumbnail = false,
      generateResponsive = false
    } = options;

    try {
      // Optimize image if it's an image file
      let optimizedBuffer = buffer;
      let optimized = false;

      if (contentType.startsWith('image/')) {
        const optimizedImage = await ImageOptimizationService.optimizeImage(buffer);
        optimizedBuffer = optimizedImage.buffer;
        optimized = true;
        
        logger.info('Image optimized for CDN:', {
          key,
          originalSize: buffer.length,
          optimizedSize: optimizedBuffer.length,
          compressionRatio: optimizedImage.compressionRatio
        });
      }

      // Upload main asset
      await this.uploadToS3(key, optimizedBuffer, {
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: {
          ...metadata,
          optimized: optimized.toString(),
          uploadedAt: new Date().toISOString()
        }
      });

      const asset: CDNAsset = {
        key,
        url: this.getAssetUrl(key),
        metadata: {
          size: optimizedBuffer.length,
          contentType,
          uploadedAt: new Date(),
          optimized
        }
      };

      // Generate thumbnail if requested
      if (generateThumbnail && contentType.startsWith('image/')) {
        const thumbnail = await ImageOptimizationService.generateThumbnail(buffer);
        const thumbnailKey = this.getThumbnailKey(key);
        
        await this.uploadToS3(thumbnailKey, thumbnail.buffer, {
          ContentType: 'image/webp',
          CacheControl: cacheControl,
          Metadata: {
            ...metadata,
            type: 'thumbnail',
            originalKey: key
          }
        });

        asset.thumbnailUrl = this.getAssetUrl(thumbnailKey);
      }

      // Generate responsive sizes if requested
      if (generateResponsive && contentType.startsWith('image/')) {
        const responsiveSizes = await ImageOptimizationService.createResponsiveSizes(buffer, [
          { width: 480, suffix: 'sm' },
          { width: 768, suffix: 'md' },
          { width: 1024, suffix: 'lg' },
          { width: 1920, suffix: 'xl' }
        ]);

        asset.responsiveSizes = [];

        for (const size of responsiveSizes) {
          const responsiveKey = this.getResponsiveKey(key, size.suffix);
          
          await this.uploadToS3(responsiveKey, size.buffer, {
            ContentType: 'image/webp',
            CacheControl: cacheControl,
            Metadata: {
              ...metadata,
              type: 'responsive',
              size: size.suffix,
              originalKey: key
            }
          });

          asset.responsiveSizes.push({
            size: size.suffix,
            url: this.getAssetUrl(responsiveKey)
          });
        }
      }

      // Cache asset metadata
      await cacheService.set(`cdn:asset:${key}`, asset, { ttl: 3600 });

      logger.info('Asset uploaded to CDN:', {
        key,
        size: asset.metadata.size,
        hasThumbnail: !!asset.thumbnailUrl,
        responsiveSizes: asset.responsiveSizes?.length || 0
      });

      return asset;
    } catch (error) {
      logger.error('CDN upload failed:', error);
      throw new Error(`CDN upload failed: ${error.message}`);
    }
  }

  /**
   * Get asset information from CDN
   */
  async getAsset(key: string): Promise<CDNAsset | null> {
    try {
      // Try cache first
      const cached = await cacheService.get<CDNAsset>(`cdn:asset:${key}`);
      if (cached) {
        return cached;
      }

      // Get from S3
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        return null;
      }

      const asset: CDNAsset = {
        key,
        url: this.getAssetUrl(key),
        metadata: {
          size: response.ContentLength || 0,
          contentType: response.ContentType || 'application/octet-stream',
          uploadedAt: response.LastModified || new Date(),
          optimized: response.Metadata?.optimized === 'true'
        }
      };

      // Cache for future requests
      await cacheService.set(`cdn:asset:${key}`, asset, { ttl: 3600 });

      return asset;
    } catch (error) {
      logger.error('Failed to get asset from CDN:', error);
      return null;
    }
  }

  /**
   * Delete asset from CDN
   */
  async deleteAsset(key: string): Promise<boolean> {
    try {
      // Delete main asset
      await this.deleteFromS3(key);

      // Delete related assets (thumbnail, responsive sizes)
      const thumbnailKey = this.getThumbnailKey(key);
      await this.deleteFromS3(thumbnailKey).catch(() => {}); // Ignore errors

      const responsiveSizes = ['sm', 'md', 'lg', 'xl'];
      for (const size of responsiveSizes) {
        const responsiveKey = this.getResponsiveKey(key, size);
        await this.deleteFromS3(responsiveKey).catch(() => {}); // Ignore errors
      }

      // Remove from cache
      await cacheService.del(`cdn:asset:${key}`);

      logger.info('Asset deleted from CDN:', { key });
      return true;
    } catch (error) {
      logger.error('Failed to delete asset from CDN:', error);
      return false;
    }
  }

  /**
   * Generate signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Get presigned upload URL for direct client uploads
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 300
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      logger.error('Failed to generate presigned upload URL:', error);
      throw new Error(`Failed to generate presigned upload URL: ${error.message}`);
    }
  }

  /**
   * Batch upload multiple assets
   */
  async uploadBatch(
    assets: Array<{
      buffer: Buffer;
      key: string;
      options?: CDNUploadOptions;
    }>
  ): Promise<CDNAsset[]> {
    const results: CDNAsset[] = [];
    const batchSize = 5; // Process 5 uploads concurrently

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      
      const batchPromises = batch.map(({ buffer, key, options }) =>
        this.uploadAsset(buffer, key, options)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error(`Batch upload failed for ${batch[index].key}:`, result.reason);
        }
      });
    }

    return results;
  }

  /**
   * Purge CDN cache for specific assets
   */
  async purgeCache(keys: string[]): Promise<boolean> {
    if (!this.cloudFrontDomain) {
      logger.warn('CloudFront domain not configured, skipping cache purge');
      return false;
    }

    try {
      // This would integrate with CloudFront invalidation API
      // For now, just remove from Redis cache
      for (const key of keys) {
        await cacheService.del(`cdn:asset:${key}`);
      }

      logger.info('CDN cache purged for keys:', keys);
      return true;
    } catch (error) {
      logger.error('Failed to purge CDN cache:', error);
      return false;
    }
  }

  /**
   * Get CDN usage statistics
   */
  async getUsageStats(): Promise<{
    totalAssets: number;
    totalSize: number;
    assetsByType: Record<string, number>;
  }> {
    try {
      // This would typically query CloudWatch or S3 analytics
      // For now, return cached stats if available
      const cached = await cacheService.get('cdn:usage:stats');
      if (cached) {
        return cached;
      }

      // Placeholder implementation
      const stats = {
        totalAssets: 0,
        totalSize: 0,
        assetsByType: {}
      };

      await cacheService.set('cdn:usage:stats', stats, { ttl: 3600 });
      return stats;
    } catch (error) {
      logger.error('Failed to get CDN usage stats:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async uploadToS3(key: string, buffer: Buffer, options: any): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ...options
    });

    await this.s3Client.send(command);
  }

  private async deleteFromS3(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.s3Client.send(command);
  }

  private getAssetUrl(key: string): string {
    if (this.cloudFrontDomain) {
      return `https://${this.cloudFrontDomain}/${key}`;
    }
    return `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
  }

  private getThumbnailKey(originalKey: string): string {
    const parts = originalKey.split('.');
    const extension = parts.pop();
    const baseName = parts.join('.');
    return `${baseName}_thumb.webp`;
  }

  private getResponsiveKey(originalKey: string, size: string): string {
    const parts = originalKey.split('.');
    const extension = parts.pop();
    const baseName = parts.join('.');
    return `${baseName}_${size}.webp`;
  }
}

export const cdnService = new CDNService();