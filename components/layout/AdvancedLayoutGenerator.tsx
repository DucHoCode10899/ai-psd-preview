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
import { PositionKeyword } from '@/utils/position-calculator';
import { toast, Toaster } from 'sonner';
import type { Node, Layer as PsdLayer } from "@webtoon/psd";
import { useSegmentationRules } from '@/hooks/useSegmentationRules';
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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

// Define types for layout API responses
interface LayoutOption {
  name: string;
}

interface LayoutRatio {
  aspectRatio: string;
}

interface Channel {
  id: string;
  name: string;
}

interface LayoutRuleResponse {
  channels: Array<{
    id: string;
    name: string;
    layouts: Array<{
      aspectRatio: string;
      width: number;
      height: number;
      options: Array<{
        name: string;
        rules: {
          visibility: Record<string, boolean>;
          positioning: Record<string, {
            position: string;
            maxWidthPercent: number;
            maxHeightPercent: number;
            alignment?: string;
            margin?: {
              top?: number;
              right?: number;
              bottom?: number;
              left?: number;
            };
          }>;
        };
      }>;
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

export function AdvancedLayoutGenerator({ psdLayers, psdBuffer }: AdvancedLayoutGeneratorProps) {
  const [isOpen, setIsOpen] = useState(true);

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
  const [availableLayouts, setAvailableLayouts] = useState<LayoutRatio[]>([]);
  const [availableOptions, setAvailableOptions] = useState<LayoutOption[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [generatedLayout, setGeneratedLayout] = useState<GeneratedLayout | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [safezoneWidth, setSafezoneWidth] = useState(10);
  const [margin] = useState(5);
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
    getSegmentationTypes
  } = useSegmentationRules();

  const [generationDescription, setGenerationDescription] = useState<string>('');

  // Add new state for multiple layouts
  const [multipleLayouts, setMultipleLayouts] = useState<GeneratedLayout[]>([]);

  // Add new state for sync links
  const [hasSync, setHasSync] = useState(false);
  
  // Add new state for gallery modal
  const [showGallery, setShowGallery] = useState(false);
  
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
      console.log('Found sync sets with alternatives:', sets);
      
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
            safezone: safezoneWidth,
            margin: margin
          });

          if (layout) {
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

  // Load available channels
  useEffect(() => {
    const fetchLayoutRules = async () => {
      try {
        const response = await fetch('/api/layout-rules');
        const data = await response.json() as LayoutRuleResponse;
        setAvailableChannels(data.channels.map(channel => ({
          id: channel.id,
          name: channel.name
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
          const layouts = channel.layouts.map(layout => ({
            aspectRatio: layout.aspectRatio
          }));
          setAvailableLayouts(layouts);
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
            const options = layout.options.map(option => ({
              name: option.name
            }));
            setAvailableOptions(options);
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
    
    console.log('Initializing fabric canvas');
    
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
    
    console.log('Canvas initialized:', fabricCanvasRef.current ? 'success' : 'failed');
    
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
      console.log(`Excluding layout with ratio ${layout.aspectRatio} because it matches source ratio ${sourceRatio}`);
      return false;
    }
    
    return true;
  });

  // Render the layout on canvas
  useEffect(() => {
    if (!fabricCanvasRef.current || !generatedLayout) return;
    
    console.log('Rendering layout on canvas:', generatedLayout.name);
    console.log('Elements to render:', generatedLayout.elements.length);
    console.log('Layer images available:', layerImages.size);
    console.log('Animation enabled:', animateElements);
    
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
    
    // Add safezone outline
    if (safezoneWidth > 0) {
      const safezone = new Rect({
        left: safezoneWidth * scale,
        top: safezoneWidth * scale,
        width: canvasWidth - (safezoneWidth * scale * 2),
        height: canvasHeight - (safezoneWidth * scale * 2),
        fill: 'transparent',
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      canvas.add(safezone);
    }
    
    // Track elements added for logging
    let elementsAdded = 0;
    
    // Get any custom positions for this layout
    const layoutCustomPositions = customPositions[generatedLayout.name] || {};
    
    // Add elements to canvas in reverse order (bottom to top)
    const elementsToRender = [...generatedLayout.elements].reverse();
    
    console.log(`Rendering ${elementsToRender.length} elements on canvas`);
    
    // Draw background elements first
    for (const element of elementsToRender.filter(el => el.label === 'background')) {
      try {
        if (!element.visible) continue;
        
        // Handle background element specially using the cover approach
        console.log(`Rendering background element ${element.name} with dimensions ${element.width}x${element.height}`);
        
        // Get the custom position if it exists
        const customPosition = layoutCustomPositions[element.id];
        
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        const elementWidth = customPosition ? customPosition.width : element.width;
        const elementHeight = customPosition ? customPosition.height : element.height;
        
        // Check if element has original bounds for comparison
        if (element.originalBounds) {
          const originalWidth = element.originalBounds.right - element.originalBounds.left;
          const originalHeight = element.originalBounds.bottom - element.originalBounds.top;
          console.log(`Background original size: ${originalWidth}x${originalHeight}, covered size: ${elementWidth}x${elementHeight}`);
        }
        
        tempCanvas.width = Math.max(1, elementWidth);
        tempCanvas.height = Math.max(1, elementHeight);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          // Try to get image data for the layer
          const imageData = layerImages.get(element.name);
          
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            // Draw the layer image, scaled to fit
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
                console.log(`Drew background image for ${element.name} from ${imageData.width}x${imageData.height} to ${elementWidth}x${elementHeight}`);
              } catch (error) {
                console.error(`Error drawing background image for layer ${element.name}:`, error);
                // Fallback to colored rectangle
                ctx.fillStyle = getLabelColor(element.label);
                ctx.fillRect(0, 0, elementWidth, elementHeight);
              }
            }
          } else {
            // No image data, use colored rectangle
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
        
        // Calculate final position with scale
        const left = (customPosition ? customPosition.x : element.x) * scale;
        const top = (customPosition ? customPosition.y : element.y) * scale;
        
        // Create fabric image - ensure we use the properly scaled dimensions
        const fabricImage = new FabricImage(tempCanvas, {
          left: animateElements ? (element.originalBounds ? element.originalBounds.left * scale : -elementWidth * scale) : left,
          top: animateElements ? (element.originalBounds ? element.originalBounds.top * scale : canvas.height / 2) : top,
          // Fabric will handle scaling internally based on these dimensions
          width: elementWidth,
          height: elementHeight,
          // Avoid using scale factors that could cause double scaling
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
          // opacity: animateElements ? 0 : (isGenerating ? 0.7 : 1)
          opacity: 1
        });
        
        // Add custom properties
        fabricImage.set('id', element.id);
        fabricImage.set('elementName', element.name);
        fabricImage.set('elementLabel', element.label);
        fabricImage.set('position', element.position);
        
        // Add modified event handler
        fabricImage.on('modified', () => {
          console.log(`Element ${element.name} modified: `, 
            `position (${fabricImage.left}, ${fabricImage.top})`,
            `dimensions (${fabricImage.width} × ${fabricImage.scaleX}) x (${fabricImage.height} × ${fabricImage.scaleY})`,
            `angle: ${fabricImage.angle}`
          );
          
          const newPosition = {
            position: element.position as PositionKeyword,
            x: Math.round(fabricImage.left! / scale),
            y: Math.round(fabricImage.top! / scale),
            // Calculate actual dimensions accounting for the scale factor
            width: Math.round(fabricImage.width! * fabricImage.scaleX! / scale),
            height: Math.round(fabricImage.height! * fabricImage.scaleY! / scale),
            angle: fabricImage.angle
          };
          
          console.log(`New element position in layout coordinates: `, newPosition);
          
          // Store the custom position for this layout
          setCustomPositions(prev => ({
            ...prev,
            [generatedLayout.name]: {
              ...(prev[generatedLayout.name] || {}),
              [element.id]: newPosition
            }
          }));
        });
        
        // Add the fabric image to canvas
        canvas.add(fabricImage);
        elementsAdded++;
        
        // Animate the element into position if animation is enabled
        if (animateElements && !isGenerating) {
          // Delay animation based on element index to create a staggered effect
          const delay = 150 * elementsAdded;
          
          setTimeout(() => {
            // Animate position and opacity
            fabricImage.animate({
              left: left,
              top: top,
              opacity: 1
            }, {
              duration: 300,
              onChange: canvas.renderAll.bind(canvas),
              easing: fabricUtil.ease.easeOutCubic
            });
          }, delay);
        }
      } catch (error) {
        console.error(`Error rendering background element ${element.name}:`, error);
      }
    }
    
    // Draw non-background elements
    for (const element of elementsToRender.filter(el => el.label !== 'background')) {
      try {
        if (!element.visible) continue;
        
        // Get the custom position if it exists
        const customPosition = layoutCustomPositions[element.id];
        
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        const elementWidth = customPosition ? customPosition.width : element.width;
        const elementHeight = customPosition ? customPosition.height : element.height;
        
        console.log(`Rendering element ${element.name} with dimensions ${elementWidth}x${elementHeight}`);
        
        // Check if element has original bounds for comparison
        if (element.originalBounds) {
          const originalWidth = element.originalBounds.right - element.originalBounds.left;
          const originalHeight = element.originalBounds.bottom - element.originalBounds.top;
          console.log(`Original bounds: ${originalWidth}x${originalHeight}, scale factor: ${elementWidth/originalWidth}x${elementHeight/originalHeight}`);
        }
        
        tempCanvas.width = Math.max(1, elementWidth);
        tempCanvas.height = Math.max(1, elementHeight);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          // Try to get image data for the layer
          const imageData = layerImages.get(element.name);
          
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            // Draw the layer image, scaled to fit
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
                console.log(`Drew image for ${element.name} from ${imageData.width}x${imageData.height} to ${elementWidth}x${elementHeight}`);
              } catch (error) {
                console.error(`Error drawing image for layer ${element.name}:`, error);
                // Fallback to colored rectangle
                ctx.fillStyle = getLabelColor(element.label);
                ctx.fillRect(0, 0, elementWidth, elementHeight);
              }
            }
          } else {
            // No image data, use colored rectangle
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
        
        // Calculate final position with scale
        const left = (customPosition ? customPosition.x : element.x) * scale;
        const top = (customPosition ? customPosition.y : element.y) * scale;
        
        // Create fabric image - ensure we use the properly scaled dimensions
        const fabricImage = new FabricImage(tempCanvas, {
          left: animateElements ? (element.originalBounds ? element.originalBounds.left * scale : -elementWidth * scale) : left,
          top: animateElements ? (element.originalBounds ? element.originalBounds.top * scale : canvas.height / 2) : top,
          // Fabric will handle scaling internally based on these dimensions
          width: elementWidth,
          height: elementHeight,
          // Avoid using scale factors that could cause double scaling
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
          console.log(`Element ${element.name} modified: `, 
            `position (${fabricImage.left}, ${fabricImage.top})`,
            `dimensions (${fabricImage.width} × ${fabricImage.scaleX}) x (${fabricImage.height} × ${fabricImage.scaleY})`,
            `angle: ${fabricImage.angle}`
          );
          
          const newPosition = {
            position: element.position as PositionKeyword,
            x: Math.round(fabricImage.left! / scale),
            y: Math.round(fabricImage.top! / scale),
            // Calculate actual dimensions accounting for the scale factor
            width: Math.round(fabricImage.width! * fabricImage.scaleX! / scale),
            height: Math.round(fabricImage.height! * fabricImage.scaleY! / scale),
            angle: fabricImage.angle
          };
          
          console.log(`New element position in layout coordinates: `, newPosition);
          
          // Store the custom position for this layout
          setCustomPositions(prev => ({
            ...prev,
            [generatedLayout.name]: {
              ...(prev[generatedLayout.name] || {}),
              [element.id]: newPosition
            }
          }));
        });
        
        // Add the fabric image to canvas
        canvas.add(fabricImage);
        elementsAdded++;
        
        // Animate the element into position if animation is enabled
        if (animateElements && !isGenerating) {
          // Delay animation based on element index to create a staggered effect
          const delay = 150 * elementsAdded;
          
          setTimeout(() => {
            // Animate position and opacity
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
    
  }, [generatedLayout, layerImages, customPositions, safezoneWidth, margin, isGenerating, animateElements]);

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
    const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
    const layerRules = personalizationRules[normalizedId] || personalizationRules[layerId];

    if (!layerRules?.isPersonalized) return true;

    const relevantRules = layerRules.rules.filter((rule: PersonalizationRule) => 
      rule.type === selectedSegmentationType
    );

    if (relevantRules.length === 0) return false;

    return relevantRules.some((rule: PersonalizationRule) => rule.value === selectedSegmentationValue);
  };

  // Modify handleGenerateLayout to use the shared doesLayerMatchRules function
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

    // Load necessary data from storage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    if (!layerLabels) {
      toast.error('Missing layer labels data');
      return;
    }

    try {
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

      // Process each label group independently
      const processedLayers = Array.from(layersByLabel.entries()).flatMap(([, layers]) => {
        // Only apply personalization rules if we have personalized layers
        if (hasPersonalization) {
          const matchingLayers = layers.filter(layer => doesLayerMatchRules(layer.id, personalizationRules));
          
          if (matchingLayers.length === 0) {
            return layers.map(layer => ({ ...layer, visible: false }));
          }

          const selectedLayer = matchingLayers[Math.floor(Math.random() * matchingLayers.length)];
          return layers.map(layer => ({
            ...layer,
            visible: layer.id === selectedLayer.id
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
            return layers.map(layer => ({ ...layer, visible: false }));
          }

          // Randomly select from visible layers
          const selectedLayer = visibleLayers[Math.floor(Math.random() * visibleLayers.length)];
          return layers.map(layer => ({
            ...layer,
            visible: layer.id === selectedLayer.id
          }));
        }
      });

      // Filter visible layers and generate layout
      const visibleLayers = processedLayers.filter(layer => layer.visible);
      console.log('Visible layers:', visibleLayers.map(l => l.name));

      const layout = generateLayout(visibleLayers, selectedOption, {
        safezone: safezoneWidth,
        margin: margin
      });

      if (!layout) {
        toast.error('Failed to generate layout');
        setIsGenerating(false);
        return;
      }

      setGeneratedLayout(layout);
      
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
  const handleOptionSelect = (option: string) => {
    setSelectedOption(option);
    setGeneratedLayout(null);
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
        format: 'png',
        quality: 1,
        multiplier: 1
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `${generatedLayout.name.replace(/\s+/g, '-').toLowerCase()}.png`;
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

  // Update renderLayoutPreview function to use larger size
  const renderLayoutPreview = (canvas: HTMLCanvasElement, layout: GeneratedLayout) => {
    const fabricCanvas = new Canvas(canvas);
    
    // Calculate dimensions to maintain aspect ratio
    const containerWidth = 500; // Much larger preview size
    const layoutAspectRatio = layout.width / layout.height;
    const canvasWidth = containerWidth;
    const canvasHeight = containerWidth / layoutAspectRatio;
    
    // Update canvas dimensions
    fabricCanvas.setDimensions({
      width: canvasWidth,
      height: canvasHeight,
    });
    
    // Calculate scale
    const scaleX = canvasWidth / layout.width;
    const scaleY = canvasHeight / layout.height;
    const scale = Math.min(scaleX, scaleY);
    
    // Add background
    const background = new Rect({
      right: 0,
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
    
    // Add safezone outline
    if (safezoneWidth > 0) {
      const safezone = new Rect({
        left: safezoneWidth * scale,
        top: safezoneWidth * scale,
        width: canvasWidth - (safezoneWidth * scale * 2),
        height: canvasHeight - (safezoneWidth * scale * 2),
        fill: 'transparent',
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        excludeFromExport: true
      });
      fabricCanvas.add(safezone);
    }
    
    // Add elements in reverse order (bottom to top)
    const elementsToRender = [...layout.elements].reverse();
    
    // Draw background elements first
    for (const element of elementsToRender.filter(el => el.label === 'background')) {
      if (!element.visible) continue;
      
      try {
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        const elementWidth = element.width;
        const elementHeight = element.height;
        
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
        
        // Create fabric image
        const fabricImage = new FabricImage(tempCanvas, {
          left: element.x * scale,
          top: element.y * scale,
          width: elementWidth,
          height: elementHeight,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          hasControls: false,
          hasBorders: false,
          opacity: 1
        });
        
        fabricCanvas.add(fabricImage);
        
      } catch (error) {
        console.error(`Error rendering preview element ${element.name}:`, error);
      }
    }
    
    // Draw non-background elements
    for (const element of elementsToRender.filter(el => el.label !== 'background')) {
      if (!element.visible) continue;
      
      try {
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        const elementWidth = element.width;
        const elementHeight = element.height;
        
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
        
        // Create fabric image
        const fabricImage = new FabricImage(tempCanvas, {
          left: element.x * scale,
          top: element.y * scale,
          width: elementWidth,
          height: elementHeight,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          hasControls: false,
          hasBorders: false,
          opacity: 1
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

    // Load necessary data from storage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    if (!layerLabels) {
      toast.error('Missing layer labels data');
      return;
    }

    try {
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
            safezone: safezoneWidth,
            margin: margin
          });

          if (layout) {
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
                  {/* New segmentation type selection */}
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
                        {getSegmentationTypes().map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* New segmentation value selection */}
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
                        {getValuesForType(selectedSegmentationType).map((value) => (
                          <SelectItem key={value.id} value={value.id}>
                            {value.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
              <Label htmlFor="safezone-width" className="text-sm font-medium mb-2">
                Safezone
              </Label>
              <Select 
                value={safezoneWidth.toString()} 
                onValueChange={(value) => setSafezoneWidth(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select safezone width" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({length: 11}, (_, i) => i * 5).map((value) => (
                    <SelectItem key={value} value={value.toString()}>
                      {value}px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>

              {/* Generate buttons */}
              {selectedChannelId && selectedAspectRatio && selectedOption && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleGenerateLayout} 
                    disabled={!selectedOption || isGenerating || (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue))}
                    size="lg"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Layout'}
                  </Button>
                  
                  {hasSync && (
                    <Button 
                      onClick={handleGenerateAllSyncLayouts}
                      disabled={!selectedOption || isGenerating || (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue))}
                      size="lg"
                      variant="secondary"
                    >
                      {isGenerating ? 'Generating...' : 'Generate All Sync Layouts'}
                    </Button>
                  )}

                  <Button 
                    onClick={handleGenerateAllCombinations}
                    disabled={!selectedOption || isGenerating || (hasPersonalization && (!selectedSegmentationType || !selectedSegmentationValue))}
                    size="lg"
                    variant="outline"
                  >
                    {isGenerating ? 'Generating...' : 'Generate All Combinations'}
                  </Button>
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
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportImage}
              disabled={downloading}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Exporting...' : 'Export PNG'}
            </Button>
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
      <div className="border rounded-lg overflow-hidden w-full bg-white shadow-sm" style={{ minHeight: '200px' }}>
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

      {/* Replace Dialog with custom full-screen modal */}
      {showGallery && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowGallery(false)}
          />
          
          {/* Modal Content */}
          <div className="absolute inset-0 bg-gray-100/95">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b">
              <div className="max-w-[2000px] mx-auto px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Layout Gallery</h2>
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

            {/* Grid Layout */}
            <div className="max-w-[2000px] mx-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 overflow-y-auto">
                {multipleLayouts.map((layout, index) => (
                  <div 
                    key={index}
                    className={cn(
                      "relative border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 bg-gray-100 hover:shadow-lg",
                      currentLayoutIndex === index 
                        ? "border-primary ring-2 ring-primary/20 shadow-xl" 
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => {
                      setCurrentLayoutIndex(index);
                      setGeneratedLayout(layout);
                      setShowGallery(false);
                    }}
                  >
                    <div className="relative bg-white rounded-lg overflow-hidden flex items-center justify-center">
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
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Layout {index + 1}
                      </span>
                      {currentLayoutIndex === index && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {layout.width}×{layout.height} • {layout.aspectRatio}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 