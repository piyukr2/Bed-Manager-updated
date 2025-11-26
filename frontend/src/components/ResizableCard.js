import React from 'react';
import useResizable from '../hooks/useResizable';

/**
 * ResizableCard - A wrapper component that makes any card resizable
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {number} props.minWidth - Minimum width in pixels
 * @param {number} props.minHeight - Minimum height in pixels
 * @param {number} props.maxWidth - Maximum width in pixels
 * @param {number} props.maxHeight - Maximum height in pixels
 * @param {boolean} props.enableWidth - Enable width resizing (default: true)
 * @param {boolean} props.enableHeight - Enable height resizing (default: true)
 * @param {string} props.storageKey - LocalStorage key to persist size
 * @param {string} props.className - Additional CSS classes
 */
const ResizableCard = ({
  children,
  minWidth = 250,
  minHeight = 200,
  maxWidth = null,
  maxHeight = null,
  enableWidth = true,
  enableHeight = false,
  storageKey = null,
  className = '',
  ...rest
}) => {
  const {
    ref,
    isResizing,
    dimensions,
    resetSize,
    ResizeHandles,
    style,
  } = useResizable({
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    enableWidth,
    enableHeight,
    storageKey,
  });

  return (
    <div
      ref={ref}
      className={`resizable ${isResizing ? 'resizing' : ''} ${className}`}
      style={style}
      {...rest}
    >
      {children}
      <ResizeHandles />
    </div>
  );
};

export default ResizableCard;
