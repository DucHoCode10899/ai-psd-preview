import { Bounds } from "@/types/layout";

// Define position types
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
  | 'bottom-25' | 'bottom-33' | 'bottom-66' | 'bottom-75';

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
  
  console.log(`Cover scaling: original=${originalWidth}x${originalHeight}, container=${containerWidth}x${containerHeight}, final=${Math.ceil(width)}x${Math.ceil(height)}`);
  
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
 * Calculate position based on position keyword
 */
export function calculatePosition(
  position: PositionKeyword | string,
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
  if (position.match(/^(top|left|right|bottom)-center-\d+$/)) {
    const ratio = getPositionRatio(position);
    const positionParts = position.split('-');
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
  if (position.match(/-(10|20|25|30|33|40|66|75)$/)) {
    const ratio = getPositionRatio(position);
    const basePosition = position.replace(/-(10|20|25|30|33|40|66|75)$/, '');

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
  switch (position) {
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
      console.warn(`Unknown position: ${position}, defaulting to center`);
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
  
  // Log scaling calculations
  console.log(`Scaling: original=${originalWidth}x${originalHeight}, max=${maxWidth}x${maxHeight}, final=${Math.floor(width)}x${Math.floor(height)}`);
  
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
  
  console.log(`Element size calculation: container=${containerWidth}x${containerHeight}, percentages=${maxWidthPercent}x${maxHeightPercent}, max allowed=${maxWidth}x${maxHeight}`);
  
  // Scale to fit within max dimensions while maintaining aspect ratio
  return scaleElement(originalWidth, originalHeight, maxWidth, maxHeight);
}

/**
 * Calculate the final element position and dimensions
 */
export function calculateElementLayout(
  position: PositionKeyword | string,
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
 * Test function for new position types - can be removed in production
 */
export function testNewPositions() {
  // Test container
  const container = { width: 1000, height: 1000 };
  
  // Test element
  const element = { width: 100, height: 100 };
  
  // Test new position types
  const positions: PositionKeyword[] = [
    'top-center-10',
    'top-center-20', 
    'top-center-30', 
    'top-center-40',
    'left-center-10', 
    'left-center-20', 
    'left-center-30', 
    'left-center-40',
    'right-center-10', 
    'right-center-20', 
    'right-center-30', 
    'right-center-40',
    'bottom-center-10', 
    'bottom-center-20', 
    'bottom-center-30', 
    'bottom-center-40'
  ];
  
  // Log results
  console.log('Testing new position types:');
  positions.forEach(pos => {
    const result = calculatePosition(pos, element, container);
    console.log(`${pos}: (${Math.round(result.x)}, ${Math.round(result.y)})`);
  });
  
  return true;
} 