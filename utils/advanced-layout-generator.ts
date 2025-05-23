import { PsdLayerMetadata } from '@/utils/psd-parser';
import { 
  LayoutConfig, 
  GeneratedLayout,
  GeneratedElement,
  Layout
} from '@/types/layout';
import { 
  calculateElementLayout,
  PositionOptions,
  PositionKeyword
} from '@/utils/position-calculator';
import layoutConfigData from '@/data/layoutRules.json';

// Define positioning rule type
interface PositioningRule {
  position: PositionKeyword;
  maxWidthPercent: number;
  maxHeightPercent: number;
}

/**
 * Get fresh layout configuration data
 */
export function getLayoutConfig(): LayoutConfig {
  // Force a fresh copy to avoid caching issues
  const rawConfig = JSON.parse(JSON.stringify(layoutConfigData));
  
  // Extract all layouts from all channels
  const allLayouts = rawConfig.channels.reduce((layouts: Layout[], channel: { layouts: Layout[] }) => {
    return layouts.concat(channel.layouts);
  }, []);
  
  return {
    layouts: allLayouts
  };
}

/**
 * Get all available layouts
 */
export function getAvailableLayouts(): { name: string; aspectRatio: string }[] {
  const config = getLayoutConfig();
  const result: { name: string; aspectRatio: string }[] = [];

  // Collect all options from all layouts
  config.layouts.forEach(layout => {
    if (layout.options) {
      layout.options.forEach(option => {
        result.push({
          name: option.name,
          aspectRatio: layout.aspectRatio
        });
      });
    }
  });

  return result;
}

/**
 * Get labels for each layer from sessionStorage or provide defaults
 */
export function getLayerLabels(): Record<string, string> {
  try {
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    if (storedLabels) {
      return JSON.parse(storedLabels);
    }
  } catch (err) {
    console.error('Error loading layer labels:', err);
  }
  return {};
}

/**
 * Get visibility states from sessionStorage or provide defaults
 */
export function getVisibilityStates(): Record<string, boolean> {
  try {
    const storedVisibility = sessionStorage.getItem('psd_layer_visibility');
    if (storedVisibility) {
      return JSON.parse(storedVisibility);
    }
  } catch (err) {
    console.error('Error loading visibility states:', err);
  }
  return {};
}

/**
 * Find a layer in the layer tree by ID
 */
export function findLayerById(
  layers: PsdLayerMetadata[], 
  layerId: string
): PsdLayerMetadata | null {
  for (const layer of layers) {
    if (layer.id === layerId) return layer;
    if (layer.children) {
      const found = findLayerById(layer.children, layerId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Determine if a layer should be visible based on its own visibility and parent chain
 */
export function shouldLayerBeVisible(
  layer: PsdLayerMetadata,
  visibilityStates: Record<string, boolean>,
  allLayers: PsdLayerMetadata[]
): boolean {
  // Get the layer's own visibility state or use its default
  const layerVisibility = visibilityStates[layer.id] ?? layer.visible;

  // If the layer is hidden, all descendants should be hidden
  if (!layerVisibility) return false;

  // Check parent chain - if any parent is hidden, this layer should be hidden
  let currentLayer = layer;
  while (currentLayer.parent) {
    const parentVisibility = visibilityStates[currentLayer.parent] ?? true;
    if (!parentVisibility) return false;
    
    // Find the parent layer
    const parent = findLayerById(allLayers, currentLayer.parent);
    if (!parent) break;
    currentLayer = parent;
  }

  return true;
}

/**
 * Find layers with specific labels
 */
export function findLayersByLabel(
  layers: PsdLayerMetadata[], 
  labelMap: Record<string, string>
): Record<string, PsdLayerMetadata[]> {
  // Common label types for ad layouts
  const labelTypes = [
    'background',
    'logo',
    'main-subject',
    'domain',
    'product-name',
    'sub-content-1',
    'sub-content-2',
    'cta',
    'disclaimer'
  ];
  
  // Initialize result with empty arrays for each label
  const result: Record<string, PsdLayerMetadata[]> = {};
  labelTypes.forEach(label => {
    result[label] = [];
  });

  // Helper function to process layer and its children recursively
  const processLayer = (layer: PsdLayerMetadata, inheritedLabel?: string) => {
    // Get layer's own label or use inherited label
    const layerLabel = labelMap[layer.id] || inheritedLabel;
    
    // If layer has a valid label, add it to results
    if (layerLabel && labelTypes.includes(layerLabel)) {
      result[layerLabel].push(layer);
    }

    // Process children if any, passing down the label
    if (layer.children) {
      layer.children.forEach(child => {
        processLayer(child, layerLabel); // Pass down the parent's label
      });
    }
  };

  // Process all top-level layers
  layers.forEach(layer => processLayer(layer));
  
  return result;
}

/**
 * Generate a layout based on the specified layout option name
 */
export function generateLayout(
  psdLayers: PsdLayerMetadata[],
  optionName: string,
  options: PositionOptions = {}
): GeneratedLayout | null {
  // Get fresh layout config
  const config = getLayoutConfig();
  
  // Find the layout and option
  let selectedLayout = null;
  let selectedOption = null;
  
  // Search for the option in all layouts
  for (const layout of config.layouts) {
    if (!layout.options) continue;
    
    const option = layout.options.find(opt => opt.name === optionName);
    if (option) {
      selectedLayout = layout;
      selectedOption = option;
      break;
    }
  }
  
  if (!selectedLayout || !selectedOption) {
    console.error(`Layout option "${optionName}" not found`);
    return null;
  }
  
  console.log(`Generating layout: ${optionName} (${selectedLayout.width}x${selectedLayout.height})`);
  
  // Get layer labels and visibility states
  const labelMap = getLayerLabels();
  const visibilityStates = getVisibilityStates();
  
  // Find layers by label
  const labeledLayers = findLayersByLabel(psdLayers, labelMap);
  
  // Create the base layout result
  const result: GeneratedLayout = {
    name: selectedOption.name,
    width: selectedLayout.width,
    height: selectedLayout.height,
    aspectRatio: selectedLayout.aspectRatio,
    elements: []
  };
  
  // Process each label type
  Object.entries(labeledLayers).forEach(([label, layers]) => {
    // Skip if there are no layers with this label
    if (layers.length === 0) return;

    // Check if this label should be visible in this layout
    const isVisible = selectedOption.rules.visibility[label] !== false;
    
    // Get positioning rules for this label
    const positioningRule = selectedOption.rules.positioning[label];
    if (!positioningRule) return;
    
    // Get position and sizing info
    const position = (positioningRule as PositioningRule).position || 'center';
    const maxWidthPercent = positioningRule.maxWidthPercent;
    const maxHeightPercent = positioningRule.maxHeightPercent;
    
    console.log(`Processing ${label} elements: position=${position}, maxWidth=${maxWidthPercent * 100}%, maxHeight=${maxHeightPercent * 100}%`);
    
    // Process each layer with this label
    layers.forEach(layer => {
      if (!layer.bounds) {
        console.warn(`Layer ${layer.name} has no bounds, skipping`);
        return;
      }
      
      // Check if this specific layer should be visible
      const layerVisible = isVisible && shouldLayerBeVisible(layer, visibilityStates, psdLayers);
      if (!layerVisible) return;
      
      // Log original bounds
      const originalWidth = layer.bounds.right - layer.bounds.left;
      const originalHeight = layer.bounds.bottom - layer.bounds.top;
      console.log(`Layer ${layer.name} original size: ${originalWidth}x${originalHeight}`);
      
      // Calculate layout for this element
      const layout = calculateElementLayout(
        position,
        layer.bounds,
        selectedLayout.width,
        selectedLayout.height,
        maxWidthPercent,
        maxHeightPercent,
        options,
        label
      );
      
      // Log calculated dimensions
      console.log(`Layer ${layer.name} (${label}) calculated size: ${layout.dimensions.width}x${layout.dimensions.height} at position ${layout.position.x},${layout.position.y}`);
      
      // Create the element
      const element: GeneratedElement = {
        id: layer.id,
        name: layer.name,
        label,
        x: layout.position.x,
        y: layout.position.y,
        width: layout.dimensions.width,
        height: layout.dimensions.height,
        visible: true,
        parent: layer.parent,
        originalBounds: layer.bounds,
        position
      };
      
      // Add to result
      result.elements.push(element);
    });
  });
  
  console.log(`Generated ${result.elements.length} elements for layout ${optionName}`);
  
  // Add rules to the generated layout for reference
  result.rules = selectedOption.rules;
  
  return result;
}

/**
 * Calculate aspect ratio from dimensions
 */
export function calculateAspectRatio(width: number, height: number): string {
  // Find GCD for simplification
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  };
  
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/**
 * Normalize an aspect ratio string to a number
 */
export function normalizeRatio(ratio: string): number {
  const [width, height] = ratio.split(':').map(Number);
  return width / height;
}

/**
 * Check if two aspect ratios are equivalent
 */
export function areRatiosEquivalent(ratio1: string, ratio2: string): boolean {
  const normalized1 = normalizeRatio(ratio1);
  const normalized2 = normalizeRatio(ratio2);
  // Use a small epsilon for floating-point comparison
  return Math.abs(normalized1 - normalized2) < 0.1;
}

/**
 * Get compatible aspect ratios based on source ratio
 */
export function getCompatibleRatios(sourceRatio: string): string[] {
  // Parse the source ratio, but we don't use the normalized value directly
  normalizeRatio(sourceRatio);
  
  // Common social media ratios
  const commonRatios = {
    SQUARE: '1:1',
    LANDSCAPE: '16:9',
    PORTRAIT_STORY: '9:16',
    PORTRAIT_POST: '4:5'
  };
  
  // Return all ratios except those equivalent to the source
  return Object.values(commonRatios).filter(
    ratio => !areRatiosEquivalent(ratio, sourceRatio)
  );
} 