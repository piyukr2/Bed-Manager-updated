import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to make any component resizable
 * @param {Object} options - Configuration options
 * @param {number} options.minWidth - Minimum width in pixels
 * @param {number} options.minHeight - Minimum height in pixels
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.maxHeight - Maximum height in pixels
 * @param {boolean} options.enableWidth - Enable width resizing
 * @param {boolean} options.enableHeight - Enable height resizing
 * @param {string} options.storageKey - LocalStorage key to persist size
 */
export const useResizable = ({
  minWidth = 200,
  minHeight = 150,
  maxWidth = null,
  maxHeight = null,
  enableWidth = true,
  enableHeight = true,
  storageKey = null,
} = {}) => {
  const ref = useRef(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dimensions, setDimensions] = useState(() => {
    // Load from localStorage if storageKey is provided
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved dimensions:', e);
        }
      }
    }
    return { width: null, height: null };
  });

  const resizeState = useRef({
    isResizing: false,
    direction: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
  });

  // Save to localStorage when dimensions change
  useEffect(() => {
    if (storageKey && (dimensions.width || dimensions.height)) {
      localStorage.setItem(storageKey, JSON.stringify(dimensions));
    }
  }, [dimensions, storageKey]);

  const startResize = useCallback((e, direction) => {
    e.preventDefault();
    e.stopPropagation();

    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    
    resizeState.current = {
      isResizing: true,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };

    setIsResizing(true);

    // Add event listeners
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = direction === 'right' ? 'ew-resize' : 
                                  direction === 'bottom' ? 'ns-resize' : 
                                  'nwse-resize';
  }, []);

  const handleResize = useCallback((e) => {
    if (!resizeState.current.isResizing || !ref.current) return;

    const { direction, startX, startY, startWidth, startHeight } = resizeState.current;
    
    let newWidth = startWidth;
    let newHeight = startHeight;

    if (direction === 'right' || direction === 'corner') {
      if (enableWidth) {
        const deltaX = e.clientX - startX;
        newWidth = startWidth + deltaX;
        newWidth = Math.max(minWidth, newWidth);
        if (maxWidth) newWidth = Math.min(maxWidth, newWidth);
      }
    }

    if (direction === 'bottom' || direction === 'corner') {
      if (enableHeight) {
        const deltaY = e.clientY - startY;
        newHeight = startHeight + deltaY;
        newHeight = Math.max(minHeight, newHeight);
        if (maxHeight) newHeight = Math.min(maxHeight, newHeight);
      }
    }

    setDimensions({
      width: enableWidth ? newWidth : null,
      height: enableHeight ? newHeight : null,
    });
  }, [enableWidth, enableHeight, minWidth, minHeight, maxWidth, maxHeight]);

  const stopResize = useCallback(() => {
    resizeState.current.isResizing = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
  }, [handleResize]);

  const resetSize = useCallback(() => {
    setDimensions({ width: null, height: null });
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
      document.body.style.cursor = '';
    };
  }, [handleResize, stopResize]);

  const ResizeHandles = () => (
    <>
      {enableWidth && (
        <div
          className={`resizable-handle resizable-handle-right ${isResizing ? 'active' : ''}`}
          onMouseDown={(e) => startResize(e, 'right')}
        />
      )}
      {enableHeight && (
        <div
          className={`resizable-handle resizable-handle-bottom ${isResizing ? 'active' : ''}`}
          onMouseDown={(e) => startResize(e, 'bottom')}
        />
      )}
      {enableWidth && enableHeight && (
        <div
          className={`resizable-handle resizable-handle-corner ${isResizing ? 'active' : ''}`}
          onMouseDown={(e) => startResize(e, 'corner')}
        />
      )}
      {isResizing && <div className="resizable-overlay active" />}
      <div className="resize-indicator">
        {dimensions.width && `${Math.round(dimensions.width)}px`}
        {dimensions.width && dimensions.height && ' × '}
        {dimensions.height && `${Math.round(dimensions.height)}px`}
      </div>
    </>
  );

  return {
    ref,
    isResizing,
    dimensions,
    resetSize,
    ResizeHandles,
    style: {
      width: dimensions.width ? `${dimensions.width}px` : undefined,
      height: dimensions.height ? `${dimensions.height}px` : undefined,
    },
  };
};

export default useResizable;
