"use client";

import { useState, useEffect, useRef } from 'react';
import { PsdLayerMetadata } from '@/utils/psd-parser';
import { 
  GeneratedLayout 
} from '@/types/layout';
import { 
  generateLayout, 
  calculateAspectRatio,
  areRatiosEquivalent
} from '@/utils/advanced-layout-generator';
import { 
  Canvas, 
  Image as FabricImage, 
  Rect,
  util as fabricUtil
} from 'fabric';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PositionKeyword, CoordinatePosition } from '@/utils/position-calculator';
import { toast, Toaster } from 'sonner';
import type { Node, Layer as PsdLayer } from "@webtoon/psd";
import { useSegmentationRules } from '@/hooks/useSegmentationRules';
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Rnd } from 'react-rnd';
import { Switch } from "@/components/ui/switch";

// Personalization types
type SegmentationType = string;

interface PersonalizationRule {
  type: SegmentationType;
  value: string;
}

interface LayerPersonalization {
  isPersonalized: boolean;
  rules: PersonalizationRule[];
}

interface AdvancedLayoutGeneratorProps {
  psdLayers: PsdLayerMetadata[] | null;
  psdBuffer?: ArrayBuffer;
}

// Add type definitions
interface PsdLayerMetadataWithSafezone extends PsdLayerMetadata {
  applySafezone?: boolean;
}

interface PositionOptions {
  safezone: number;
  margin: number;
  applySafezoneByLayer?: boolean;
}

interface PositioningRule {
  maxWidthPercent: number;
  maxHeightPercent: number;
  alignment?: string;
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  applySafezone?: boolean;
  // Coordinate-based positioning (now default)
  coordinatePosition: CoordinatePosition;
}

interface LayoutOption {
  name: string;
  rules: {
    visibility: Record<string, boolean>;
    positioning: Record<string, PositioningRule>;
    renderOrder?: string[];
  };
  safezoneMargin?: number;
}

interface LayoutRule {
  aspectRatio: string;
  width: number;
  height: number;
  options: LayoutOption[];
}

interface Channel {
  id: string;
  name: string;
  layouts: LayoutRule[];
}

interface LayoutRuleResponse {
  channels: Array<{
    id: string;
    name: string;
    layouts: Array<{
      aspectRatio: string;
      width: number;
      height: number;
      options: Array<LayoutOption>;
    }>;
  }>;
}

interface LayerLink {
  sourceId: string;
  targetId: string;
  type: 'sync-visibility' | 'sync-position' | 'custom';
  description?: string;
}

interface SyncLayerSet {
  mainLayer: string;  // ID of the main layer (e.g., main-subject)
  syncedLayers: string[][];  // Array of alternative synced layer groups
  label: string;  // The label of the main layer
}

interface SafezoneState {
  [label: string]: boolean;
}

export function AdvancedLayoutGenerator({ psdLayers, psdBuffer }: AdvancedLayoutGeneratorProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(false);

  // Function to check for personalized layers
  const hasPersonalizedLayers = () => {
    const storedRules = localStorage.getItem('psd_personalization_rules');
    if (!storedRules) return false;
    
    try {
      const rules = JSON.parse(storedRules) as Record<string, LayerPersonalization>;
      return Object.values(rules).some((layer) => 
        layer.isPersonalized && layer.rules.length > 0
      );
    } catch (error) {
      console.error('Error parsing personalization rules:', error);
      return false;
    }
  };

  // Add function to check for sync links
  const hasSyncLinks = () => {
    const storedLinks = localStorage.getItem('psd_layer_links');
    if (!storedLinks) return false;
    
    try {
      const links = JSON.parse(storedLinks) as LayerLink[];
      return links.length > 0;
    } catch (error) {
      console.error('Error parsing layer links:', error);
      return false;
    }
  };

  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [availableLayouts, setAvailableLayouts] = useState<LayoutRule[]>([]);
  const [availableOptions, setAvailableOptions] = useState<LayoutOption[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [generatedLayout, setGeneratedLayout] = useState<GeneratedLayout | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [margin, setMargin] = useState<number>(0.043); // Default margin of 4.3%
  const [sourceRatio, setSourceRatio] = useState<string | null>(null);
  const [layerImages, setLayerImages] = useState<Map<string, ImageData>>(new Map());
  const [customPositions, setCustomPositions] = useState<Record<string, Record<string, { 
    position: PositionKeyword;
    x: number;
    y: number;
    width: number; 
    height: number; 
    angle?: number;
  }>>>({});
  const [animateElements] = useState(true);
  const [hasPersonalization, setHasPersonalization] = useState(false);
  
  // New personalization states
  const [selectedSegmentationType, setSelectedSegmentationType] = useState<string>('gender');
  const [selectedSegmentationValue, setSelectedSegmentationValue] = useState<string>("");
  
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  
  // Add the segmentation rules hook with only used functions
  const { 
    getValuesForType,
    getSegmentationTypes,
    rules: segmentationRules
  } = useSegmentationRules();

  const [generationDescription, setGenerationDescription] = useState<string>('');

  // Add new state for multiple layouts
  const [multipleLayouts, setMultipleLayouts] = useState<GeneratedLayout[]>([]);

  // Add new state for sync links
  const [hasSync, setHasSync] = useState(false);
  
  // Add new state for gallery modal
  const [showGallery, setShowGallery] = useState(false);
  
  // Add format selection state
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');

  // Add state for grid columns
  const [gridColumns, setGridColumns] = useState(4);

  // Add state for modal fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calculate initial dimensions (90% of viewport)
  const calculateInitialModalDimensions = () => {
    return {
      width: Math.floor(window.innerWidth * 0.9),
      height: Math.floor(window.innerHeight * 0.9)
    };
  };

  // Calculate center position
  const calculateCenterPosition = (dimensions: { width: number; height: number }) => {
    return {
      x: Math.floor((window.innerWidth - dimensions.width)/2),
      y: Math.floor((window.innerHeight - dimensions.height)/2)
    };
  };

  // State for modal position and dimensions
  const [modalDimensions, setModalDimensions] = useState(calculateInitialModalDimensions());
  const [modalPosition, setModalPosition] = useState(calculateCenterPosition(calculateInitialModalDimensions()));

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newDimensions = isFullscreen ? 
        { width: window.innerWidth, height: window.innerHeight } : 
        calculateInitialModalDimensions();
      
      setModalDimensions(newDimensions);
      if (!isFullscreen) {
        setModalPosition(calculateCenterPosition(newDimensions));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    const newIsFullscreen = !isFullscreen;
    setIsFullscreen(newIsFullscreen);
    
    if (newIsFullscreen) {
      setModalDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
      setModalPosition({ x: 0, y: 0 });
    } else {
      const newDimensions = calculateInitialModalDimensions();
      setModalDimensions(newDimensions);
      setModalPosition(calculateCenterPosition(newDimensions));
    }
  };

  // Add new state for storing render order
  const [currentRenderOrder, setCurrentRenderOrder] = useState<string[] | null>(null);

  // Add new state for safezone states
  const [safezoneByLabel, setSafezoneByLabel] = useState<SafezoneState>({});

  // Add new state for sync gallery modal
  const [showSyncGallery, setShowSyncGallery] = useState(false);

  // Add state to force gallery re-renders when custom positions change
  const [galleryRenderKey, setGalleryRenderKey] = useState(0);

  // Add function to calculate grid columns based on width
  const calculateGridColumns = (width: number) => {
    if (width < 768) return 1;
    if (width < 1200) return 2;
    if (width < 1600) return 3;
    return 4;
  };

  // Add useEffect to check for personalized layers
  useEffect(() => {
    setHasPersonalization(hasPersonalizedLayers());

    // Listen for changes in personalization rules
    const handlePersonalizationChange = () => {
      setHasPersonalization(hasPersonalizedLayers());
    };

    window.addEventListener('psd_personalization_change', handlePersonalizationChange);
    return () => {
      window.removeEventListener('psd_personalization_change', handlePersonalizationChange);
    };
  }, []);

  // Add useEffect to check for sync links
  useEffect(() => {
    setHasSync(hasSyncLinks());

    // Listen for changes in layer links
    const handleLinksChange = () => {
      setHasSync(hasSyncLinks());
    };

    window.addEventListener('psd_layer_links_change', handleLinksChange);
    return () => {
      window.removeEventListener('psd_layer_links_change', handleLinksChange);
    };
  }, []);

  // Force gallery re-render when custom positions change
  useEffect(() => {
    setGalleryRenderKey(prev => prev + 1);
  }, [customPositions]);

  // Add function to update safezone states
  const updateSafezoneStates = (option: LayoutOption) => {
    const newSafezoneState: SafezoneState = {};
    
    // Get all labels from positioning rules
    Object.entries(option.rules.positioning).forEach(([label, rules]) => {
      // Default to true unless explicitly set to false
      newSafezoneState[label] = rules.applySafezone !== false;
    });

    setSafezoneByLabel(newSafezoneState);
  };

  // Update safezone states when option changes
  useEffect(() => {
    if (selectedChannelId && selectedAspectRatio && selectedOption) {
      const channel = availableChannels.find(c => c.id === selectedChannelId);
      if (channel) {
        const layout = channel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
        if (layout) {
          const option = layout.options.find(o => o.name === selectedOption);
          if (option) {
            updateSafezoneStates(option);
          }
        }
      }
    }
  }, [selectedChannelId, selectedAspectRatio, selectedOption, availableChannels]);

  // Load available channels
  useEffect(() => {
    const fetchLayoutRules = async () => {
      try {
        const response = await fetch('/api/layout-rules');
        const data = await response.json() as LayoutRuleResponse;
        setAvailableChannels(data.channels.map(channel => ({
          id: channel.id,
          name: channel.name,
          layouts: channel.layouts
        })));
      } catch (error) {
        console.error('Error loading channels:', error);
        toast.error('Failed to load channels');
      }
    };
    
    fetchLayoutRules();
  }, []);

  // Load available layouts when channel changes
  useEffect(() => {
    if (!selectedChannelId) {
      setAvailableLayouts([]);
      return;
    }
    
    const fetchLayouts = async () => {
      try {
        const response = await fetch('/api/layout-rules');
        const data = await response.json() as LayoutRuleResponse;
        const channel = data.channels.find(c => c.id === selectedChannelId);
        
        if (channel) {
          setAvailableLayouts(channel.layouts);
        } else {
          setAvailableLayouts([]);
        }
      } catch (error) {
        console.error('Error loading layout ratios:', error);
        toast.error('Failed to load layout ratios');
      }
    };
    
    fetchLayouts();
  }, [selectedChannelId]);
  
  // Load available options when aspect ratio changes
  useEffect(() => {
    if (!selectedChannelId || !selectedAspectRatio) {
      setAvailableOptions([]);
      return;
    }
    
    const fetchOptions = async () => {
      try {
        const response = await fetch('/api/layout-rules');
        const data = await response.json() as LayoutRuleResponse;
        const channel = data.channels.find(c => c.id === selectedChannelId);
        
        if (channel) {
          const layout = channel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
          
          if (layout && layout.options) {
            setAvailableOptions(layout.options);
          } else {
            setAvailableOptions([]);
          }
        } else {
          setAvailableOptions([]);
        }
      } catch (error) {
        console.error('Error loading layout options:', error);
        toast.error('Failed to load layout options');
      }
    };
    
    fetchOptions();
  }, [selectedChannelId, selectedAspectRatio]);
  
  // Initialize canvas when component mounts
  useEffect(() => {
    if (!canvasRef.current) return;
    
    fabricCanvasRef.current = new Canvas(canvasRef.current, {
      backgroundColor: '#f9f9f9',
      width: 800,
      height: 500,
      centeredScaling: true,
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(100, 100, 255, 0.3)',
      selectionBorderColor: '#6366F1',
      selectionLineWidth: 1
    });
    
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, []);

  // Calculate source ratio when PSD layers are loaded
  useEffect(() => {
    if (psdLayers && psdLayers.length > 0) {
      // Find a reference layer with bounds for source ratio calculation
      const referenceLayer = psdLayers.find(layer => layer.bounds) || psdLayers[0];
      if (referenceLayer.bounds) {
        const width = referenceLayer.bounds.right - referenceLayer.bounds.left;
        const height = referenceLayer.bounds.bottom - referenceLayer.bounds.top;
        const ratio = calculateAspectRatio(width, height);
        setSourceRatio(ratio);
      }
    }
  }, [psdLayers]);

  // Process PSD buffer to extract layer images
  useEffect(() => {
    if (!psdBuffer || !psdLayers) return;

    const processLayers = async () => {
      try {
        const Psd = (await import('@webtoon/psd')).default;
        const psd = Psd.parse(psdBuffer);
        const images = new Map<string, ImageData>();

        // Extract images from each layer
        const processNode = async (node: Node) => {
          if (node.type === "Layer") {
            const layer = node as PsdLayer;
            try {
              const layerBuffer = await layer.composite();
              if (layerBuffer) {
                const imageData = new ImageData(
                  new Uint8ClampedArray(layerBuffer),
                  layer.width,
                  layer.height
                );
                images.set(layer.name || '', imageData);
              }
            } catch (error) {
              console.error(`Error processing layer ${layer.name}:`, error);
            }
          }

          // Process children recursively
          if (node.children) {
            for (const child of node.children) {
              await processNode(child);
            }
          }
        };

        await processNode(psd);
        setLayerImages(images);
      } catch (error) {
        console.error("Error processing PSD layers:", error);
        toast.error("Error processing PSD layers");
      }
    };

    processLayers();
  }, [psdBuffer, psdLayers]);

  // Filter options by selected channel
  const filteredOptions = availableOptions;

  // Filter aspect ratios by selected channel and compatible ratios
  const filteredAspectRatios = availableLayouts.filter(layout => {
    // Skip layouts that have the same aspect ratio as the source
    if (!sourceRatio) return false;
    
    if (areRatiosEquivalent(layout.aspectRatio, sourceRatio)) {
      return false;
    }
    
    return true;
  });

  // Update canvas rendering effect to use safezone states
  useEffect(() => {
    if (!fabricCanvasRef.current || !generatedLayout) return;
    
    // Get layer labels from session storage
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    if (!storedLabels) {
      console.error('Missing layer labels data');
      return;
    }

    let labels: Record<string, string>;
    try {
      labels = JSON.parse(storedLabels);
    } catch (error) {
      console.error('Error parsing layer labels:', error);
      return;
    }
    
    const canvas = fabricCanvasRef.current;
    
    // Clear canvas
    canvas.clear();
    
    // Get container dimensions
    const containerEl = canvas.getElement().parentElement;
    if (!containerEl) {
      console.error("Container element not found");
      return;
    }
    
    // Calculate canvas dimensions
    const containerWidth = containerEl.clientWidth || 800;
    const layoutAspectRatio = generatedLayout.width / generatedLayout.height;
    const canvasWidth = containerWidth;
    const canvasHeight = containerWidth / layoutAspectRatio;
    
    // Update container and canvas
    containerEl.style.minHeight = `${canvasHeight}px`;
    canvas.setDimensions({
      width: canvasWidth,
      height: canvasHeight
    });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    // Calculate scale
    const scaleX = canvasWidth / generatedLayout.width;
    const scaleY = canvasHeight / generatedLayout.height;
    const scale = Math.min(scaleX, scaleY);
    
    // Add background
    const background = new Rect({
      left: 0,
      top: 0,
      width: canvasWidth,
      height: canvasHeight,
      fill: 'white',
      stroke: '#cccccc',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    canvas.add(background);

    // Add safezone boundaries based on layout option's safezone margin
    const safezoneMargin = margin; // Margin is already in decimal form
    const safezone = new Rect({
      left: canvasWidth * safezoneMargin,
      top: canvasHeight * safezoneMargin,
      width: canvasWidth * (1 - 2 * safezoneMargin),
      height: canvasHeight * (1 - 2 * safezoneMargin),
      fill: 'transparent',
      stroke: '#2563eb',
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    canvas.add(safezone);
    
    // Track elements added for logging
    let elementsAdded = 0;
    
    // Get any custom positions for this layout
    const layoutCustomPositions = customPositions[generatedLayout.name] || {};

    // Sort elements based on render order
    let elementsToRender = [...generatedLayout.elements];
    if (currentRenderOrder) {
      // Create a map for quick label lookup
      const elementsByLabel = new Map();
      elementsToRender.forEach(element => {
        if (!elementsByLabel.has(element.label)) {
          elementsByLabel.set(element.label, []);
        }
        elementsByLabel.get(element.label).push(element);
      });

      // Sort elements according to render order
      elementsToRender = currentRenderOrder.flatMap(label => 
        elementsByLabel.get(label) || []
      );

      // Add any remaining elements not in render order at the end
      const remainingElements = elementsToRender.filter(element => 
        !currentRenderOrder.includes(element.label)
      );
      elementsToRender = [...elementsToRender, ...remainingElements];

    } else {
      // If no render order specified, render background first, then other elements
      elementsToRender.sort((a, b) => {
        if (a.label === 'background') return -1;
        if (b.label === 'background') return 1;
        return 0;
      });
    }

    // Render elements in order
    for (const element of elementsToRender) {
      try {
        if (!element.visible) continue;
        
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        const elementWidth = layoutCustomPositions[element.id]?.width || element.width;
        const elementHeight = layoutCustomPositions[element.id]?.height || element.height;
        
        tempCanvas.width = Math.max(1, elementWidth);
        tempCanvas.height = Math.max(1, elementHeight);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          const imageData = layerImages.get(element.name);
          
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = Math.max(1, imageData.width);
            originalCanvas.height = Math.max(1, imageData.height);
            const originalCtx = originalCanvas.getContext('2d');
            
            if (originalCtx) {
              originalCtx.putImageData(imageData, 0, 0);
              
              try {
                ctx.drawImage(
                  originalCanvas,
                  0, 0, imageData.width, imageData.height,
                  0, 0, elementWidth, elementHeight
                );
              } catch (error) {
                console.error(`Error drawing image for layer ${element.name}:`, error);
                ctx.fillStyle = getLabelColor(element.label);
                ctx.fillRect(0, 0, elementWidth, elementHeight);
              }
            }
          } else {
            ctx.fillStyle = getLabelColor(element.label);
            ctx.fillRect(0, 0, elementWidth, elementHeight);
            
            // Add label text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(element.label, elementWidth / 2, elementHeight / 2);
          }
        }
        
        // Calculate final position with scale and safezone
        const customPosition = layoutCustomPositions[element.id];
        let left = (customPosition ? customPosition.x : element.x) * scale;
        let top = (customPosition ? customPosition.y : element.y) * scale;

        // Apply safezone if enabled for this element's label
        const elementLabel = labels[element.id] || labels[`layer_${element.id}`];
        if (safezoneByLabel[elementLabel] !== false) {
          const safeLeft = canvasWidth * safezoneMargin;
          const safeTop = canvasHeight * safezoneMargin;
          const safeWidth = canvasWidth * (1 - 2 * safezoneMargin);
          const safeHeight = canvasHeight * (1 - 2 * safezoneMargin);

          // Ensure element stays within safezone
          left = Math.max(safeLeft, Math.min(safeLeft + safeWidth - elementWidth * scale, left));
          top = Math.max(safeTop, Math.min(safeTop + safeHeight - elementHeight * scale, top));
        }
        
        // Create fabric image
        const fabricImage = new FabricImage(tempCanvas, {
          left: animateElements ? (element.originalBounds ? element.originalBounds.left * scale : -elementWidth * scale) : left,
          top: animateElements ? (element.originalBounds ? element.originalBounds.top * scale : canvas.height / 2) : top,
          width: elementWidth,
          height: elementHeight,
          scaleX: scale,
          scaleY: scale,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          lockRotation: false,
          transparentCorners: false,
          cornerColor: '#3b82f6',
          cornerSize: 8,
          cornerStyle: 'circle',
          borderColor: '#3b82f6',
          borderScaleFactor: 1,
          angle: customPosition?.angle || 0,
          opacity: animateElements ? 0 : (isGenerating ? 0.7 : 1)
        });
        
        // Add custom properties
        fabricImage.set('id', element.id);
        fabricImage.set('elementName', element.name);
        fabricImage.set('elementLabel', element.label);
        fabricImage.set('position', element.position);
        
        // Add modified event handler
        fabricImage.on('modified', () => {
          const newPosition = {
            position: element.position as PositionKeyword,
            x: Math.round(fabricImage.left! / scale),
            y: Math.round(fabricImage.top! / scale),
            width: Math.round(fabricImage.width! * fabricImage.scaleX! / scale),
            height: Math.round(fabricImage.height! * fabricImage.scaleY! / scale),
            angle: fabricImage.angle
          };
          
          // Update custom positions for current layout and sync to all layouts that contain this element
          setCustomPositions(prev => {
            const updatedPositions = { ...prev };
            
            // Update current layout
            updatedPositions[generatedLayout.name] = {
              ...(updatedPositions[generatedLayout.name] || {}),
              [element.id]: newPosition
            };
            
            // Sync to all other layouts that contain this element
            // We capture multipleLayouts at the time of event handler creation
            const currentMultipleLayouts = multipleLayouts;
            currentMultipleLayouts.forEach(layout => {
              if (layout.name !== generatedLayout.name) {
                const hasElement = layout.elements.some(el => el.id === element.id);
                if (hasElement) {
                  updatedPositions[layout.name] = {
                    ...(updatedPositions[layout.name] || {}),
                    [element.id]: newPosition
                  };
                }
              }
            });
            
            return updatedPositions;
          });
        });
        
        // Add the fabric image to canvas
        canvas.add(fabricImage);
        elementsAdded++;
        
        // Animate the element into position if animation is enabled
        if (animateElements && !isGenerating) {
          const delay = 150 * elementsAdded;
          
          setTimeout(() => {
            fabricImage.animate({
              left: left,
              top: top,
              opacity: 1
            }, {
              duration: 800,
              onChange: canvas.renderAll.bind(canvas),
              easing: fabricUtil.ease.easeOutCubic
            });
          }, delay);
        }
      } catch (error) {
        console.error(`Error rendering element ${element.name}:`, error);
      }
    }
    
    // Render canvas
    if (elementsAdded > 0) {
      canvas.renderAll();
    }
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedLayout, layerImages, customPositions, margin, isGenerating, animateElements, currentRenderOrder, availableOptions, safezoneByLabel]);

  // Function to find all sync sets in the layers with support for multiple alternatives
  const findSyncSets = (layers: PsdLayerMetadata[], labels: Record<string, string>, links: LayerLink[]): SyncLayerSet[] => {
    const sets: SyncLayerSet[] = [];
    const processedLayers = new Set<string>();

    // Helper to get layer ID with or without 'layer_' prefix
    const normalizeLayerId = (id: string) => id.startsWith('layer_') ? id : `layer_${id}`;

    // First, group links by source layer
    const linksBySource = new Map<string, LayerLink[]>();
    links.forEach(link => {
      if (link.type === 'sync-visibility') {
        const sourceId = normalizeLayerId(link.sourceId);
        if (!linksBySource.has(sourceId)) {
          linksBySource.set(sourceId, []);
        }
        linksBySource.get(sourceId)?.push(link);
      }
    });

    // Process each layer
    layers.forEach(layer => {
      const layerId = normalizeLayerId(layer.id);
      const label = labels[layerId] || labels[layer.id];

      // Skip if already processed or no label
      if (processedLayers.has(layerId) || !label) return;

      // Find all synchronized layers for this layer
      const sourceLinks = linksBySource.get(layerId) || [];
      
      if (sourceLinks.length > 0) {
        // Group target layers by their labels to identify alternatives
        const targetsByLabel = new Map<string, string[]>();
        
        sourceLinks.forEach(link => {
          const targetId = normalizeLayerId(link.targetId);
          const targetLayer = layers.find(l => normalizeLayerId(l.id) === targetId);
          if (targetLayer) {
            const targetLabel = labels[targetId] || labels[targetLayer.id];
            if (targetLabel) {
              if (!targetsByLabel.has(targetLabel)) {
                targetsByLabel.set(targetLabel, []);
              }
              targetsByLabel.get(targetLabel)?.push(targetId);
            }
          }
        });

        // Convert grouped targets into alternative combinations
        const syncedLayerGroups: string[][] = [];
        
        // For each unique target label, create a separate group
        targetsByLabel.forEach((targets) => {
          // Each target in this group is an alternative
          targets.forEach(target => {
            syncedLayerGroups.push([target]);
          });
        });

        if (syncedLayerGroups.length > 0) {
          sets.push({
            mainLayer: layerId,
            syncedLayers: syncedLayerGroups,
            label
          });

          // Mark main layer as processed
          processedLayers.add(layerId);
          // Mark all target layers as processed
          syncedLayerGroups.flat().forEach(id => processedLayers.add(id));
        }
      }
    });

    return sets;
  };

  // Move doesLayerMatchRules outside of handleGenerateSyncLayout
  const doesLayerMatchRules = (layerId: string, personalizationRules: Record<string, LayerPersonalization>) => {
    const layerRules = personalizationRules[layerId];
    if (!layerRules || !layerRules.isPersonalized || !layerRules.rules.length) {
      return true; // Layer is not personalized, so it matches by default
    }

    // Check if all rules match the current context
    return layerRules.rules.every(rule => {
      const segmentationType = segmentationRules?.segmentationTypes.find(t => t.id === rule.type);
      if (!segmentationType) return false;

      const value = segmentationType.values.find(v => v.id === rule.value);
      if (!value) return false;

      // Use the selected segmentation values instead of hardcoded ones
      return rule.type === selectedSegmentationType && rule.value === selectedSegmentationValue;
    });
  };

  // Modify handleGenerateLayout to use updated safezone states
  const handleGenerateLayout = async () => {
    if (!psdLayers || !selectedAspectRatio || !selectedOption) {
      toast.error('Please select all required options');
      return;
    }

    // Only check segmentation if there are personalized layers
    if (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue)) {
      toast.error('Please select segmentation options');
      return;
    }

    // If sync is enabled, use sync layout generation
    if (syncEnabled && hasSync) {
      handleGenerateAllSyncLayouts();
      return;
    }

    // Load necessary data from storage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    if (!layerLabels) {
      toast.error('Missing layer labels data');
      return;
    }

    try {
      // Fetch latest layout rules data
      const response = await fetch('/api/layout-rules');
      const layoutRulesData = await response.json() as LayoutRuleResponse;
      
      // Find current channel and layout option to get latest render order and safezone settings
      const currentChannel = layoutRulesData.channels.find(c => c.id === selectedChannelId);
      if (!currentChannel) {
        toast.error('Selected channel not found');
        return;
      }

      const currentLayoutRule = currentChannel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
      if (!currentLayoutRule) {
        toast.error('Selected layout not found');
        return;
      }

      const currentOption = currentLayoutRule.options.find(o => o.name === selectedOption);
      if (!currentOption) {
        toast.error('Selected option not found');
        return;
      }

      // Update safezone states with latest data
      updateSafezoneStates(currentOption);

      // Update current render order with latest data
      const renderOrder = currentOption.rules.renderOrder;
      setCurrentRenderOrder(renderOrder || null);

      // Update safezone margin with latest data
      const safezoneMargin = currentOption.safezoneMargin || margin;
      setMargin(safezoneMargin);

      const labels = JSON.parse(layerLabels);
      let personalizationRules = {};

      // Only load personalization rules if we have personalized layers
      if (hasPersonalization) {
        const storedRules = localStorage.getItem('psd_personalization_rules');
        if (!storedRules) {
          toast.error('Missing personalization rules');
          return;
        }
        personalizationRules = JSON.parse(storedRules);
      }

      setIsGenerating(true);

      // Group layers by label
      const layersByLabel = new Map<string, PsdLayerMetadataWithSafezone[]>();
      psdLayers.forEach(layer => {
        const layerId = layer.id;
        const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
        const label = labels[normalizedId] || labels[layerId];
        if (label) {
          if (!layersByLabel.has(label)) {
            layersByLabel.set(label, []);
          }
          layersByLabel.get(label)?.push(layer as PsdLayerMetadataWithSafezone);
        }
      });

      // Process each label group independently
      const processedLayers = Array.from(layersByLabel.entries()).flatMap(([label, layers]) => {
        // Get safezone setting for this label from latest rules
        const labelRules = currentOption.rules.positioning[label];
        const applySafezone = labelRules?.applySafezone !== false; // Default to true if not specified

        // Update safezone state for this label
        setSafezoneByLabel(prev => ({
          ...prev,
          [label]: applySafezone
        }));

        // Only apply personalization rules if we have personalized layers
        if (hasPersonalization) {
          const matchingLayers = layers.filter(layer => doesLayerMatchRules(layer.id, personalizationRules));
          
          if (matchingLayers.length === 0) {
            return layers.map(layer => ({ ...layer, visible: false, applySafezone }));
          }

          const selectedLayer = matchingLayers[Math.floor(Math.random() * matchingLayers.length)];
          return layers.map(layer => ({
            ...layer,
            visible: layer.id === selectedLayer.id,
            applySafezone
          }));
        } else {
          // If no personalization, randomly select a layer from each group
          const visibleLayers = layers.filter(layer => {
            // Check if layer is marked as visible in the PSD
            const isVisible = typeof layer.visible === 'undefined' || layer.visible === true;
            return isVisible;
          });

          if (visibleLayers.length === 0) {
            // If no visible layers, mark all as invisible
            return layers.map(layer => ({ ...layer, visible: false, applySafezone }));
          }

          // Randomly select from visible layers
          const selectedLayer = visibleLayers[Math.floor(Math.random() * visibleLayers.length)];
          return layers.map(layer => ({
            ...layer,
            visible: layer.id === selectedLayer.id,
            applySafezone
          }));
        }
      });

      // Filter visible layers and generate layout
      const visibleLayers = processedLayers.filter(layer => layer.visible) as PsdLayerMetadataWithSafezone[];

      const generatedLayoutResult = generateLayout(visibleLayers, selectedOption, {
        safezone: safezoneMargin,
        margin: safezoneMargin,
        applySafezoneByLayer: true
      } as PositionOptions);

      if (!generatedLayoutResult) {
        toast.error('Failed to generate layout');
        setIsGenerating(false);
        return;
      }

      setGeneratedLayout(generatedLayoutResult);
      
      setTimeout(() => {
        setIsGenerating(false);
      }, 1000);

    } catch (error) {
      console.error('Error generating layout:', error);
      toast.error('Error generating layout');
      setIsGenerating(false);
    }
  };

  // Reset custom positions for current layout
  const handleResetCurrentLayout = () => {
    if (!generatedLayout) return;
    
    setCustomPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[generatedLayout.name];
      return newPositions;
    });
  };

  // Handle channel selection
  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId);
    setSelectedAspectRatio(null);
    setSelectedOption(null);
    setGeneratedLayout(null);
  };

  // Handle aspect ratio selection
  const handleAspectRatioSelect = (aspectRatio: string) => {
    setSelectedAspectRatio(aspectRatio);
    setSelectedOption(null);
    setGeneratedLayout(null);
  };

  // Handle option selection
  const handleOptionSelect = (optionName: string) => {
    setSelectedOption(optionName);
    setGeneratedLayout(null);
    
    // Get and store render order from selected option
    if (selectedChannelId && selectedAspectRatio) {
      const channel = availableChannels.find(c => c.id === selectedChannelId);
      if (channel) {
        const layout = channel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
        if (layout) {
          const option = layout.options.find(o => o.name === optionName);
          if (option) {
            // Set render order if available
            if (option.rules.renderOrder) {
              setCurrentRenderOrder(option.rules.renderOrder);
            } else {
              setCurrentRenderOrder(null);
            }
            // Set margin if available, otherwise use default
            setMargin(option.safezoneMargin || 0.043);
          }
        }
      }
    }
  };

  // Get color for label
  const getLabelColor = (label: string): string => {
    switch (label) {
      case 'background':
        return 'rgba(107, 114, 128, 0.5)'; // Gray
      case 'logo':
        return 'rgba(239, 68, 68, 0.8)'; // Red
      case 'main-subject':
        return 'rgba(59, 130, 246, 0.8)'; // Blue
      case 'domain':
        return 'rgba(168, 85, 247, 0.8)'; // Purple
      case 'product-name':
        return 'rgba(16, 185, 129, 0.8)'; // Green
      case 'sub-content-1':
        return 'rgba(236, 72, 153, 0.8)'; // Pink
      case 'sub-content-2':
        return 'rgba(99, 102, 241, 0.8)'; // Indigo
      case 'cta':
        return 'rgba(249, 115, 22, 0.8)'; // Orange
      case 'disclaimer':
        return 'rgba(245, 158, 11, 0.8)'; // Amber
      default:
        return 'rgba(156, 163, 175, 0.8)'; // Gray
    }
  };

  // Generate filename based on layout and segmentation info
  const generateExportFilename = () => {
    if (!generatedLayout || !selectedChannelId) return '';
    
    const channel = availableChannels.find(c => c.id === selectedChannelId);
    const parts = [
      channel?.name || 'Unknown', // Platform
      generatedLayout.aspectRatio.replace(':', '-'), // Ratio
      generatedLayout.name, // Layout option
    ];
    
    // Add segmentation info if available
    if (selectedSegmentationType && selectedSegmentationValue) {
      const segmentType = getSegmentationTypes().find(t => t.id === selectedSegmentationType);
      const segmentValue = getValuesForType(selectedSegmentationType).find(v => v.id === selectedSegmentationValue);
      
      if (segmentType && segmentValue) {
        parts.push(segmentType.label);
        parts.push(segmentValue.label);
      }
    }
    
    // Add timestamp in YYYY-MM-DD-HH-MM-SS format
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('-');
    
    parts.push(timestamp);
    
    // Convert jpeg to jpg for the file extension
    const extension = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
    return parts.join('_').replace(/\s+/g, '-') + '.' + extension;
  };

  // Export the layout as an image
  const handleExportImage = () => {
    if (!fabricCanvasRef.current || !generatedLayout) return;
    
    setDownloading(true);
    
    try {
      const canvas = fabricCanvasRef.current;
      
      // Store current state
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();
      const currentZoom = canvas.getZoom();
      
      // Calculate export dimensions
      const targetWidth = generatedLayout.width;
      const targetHeight = generatedLayout.height;
      
      // Set canvas to exact layout dimensions
      canvas.setDimensions({
        width: targetWidth,
        height: targetHeight
      });

      // Scale objects for export
      const scaleX = targetWidth / currentWidth;
      const scaleY = targetHeight / currentHeight;
      
      // Transform all objects for export
      canvas.getObjects().forEach(obj => {
        if (!obj.excludeFromExport) {
          const originalLeft = obj.left || 0;
          const originalTop = obj.top || 0;
          const originalScaleX = obj.scaleX || 1;
          const originalScaleY = obj.scaleY || 1;

          obj.set({
            left: originalLeft * scaleX,
            top: originalTop * scaleY,
            scaleX: originalScaleX * scaleX,
            scaleY: originalScaleY * scaleY
          });
        } else {
          // Hide helper objects for export
          obj.visible = false;
        }
      });
      
      // Render before export
      canvas.renderAll();
      
      // Export at exact dimensions
      const dataURL = canvas.toDataURL({
        format: exportFormat,
        quality: 1,
        multiplier: 1
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = generateExportFilename();
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Restore original state
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight
      });

      // Restore object positions and visibility
      canvas.getObjects().forEach(obj => {
        if (!obj.excludeFromExport) {
          const originalLeft = obj.left || 0;
          const originalTop = obj.top || 0;
          const originalScaleX = obj.scaleX || 1;
          const originalScaleY = obj.scaleY || 1;

          obj.set({
            left: originalLeft / scaleX,
            top: originalTop / scaleY,
            scaleX: originalScaleX / scaleX,
            scaleY: originalScaleY / scaleY
          });
        } else {
          // Restore visibility
          obj.visible = true;
        }
      });
      
      // Restore zoom and render
      canvas.setZoom(currentZoom);
      canvas.renderAll();
      
      toast.success("Image exported successfully");
    } catch (error) {
      console.error('Error exporting image:', error);
      toast.error("Error exporting image");
    } finally {
      setDownloading(false);
    }
  };

  // Update renderLayoutPreview function to respect per-layer safezone settings and custom positions
  const renderLayoutPreview = (canvas: HTMLCanvasElement, layout: GeneratedLayout) => {
    const fabricCanvas = new Canvas(canvas);
    
    // Set a fixed container width for consistency
    const containerWidth = 400; // Base width for the preview
    const containerHeight = 300; // Base height for the preview
    
    // Calculate dimensions to maintain layout's aspect ratio
    const layoutRatio = layout.width / layout.height;
    let canvasWidth, canvasHeight;
    
    if (layoutRatio > 1) {
      // Landscape orientation
      canvasWidth = containerWidth;
      canvasHeight = containerWidth / layoutRatio;
    } else {
      // Portrait or square orientation
      canvasHeight = containerHeight;
      canvasWidth = containerHeight * layoutRatio;
    }
    
    // Update canvas dimensions
    fabricCanvas.setDimensions({
      width: canvasWidth,
      height: canvasHeight,
    });
    
    // Calculate scale to fit elements
    const scaleX = canvasWidth / layout.width;
    const scaleY = canvasHeight / layout.height;
    const scale = Math.min(scaleX, scaleY);
    
    // Add background
    const background = new Rect({
      left: 0,
      top: 0,
      width: canvasWidth,
      height: canvasHeight,
      fill: 'white',
      stroke: '#cccccc',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    fabricCanvas.add(background);

    // Add safezone boundaries with the same margin as main canvas
    const safezoneMargin = margin;
    const safezone = new Rect({
      left: canvasWidth * safezoneMargin,
      top: canvasHeight * safezoneMargin,
      width: canvasWidth * (1 - 2 * safezoneMargin),
      height: canvasHeight * (1 - 2 * safezoneMargin),
      fill: 'transparent',
      stroke: '#2563eb',
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    fabricCanvas.add(safezone);
    
    // Get layer labels from session storage
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    let labels: Record<string, string> = {};
    try {
      labels = storedLabels ? JSON.parse(storedLabels) : {};
    } catch (error) {
      console.error('Error parsing layer labels:', error);
    }

    // Get any custom positions for this layout
    const layoutCustomPositions = customPositions[layout.name] || {};

    // Sort elements based on render order
    let elementsToRender = [...layout.elements];
    if (currentRenderOrder) {
      // Create a map for quick label lookup
      const elementsByLabel = new Map();
      elementsToRender.forEach(element => {
        if (!elementsByLabel.has(element.label)) {
          elementsByLabel.set(element.label, []);
        }
        elementsByLabel.get(element.label).push(element);
      });

      // Sort elements according to render order
      elementsToRender = currentRenderOrder.flatMap(label => 
        elementsByLabel.get(label) || []
      );

      // Add any remaining elements not in render order at the end
      const remainingElements = elementsToRender.filter(element => 
        !currentRenderOrder.includes(element.label)
      );
      elementsToRender = [...elementsToRender, ...remainingElements];
    } else {
      // If no render order specified, render background first, then other elements
      elementsToRender.sort((a, b) => {
        if (a.label === 'background') return -1;
        if (b.label === 'background') return 1;
        return 0;
      });
    }

    // Render elements in order
    for (const element of elementsToRender) {
      if (!element.visible) continue;
      
      try {
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        // Apply custom dimensions if available
        const customPosition = layoutCustomPositions[element.id];
        const elementWidth = customPosition?.width || element.width;
        const elementHeight = customPosition?.height || element.height;
        
        tempCanvas.width = Math.max(1, elementWidth);
        tempCanvas.height = Math.max(1, elementHeight);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          const imageData = layerImages.get(element.name);
          
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = Math.max(1, imageData.width);
            originalCanvas.height = Math.max(1, imageData.height);
            const originalCtx = originalCanvas.getContext('2d');
            
            if (originalCtx) {
              originalCtx.putImageData(imageData, 0, 0);
              ctx.drawImage(
                originalCanvas,
                0, 0, imageData.width, imageData.height,
                0, 0, elementWidth, elementHeight
              );
            }
          } else {
            ctx.fillStyle = getLabelColor(element.label);
            ctx.fillRect(0, 0, elementWidth, elementHeight);
          }
        }

        // Calculate position with custom positions and safezone consideration
        const elementLabel = labels[element.id] || labels[`layer_${element.id}`];
        const shouldApplySafezone = safezoneByLabel[elementLabel] !== false;
        
        // Use custom position if available, otherwise use original position
        let left = (customPosition ? customPosition.x : element.x) * scale;
        let top = (customPosition ? customPosition.y : element.y) * scale;

        if (shouldApplySafezone) {
          const safeLeft = canvasWidth * safezoneMargin;
          const safeTop = canvasHeight * safezoneMargin;
          const safeWidth = canvasWidth * (1 - 2 * safezoneMargin);
          const safeHeight = canvasHeight * (1 - 2 * safezoneMargin);

          left = Math.max(safeLeft, Math.min(safeLeft + safeWidth - elementWidth * scale, left));
          top = Math.max(safeTop, Math.min(safeTop + safeHeight - elementHeight * scale, top));
        }

        const fabricImage = new FabricImage(tempCanvas, {
          left: left,
          top: top,
          width: elementWidth,
          height: elementHeight,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          hasControls: false,
          hasBorders: false,
          opacity: 1,
          angle: customPosition?.angle || 0
        });
        
        fabricCanvas.add(fabricImage);
        
      } catch (error) {
        console.error(`Error rendering preview element ${element.name}:`, error);
      }
    }
    
    fabricCanvas.renderAll();
    return fabricCanvas;
  };

  // Add new function to generate all combinations
  const handleGenerateAllCombinations = async () => {
    if (!psdLayers || !selectedAspectRatio || !selectedOption) {
      toast.error('Please select all required options');
      return;
    }

    // Only check segmentation if there are personalized layers
    if (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue)) {
      toast.error('Please select segmentation options');
      return;
    }

    // If sync is enabled, use sync layout generation
    if (syncEnabled && hasSync) {
      handleGenerateAllSyncLayouts();
      return;
    }

    // Load necessary data from storage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    if (!layerLabels) {
      toast.error('Missing layer labels data');
      return;
    }

    try {
      // Fetch latest layout rules data
      const response = await fetch('/api/layout-rules');
      const layoutRulesData = await response.json() as LayoutRuleResponse;
      
      // Find current channel and layout option to get latest render order and safezone settings
      const currentChannel = layoutRulesData.channels.find(c => c.id === selectedChannelId);
      if (!currentChannel) {
        toast.error('Selected channel not found');
        return;
      }

      const currentLayoutRule = currentChannel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
      if (!currentLayoutRule) {
        toast.error('Selected layout not found');
        return;
      }

      const currentOption = currentLayoutRule.options.find(o => o.name === selectedOption);
      if (!currentOption) {
        toast.error('Selected option not found');
        return;
      }

      // Update safezone states with latest data
      updateSafezoneStates(currentOption);

      // Update current render order with latest data
      const renderOrder = currentOption.rules.renderOrder;
      setCurrentRenderOrder(renderOrder || null);

      // Update safezone margin with latest data
      const safezoneMargin = currentOption.safezoneMargin || margin;
      setMargin(safezoneMargin);

      const labels = JSON.parse(layerLabels);
      let personalizationRules = {};

      // Only load personalization rules if we have personalized layers
      if (hasPersonalization) {
        const storedRules = localStorage.getItem('psd_personalization_rules');
        if (!storedRules) {
          toast.error('Missing personalization rules');
          return;
        }
        personalizationRules = JSON.parse(storedRules);
      }

      setIsGenerating(true);
      const description = [];

      // Group layers by label
      const layersByLabel = new Map<string, PsdLayerMetadata[]>();
      psdLayers.forEach(layer => {
        const layerId = layer.id;
        const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
        const label = labels[normalizedId] || labels[layerId];
        if (label) {
          if (!layersByLabel.has(label)) {
            layersByLabel.set(label, []);
          }
          layersByLabel.get(label)?.push(layer);
        }
      });

      // Generate all possible combinations
      const layouts: GeneratedLayout[] = [];
      const generateCombinations = (
        currentLabel: string | undefined,
        selectedLayers: Map<string, string>,
        remainingLabels: string[]
      ) => {
        if (!currentLabel) {
          // Base case: generate layout from current combination
          const visibleLayerIds = new Set<string>();
          
          // Add selected layers to visible set
          selectedLayers.forEach((layerId) => {
            visibleLayerIds.add(layerId);
            visibleLayerIds.add(layerId.replace('layer_', ''));
          });

          // Generate layout with current visible layers
          const visibleLayers = psdLayers.filter(layer =>
            visibleLayerIds.has(layer.id) || visibleLayerIds.has(`layer_${layer.id}`)
          ).map(layer => ({
            ...layer,
            visible: true
          }));

          const layout = generateLayout(visibleLayers, selectedOption, {
            safezone: safezoneMargin,
            margin: safezoneMargin
          });

          if (layout) {
            // Sort elements according to render order before adding to layouts
            if (renderOrder) {
              const elementsByLabel = new Map();
              layout.elements.forEach(element => {
                if (!elementsByLabel.has(element.label)) {
                  elementsByLabel.set(element.label, []);
                }
                elementsByLabel.get(element.label).push(element);
              });

              // Sort elements according to render order
              const sortedElements = renderOrder.flatMap(label => 
                elementsByLabel.get(label) || []
              );

              // Add any remaining elements not in render order at the end
              const remainingElements = layout.elements.filter(element => 
                !renderOrder.includes(element.label)
              );

              layout.elements = [...sortedElements, ...remainingElements];
            } else {
              // If no render order, sort background first
              layout.elements.sort((a, b) => {
                if (a.label === 'background') return -1;
                if (b.label === 'background') return 1;
                return 0;
              });
            }

            layouts.push(layout);
          }
          return;
        }

        // Get layers for current label
        const currentLayers = layersByLabel.get(currentLabel) || [];
        const nextLabel = remainingLabels[0];
        const nextRemainingLabels = remainingLabels.slice(1);

        // Try each layer in the current label group
        currentLayers.forEach(layer => {
          // Check if layer matches personalization rules
          if (hasPersonalization) {
            if (!doesLayerMatchRules(layer.id, personalizationRules)) {
              return; // Skip this layer if it doesn't match rules
            }
          }

          // Create new combination with this layer
          const newSelectedLayers = new Map(selectedLayers);
          newSelectedLayers.set(currentLabel, layer.id);
          generateCombinations(nextLabel, newSelectedLayers, nextRemainingLabels);
        });
      };

      // Start generating combinations
      const labelKeys = Array.from(layersByLabel.keys());
      generateCombinations(labelKeys[0], new Map(), labelKeys.slice(1));

      description.push(`Generated ${layouts.length} layout combinations`);
      setGenerationDescription(description.join('\n'));
      setMultipleLayouts(layouts);
      setGeneratedLayout(layouts[0]); // Show first layout initially
      setShowGallery(true); // Open the gallery modal automatically

      setTimeout(() => {
        setIsGenerating(false);
      }, 1000);

    } catch (error) {
      console.error('Error generating layout combinations:', error);
      toast.error('Error generating layouts');
      setIsGenerating(false);
    }
  };

  // Add new function to get available segmentation types from personalization rules
  const getAvailableSegmentationTypes = () => {
    try {
      const storedRules = localStorage.getItem('psd_personalization_rules');
      if (!storedRules) return [];
      
      const rules = JSON.parse(storedRules) as Record<string, LayerPersonalization>;
      const segmentationTypes = new Set<string>();
      
      // Collect all unique segmentation types from rules
      Object.values(rules).forEach(layer => {
        if (layer.isPersonalized && layer.rules.length > 0) {
          layer.rules.forEach(rule => {
            segmentationTypes.add(rule.type);
          });
        }
      });
      
      // Filter segmentation types to only include those that exist in the rules
      return getSegmentationTypes().filter(type => segmentationTypes.has(type.id));
    } catch (error) {
      console.error('Error getting available segmentation types:', error);
      return [];
    }
  };

  // Add function to get available values for a segmentation type
  const getAvailableSegmentationValues = (typeId: string) => {
    try {
      const storedRules = localStorage.getItem('psd_personalization_rules');
      if (!storedRules) return [];
      
      const rules = JSON.parse(storedRules) as Record<string, LayerPersonalization>;
      const segmentationValues = new Set<string>();
      
      // Collect all unique values for this type from rules
      Object.values(rules).forEach(layer => {
        if (layer.isPersonalized && layer.rules.length > 0) {
          layer.rules.forEach(rule => {
            if (rule.type === typeId) {
              segmentationValues.add(rule.value);
            }
          });
        }
      });
      
      // Filter values to only include those that exist in the rules
      return getValuesForType(typeId).filter(value => segmentationValues.has(value.id));
    } catch (error) {
      console.error('Error getting available segmentation values:', error);
      return [];
    }
  };

  // Add new function to generate all sync layouts
  const handleGenerateAllSyncLayouts = async () => {
    if (!psdLayers || !selectedAspectRatio || !selectedOption) {
      toast.error('Please select all required options');
      return;
    }

    // Only check segmentation if there are personalized layers
    if (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue)) {
      toast.error('Please select segmentation options');
      return;
    }

    // Load necessary data from storage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    const storedLinks = localStorage.getItem('psd_layer_links');
    
    if (!layerLabels || !storedLinks) {
      toast.error('Missing layer data or sync links');
      return;
    }

    try {
      // Fetch latest layout rules data
      const response = await fetch('/api/layout-rules');
      const layoutRulesData = await response.json() as LayoutRuleResponse;
      
      // Find current channel and layout option to get latest render order and safezone settings
      const currentChannel = layoutRulesData.channels.find(c => c.id === selectedChannelId);
      if (!currentChannel) {
        toast.error('Selected channel not found');
        return;
      }

      const currentLayoutRule = currentChannel.layouts.find(l => l.aspectRatio === selectedAspectRatio);
      if (!currentLayoutRule) {
        toast.error('Selected layout not found');
        return;
      }

      const currentOption = currentLayoutRule.options.find(o => o.name === selectedOption);
      if (!currentOption) {
        toast.error('Selected option not found');
        return;
      }

      // Update safezone states with latest data
      updateSafezoneStates(currentOption);

      // Update current render order with latest data
      const renderOrder = currentOption.rules.renderOrder;
      setCurrentRenderOrder(renderOrder || null);

      // Update safezone margin with latest data
      const safezoneMargin = currentOption.safezoneMargin || margin;
      setMargin(safezoneMargin);

      const labels = JSON.parse(layerLabels);
      const links = JSON.parse(storedLinks) as LayerLink[];
      let personalizationRules = {};

      // Only load personalization rules if we have personalized layers
      if (hasPersonalization) {
        const storedRules = localStorage.getItem('psd_personalization_rules');
        if (!storedRules) {
          toast.error('Missing personalization rules');
          return;
        }
        personalizationRules = JSON.parse(storedRules);
      }

      setIsGenerating(true);
      const description = [];

      // Find all sync sets with alternatives
      const sets = findSyncSets(psdLayers, labels, links);
      
      if (sets.length === 0) {
        toast.error('No synchronized sets found');
        setIsGenerating(false);
        return;
      }

      description.push(`Found ${sets.length} synchronized sets:`);
      sets.forEach(set => {
        const mainLayerName = psdLayers.find(l => l.id === set.mainLayer)?.name || set.mainLayer;
        description.push(`- ${set.label}: Main layer ${mainLayerName} with alternatives:`);
        set.syncedLayers.forEach((group, index) => {
          const syncedLayerNames = group.map(id => 
            psdLayers.find(l => l.id === id)?.name || id
          );
          description.push(`  Alternative ${index + 1}: ${syncedLayerNames.join(', ')}`);
        });
      });

      // Group sets by label
      const setsByLabel = new Map<string, typeof sets>();
      sets.forEach(set => {
        if (!setsByLabel.has(set.label)) {
          setsByLabel.set(set.label, []);
        }
        setsByLabel.get(set.label)?.push(set);
      });

      // Get all valid sets for each label
      const validSetsByLabel = new Map<string, typeof sets>();
      setsByLabel.forEach((labelSets, labelKey) => {
        // Only apply personalization rules if we have personalized layers
        if (hasPersonalization) {
          const validSets = labelSets.filter(set =>
            doesLayerMatchRules(set.mainLayer, personalizationRules) &&
            set.syncedLayers.flat().every(id => doesLayerMatchRules(id, personalizationRules))
          );
          if (validSets.length > 0) {
            validSetsByLabel.set(labelKey, validSets);
          }
        } else {
          // If no personalization, all sets are valid
          validSetsByLabel.set(labelKey, labelSets);
        }
      });

      // Generate all possible combinations
      const layouts: GeneratedLayout[] = [];
      const generateCombinations = (
        currentLabel: string | undefined,
        selectedSets: Map<string, { mainLayer: string; selectedGroup: string[] }>,
        remainingLabels: string[]
      ) => {
        if (!currentLabel) {
          // Base case: generate layout from current combination
          const visibleLayerIds = new Set<string>();
          const processedLayerIds = new Set<string>();
          const excludedLayerIds = new Set<string>();

          // Mark excluded layers from all sync sets
          sets.forEach(set => {
            set.syncedLayers.flat().forEach(id => {
              excludedLayerIds.add(id.replace('layer_', ''));
              excludedLayerIds.add(`layer_${id.replace('layer_', '')}`);
            });
          });

          // Add selected sync sets to visible layers
          selectedSets.forEach(({ mainLayer, selectedGroup }) => {
            const selectedLayerIds = new Set([
              mainLayer,
              ...selectedGroup,
              mainLayer.replace('layer_', ''),
              ...selectedGroup.map(id => id.replace('layer_', ''))
            ]);
            selectedLayerIds.forEach(id => {
              processedLayerIds.add(id);
              visibleLayerIds.add(id);
            });
          });

          // Add non-synced layers
          const layersByLabel = new Map<string, PsdLayerMetadata[]>();
          psdLayers.forEach(layer => {
            const layerId = layer.id;
            const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
            const layerLabel = labels[normalizedId] || labels[layerId];
            if (layerLabel && !selectedSets.has(layerLabel)) {
              if (!layersByLabel.has(layerLabel)) {
                layersByLabel.set(layerLabel, []);
              }
              layersByLabel.get(layerLabel)?.push(layer);
            }
          });

          // Process non-synced layers
          layersByLabel.forEach((layers) => {
            const unprocessedLayers = layers.filter(layer => !processedLayerIds.has(layer.id));
            const availableLayers = unprocessedLayers.filter(layer =>
              !excludedLayerIds.has(layer.id) && !excludedLayerIds.has(`layer_${layer.id}`)
            );
            const matchingLayers = availableLayers.filter(layer => doesLayerMatchRules(layer.id, personalizationRules));

            if (matchingLayers.length > 0) {
              const selectedLayer = matchingLayers[Math.floor(Math.random() * matchingLayers.length)];
              visibleLayerIds.add(selectedLayer.id);
            }
          });

          // Generate layout with current visible layers
          const visibleLayers = psdLayers.filter(layer =>
            visibleLayerIds.has(layer.id) || visibleLayerIds.has(`layer_${layer.id}`)
          );

          const layout = generateLayout(visibleLayers, selectedOption, {
            safezone: safezoneMargin,
            margin: safezoneMargin
          });

          if (layout) {
            // Sort elements according to render order before adding to layouts
            if (renderOrder) {
              const elementsByLabel = new Map();
              layout.elements.forEach(element => {
                if (!elementsByLabel.has(element.label)) {
                  elementsByLabel.set(element.label, []);
                }
                elementsByLabel.get(element.label).push(element);
              });

              // Sort elements according to render order
              const sortedElements = renderOrder.flatMap(label => 
                elementsByLabel.get(label) || []
              );

              // Add any remaining elements not in render order at the end
              const remainingElements = layout.elements.filter(element => 
                !renderOrder.includes(element.label)
              );

              layout.elements = [...sortedElements, ...remainingElements];
            } else {
              // If no render order, sort background first
              layout.elements.sort((a, b) => {
                if (a.label === 'background') return -1;
                if (b.label === 'background') return 1;
                return 0;
              });
            }

            layouts.push(layout);
          }
          return;
        }

        // Get valid sets for current label
        const validSets = validSetsByLabel.get(currentLabel) || [];
        const nextLabel = remainingLabels[0];
        const nextRemainingLabels = remainingLabels.slice(1);

        // Try each valid set and each alternative group
        validSets.forEach(set => {
          set.syncedLayers.forEach(group => {
            const newSelectedSets = new Map(selectedSets);
            newSelectedSets.set(currentLabel, { mainLayer: set.mainLayer, selectedGroup: group });
            generateCombinations(nextLabel, newSelectedSets, nextRemainingLabels);
          });
        });
      };

      // Start generating combinations
      const labelKeys = Array.from(validSetsByLabel.keys());
      generateCombinations(labelKeys[0], new Map(), labelKeys.slice(1));

      description.push(`\nGenerated ${layouts.length} layout combinations`);
      setGenerationDescription(description.join('\n'));
      setMultipleLayouts(layouts);
      setGeneratedLayout(layouts[0]); // Show first layout initially
      setShowSyncGallery(true); // Open the sync gallery modal automatically

      setTimeout(() => {
        setIsGenerating(false);
      }, 1000);

    } catch (error) {
      console.error('Error generating all sync layouts:', error);
      toast.error('Error generating layouts');
      setIsGenerating(false);
    }
  };

  // Add layout navigation controls
  const [currentLayoutIndex, setCurrentLayoutIndex] = useState(0);

  const showNextLayout = () => {
    if (multipleLayouts.length > 0) {
      const nextIndex = (currentLayoutIndex + 1) % multipleLayouts.length;
      setCurrentLayoutIndex(nextIndex);
      setGeneratedLayout(multipleLayouts[nextIndex]);
    }
  };

  const showPreviousLayout = () => {
    if (multipleLayouts.length > 0) {
      const prevIndex = (currentLayoutIndex - 1 + multipleLayouts.length) % multipleLayouts.length;
      setCurrentLayoutIndex(prevIndex);
      setGeneratedLayout(multipleLayouts[prevIndex]);
    }
  };

  // If no layers, show upload message
  if (!psdLayers) {
    return (
      <div className="p-4 border-dashed border-2 rounded-lg text-center">
        <p className="text-gray-500">Upload a PSD file first</p>
      </div>
    );
  }
  
  return (
    <div>
      <Toaster />
      <Collapsible defaultOpen className="mb-4" open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold mb-4">Layout Generator</h3>
          <CollapsibleTrigger className="hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors">
            {isOpen ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-4">
          {/* Selection controls */}
          <div className="space-y-4">
            {/* Dropdowns and buttons in a row */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Channel selection */}
              <div>
                <Label className="text-sm font-medium mb-2">Channel</Label>
                <Select value={selectedChannelId || ''} onValueChange={handleChannelSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChannels.length === 0 ? (
                      <SelectItem value="none" disabled>No channels available</SelectItem>
                    ) : (
                      availableChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Aspect Ratio selection */}
              <div>
                <Label className="text-sm font-medium mb-2">Aspect Ratio</Label>
                <Select 
                  value={selectedAspectRatio || ''} 
                  onValueChange={handleAspectRatioSelect}
                  disabled={!selectedChannelId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select aspect ratio" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredAspectRatios.length === 0 ? (
                      <SelectItem value="none" disabled>
                        {sourceRatio ? `No ratios available (Source: ${sourceRatio})` : 'No ratios available'}
                      </SelectItem>
                    ) : (
                      filteredAspectRatios.map((layout) => (
                        <SelectItem key={layout.aspectRatio} value={layout.aspectRatio}>
                          <div className="flex items-center gap-2">
                            {layout.aspectRatio}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Option selection */}
              <div>
                <Label className="text-sm font-medium mb-2">Layout Option</Label>
                <Select 
                  value={selectedOption || ''} 
                  onValueChange={handleOptionSelect}
                  disabled={!selectedChannelId || !selectedAspectRatio}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select layout option" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOptions.length === 0 ? (
                      <SelectItem value="none" disabled>No options available</SelectItem>
                    ) : (
                      filteredOptions.map((option) => (
                        <SelectItem key={option.name} value={option.name}>
                          {option.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Segmentation controls - only show if there are personalized layers */}
              {hasPersonalization && (
                <>
                  {/* Segmentation type selection */}
                  <div>
                    <Label className="text-sm font-medium mb-2">Segmentation Type</Label>
                    <Select 
                      value={selectedSegmentationType} 
                      onValueChange={(value: string) => {
                        setSelectedSegmentationType(value);
                        setSelectedSegmentationValue(''); // Reset value when type changes
                      }}
                      disabled={!selectedOption}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select segmentation type" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableSegmentationTypes().map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Segmentation value selection */}
                  <div>
                    <Label className="text-sm font-medium mb-2">Segmentation Value</Label>
                    <Select 
                      value={selectedSegmentationValue} 
                      onValueChange={setSelectedSegmentationValue}
                      disabled={!selectedOption || !selectedSegmentationType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select value" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSegmentationType && 
                          getAvailableSegmentationValues(selectedSegmentationType).map((value) => (
                            <SelectItem key={value.id} value={value.id}>
                              {value.label}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Generate buttons */}
              {selectedChannelId && selectedAspectRatio && selectedOption && (
                <div className="flex gap-2 align-middle">
                  <Button 
                    onClick={handleGenerateLayout} 
                    disabled={!selectedOption || isGenerating || (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue))}
                    size="lg"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Layout'}
                  </Button>

                  <Button 
                    onClick={handleGenerateAllCombinations}
                    disabled={!selectedOption || isGenerating || (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue))}
                    size="lg"
                    variant="outline"
                  >
                    {isGenerating ? 'Generating...' : 'Generate All Combinations'}
                  </Button>

                  {/* Sync toggle - only show if sync links exist */}
                  {hasSync && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="sync-toggle" className="text-sm font-medium">
                        Use Sync Links
                      </Label>
                      <Switch
                        id="sync-toggle"
                        checked={syncEnabled}
                        onCheckedChange={setSyncEnabled}
                        disabled={!selectedOption}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Layout info and export */}
      <div className="mb-4">
        {generatedLayout && (
          <div className="flex items-center justify-end text-sm text-muted-foreground gap-2 mb-4">          
            <Button 
              variant="destructive" 
              onClick={handleResetCurrentLayout}
              size="sm"
              className="flex items-center gap-1"
            >
              Reset Current Position
            </Button>
            
            <div className="flex items-center gap-2">
              <Label>Export Format</Label>
              <Select value={exportFormat} onValueChange={(value: 'png' | 'jpeg') => setExportFormat(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpeg">JPG</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleExportImage}
                disabled={!generatedLayout || downloading}
                className="ml-2"
              >
                {downloading ? (
                  <span>Exporting...</span>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        
        {/* Layout navigation controls */}
        {multipleLayouts.length > 1 && (
          <div className="flex items-center gap-4 justify-end">
            <span className="text-sm text-muted-foreground">
              Layout {currentLayoutIndex + 1} of {multipleLayouts.length}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={showPreviousLayout}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                onClick={showNextLayout}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* Canvas container */}
      <div className="border overflow-hidden w-full bg-white shadow-sm" style={{ minHeight: '200px' }}>
        <div className="w-full h-full flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full"  />
        </div>
      </div>

      {/* Add generation description */}
      {generationDescription && (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap p-4 bg-slate-50 rounded-lg mt-4">
          <h4 className="font-medium mb-2">Generation Details:</h4>
          {generationDescription}
        </div>
      )}

      {/* Replace Dialog with custom floating modal */}
      {showGallery && (
        <>
          {/* Floating Modal */}
          <Rnd
            default={{
              x: modalPosition.x,
              y: modalPosition.y,
              width: modalDimensions.width,
              height: modalDimensions.height
            }}
            position={modalPosition}
            size={modalDimensions}
            minWidth={400}
            minHeight={300}
            bounds="window"
            className={cn(
              "z-50",
              isFullscreen ? "!fixed !inset-0" : "absolute"
            )}
            onDragStop={(e, d) => {
              setModalPosition({ x: d.x, y: d.y });
            }}
            onResize={(e, direction, ref, delta, position) => {
              setModalDimensions({
                width: ref.offsetWidth,
                height: ref.offsetHeight
              });
              setModalPosition(position);
              setGridColumns(calculateGridColumns(ref.offsetWidth));
            }}
            dragHandleClassName="handle"
          >
            <div className={cn(
              "w-full h-full flex flex-col bg-white rounded-lg shadow-2xl border overflow-hidden",
              isFullscreen && "rounded-none"
            )}>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b handle">
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">Combination Layout Gallery</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {multipleLayouts.length} layouts generated • Click on a layout to select it
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border">
                        <span className="text-sm font-medium">Layout {currentLayoutIndex + 1} of {multipleLayouts.length}</span>
                        <div className="flex gap-1">
                          <Button
                            onClick={showPreviousLayout}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={showNextLayout}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Button
                        onClick={toggleFullscreen}
                        variant="outline"
                        size="sm"
                        className="w-8 h-8 p-0"
                      >
                        {isFullscreen ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                            <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3h7v7H3z"></path>
                            <path d="M14 3h7v7h-7z"></path>
                            <path d="M14 14h7v7h-7z"></path>
                            <path d="M3 14h7v7H3z"></path>
                          </svg>
                        )}
                      </Button>
                      <Button
                        onClick={() => setShowGallery(false)}
                        variant="outline"
                        size="sm"
                      >
                        Close Gallery
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid Layout - Scrollable Content */}
              <div className="flex-1 overflow-auto p-6">
                <div className={cn(
                  "grid gap-6",
                  isFullscreen ? "grid-cols-4" : `grid-cols-${gridColumns}`
                )} key={`gallery-${galleryRenderKey}`}>
                  {multipleLayouts.map((layout, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "relative overflow-hidden transition-all duration-200 hover:shadow-lg",
                        currentLayoutIndex === index 
                          ? "border-primary ring-2 ring-primary/20 shadow-xl" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => {
                        setCurrentLayoutIndex(index);
                        setGeneratedLayout(layout);
                      }}
                    >
                      <div className="relative overflow-hidden cursor-pointer flex items-center justify-center" style={{
                        aspectRatio: `${layout.width} / ${layout.height}`,
                        width: '100%'
                      }}>
                        <canvas
                          ref={(canvas) => {
                            if (canvas) {
                              try {
                                const fabricCanvas = renderLayoutPreview(canvas, layout);
                                return () => {
                                  fabricCanvas.dispose();
                                };
                              } catch (error) {
                                console.error('Error rendering layout preview:', error);
                              }
                            }
                          }}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Rnd>
        </>
      )}

      {/* Update sync gallery modal with the same improvements */}
      {showSyncGallery && (
        <>
          {/* Floating Modal */}
          <Rnd
            default={{
              x: modalPosition.x,
              y: modalPosition.y,
              width: modalDimensions.width,
              height: modalDimensions.height
            }}
            position={modalPosition}
            size={modalDimensions}
            minWidth={400}
            minHeight={300}
            bounds="window"
            className={cn(
              "z-50",
              isFullscreen ? "!fixed !inset-0" : "absolute"
            )}
            onDragStop={(e, d) => {
              setModalPosition({ x: d.x, y: d.y });
            }}
            onResize={(e, direction, ref, delta, position) => {
              setModalDimensions({
                width: ref.offsetWidth,
                height: ref.offsetHeight
              });
              setModalPosition(position);
              setGridColumns(calculateGridColumns(ref.offsetWidth));
            }}
            dragHandleClassName="handle"
          >
            <div className={cn(
              "w-full h-full flex flex-col bg-white rounded-lg shadow-2xl border overflow-hidden",
              isFullscreen && "rounded-none"
            )}>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b handle">
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Sync Layout Gallery</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {multipleLayouts.length} synchronized layouts generated • Click on a layout to select it
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border">
                        <span className="text-sm font-medium">Layout {currentLayoutIndex + 1} of {multipleLayouts.length}</span>
                        <div className="flex gap-1">
                          <Button
                            onClick={showPreviousLayout}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={showNextLayout}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Button
                        onClick={toggleFullscreen}
                        variant="outline"
                        size="sm"
                        className="w-8 h-8 p-0"
                      >
                        {isFullscreen ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                            <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3h7v7H3z"></path>
                            <path d="M14 3h7v7h-7z"></path>
                            <path d="M14 14h7v7h-7z"></path>
                            <path d="M3 14h7v7H3z"></path>
                          </svg>
                        )}
                      </Button>
                      <Button
                        onClick={() => setShowSyncGallery(false)}
                        variant="outline"
                        size="sm"
                      >
                        Close Gallery
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid Layout - Scrollable Content */}
              <div className="flex-1 overflow-auto p-6">
                <div className={cn(
                  "grid gap-6",
                  isFullscreen ? "grid-cols-6" : `grid-cols-${gridColumns}`
                )} key={`sync-gallery-${galleryRenderKey}`}>
                  {multipleLayouts.map((layout, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "relative overflow-hidden transition-all duration-200 hover:shadow-lg",
                        currentLayoutIndex === index 
                          ? "border-primary ring-2 ring-primary/20 shadow-xl" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => {
                        setCurrentLayoutIndex(index);
                        setGeneratedLayout(layout);
                      }}
                    >
                      <div className="relative overflow-hidden cursor-pointer flex items-center justify-center" style={{
                        aspectRatio: `${layout.width} / ${layout.height}`,
                        width: '100%'
                      }}>
                        <canvas
                          ref={(canvas) => {
                            if (canvas) {
                              try {
                                const fabricCanvas = renderLayoutPreview(canvas, layout);
                                return () => {
                                  fabricCanvas.dispose();
                                };
                              } catch (error) {
                                console.error('Error rendering layout preview:', error);
                              }
                            }
                          }}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Rnd>
        </>
      )}
    </div>
  );
} 