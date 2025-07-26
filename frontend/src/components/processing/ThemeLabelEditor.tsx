import React, { useState, useEffect, useRef } from 'react';
import { clusteringService } from '../../services/clusteringService';
import type { ClusterData } from '../../../shared/src/types/processing';

interface ThemeLabelEditorProps {
  cluster: ClusterData;
  projectId: string;
  onLabelUpdate: (clusterId: string, newLabel: string) => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

export const ThemeLabelEditor: React.FC<ThemeLabelEditorProps> = ({
  cluster,
  projectId,
  onLabelUpdate,
  onCancel,
  isEditing = false
}) => {
  const [label, setLabel] = useState(cluster.label);
  const [originalLabel] = useState(cluster.label);
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isUnique: boolean;
    suggestions?: string[];
  } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const validateLabel = async (labelToValidate: string) => {
    if (labelToValidate.trim() === originalLabel.trim()) {
      setValidationResult({ isUnique: true });
      return;
    }

    try {
      const result = await clusteringService.validateLabelUniqueness(
        projectId,
        labelToValidate.trim(),
        cluster.id
      );
      setValidationResult(result);
      setShowSuggestions(!result.isUnique && !!result.suggestions?.length);
    } catch (error) {
      console.error('Error validating label:', error);
      setValidationResult({ isUnique: true });
    }
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    
    // Debounce validation
    const timeoutId = setTimeout(() => {
      if (newLabel.trim()) {
        validateLabel(newLabel);
      } else {
        setValidationResult(null);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  const handleSave = async () => {
    if (!label.trim() || isLoading) return;

    // Final validation before saving
    await validateLabel(label.trim());
    
    if (validationResult && !validationResult.isUnique) {
      setShowSuggestions(true);
      return;
    }

    setIsLoading(true);
    try {
      await clusteringService.updateClusterLabel(cluster.id, label.trim());
      onLabelUpdate(cluster.id, label.trim());
    } catch (error) {
      console.error('Error updating label:', error);
      // Could show error toast here
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setLabel(originalLabel);
    setValidationResult(null);
    setShowSuggestions(false);
    onCancel?.();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setLabel(suggestion);
    setShowSuggestions(false);
    validateLabel(suggestion);
  };

  const generateAutoLabel = async () => {
    setIsGeneratingLabel(true);
    try {
      const suggestions = await clusteringService.generateThemeLabels(
        projectId,
        [cluster.id]
      );
      
      if (suggestions && suggestions.length > 0) {
        const suggestion = suggestions[0];
        setLabel(suggestion.suggestedLabel);
        await validateLabel(suggestion.suggestedLabel);
      }
    } catch (error) {
      console.error('Error generating auto label:', error);
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 group">
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
          {cluster.label}
        </h3>
        <button
          onClick={() => onCancel?.()} // This would trigger edit mode in parent
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
          title="Edit label"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onKeyDown={handleKeyPress}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              validationResult && !validationResult.isUnique
                ? 'border-red-300 focus:ring-red-500'
                : 'border-gray-300'
            }`}
            placeholder="Enter theme label..."
            disabled={isLoading}
          />
          
          {validationResult && !validationResult.isUnique && (
            <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              This label already exists in the project
            </div>
          )}
        </div>

        <button
          onClick={generateAutoLabel}
          disabled={isGeneratingLabel || isLoading}
          className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Generate automatic label"
        >
          {isGeneratingLabel ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          Auto
        </button>
      </div>

      {showSuggestions && validationResult?.suggestions && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-sm text-yellow-800 mb-2">Suggested alternatives:</p>
          <div className="flex flex-wrap gap-2">
            {validationResult.suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isLoading || !label.trim() || (validationResult && !validationResult.isUnique)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          Save
        </button>
        
        <button
          onClick={handleCancel}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};