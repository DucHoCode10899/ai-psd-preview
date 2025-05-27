import Psd from '@webtoon/psd';
import type { Node, Layer as PsdLayer } from '@webtoon/psd';

export interface PsdLayerMetadata {
  id: string;
  name: string;
  type: 'group' | 'layer';
  bounds: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  } | null;
  visible: boolean;
  opacity: number;
  blendMode: string;
  textContent?: string;
  children?: PsdLayerMetadata[];
  parent?: string;
  groupId?: string;
}

// Generate unique IDs for layers
let layerIdCounter = 0;
function generateLayerId(): string {
  return `layer_${layerIdCounter++}`;
}

// Main function to parse the PSD file
export async function parsePsdFile(file: File): Promise<PsdLayerMetadata[]> {
  try {
    // Reset counter when parsing a new file
    layerIdCounter = 0;
    
    // Clear layer labels from sessionStorage when uploading a new file
    sessionStorage.removeItem('psd_layer_labels');
    
    // Read the file as ArrayBuffer
    const arrayBuffer = await readFileAsArrayBuffer(file);
    
    // Parse the PSD using @webtoon/psd
    const psd = Psd.parse(arrayBuffer);
    
    if (!psd || !psd.children) {
      throw new Error('Invalid PSD file or no layers found');
    }
    
    // Process all layers recursively
    const result = await processLayers(psd.children);
    
    // Store in localStorage
    localStorage.setItem('psd_structure', JSON.stringify(result));
    
    return result;
  } catch (error) {
    console.error('Error parsing PSD file:', error);
    throw error;
  }
}

// Convert File to ArrayBuffer
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Process layers recursively
async function processLayers(nodes: Node[], parentId?: string): Promise<PsdLayerMetadata[]> {
  const results: PsdLayerMetadata[] = [];
  
  for (const node of nodes) {
    const layerId = generateLayerId();
    
    if (node.type === "Group") {
      const metadata: PsdLayerMetadata = {
        id: layerId,
        name: node.name || 'Unnamed Group',
        type: 'group',
        bounds: null, // Groups don't have direct bounds
        visible: true, // Groups are always visible in @webtoon/psd
        opacity: 100, // Groups don't have opacity in @webtoon/psd
        blendMode: 'normal', // Groups don't have blend modes in @webtoon/psd
        parent: parentId
      };
      
      if (node.children && node.children.length > 0) {
        metadata.children = await processLayers(node.children, layerId);
        
        // Calculate group bounds from children
        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;
        
        for (const child of metadata.children) {
          if (child.bounds) {
            minLeft = Math.min(minLeft, child.bounds.left);
            minTop = Math.min(minTop, child.bounds.top);
            maxRight = Math.max(maxRight, child.bounds.right);
            maxBottom = Math.max(maxBottom, child.bounds.bottom);
          }
        }
        
        if (minLeft !== Infinity) {
          metadata.bounds = {
            left: minLeft,
            top: minTop,
            right: maxRight,
            bottom: maxBottom
          };
        }
      }
      
      results.push(metadata);
    } else if (node.type === "Layer") {
      const layer = node as PsdLayer;
      const metadata: PsdLayerMetadata = {
        id: layerId,
        name: layer.name || 'Unnamed Layer',
        type: 'layer',
        bounds: {
          top: layer.top,
          left: layer.left,
          bottom: layer.top + layer.height,
          right: layer.left + layer.width
        },
        visible: !layer.isHidden,
        opacity: 100, // @webtoon/psd doesn't expose layer opacity
        blendMode: 'normal', // @webtoon/psd doesn't expose blend modes
        parent: parentId
      };
      
      // Handle text content if available
      if (typeof layer.text === 'string') {
        metadata.textContent = layer.text;
      }
      
      results.push(metadata);
    }
  }
  
  return results;
}

// Helper function to get flattened list of all layers
export function flattenLayers(layers: PsdLayerMetadata[]): PsdLayerMetadata[] {
  let result: PsdLayerMetadata[] = [];
  
  for (const layer of layers) {
    result.push(layer);
    
    if (layer.children && layer.children.length > 0) {
      result = result.concat(flattenLayers(layer.children));
    }
  }
  
  return result;
} 