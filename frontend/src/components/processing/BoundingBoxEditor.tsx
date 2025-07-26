import React, { useState, useRef, useEffect } from 'react';
import { BoundingBox, BoundingBoxGroup } from '../../types/processing';

interface BoundingBoxEditorProps {
  imageUrl: string;
  groups: BoundingBoxGroup[];
  onGroupUpdate: (groupId: string, boundingBox: BoundingBox) => void;
  onGroupCreate: (boundingBox: BoundingBox) => void;
  onGroupDelete: (groupId: string) => void;
  isEditable?: boolean;
}

interface DragState {
  isDragging: boolean;
  isResizing: boolean;
  dragStart: { x: number; y: number };
  originalBox: BoundingBox;
  resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
}

export const BoundingBoxEditor: React.FC<BoundingBoxEditorProps> = ({
  imageUrl,
  groups,
  onGroupUpdate,
  onGroupCreate,
  onGroupDelete,
  isEditable = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    isResizing: false,
    dragStart: { x: 0, y: 0 },
    originalBox: { left: 0, top: 0, width: 0, height: 0 },
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [groups, selectedGroupId, imageLoaded, scale]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    calculateScale();
  };

  const calculateScale = () => {
    if (!imageRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    const scaleX = canvas.width / image.naturalWidth;
    const scaleY = canvas.height / image.naturalHeight;
    setScale(Math.min(scaleX, scaleY));
  };

  const drawCanvas = () => {
    if (!canvasRef.current || !imageRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    const image = imageRef.current;
    const scaledWidth = image.naturalWidth * scale;
    const scaledHeight = image.naturalHeight * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    ctx.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight);

    // Draw bounding boxes
    groups.forEach((group) => {
      drawBoundingBox(ctx, group, offsetX, offsetY);
    });
  };

  const drawBoundingBox = (
    ctx: CanvasRenderingContext2D,
    group: BoundingBoxGroup,
    offsetX: number,
    offsetY: number
  ) => {
    const box = group.boundingBox;
    const isSelected = selectedGroupId === group.id;
    
    // Scale and position the bounding box
    const scaledBox = {
      left: box.left * scale + offsetX,
      top: box.top * scale + offsetY,
      width: box.width * scale,
      height: box.height * scale,
    };

    // Draw bounding box rectangle
    ctx.strokeStyle = isSelected ? '#3b82f6' : group.type === 'manual' ? '#10b981' : '#ef4444';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash(group.type === 'auto' ? [5, 5] : []);
    
    ctx.strokeRect(scaledBox.left, scaledBox.top, scaledBox.width, scaledBox.height);

    // Draw label
    ctx.fillStyle = isSelected ? '#3b82f6' : group.type === 'manual' ? '#10b981' : '#ef4444';
    ctx.font = '12px Arial';
    const label = `${group.type === 'manual' ? 'Manual' : 'Auto'} (${Math.round(group.confidence * 100)}%)`;
    ctx.fillText(label, scaledBox.left, scaledBox.top - 5);

    // Draw resize handles if selected and editable
    if (isSelected && isEditable) {
      drawResizeHandles(ctx, scaledBox);
    }

    ctx.setLineDash([]);
  };

  const drawResizeHandles = (ctx: CanvasRenderingContext2D, box: BoundingBox) => {
    const handleSize = 8;
    const handles = [
      { x: box.left, y: box.top, type: 'nw' },
      { x: box.left + box.width, y: box.top, type: 'ne' },
      { x: box.left, y: box.top + box.height, type: 'sw' },
      { x: box.left + box.width, y: box.top + box.height, type: 'se' },
      { x: box.left + box.width / 2, y: box.top, type: 'n' },
      { x: box.left + box.width / 2, y: box.top + box.height, type: 's' },
      { x: box.left, y: box.top + box.height / 2, type: 'w' },
      { x: box.left + box.width, y: box.top + box.height / 2, type: 'e' },
    ];

    ctx.fillStyle = '#3b82f6';
    handles.forEach((handle) => {
      ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
    });
  };

  const getMousePosition = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const getResizeHandle = (mousePos: { x: number; y: number }, box: BoundingBox) => {
    const handleSize = 8;
    const tolerance = handleSize / 2;

    const handles = [
      { x: box.left, y: box.top, type: 'nw' as const },
      { x: box.left + box.width, y: box.top, type: 'ne' as const },
      { x: box.left, y: box.top + box.height, type: 'sw' as const },
      { x: box.left + box.width, y: box.top + box.height, type: 'se' as const },
      { x: box.left + box.width / 2, y: box.top, type: 'n' as const },
      { x: box.left + box.width / 2, y: box.top + box.height, type: 's' as const },
      { x: box.left, y: box.top + box.height / 2, type: 'w' as const },
      { x: box.left + box.width, y: box.top + box.height / 2, type: 'e' as const },
    ];

    for (const handle of handles) {
      if (
        Math.abs(mousePos.x - handle.x) <= tolerance &&
        Math.abs(mousePos.y - handle.y) <= tolerance
      ) {
        return handle.type;
      }
    }

    return null;
  };

  const isPointInBox = (point: { x: number; y: number }, box: BoundingBox) => {
    return (
      point.x >= box.left &&
      point.x <= box.left + box.width &&
      point.y >= box.top &&
      point.y <= box.top + box.height
    );
  };

  const screenToImageCoordinates = (screenPos: { x: number; y: number }) => {
    if (!imageRef.current || !canvasRef.current) return screenPos;

    const canvas = canvasRef.current;
    const image = imageRef.current;
    const scaledWidth = image.naturalWidth * scale;
    const scaledHeight = image.naturalHeight * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    return {
      x: (screenPos.x - offsetX) / scale,
      y: (screenPos.y - offsetY) / scale,
    };
  };

  const imageToScreenCoordinates = (imagePos: { x: number; y: number }) => {
    if (!imageRef.current || !canvasRef.current) return imagePos;

    const canvas = canvasRef.current;
    const image = imageRef.current;
    const scaledWidth = image.naturalWidth * scale;
    const scaledHeight = image.naturalHeight * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    return {
      x: imagePos.x * scale + offsetX,
      y: imagePos.y * scale + offsetY,
    };
  };

  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState({ x: 0, y: 0 });
  
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditable) return;

    const mousePos = getMousePosition(event);
    const imagePos = screenToImageCoordinates(mousePos);

    // Check if clicking on a group
    for (const group of groups) {
      const screenBox = {
        left: group.boundingBox.left * scale + (canvasRef.current!.width - imageRef.current!.naturalWidth * scale) / 2,
        top: group.boundingBox.top * scale + (canvasRef.current!.height - imageRef.current!.naturalHeight * scale) / 2,
        width: group.boundingBox.width * scale,
        height: group.boundingBox.height * scale,
      };

      // Check for resize handle
      const resizeHandle = getResizeHandle(mousePos, screenBox);
      if (resizeHandle && selectedGroupId === group.id) {
        setDragState({
          isDragging: false,
          isResizing: true,
          dragStart: mousePos,
          originalBox: { ...group.boundingBox },
          resizeHandle,
        });
        return;
      }

      // Check if clicking inside the box
      if (isPointInBox(mousePos, screenBox)) {
        setSelectedGroupId(group.id);
        setDragState({
          isDragging: true,
          isResizing: false,
          dragStart: mousePos,
          originalBox: { ...group.boundingBox },
        });
        return;
      }
    }

    // If not clicking on any group, start creating a new one
    setSelectedGroupId(null);
    setIsCreating(true);
    setCreateStart(imagePos);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditable) return;
    
    const mousePos = getMousePosition(event);
    
    // Handle creating a new bounding box
    if (isCreating) {
      drawCanvas(); // Redraw the canvas to clear any previous drawing
      
      if (!canvasRef.current || !imageRef.current) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const imagePos = screenToImageCoordinates(mousePos);
      
      // Calculate the new bounding box in image coordinates
      const left = Math.min(createStart.x, imagePos.x);
      const top = Math.min(createStart.y, imagePos.y);
      const width = Math.abs(imagePos.x - createStart.x);
      const height = Math.abs(imagePos.y - createStart.y);
      
      // Convert to screen coordinates for drawing
      const screenBox = {
        left: left * scale + (canvasRef.current.width - imageRef.current.naturalWidth * scale) / 2,
        top: top * scale + (canvasRef.current.height - imageRef.current.naturalHeight * scale) / 2,
        width: width * scale,
        height: height * scale,
      };
      
      // Draw the new bounding box
      ctx.strokeStyle = '#10b981'; // Green for new boxes
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(screenBox.left, screenBox.top, screenBox.width, screenBox.height);
      ctx.setLineDash([]);
      
      return;
    }
    
    // Handle dragging or resizing an existing box
    if (!dragState.isDragging && !dragState.isResizing) return;
    
    const deltaX = (mousePos.x - dragState.dragStart.x) / scale;
    const deltaY = (mousePos.y - dragState.dragStart.y) / scale;

    if (!selectedGroupId) return;

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    if (!selectedGroup) return;

    let newBox: BoundingBox;

    if (dragState.isResizing && dragState.resizeHandle) {
      newBox = resizeBoundingBox(dragState.originalBox, deltaX, deltaY, dragState.resizeHandle);
    } else if (dragState.isDragging) {
      newBox = {
        ...dragState.originalBox,
        left: dragState.originalBox.left + deltaX,
        top: dragState.originalBox.top + deltaY,
      };
    } else {
      return;
    }

    // Ensure the box stays within image bounds
    newBox = constrainToImageBounds(newBox);

    onGroupUpdate(selectedGroupId, newBox);
  };

  const resizeBoundingBox = (
    originalBox: BoundingBox,
    deltaX: number,
    deltaY: number,
    handle: string
  ): BoundingBox => {
    let newBox = { ...originalBox };

    switch (handle) {
      case 'nw':
        newBox.left += deltaX;
        newBox.top += deltaY;
        newBox.width -= deltaX;
        newBox.height -= deltaY;
        break;
      case 'ne':
        newBox.top += deltaY;
        newBox.width += deltaX;
        newBox.height -= deltaY;
        break;
      case 'sw':
        newBox.left += deltaX;
        newBox.width -= deltaX;
        newBox.height += deltaY;
        break;
      case 'se':
        newBox.width += deltaX;
        newBox.height += deltaY;
        break;
      case 'n':
        newBox.top += deltaY;
        newBox.height -= deltaY;
        break;
      case 's':
        newBox.height += deltaY;
        break;
      case 'w':
        newBox.left += deltaX;
        newBox.width -= deltaX;
        break;
      case 'e':
        newBox.width += deltaX;
        break;
    }

    // Ensure minimum size
    if (newBox.width < 10) {
      newBox.width = 10;
      if (handle.includes('w')) {
        newBox.left = originalBox.left + originalBox.width - 10;
      }
    }
    if (newBox.height < 10) {
      newBox.height = 10;
      if (handle.includes('n')) {
        newBox.top = originalBox.top + originalBox.height - 10;
      }
    }

    return newBox;
  };

  const constrainToImageBounds = (box: BoundingBox): BoundingBox => {
    if (!imageRef.current) return box;

    const imageWidth = imageRef.current.naturalWidth;
    const imageHeight = imageRef.current.naturalHeight;

    return {
      left: Math.max(0, Math.min(box.left, imageWidth - box.width)),
      top: Math.max(0, Math.min(box.top, imageHeight - box.height)),
      width: Math.min(box.width, imageWidth - Math.max(0, box.left)),
      height: Math.min(box.height, imageHeight - Math.max(0, box.top)),
    };
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // Handle creating a new bounding box
    if (isCreating) {
      const mousePos = getMousePosition(event);
      const imagePos = screenToImageCoordinates(mousePos);
      
      // Calculate the new bounding box in image coordinates
      const left = Math.min(createStart.x, imagePos.x);
      const top = Math.min(createStart.y, imagePos.y);
      const width = Math.abs(imagePos.x - createStart.x);
      const height = Math.abs(imagePos.y - createStart.y);
      
      // Only create if the box has a minimum size
      if (width >= 10 && height >= 10) {
        const newBox: BoundingBox = {
          left,
          top,
          width,
          height,
        };
        
        // Create the new bounding box
        onGroupCreate(newBox);
      }
      
      setIsCreating(false);
      return;
    }
    
    // Reset drag state
    setDragState({
      isDragging: false,
      isResizing: false,
      dragStart: { x: 0, y: 0 },
      originalBox: { left: 0, top: 0, width: 0, height: 0 },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isEditable || !selectedGroupId) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      onGroupDelete(selectedGroupId);
      setSelectedGroupId(null);
    }
  };

  return (
    <div className="relative">
      <img
        ref={imageRef}
        src={imageUrl}
        alt="OCR Image"
        className="hidden"
        onLoad={handleImageLoad}
      />
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-gray-300 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
      
      {/* Controls */}
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600 flex gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-red-500"></div>
                <span>Auto-detected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-green-500"></div>
                <span>Manual</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-500"></div>
                <span>Selected</span>
              </div>
            </div>
            
            {selectedGroupId && (
              <div className="text-sm text-gray-600">
                <p>Selected: {selectedGroupId}</p>
                <p>Press Delete to remove</p>
              </div>
            )}
          </div>
          
          {isEditable && (
            <div className="flex gap-2">
              <button 
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                onClick={() => {
                  // Create a default bounding box in the center of the image
                  if (!imageRef.current) return;
                  
                  const imageWidth = imageRef.current.naturalWidth;
                  const imageHeight = imageRef.current.naturalHeight;
                  
                  const newBox: BoundingBox = {
                    left: imageWidth * 0.25,
                    top: imageHeight * 0.25,
                    width: imageWidth * 0.5,
                    height: imageHeight * 0.5,
                  };
                  
                  onGroupCreate(newBox);
                }}
              >
                Add Box
              </button>
              
              {selectedGroupId && (
                <button 
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  onClick={() => {
                    if (selectedGroupId) {
                      onGroupDelete(selectedGroupId);
                      setSelectedGroupId(null);
                    }
                  }}
                >
                  Delete Selected
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="text-sm text-gray-600">
          <p>Instructions:</p>
          <ul className="list-disc list-inside">
            <li>Click and drag to create a new bounding box</li>
            <li>Click on a box to select it</li>
            <li>Drag a selected box to move it</li>
            <li>Drag the handles to resize a selected box</li>
            <li>Press Delete or use the Delete button to remove a selected box</li>
          </ul>
        </div>
      </div>
    </div>
  );
};