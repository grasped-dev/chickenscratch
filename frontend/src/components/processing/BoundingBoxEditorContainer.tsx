import React, { useState, useEffect } from 'react';
import { BoundingBoxEditor } from './BoundingBoxEditor';
import { boundingBoxService } from '../../services/boundingBoxService';
import { BoundingBox, BoundingBoxGroup } from '../../types/processing';

interface BoundingBoxEditorContainerProps {
  imageId: string;
  imageUrl: string;
  onComplete?: () => void;
  isEditable?: boolean;
}

export const BoundingBoxEditorContainer: React.FC<BoundingBoxEditorContainerProps> = ({
  imageId,
  imageUrl,
  onComplete,
  isEditable = true,
}) => {
  const [groups, setGroups] = useState<BoundingBoxGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoDetectOptions, setAutoDetectOptions] = useState({
    minGroupSize: 1,
    overlapThreshold: 0.1,
    proximityThreshold: 50,
    useHierarchicalGrouping: true,
  });

  // Load bounding box groups on mount
  useEffect(() => {
    loadBoundingBoxGroups();
  }, [imageId]);

  const loadBoundingBoxGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await boundingBoxService.getBoundingBoxGroups(imageId);
      setGroups(result.groups);
    } catch (err) {
      console.error('Failed to load bounding box groups:', err);
      setError('Failed to load bounding box groups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoDetect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await boundingBoxService.detectBoundingBoxes({
        imageId,
        detectionOptions: autoDetectOptions,
      });
      
      setGroups(result.groups);
    } catch (err) {
      console.error('Failed to auto-detect bounding boxes:', err);
      setError('Failed to auto-detect bounding boxes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupUpdate = async (groupId: string, boundingBox: BoundingBox) => {
    try {
      const updatedGroup = await boundingBoxService.updateBoundingBox(
        imageId,
        groupId,
        boundingBox
      );
      
      // Update the groups state
      setGroups(prevGroups => 
        prevGroups.map(group => 
          group.id === groupId ? updatedGroup : group
        )
      );
    } catch (err) {
      console.error('Failed to update bounding box:', err);
      setError('Failed to update bounding box. Please try again.');
    }
  };

  const handleGroupCreate = async (boundingBox: BoundingBox) => {
    try {
      const newGroup = await boundingBoxService.createManualBoundingBox(
        imageId,
        boundingBox
      );
      
      // Add the new group to the state
      setGroups(prevGroups => [...prevGroups, newGroup]);
    } catch (err) {
      console.error('Failed to create bounding box:', err);
      setError('Failed to create bounding box. Please try again.');
    }
  };

  const handleGroupDelete = async (groupId: string) => {
    try {
      await boundingBoxService.deleteBoundingBox(imageId, groupId);
      
      // Remove the deleted group from the state
      setGroups(prevGroups => prevGroups.filter(group => group.id !== groupId));
    } catch (err) {
      console.error('Failed to delete bounding box:', err);
      setError('Failed to delete bounding box. Please try again.');
    }
  };

  const handleSeparateOverlapping = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Find overlapping groups
      const overlappingGroups = findOverlappingGroups(groups);
      
      if (overlappingGroups.length === 0) {
        setError('No overlapping groups found.');
        setLoading(false);
        return;
      }
      
      const result = await boundingBoxService.separateOverlappingNotes(
        imageId,
        overlappingGroups
      );
      
      // Replace the original groups with the separated ones
      const overlappingIds = new Set(overlappingGroups.map(g => g.id));
      
      setGroups(prevGroups => [
        ...prevGroups.filter(g => !overlappingIds.has(g.id)),
        ...result.groups,
      ]);
    } catch (err) {
      console.error('Failed to separate overlapping notes:', err);
      setError('Failed to separate overlapping notes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to find overlapping groups
  const findOverlappingGroups = (groups: BoundingBoxGroup[]): BoundingBoxGroup[] => {
    const overlapping: BoundingBoxGroup[] = [];
    
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const group1 = groups[i];
        const group2 = groups[j];
        
        // Calculate overlap
        const overlap = calculateOverlap(group1.boundingBox, group2.boundingBox);
        
        if (overlap > 0.1) { // 10% overlap threshold
          if (!overlapping.includes(group1)) {
            overlapping.push(group1);
          }
          if (!overlapping.includes(group2)) {
            overlapping.push(group2);
          }
        }
      }
    }
    
    return overlapping;
  };

  // Helper function to calculate overlap between two bounding boxes
  const calculateOverlap = (box1: BoundingBox, box2: BoundingBox): number => {
    const left = Math.max(box1.left, box2.left);
    const top = Math.max(box1.top, box2.top);
    const right = Math.min(box1.left + box1.width, box2.left + box2.width);
    const bottom = Math.min(box1.top + box1.height, box2.top + box2.height);
    
    if (left < right && top < bottom) {
      const overlapArea = (right - left) * (bottom - top);
      const box1Area = box1.width * box1.height;
      const box2Area = box2.width * box2.height;
      const unionArea = box1Area + box2Area - overlapArea;
      
      return overlapArea / unionArea; // Intersection over Union (IoU)
    }
    
    return 0;
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Bounding Box Editor</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      <div className="flex gap-4 mb-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          onClick={handleAutoDetect}
          disabled={loading}
        >
          Auto-Detect Boxes
        </button>
        
        <button
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
          onClick={handleSeparateOverlapping}
          disabled={loading}
        >
          Separate Overlapping
        </button>
        
        {onComplete && (
          <button
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 ml-auto"
            onClick={onComplete}
          >
            Complete
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <BoundingBoxEditor
          imageUrl={imageUrl}
          groups={groups}
          onGroupUpdate={handleGroupUpdate}
          onGroupCreate={handleGroupCreate}
          onGroupDelete={handleGroupDelete}
          isEditable={isEditable}
        />
      )}
      
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">Auto-Detection Options</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Minimum Group Size
            </label>
            <input
              type="number"
              min="1"
              value={autoDetectOptions.minGroupSize}
              onChange={(e) => setAutoDetectOptions({
                ...autoDetectOptions,
                minGroupSize: parseInt(e.target.value) || 1,
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Overlap Threshold
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={autoDetectOptions.overlapThreshold}
              onChange={(e) => setAutoDetectOptions({
                ...autoDetectOptions,
                overlapThreshold: parseFloat(e.target.value) || 0.1,
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Proximity Threshold (px)
            </label>
            <input
              type="number"
              min="0"
              value={autoDetectOptions.proximityThreshold}
              onChange={(e) => setAutoDetectOptions({
                ...autoDetectOptions,
                proximityThreshold: parseInt(e.target.value) || 50,
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hierarchical-grouping"
              checked={autoDetectOptions.useHierarchicalGrouping}
              onChange={(e) => setAutoDetectOptions({
                ...autoDetectOptions,
                useHierarchicalGrouping: e.target.checked,
              })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="hierarchical-grouping" className="ml-2 block text-sm text-gray-900">
              Use Hierarchical Grouping
            </label>
          </div>
        </div>
      </div>
      
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">Statistics</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Total Boxes:</span> {groups.length}
          </div>
          <div>
            <span className="font-medium">Auto-detected:</span> {groups.filter(g => g.type === 'auto').length}
          </div>
          <div>
            <span className="font-medium">Manual:</span> {groups.filter(g => g.type === 'manual').length}
          </div>
          <div>
            <span className="font-medium">Average Confidence:</span>{' '}
            {groups.length > 0
              ? Math.round(
                  (groups.reduce((sum, g) => sum + g.confidence, 0) / groups.length) * 100
                ) + '%'
              : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
};