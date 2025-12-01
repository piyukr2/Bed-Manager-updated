import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to make any component resizable
 * Dimensions reset on page refresh for a clean, professional look
 * @param {Object} options - Configuration options
 * @param {number} options.minWidth - Minimum width in pixels
 * @param {number} options.minHeight - Minimum height in pixels
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.maxHeight - Maximum height in pixels
 * @param {boolean} options.enableWidth - Enable width resizing
 * @param {boolean} options.enableHeight - Enable height resizing
 */
export const useResizable = ({
  minWidth = 200,
  minHeight = 150,
  maxWidth = null,
  maxHeight = null,
  enableWidth = true,
  enableHeight = true,
} = {}) => {
  const ref = useRef(null);
  const [isResizing, setIsResizing] = useState(false);
  // Always start with null dimensions (default/natural size) on mount
  const [dimensions, setDimensions] = useState({ width: null, height: null });

  const resizeState = useRef({
    isResizing: false,
    direction: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
  });

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
  }, [handleResize, stopResize]);

  const resetSize = useCallback(() => {
    setDimensions({ width: null, height: null });
  }, []);

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
