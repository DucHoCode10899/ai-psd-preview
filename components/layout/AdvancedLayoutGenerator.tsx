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

export function AdvancedLayoutGenerator({ psdLayers, psdBuffer }: AdvancedLayoutGeneratorProps) {
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

  // Modify handleGenerateLayout to consider personalization
  const handleGenerateLayout = async () => {
    if (!psdLayers || !selectedAspectRatio || !selectedOption || !selectedSegmentationType || !selectedSegmentationValue) {
      toast.error('Please select all options including segmentation');
      return;
    }
    
    // Fetch latest personalization rules from localStorage
    const storedRules = localStorage.getItem("psd_personalization_rules");
    let personalizationRules: Record<string, LayerPersonalization>;
    
    try {
      if (!storedRules) {
        console.error('No personalization rules found in localStorage');
        toast.error('No personalization rules found. Please configure layer personalization first.');
        return;
      }
      
      personalizationRules = JSON.parse(storedRules);
      if (typeof personalizationRules !== 'object' || personalizationRules === null) {
        console.error('Invalid rules structure:', personalizationRules);
        toast.error('Invalid personalization rules structure');
        return;
      }
    } catch (error) {
      console.error('Error parsing personalization rules:', error);
      toast.error('Error loading personalization rules');
      return;
    }
    
    // Check if there are any labeled layers in sessionStorage
    const layerLabels = sessionStorage.getItem('psd_layer_labels');
    const labels = layerLabels ? JSON.parse(layerLabels) : {};
    const hasLabeledLayers = Object.keys(labels).length > 0;
    
    if (!hasLabeledLayers) {
      toast.error('No labeled layers detected. Please label your Master PSD layers before generating a layout.');
      return;
    }
    
    setIsGenerating(true);
    console.log('Generating layout for aspect ratio:', selectedAspectRatio, 'option:', selectedOption, 'with layers:', psdLayers.length);
    console.log('Current segmentation:', selectedSegmentationType, selectedSegmentationValue);
    console.log('Active personalization rules:', personalizationRules);
    
    try {
      // First group layers by their label
      const layersByLabel = new Map<string, Array<typeof psdLayers[0]>>();
      
      psdLayers.forEach(layer => {
        const layerId = layer.id;
        const label = labels[layerId] || labels[`layer_${layerId}`];
        if (label) {
          if (!layersByLabel.has(label)) {
            layersByLabel.set(label, []);
          }
          layersByLabel.get(label)?.push(layer);
        }
      });

      // Helper function to check if a layer's rules match current segmentation
      const doesLayerMatchRules = (layerId: string) => {
        const layerRules = personalizationRules[layerId] || 
                          personalizationRules[`layer_${layerId}`];

        // If no personalization, layer is always visible
        if (!layerRules?.isPersonalized) return true;

        // Check if rules match current segmentation
        const relevantRules = layerRules.rules.filter(rule => 
          rule.type === selectedSegmentationType
        );

        // If no rules for this segmentation type, hide layer
        if (relevantRules.length === 0) return false;

        // Check if any rules match current value
        return relevantRules.some(rule => rule.value === selectedSegmentationValue);
      };

      // Process each label group and randomly select one matching layer
      const processedLayers = Array.from(layersByLabel.entries()).flatMap(([label, layers]) => {
        // Filter layers that match current personalization rules
        const matchingLayers = layers.filter(layer => doesLayerMatchRules(layer.id));
        
        console.log(`Processing ${label} group: ${layers.length} total layers, ${matchingLayers.length} matching current rules`);
        
        if (matchingLayers.length === 0) {
          // If no layers match rules, mark all as invisible
          console.log(`No matching layers for ${label}, hiding all`);
          return layers.map(layer => ({ ...layer, visible: false }));
        }

        // Randomly select one layer from matching layers
        const selectedIndex = Math.floor(Math.random() * matchingLayers.length);
        const selectedLayer = matchingLayers[selectedIndex];
        console.log(`Selected layer ${selectedLayer.name} for ${label} group`);
        
        // Return all layers, but only selected one is visible
        return layers.map(layer => ({
          ...layer,
          visible: matchingLayers.includes(layer) && 
                  matchingLayers.indexOf(layer) === selectedIndex
        }));
      });

      // Log processed layers for debugging
      console.log('\nFinal layer visibility after random selection:');
      processedLayers.forEach(layer => {
        console.log(`- ${layer.name} (${layer.id}): ${layer.visible ? 'Visible' : 'Hidden'}`);
      });

      // Filter out invisible layers before generating layout
      const visibleLayers = processedLayers.filter(layer => layer.visible);
      console.log('\nLayers being used in layout:', visibleLayers.map(l => l.name).join(', '));

      // Generate the layout with visible layers only
      const layout = generateLayout(visibleLayers, selectedOption, {
        safezone: safezoneWidth,
        margin: margin
      });
      
      if (!layout) {
        toast.error('Failed to generate layout');
        setIsGenerating(false);
        return;
      }
      
      console.log('Generated layout:', layout.name, 'with elements:', layout.elements.length);
      console.log('Elements in layout:', layout.elements.map(e => e.name).join(', '));
      
      // Set the generated layout
      setGeneratedLayout(layout);
      
      // Wait a short time before finishing
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

  // If no layers, show upload message
  if (!psdLayers) {
    return (
      <div className="p-4 border-dashed border-2 rounded-lg text-center">
        <p className="text-gray-500">Upload a PSD file first</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Toaster />
      {/* Channel and layout selection */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-2">
          {/* Empty div - removed Reset Current Position button from here */}
        </div>
      </div>
      
      {/* Selection controls */}
      <div className="space-y-4">
        {/* Dropdowns and button in a row */}
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

          {/* Generate button */}
          {selectedChannelId && selectedAspectRatio && selectedOption && selectedSegmentationType && selectedSegmentationValue && (
            <Button 
              onClick={handleGenerateLayout} 
              disabled={!selectedOption || isGenerating}
              size="lg"
              className="w-[200px]"
            >
              {isGenerating ? 'Generating...' : 'Generate Layout'}
            </Button>
          )}
        </div>
      </div>
      
      {/* Layout info and export */}
      {generatedLayout && (
        <div className="flex items-center justify-end text-sm text-muted-foreground gap-2">          
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
      
      {/* Canvas container */}
      <div className="border rounded-lg overflow-hidden w-full bg-white shadow-sm" style={{ minHeight: '200px' }}>
        <div className="w-full h-full flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full"  />
        </div>
      </div>
    
    </div>
  );
} 