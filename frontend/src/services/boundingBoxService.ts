import { apiClient } from '../utils/api';
import { 
  BoundingBox, 
  BoundingBoxDetectionRequest, 
  BoundingBoxDetectionResponse,
  ManualBoundingBoxRequest,
  BoundingBoxGroup 
} from '../types/processing';

class BoundingBoxService {

  /**
   * Detect bounding boxes automatically from OCR results
   */
  async detectBoundingBoxes(request: BoundingBoxDetectionRequest): Promise<BoundingBoxDetectionResponse> {
    const response = await apiClient.post<{ data: BoundingBoxDetectionResponse }>('/boundingBox/detect', request);
    return response.data.data;
  }

  /**
   * Handle manual bounding box adjustments
   */
  async handleManualAdjustment(request: ManualBoundingBoxRequest): Promise<BoundingBoxGroup | null> {
    const response = await apiClient.post<{ data: BoundingBoxGroup }>('/boundingBox/manual', request);
    return request.action === 'delete' ? null : response.data.data;
  }

  /**
   * Update text groupings based on bounding box changes
   */
  async updateTextGroupings(
    groupId: string,
    boundingBox: BoundingBox,
    imageId: string
  ): Promise<{ groupId: string; boundingBox: BoundingBox; textBlocks: any[] }> {
    const response = await apiClient.post<{ data: { groupId: string; boundingBox: BoundingBox; textBlocks: any[] } }>(
      '/boundingBox/update-groupings',
      { groupId, boundingBox, imageId }
    );
    return response.data.data;
  }

  /**
   * Get bounding box groups for an image
   */
  async getBoundingBoxGroups(imageId: string): Promise<{
    imageId: string;
    groups: BoundingBoxGroup[];
    lastUpdated: string;
  }> {
    const response = await apiClient.get<{ data: { imageId: string; groups: BoundingBoxGroup[]; lastUpdated: string } }>(
      `/boundingBox/${imageId}`
    );
    return response.data.data;
  }

  /**
   * Separate overlapping notes
   */
  async separateOverlappingNotes(
    imageId: string,
    overlappingGroups: BoundingBoxGroup[]
  ): Promise<{
    originalGroups: number;
    separatedGroups: number;
    groups: BoundingBoxGroup[];
  }> {
    const response = await apiClient.post<{ 
      data: { originalGroups: number; separatedGroups: number; groups: BoundingBoxGroup[] } 
    }>('/boundingBox/separate', { imageId, overlappingGroups });
    return response.data.data;
  }

  /**
   * Create a new manual bounding box
   */
  async createManualBoundingBox(imageId: string, boundingBox: BoundingBox): Promise<BoundingBoxGroup> {
    return this.handleManualAdjustment({
      imageId,
      boundingBox,
      action: 'create',
    }) as Promise<BoundingBoxGroup>;
  }

  /**
   * Update an existing bounding box
   */
  async updateBoundingBox(
    imageId: string,
    groupId: string,
    boundingBox: BoundingBox
  ): Promise<BoundingBoxGroup> {
    return this.handleManualAdjustment({
      imageId,
      boundingBox,
      action: 'update',
      groupId,
    }) as Promise<BoundingBoxGroup>;
  }

  /**
   * Delete a bounding box group
   */
  async deleteBoundingBox(imageId: string, groupId: string): Promise<void> {
    await this.handleManualAdjustment({
      imageId,
      boundingBox: { left: 0, top: 0, width: 0, height: 0 }, // Dummy box for delete
      action: 'delete',
      groupId,
    });
  }
}

export const boundingBoxService = new BoundingBoxService();