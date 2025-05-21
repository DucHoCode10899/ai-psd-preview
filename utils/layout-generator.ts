import { PsdLayerMetadata } from '@/utils/psd-parser';
import { 
  LayoutConfig, 
  GeneratedLayout
} from '@/types/layout';
import layoutConfigData from '@/data/layoutRules.json';

// Get the most up-to-date config data to avoid caching issues
const getLayoutConfig = (): LayoutConfig => {
  // Force a fresh import of the layout config data
  return JSON.parse(JSON.stringify(layoutConfigData)) as LayoutConfig;
};

// Helper function to calculate position based on position keyword
const calculatePosition = (
  position: string,
  elementWidth: number,
  elementHeight: number,
  containerWidth: number,
  containerHeight: number,
  safezoneWidth: number = 0
): { x: number, y: number } => {
  // Default to center position
  let x = containerWidth / 2 - elementWidth / 2;
  let y = containerHeight / 2 - elementHeight / 2;
  
  // Parse the position string
  switch (position) {
    case 'center':
      // Already set to default center position
      break;
    case 'top-center':
      y = safezoneWidth;
      x = containerWidth / 2 - elementWidth / 2;
      break;
    case 'bottom-center':
      y = containerHeight - elementHeight - safezoneWidth;
      x = containerWidth / 2 - elementWidth / 2;
      break;
    case 'left-center':
      x = safezoneWidth;
      y = containerHeight / 2 - elementHeight / 2;
      break;
    case 'right-center':
      x = containerWidth - elementWidth - safezoneWidth;
      y = containerHeight / 2 - elementHeight / 2;
      break;
    case 'top-left':
      x = safezoneWidth;
      y = safezoneWidth;
      break;
    case 'top-right':
      x = containerWidth - elementWidth - safezoneWidth;
      y = safezoneWidth;
      break;
    case 'bottom-left':
      x = safezoneWidth;
      y = containerHeight - elementHeight - safezoneWidth;
      break;
    case 'bottom-right':
      x = containerWidth - elementWidth - safezoneWidth;
      y = containerHeight - elementHeight - safezoneWidth;
      break;
    // Handle any incorrect position strings by defaulting to center
    default:
      console.warn(`Unknown position: ${position}, defaulting to center`);
  }
  
  return { x, y };
};

// Get labels for each layer from sessionStorage
const getLayerLabels = (): Record<string, string> => {
  try {
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    if (storedLabels) {
      return JSON.parse(storedLabels);
    }
  } catch (err) {
    console.error('Error loading layer labels:', err);
  }
  return {};
};

// Get visibility states from sessionStorage
const getVisibilityStates = (): Record<string, boolean> => {
  try {
    const storedVisibility = sessionStorage.getItem('psd_layer_visibility');
    if (storedVisibility) {
      return JSON.parse(storedVisibility);
    }
  } catch (err) {
    console.error('Error loading visibility states:', err);
  }
  return {};
};

// Find layers with specific labels
const findLayersByLabel = (
  layers: PsdLayerMetadata[], 
  labelMap: Record<string, string>
): Record<string, PsdLayerMetadata[]> => {
  const result: Record<string, PsdLayerMetadata[]> = {};
  
  // Initialize arrays for each label type
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
};

// Update type declarations to include position property
declare module '@/types/layout' {
  interface PositioningRule {
    position: string;
    maxWidthPercent: number;
    maxHeightPercent: number;
  }
  
  interface GeneratedElement {
    position?: string;
  }
}

// Generate a layout based on the specified aspect ratio
export const generateLayout = (
  psdLayers: PsdLayerMetadata[],
  optionName: string,
  safezoneWidth: number = 10
): GeneratedLayout | null => {
  // Get layer labels from sessionStorage
  const labelMap = getLayerLabels();
  
  // Get visibility states from sessionStorage
  const visibilityStates = getVisibilityStates();
  
  // Find all layers grouped by label
  const labeledLayers = findLayersByLabel(psdLayers, labelMap);
  
  // Get layout configuration (always get fresh data)
  const typedLayoutConfig = getLayoutConfig();
  
  // Find the layout and option
  let selectedLayout = null;
  let selectedOption = null;
  
  // Search for the option in all layouts
  for (const layout of typedLayoutConfig.layouts) {
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
  
  // Create the base layout
  const result: GeneratedLayout = {
    name: selectedOption.name,
    width: selectedLayout.width,
    height: selectedLayout.height,
    aspectRatio: selectedLayout.aspectRatio,
    elements: []
  };

  // Helper function to check if a layer should be visible
  const shouldLayerBeVisible = (layer: PsdLayerMetadata): boolean => {
    // Get the layer's own visibility state from sessionStorage or use its default
    const layerVisibility = visibilityStates[layer.id] ?? layer.visible;

    // If the layer is hidden, all descendants should be hidden
    if (!layerVisibility) return false;

    // Check parent chain - if any parent is hidden, this layer should be hidden
    let currentLayer = layer;
    while (currentLayer.parent) {
      const parentVisibility = visibilityStates[currentLayer.parent] ?? true;
      if (!parentVisibility) return false;
      
      // Find the parent layer
      const parent = findLayerInTree(psdLayers, currentLayer.parent);
      if (!parent) break;
      currentLayer = parent;
    }

    return true;
  };

  // Helper function to find a layer in the layer tree
  const findLayerInTree = (layers: PsdLayerMetadata[], layerId: string): PsdLayerMetadata | null => {
    for (const layer of layers) {
      if (layer.id === layerId) return layer;
      if (layer.children) {
        const found = findLayerInTree(layer.children, layerId);
        if (found) return found;
      }
    }
    return null;
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
    
    // Use default size from rules
    const maxWidthPercent = positioningRule.maxWidthPercent;
    const maxHeightPercent = positioningRule.maxHeightPercent;
    
    // Process each layer with this label
    layers.forEach(layer => {
      if (!layer.bounds) return;
      
      // Calculate original dimensions
      const originalWidth = Math.max(1, layer.bounds.right - layer.bounds.left);
      const originalHeight = Math.max(1, layer.bounds.bottom - layer.bounds.top);
      
      // Calculate aspect ratio
      const aspectRatio = originalWidth / originalHeight;
      
      // Calculate dimensions based on percentages
      let finalWidth = Math.floor(maxWidthPercent * selectedLayout.width);
      let finalHeight = Math.floor(finalWidth / aspectRatio);
      
      // If height exceeds max height, scale down based on height
      if (finalHeight > maxHeightPercent * selectedLayout.height) {
        finalHeight = Math.floor(maxHeightPercent * selectedLayout.height);
        finalWidth = Math.floor(finalHeight * aspectRatio);
      }
      
      // Get position from positioning rule
      const position = (positioningRule as unknown as { position: string }).position || 'center';
      
      console.log(`Positioning ${layer.name} (${label}) at ${position}`);
      
      // Calculate x and y positions based on position keyword
      const { x, y } = calculatePosition(
        position,
        finalWidth,
        finalHeight,
        selectedLayout.width,
        selectedLayout.height,
        safezoneWidth
      );
      
      console.log(`Calculated position: x=${x}, y=${y}`);

      result.elements.push({
        id: layer.id,
        name: layer.name,
        label,
        x,
        y,
        width: finalWidth,
        height: finalHeight,
        visible: isVisible && shouldLayerBeVisible(layer),
        parent: layer.parent,
        originalBounds: layer.bounds,
        position
      });
    });
  });
  
  // Add rules to the generated layout for reference
  result.rules = selectedOption.rules;

  return result;
};

// Get available layouts
export const getAvailableLayouts = (): { name: string; aspectRatio: string }[] => {
  // Always get fresh data to avoid caching issues
  const typedLayoutConfig = getLayoutConfig();
  const result: { name: string; aspectRatio: string }[] = [];
  
  // Collect options from all layouts
  typedLayoutConfig.layouts.forEach(layout => {
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
}; 