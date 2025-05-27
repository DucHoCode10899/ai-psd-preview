import { Bounds } from "@/types/layout";

// Define horizontal alignment options
export type HorizontalAlignment = 'left' | 'center' | 'right';

// Define vertical alignment options  
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

// Define position types - keeping existing for backward compatibility
export type PositionKeyword = 
  // Center positions
  | 'center' 
  | 'middle-center'
  // Top positions
  | 'top'
  | 'top-center' 
  | 'middle-top-center'
  // Bottom positions
  | 'bottom'
  | 'bottom-center'
  | 'middle-bottom-center'
  // Left positions
  | 'left'
  | 'left-center'
  | 'middle-left-center'
  // Right positions
  | 'right'
  | 'right-center'
  | 'middle-right-center'
  // Corner positions
  | 'top-left' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-right'
  // Percentage-based positions (10%, 20%, 30%, 40%)
  | 'top-center-10' | 'top-center-20' | 'top-center-30' | 'top-center-40'
  | 'left-center-10' | 'left-center-20' | 'left-center-30' | 'left-center-40'
  | 'right-center-10' | 'right-center-20' | 'right-center-30' | 'right-center-40'
  | 'bottom-center-10' | 'bottom-center-20' | 'bottom-center-30' | 'bottom-center-40'
  // Percentage-based positions (25%, 33%, 66%, 75%)
  | 'top-left-25' | 'top-left-33' | 'top-left-66' | 'top-left-75'
  | 'top-right-25' | 'top-right-33' | 'top-right-66' | 'top-right-75'
  | 'bottom-left-25' | 'bottom-left-33' | 'bottom-left-66' | 'bottom-left-75'
  | 'bottom-right-25' | 'bottom-right-33' | 'bottom-right-66' | 'bottom-right-75'
  | 'left-25' | 'left-33' | 'left-66' | 'left-75'
  | 'right-25' | 'right-33' | 'right-66' | 'right-75'
  | 'top-25' | 'top-33' | 'top-66' | 'top-75'
  | 'bottom-25' | 'bottom-33' | 'bottom-66' | 'bottom-75'
  // Custom coordinate position
  | 'custom';

// New interface for coordinate-based positioning
export interface CoordinatePosition {
  horizontalAlignment: HorizontalAlignment;
  verticalAlignment: VerticalAlignment;
  horizontalOffset?: number; // Percentage offset from alignment point (0-100)
  verticalOffset?: number;   // Percentage offset from alignment point (0-100)
  customX?: number;         // Custom X coordinate (percentage of container width)
  customY?: number;         // Custom Y coordinate (percentage of container height)
}

// Union type for all position types
export type Position = PositionKeyword | CoordinatePosition;

export interface PositionResult {
  x: number;
  y: number;
}

export interface ElementDimensions {
  width: number;
  height: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export interface PositionOptions {
  safezone?: number;
  padding?: number;
  margin?: number;
  elementType?: string;
}

/**
 * Scale an element using "cover" approach - ensures the element covers the entire container
 * while maintaining aspect ratio (like CSS background-size: cover)
 */
export function coverScaleElement(
  originalWidth: number,
  originalHeight: number,
  containerWidth: number,
  containerHeight: number
): ElementDimensions {
  // Calculate aspect ratios
  const imageRatio = originalWidth / originalHeight;
  const containerRatio = containerWidth / containerHeight;
  
  let width, height;
  
  // If container is wider than the image
  if (containerRatio > imageRatio) {
    // Use container width and scale height to maintain aspect ratio
    width = containerWidth;
    height = containerWidth / imageRatio;
  } else {
    // Use container height and scale width to maintain aspect ratio
    height = containerHeight;
    width = containerHeight * imageRatio;
  }
  
  return {
    width: Math.ceil(width),
    height: Math.ceil(height)
  };
}

/**
 * Get position ratio from percentage suffix
 */
function getPositionRatio(position: string): number {
  if (position.endsWith('-10')) return 0.10;
  if (position.endsWith('-20')) return 0.20;
  if (position.endsWith('-25')) return 0.25;
  if (position.endsWith('-30')) return 0.30;
  if (position.endsWith('-33')) return 0.33;
  if (position.endsWith('-40')) return 0.40;
  if (position.endsWith('-66')) return 0.66;
  if (position.endsWith('-75')) return 0.75;
  return 0.5; // default to center
}

/**
 * Calculate position using coordinate-based positioning
 */
function calculateCoordinatePosition(
  coordinatePos: CoordinatePosition,
  element: ElementDimensions,
  container: ContainerDimensions,
  options: PositionOptions = {}
): PositionResult {
  const { safezone = 0, margin = 0 } = options;
  
  // Calculate effective container dimensions after safezone
  const effectiveWidth = container.width - (safezone * 2);
  const effectiveHeight = container.height - (safezone * 2);
  
  let x: number = safezone + (effectiveWidth / 2) - (element.width / 2); // Default to center
  let y: number = safezone + (effectiveHeight / 2) - (element.height / 2); // Default to center
  
  // Handle custom coordinates
  if (coordinatePos.customX !== undefined && coordinatePos.customY !== undefined) {
    x = (coordinatePos.customX / 100) * container.width - (element.width / 2);
    y = (coordinatePos.customY / 100) * container.height - (element.height / 2);
    return { x, y };
  }
  
  // Calculate base position based on alignment
  switch (coordinatePos.horizontalAlignment) {
    case 'left':
      x = safezone + margin;
      break;
    case 'center':
      x = safezone + (effectiveWidth / 2) - (element.width / 2);
      break;
    case 'right':
      x = container.width - element.width - safezone - margin;
      break;
    default:
      // Already set to center as default
      break;
  }
  
  switch (coordinatePos.verticalAlignment) {
    case 'top':
      y = safezone + margin;
      break;
    case 'middle':
      y = safezone + (effectiveHeight / 2) - (element.height / 2);
      break;
    case 'bottom':
      y = container.height - element.height - safezone - margin;
      break;
    default:
      // Already set to center as default
      break;
  }
  
  // Apply offsets if specified
  if (coordinatePos.horizontalOffset !== undefined) {
    const offsetX = (coordinatePos.horizontalOffset / 100) * effectiveWidth;
    x += offsetX;
  }
  
  if (coordinatePos.verticalOffset !== undefined) {
    const offsetY = (coordinatePos.verticalOffset / 100) * effectiveHeight;
    y += offsetY;
  }
  
  return { x, y };
}

/**
 * Calculate position based on position keyword or coordinate position
 */
export function calculatePosition(
  position: Position,
  element: ElementDimensions,
  container: ContainerDimensions,
  options: PositionOptions = {}
): PositionResult {
  const { 
    safezone = 0,
    padding = 0,
    margin = 0,
    elementType
  } = options;

  // Handle null/undefined position - default to center
  if (!position) {
    position = 'center';
  }

  // Handle coordinate-based positioning
  if (typeof position === 'object') {
    return calculateCoordinatePosition(position, element, container, options);
  }

  // Convert position to string for legacy handling
  const positionStr = position as string;

  // Additional safety check for string validity
  if (typeof positionStr !== 'string' || positionStr.trim() === '') {
    console.warn('Invalid position string, defaulting to center');
    const centerX = safezone + (container.width - (safezone * 2)) / 2 - element.width / 2;
    const centerY = safezone + (container.height - (safezone * 2)) / 2 - element.height / 2;
    return { x: centerX, y: centerY };
  }

  // Special handling for background elements - always position at 0,0
  if (elementType === 'background') {
    return { x: 0, y: 0 };
  }

  // Calculate effective container dimensions after safezone
  const effectiveWidth = container.width - (safezone * 2);
  const effectiveHeight = container.height - (safezone * 2);
  
  // Calculate effective element dimensions after padding
  const effectiveElementWidth = element.width + (padding * 2) + (margin * 2);
  const effectiveElementHeight = element.height + (padding * 2) + (margin * 2);
  
  // Handle oversized elements (excluding backgrounds which are handled above)
  if (effectiveElementWidth > container.width || effectiveElementHeight > container.height) {
    const x = (container.width - effectiveElementWidth) / 2;
    const y = (container.height - effectiveElementHeight) / 2;
    return { x, y };
  }
  
  // Base position (center)
  let x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
  let y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);

  // Handle percentage-based positions with format 'direction-center-percent'
  if (positionStr && positionStr.match(/^(top|left|right|bottom)-center-\d+$/)) {
    const ratio = getPositionRatio(positionStr);
    const positionParts = positionStr.split('-');
    const direction = positionParts[0];
    
    switch (direction) {
      case 'top':
        y = safezone + (effectiveHeight * ratio) - (effectiveElementHeight / 2);
        break;
      case 'bottom':
        y = container.height - (effectiveHeight * ratio) - (effectiveElementHeight / 2);
        break;
      case 'left':
        x = safezone + (effectiveWidth * ratio) - (effectiveElementWidth / 2);
        break;
      case 'right':
        x = container.width - (effectiveWidth * ratio) - (effectiveElementWidth / 2);
        break;
    }
    return { x, y };
  }

  // Handle other percentage-based positions
  if (positionStr && positionStr.match(/-(10|20|25|30|33|40|66|75)$/)) {
    const ratio = getPositionRatio(positionStr);
    const basePosition = positionStr.replace(/-(10|20|25|30|33|40|66|75)$/, '');

    // Calculate the position at the specified ratio
    const ratioX = safezone + (effectiveWidth * ratio) - (effectiveElementWidth / 2);
    const ratioY = safezone + (effectiveHeight * ratio) - (effectiveElementHeight / 2);

    switch (basePosition) {
      case 'top-left':
        x = ratioX;
        y = safezone + margin;
        break;
      case 'top-right':
        x = container.width - ratioX - effectiveElementWidth;
        y = safezone + margin;
        break;
      case 'bottom-left':
        x = ratioX;
        y = container.height - effectiveElementHeight - safezone - margin;
        break;
      case 'bottom-right':
        x = container.width - ratioX - effectiveElementWidth;
        y = container.height - effectiveElementHeight - safezone - margin;
        break;
      case 'left':
        x = ratioX;
        y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
        break;
      case 'right':
        x = container.width - ratioX - effectiveElementWidth;
        y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
        break;
      case 'top':
        x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
        y = ratioY;
        break;
      case 'bottom':
        x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
        y = container.height - ratioY - effectiveElementHeight;
        break;
    }
    return { x, y };
  }

  // Calculate based on position keyword
  switch (positionStr) {
    // Center positions
    case 'center':
    case 'middle-center':
      // Already centered (default)
      break;
      
    // Top positions
    case 'top':
    case 'top-center':
      y = safezone + margin;
      x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      break;
      
    case 'middle-top-center':
      // Position halfway between top and center
      const topY = safezone + margin;
      const centerY = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      y = topY + (centerY - topY) / 2;
      x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      break;
      
    // Bottom positions
    case 'bottom':
    case 'bottom-center':
      y = container.height - effectiveElementHeight - safezone - margin;
      x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      break;
      
    case 'middle-bottom-center':
      // Position halfway between bottom and center
      const bottomY = container.height - effectiveElementHeight - safezone - margin;
      const centerBottomY = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      y = bottomY - (bottomY - centerBottomY) / 2;
      x = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      break;
      
    // Left positions
    case 'left':
    case 'left-center':
      x = safezone + margin;
      y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      break;
      
    case 'middle-left-center':
      // Position halfway between left and center
      const leftX = safezone + margin;
      const centerX = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      x = leftX + (centerX - leftX) / 2;
      y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      break;
      
    // Right positions
    case 'right':
    case 'right-center':
      x = container.width - effectiveElementWidth - safezone - margin;
      y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      break;
      
    case 'middle-right-center':
      // Position halfway between right and center
      const rightX = container.width - effectiveElementWidth - safezone - margin;
      const centerRightX = safezone + (effectiveWidth / 2) - (effectiveElementWidth / 2);
      x = rightX - (rightX - centerRightX) / 2;
      y = safezone + (effectiveHeight / 2) - (effectiveElementHeight / 2);
      break;
      
    // Corner positions
    case 'top-left':
      x = safezone + margin;
      y = safezone + margin;
      break;
      
    case 'top-right':
      x = container.width - effectiveElementWidth - safezone - margin;
      y = safezone + margin;
      break;
      
    case 'bottom-left':
      x = safezone + margin;
      y = container.height - effectiveElementHeight - safezone - margin;
      break;
      
    case 'bottom-right':
      x = container.width - effectiveElementWidth - safezone - margin;
      y = container.height - effectiveElementHeight - safezone - margin;
      break;
      
    default:
      console.warn(`Unknown position: ${positionStr}, defaulting to center`);
  }
  
  return { x, y };
}

/**
 * Scale an element while maintaining aspect ratio
 */
export function scaleElement(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): ElementDimensions {
  // Calculate aspect ratio
  const aspectRatio = originalWidth / originalHeight;
  
  // Initial dimensions based on maxWidth
  let width = maxWidth;
  let height = width / aspectRatio;
  
  // If height exceeds maxHeight, scale based on height instead
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  
  return {
    width: Math.floor(width),
    height: Math.floor(height)
  };
}

/**
 * Calculate element dimensions within container based on percentages
 */
export function calculateElementSize(
  originalBounds: Bounds | undefined,
  containerWidth: number,
  containerHeight: number,
  maxWidthPercent: number,
  maxHeightPercent: number,
  elementType?: string
): ElementDimensions {
  if (!originalBounds) {
    return { width: 0, height: 0 };
  }
  
  // Calculate original dimensions
  const originalWidth = Math.max(1, originalBounds.right - originalBounds.left);
  const originalHeight = Math.max(1, originalBounds.bottom - originalBounds.top);
  
  // Special handling for background elements
  if (elementType === 'background') {
    return coverScaleElement(
      originalWidth,
      originalHeight,
      containerWidth,
      containerHeight
    );
  }
  
  // Calculate max dimensions based on percentages
  const maxWidth = Math.floor(maxWidthPercent * containerWidth);
  const maxHeight = Math.floor(maxHeightPercent * containerHeight);
  
  // Scale to fit within max dimensions while maintaining aspect ratio
  return scaleElement(originalWidth, originalHeight, maxWidth, maxHeight);
}

/**
 * Calculate the final element position and dimensions
 */
export function calculateElementLayout(
  position: Position,
  originalBounds: Bounds | undefined,
  containerWidth: number,
  containerHeight: number,
  maxWidthPercent: number,
  maxHeightPercent: number,
  options: PositionOptions = {},
  elementType?: string
): { position: PositionResult; dimensions: ElementDimensions } {
  // Calculate dimensions
  const dimensions = calculateElementSize(
    originalBounds,
    containerWidth,
    containerHeight,
    maxWidthPercent,
    maxHeightPercent,
    elementType
  );
  
  // Calculate position
  const pos = calculatePosition(
    position,
    dimensions,
    { width: containerWidth, height: containerHeight },
    { ...options, elementType }
  );
  
  return {
    position: pos,
    dimensions
  };
}

/**
 * Helper function to create coordinate position
 */
export function createCoordinatePosition(
  horizontalAlignment: HorizontalAlignment,
  verticalAlignment: VerticalAlignment,
  horizontalOffset?: number,
  verticalOffset?: number,
  customX?: number,
  customY?: number
): CoordinatePosition {
  return {
    horizontalAlignment,
    verticalAlignment,
    horizontalOffset,
    verticalOffset,
    customX,
    customY
  };
}

/**
 * Helper function to convert legacy position string to coordinate position
 */
export function legacyPositionToCoordinate(position: string): CoordinatePosition | null {
  switch (position) {
    case 'center':
      return createCoordinatePosition('center', 'middle');
    case 'top-left':
      return createCoordinatePosition('left', 'top');
    case 'top-center':
      return createCoordinatePosition('center', 'top');
    case 'top-right':
      return createCoordinatePosition('right', 'top');
    case 'left-center':
      return createCoordinatePosition('left', 'middle');
    case 'right-center':
      return createCoordinatePosition('right', 'middle');
    case 'bottom-left':
      return createCoordinatePosition('left', 'bottom');
    case 'bottom-center':
      return createCoordinatePosition('center', 'bottom');
    case 'bottom-right':
      return createCoordinatePosition('right', 'bottom');
    default:
      return null;
  }
}

/**
 * Test function for new position types - can be removed in production
 */
export function testNewPositions() {
  // Test container
  const container = { width: 1000, height: 1000 };
  
  // Test element
  const element = { width: 100, height: 100 };
  
  // Test new coordinate positions
  const coordinatePositions: CoordinatePosition[] = [
    createCoordinatePosition('left', 'top'),
    createCoordinatePosition('center', 'middle'),
    createCoordinatePosition('right', 'bottom'),
    createCoordinatePosition('left', 'middle', 25), // 25% offset from left
    createCoordinatePosition('center', 'top', 0, 10), // 10% offset from top
  ];

  // Test calculations to verify functionality
  coordinatePositions.forEach(pos => {
    calculateCoordinatePosition(pos, element, container);
  });

  return true;
} 