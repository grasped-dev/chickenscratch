export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextBlock {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  type: 'LINE' | 'WORD' | 'CELL';
}

export interface BoundingBoxGroup {
  id: string;
  boundingBox: BoundingBox;
  textBlocks: TextBlock[];
  confidence: number;
  type: 'auto' | 'manual';
}

export interface OCRResponse {
  extractedText: TextBlock[];
  boundingBoxes: BoundingBox[];
  confidence: number;
  processingTime: number;
}

export interface BoundingBoxDetectionRequest {
  imageId: string;
  detectionOptions?: {
    minGroupSize?: number;
    overlapThreshold?: number;
    proximityThreshold?: number;
    useHierarchicalGrouping?: boolean;
  };
}

export interface BoundingBoxDetectionResponse {
  groups: BoundingBoxGroup[];
  ungroupedBlocks: TextBlock[];
  processingTime: number;
  confidence: number;
}

export interface ManualBoundingBoxRequest {
  imageId: string;
  boundingBox: BoundingBox;
  action: 'create' | 'update' | 'delete';
  groupId?: string;
}

export interface SpatialRelationship {
  blockId1: string;
  blockId2: string;
  distance: number;
  relationship: 'above' | 'below' | 'left' | 'right' | 'overlapping' | 'contained';
}