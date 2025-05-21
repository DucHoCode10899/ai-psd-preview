"use client";

import { useState, useEffect, useRef } from 'react';
import { PsdLayerMetadata } from '@/utils/psd-parser';
import { GeneratedLayout } from '@/types/layout';
import { getAvailableLayouts, generateLayout } from '@/utils/layout-generator';
import { Canvas, Text, Rect, FabricObject, FabricImage, util as fabricUtil } from 'fabric';
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
import type { Node, Layer as PsdLayer } from "@webtoon/psd";

interface LayoutGeneratorProps {
  psdLayers: PsdLayerMetadata[] | null;
  psdBuffer?: ArrayBuffer;
}

// Available social media channels
const CHANNELS = [
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "twitter", name: "Twitter" },
];

// Helper function to calculate aspect ratio
const calculateAspectRatio = (width: number, height: number): string => {
  // Normalize to common ratios instead of using raw dimensions
  const ratio = width / height;
  
  // Define standard ratios and their normalized values
  const STANDARD_RATIOS = [
    { ratio: '9:16', value: 9/16 },  // 0.5625
    { ratio: '4:5', value: 4/5 },    // 0.8
    { ratio: '1:1', value: 1 },      // 1.0
    { ratio: '16:9', value: 16/9 }   // 1.7778
  ];

  // Find the closest standard ratio
  let closestRatio = STANDARD_RATIOS[0];
  let minDiff = Math.abs(ratio - STANDARD_RATIOS[0].value);

  for (let i = 1; i < STANDARD_RATIOS.length; i++) {
    const diff = Math.abs(ratio - STANDARD_RATIOS[i].value);
    if (diff < minDiff) {
      minDiff = diff;
      closestRatio = STANDARD_RATIOS[i];
    }
  }

  return closestRatio.ratio;
};

// Helper function to normalize aspect ratio for comparison
const normalizeRatio = (ratio: string): number => {
  const [width, height] = ratio.split(':').map(Number);
  return width / height;
};

// Helper function to check if two ratios are equivalent
const areRatiosEquivalent = (ratio1: string, ratio2: string): boolean => {
  const normalized1 = normalizeRatio(ratio1);
  const normalized2 = normalizeRatio(ratio2);
  // Use a small epsilon for floating-point comparison
  return Math.abs(normalized1 - normalized2) < 0.1;
};

// Helper function to get target ratios based on source ratio
const getTargetRatios = (sourceRatio: string): string[] => {
  const normalized = normalizeRatio(sourceRatio);
  
  // Common social media ratios
  const commonRatios = {
    SQUARE: '1:1',
    LANDSCAPE: '16:9',
    PORTRAIT_STORY: '9:16',
    PORTRAIT_POST: '4:5'
  };
  
  // If source is vertical (portrait)
  if (normalized <= 0.7) {
    const ratios = [
      commonRatios.SQUARE,      // Include square
      commonRatios.LANDSCAPE,   // Include landscape
      commonRatios.PORTRAIT_POST // Include 4:5
    ].filter(ratio => !areRatiosEquivalent(ratio, sourceRatio));
    return ratios;
  }
  // If source is square-ish
  else if (normalized > 0.7 && normalized < 1.3) {
    const ratios = [
      commonRatios.LANDSCAPE,      // Include 16:9
      commonRatios.PORTRAIT_POST,  // Include 4:5
      commonRatios.PORTRAIT_STORY  // Include 9:16
    ].filter(ratio => !areRatiosEquivalent(ratio, sourceRatio));
    return ratios;
  }
  // If source is horizontal (landscape)
  else {
    const ratios = [
      commonRatios.SQUARE,         // Include square
      commonRatios.PORTRAIT_POST,  // Include 4:5
      commonRatios.PORTRAIT_STORY  // Include 9:16
    ].filter(ratio => !areRatiosEquivalent(ratio, sourceRatio));
    return ratios;
  }
};

// Helper function to get layer labels from sessionStorage
const getLayerLabels = (): Record<string, string> => {
  try {
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    return storedLabels ? JSON.parse(storedLabels) : {};
  } catch (error) {
    console.error('Error getting layer labels:', error);
    return {};
  }
};

// Helper function to get scale factor based on aspect ratio for main-subject
const getMainSubjectScaleFactor = (aspectRatio: string): number => {
  switch (aspectRatio) {
    case '1:1':  // Square
      return 0.85;  // 70% of original scale
    case '4:5':  // Vertical post
      return 0.9; // 75% of original scale
    case '16:9': // Landscape
      return 1.0;  // Full scale
    case '9:16': // Story
      return 0.8;  // 80% of original scale
    default:
      return 1.0;
  }
};

export function LayoutGenerator({ psdLayers, psdBuffer }: LayoutGeneratorProps) {
  const [availableLayouts, setAvailableLayouts] = useState<{name: string; aspectRatio: string}[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [generatedLayout, setGeneratedLayout] = useState<GeneratedLayout | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState("facebook");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [layerImages, setLayerImages] = useState<Map<string, ImageData>>(new Map());
  const [modifiedPositions, setModifiedPositions] = useState<Record<string, Record<string, { 
    left: number; 
    top: number; 
    width: number; 
    height: number; 
    angle?: number 
  }>>>({});
  const [sourceRatio, setSourceRatio] = useState<string | null>(null);
  const [safezoneWidth, setSafezoneWidth] = useState(10);
  
  // Load available layouts
  useEffect(() => {
    setAvailableLayouts(getAvailableLayouts());
  }, []);
  
  // Initialize canvas when component mounts
  useEffect(() => {
    if (!canvasRef.current) return;
    
    
    fabricCanvasRef.current = new Canvas(canvasRef.current, {
      backgroundColor: '#f9f9f9',
      width: 800,
      height: 500,
      centeredScaling: true,
      preserveObjectStacking: true,
      selection: true
    });
    
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, []);

  // Check scroll capability when tabs change
  useEffect(() => {
    // Add window resize listener to recheck scrollability
    window.addEventListener('resize', checkScrollability);
    return () => {
      window.removeEventListener('resize', checkScrollability);
    };
  }, []);

  // Check if we can scroll the tabs
  const checkScrollability = () => {
    // Logic removed since tabs are now a dropdown
  };

  // Calculate source ratio when PSD layers are loaded
  useEffect(() => {
    if (psdLayers && psdLayers.length > 0) {
      const labels = getLayerLabels();
      // Find the background layer or use the first layer
      const referenceLayer = psdLayers.find(layer => labels[layer.id] === 'background') || psdLayers[0];
      if (referenceLayer.bounds) {
        const width = referenceLayer.bounds.right - referenceLayer.bounds.left;
        const height = referenceLayer.bounds.bottom - referenceLayer.bounds.top;
        const ratio = calculateAspectRatio(width, height);
        setSourceRatio(ratio);
      }
    }
  }, [psdLayers]);

  // Process PSD layers to extract images
  useEffect(() => {
    if (!psdBuffer || !psdLayers) return;

    const processLayers = async () => {
      try {
        const Psd = (await import('@webtoon/psd')).default;
        const psd = Psd.parse(psdBuffer);
        const images = new Map<string, ImageData>();

        const processNode = async (node: Node) => {
          if (node.type === "Group") {
            console.log("Group", node);
            
            // Calculate group dimensions similar to PsdPreviewCanvas
            let minLeft = Infinity;
            let minTop = Infinity;
            let maxRight = -Infinity;
            let maxBottom = -Infinity;
            const childrenIds: string[] = [];
            
            // Process all children to find group bounds
            if (node.children) {
              for (const child of node.children) {
                if (child.type === "Layer") {
                  const layer = child as PsdLayer;
                  minLeft = Math.min(minLeft, layer.left);
                  minTop = Math.min(minTop, layer.top);
                  maxRight = Math.max(maxRight, layer.left + layer.width);
                  maxBottom = Math.max(maxBottom, layer.top + layer.height);
                  childrenIds.push(layer.name || '');
                  
                  // Process layer contents
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
                    console.error(`Error processing layer in group ${node.name}, layer ${layer.name}:`, error);
                  }
                }
              }
            }
            
            // Create a composite image for the group if needed
            if (minLeft !== Infinity) {
              const groupWidth = maxRight - minLeft;
              const groupHeight = maxBottom - minTop;
              
              // Store group information for layout generation
              images.set(node.name || 'Group', new ImageData(
                new Uint8ClampedArray(groupWidth * groupHeight * 4),
                groupWidth,
                groupHeight
              ));
            }
          }
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

          // Process all children nodes recursively
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
      }
    };

    processLayers();
  }, [psdBuffer, psdLayers]);

  // Filter layouts by selected channel AND compatible ratios
  const filteredLayouts = availableLayouts.filter((layout: { name: string; aspectRatio: string }) => {
    const matchesChannel = layout.name.toLowerCase().includes(selectedChannel.toLowerCase());
    if (!matchesChannel || !sourceRatio) return false;

    // Get target ratios based on source ratio
    const targetRatios = getTargetRatios(sourceRatio);
    
    // Exclude layouts with the same ratio as source
    return targetRatios.includes(layout.aspectRatio) && !areRatiosEquivalent(layout.aspectRatio, sourceRatio);
  });

  // Render the layout when it changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !generatedLayout) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Clear canvas
    canvas.clear();
    
    // Get the container dimensions
    const containerEl = canvas.getElement().parentElement;
    if (!containerEl) {
      console.error("Container element not found");
      return;
    }
    
    // Get container dimensions - use container width and calculate appropriate height
    const containerWidth = containerEl.clientWidth || 800;
    const layoutAspectRatio = generatedLayout.width / generatedLayout.height;
    
    // Use const instead of let since these aren't reassigned
    const canvasWidth = containerWidth;
    const canvasHeight = containerWidth / layoutAspectRatio;
    
    // Set minimum height for container
    containerEl.style.minHeight = `${canvasHeight}px`;
    
    // Set canvas dimensions
    canvas.setDimensions({
      width: canvasWidth,
      height: canvasHeight
    });
    
    // Set canvas viewport (display size)
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    // Calculate scale based on layout dimensions
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
    
    // Track elements added
    let elementsAdded = 0;
    
    // Add elements to canvas
    for (const element of generatedLayout.elements) {
      if (!element.visible) {
        continue;
      }
      
      // Get modified position for current layout if it exists
      const layoutPositions = modifiedPositions[generatedLayout.name] || {};
      const modifiedPosition = layoutPositions[element.id];
      
      // Calculate positions - maintain original size but scale based on layout ratio
      // These values are used below for initialLeft and initialTop
      
      // Get original bounds for size calculation
      const originalBounds = element.originalBounds;
      let width, height;
      
      // Create temporary canvas for the layer
      const tempCanvas = document.createElement('canvas');
      
      // Special handling for background layer
      if (element.label === 'background') {
        // For background, use the full canvas dimensions without safezone
        width = canvasWidth;
        height = canvasHeight;
        
        // Set temp canvas dimensions
        tempCanvas.width = Math.max(1, width);
        tempCanvas.height = Math.max(1, height);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          // Get layer image data
          const imageData = layerImages.get(element.name);
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            // Create a temporary canvas to hold the original image data
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = Math.max(1, imageData.width);
            originalCanvas.height = Math.max(1, imageData.height);
            const originalCtx = originalCanvas.getContext('2d');
            
            if (originalCtx) {
              // Draw the original image data
              originalCtx.putImageData(imageData, 0, 0);
              
              // Scale and draw to the final canvas
              try {
                ctx.drawImage(
                  originalCanvas,
                  0, 0, imageData.width, imageData.height,
                  0, 0, width, height
                );
              } catch (error) {
                console.error(`Error drawing image for layer ${element.name}:`, error);
                // Fallback to colored rectangle if drawing fails
                ctx.fillStyle = getLabelColor(element.label);
                ctx.fillRect(0, 0, width, height);
              }
            }
          } else {
            // Fallback to colored rectangle if image not found or has invalid dimensions
            ctx.fillStyle = getLabelColor(element.label);
            ctx.fillRect(0, 0, width, height);
          }
        }
        
        // Position at (0,0) for full canvas coverage
        const fabricImage = new FabricImage(tempCanvas, {
          left: 0,
          top: 0,
          width: width,
          height: height,
          scaleX: 1,
          scaleY: 1,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          lockRotation: false,
          transparentCorners: false,
          cornerColor: '#0070f3',
          cornerSize: 8,
          cornerStyle: 'circle',
          borderColor: '#0070f3',
          borderScaleFactor: 2,
          angle: modifiedPosition?.angle || 0,
          opacity: isGenerating ? 0.5 : 1
        });
        
        // Add special moving constraints for background
        fabricImage.on('moving', () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          
          // Keep background at (0,0)
          fabricImage.setCoords();
          fabricImage.set({
            left: 0,
            top: 0
          });
        });
        
        // Add elements to canvas
        canvas.add(fabricImage);
        
        // Set custom properties
        fabricImage.set('id', element.id);
        fabricImage.set('elementName', element.name);
        fabricImage.set('elementLabel', element.label);
        
        // Add modified event
        fabricImage.on('modified', () => {
          const newPosition = {
            left: Math.round(fabricImage.left! / scale),
            top: Math.round(fabricImage.top! / scale),
            width: Math.round((fabricImage.width! * fabricImage.scaleX!) / scale),
            height: Math.round((fabricImage.height! * fabricImage.scaleY!) / scale),
            angle: fabricImage.angle
          };
          
          // Store the modified position for the current layout
          setModifiedPositions(prev => ({
            ...prev,
            [generatedLayout.name]: {
              ...(prev[generatedLayout.name] || {}),
              [element.id]: newPosition
            }
          }));
        });
        
        elementsAdded++;
      } else {
        // Normal layer handling with safezone constraints
        if (originalBounds) {
          width = Math.max(1, (originalBounds.right - originalBounds.left) * scale);
          height = Math.max(1, (originalBounds.bottom - originalBounds.top) * scale);
        } else {
          width = Math.max(1, element.width * scale);
          height = Math.max(1, element.height * scale);
        }
        
        // Create temporary canvas for the layer
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, width);
        tempCanvas.height = Math.max(1, height);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          // Get layer image data
          const imageData = layerImages.get(element.name);
          if (imageData && imageData.width > 0 && imageData.height > 0) {
            // Create a temporary canvas to hold the original image data
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = Math.max(1, imageData.width);
            originalCanvas.height = Math.max(1, imageData.height);
            const originalCtx = originalCanvas.getContext('2d');
            
            if (originalCtx) {
              // Draw the original image data
              originalCtx.putImageData(imageData, 0, 0);
              
              // Scale and draw to the final canvas
              try {
                ctx.drawImage(
                  originalCanvas,
                  0, 0, imageData.width, imageData.height,
                  0, 0, width, height
                );
              } catch (error) {
                console.error(`Error drawing image for layer ${element.name}:`, error);
                // Fallback to colored rectangle if drawing fails
                ctx.fillStyle = getLabelColor(element.label);
                ctx.fillRect(0, 0, width, height);
              }
            }
          } else {
            // Fallback to colored rectangle if image not found or has invalid dimensions
            ctx.fillStyle = getLabelColor(element.label);
            ctx.fillRect(0, 0, width, height);
          }
        }
        
        // Calculate available space within safezone
        const availableWidth = canvasWidth - (safezoneWidth * 2);
        const availableHeight = canvasHeight - (safezoneWidth * 2);
        
        // Calculate scale to fit within safezone if necessary, with special handling for main-subject
        let scaleToFit;
        if (element.label === 'main-subject') {
          const mainSubjectScale = getMainSubjectScaleFactor(generatedLayout.aspectRatio);
          const scaleToFitX = width > availableWidth ? availableWidth / width : 1;
          const scaleToFitY = height > availableHeight ? availableHeight / height : 1;
          scaleToFit = Math.min(scaleToFitX, scaleToFitY) * mainSubjectScale;
        } else {
          const scaleToFitX = width > availableWidth ? availableWidth / width : 1;
          const scaleToFitY = height > availableHeight ? availableHeight / height : 1;
          scaleToFit = Math.min(scaleToFitX, scaleToFitY);
        }
        
        // Apply safezone-aware scaling
        const finalWidth = width * scaleToFit;
        const finalHeight = height * scaleToFit;
        
        // Calculate initial position with safezone constraints
        const initialLeft = Math.max(safezoneWidth, Math.min(canvasWidth - safezoneWidth - finalWidth, 
          (modifiedPosition ? modifiedPosition.left : element.x) * scale));
        
        const initialTop = Math.max(safezoneWidth, Math.min(canvasHeight - safezoneWidth - finalHeight, 
          (modifiedPosition ? modifiedPosition.top : element.y) * scale));
        
        // Create fabric image from temp canvas with safezone constraints
        const fabricImage = new FabricImage(tempCanvas, {
          left: initialLeft,
          top: initialTop,
          width: width,
          height: height,
          scaleX: scaleToFit,
          scaleY: scaleToFit,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          lockRotation: false,
          transparentCorners: false,
          cornerColor: '#0070f3',
          cornerSize: 8,
          cornerStyle: 'circle',
          borderColor: '#0070f3',
          borderScaleFactor: 2,
          angle: modifiedPosition?.angle || 0,
          opacity: isGenerating ? 0.5 : 1
        });
        
        // Add moving and scaling constraints for non-background layers
        const enforceConstraints = () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          
          // Calculate safezone boundaries
          const canvasWidth = canvas.getWidth();
          const canvasHeight = canvas.getHeight();
          
          // Get object bounds
          const objWidth = fabricImage.getScaledWidth();
          const objHeight = fabricImage.getScaledHeight();
          
          // Calculate available space within safezone
          const availableWidth = canvasWidth - (safezoneWidth * 2);
          const availableHeight = canvasHeight - (safezoneWidth * 2);
          
          // If object is larger than available space, scale it down
          if (objWidth > availableWidth || objHeight > availableHeight) {
            const scaleX = availableWidth / (fabricImage.width || 1);
            const scaleY = availableHeight / (fabricImage.height || 1);
            const newScale = Math.min(scaleX, scaleY);
            
            fabricImage.set({
              scaleX: newScale,
              scaleY: newScale
            });
          }
          
          // Calculate boundaries with safezone
          const minX = safezoneWidth;
          const maxX = canvasWidth - safezoneWidth - fabricImage.getScaledWidth();
          const minY = safezoneWidth;
          const maxY = canvasHeight - safezoneWidth - fabricImage.getScaledHeight();
          
          // Constrain position within safezone
          fabricImage.setCoords();
          fabricImage.set({
            left: Math.min(Math.max(fabricImage.left!, minX), maxX),
            top: Math.min(Math.max(fabricImage.top!, minY), maxY)
          });
        };
        
        // Apply constraints on moving and scaling
        fabricImage.on('moving', enforceConstraints);
        fabricImage.on('scaling', enforceConstraints);
        fabricImage.on('modified', enforceConstraints);
        
        // Add elements to canvas
        canvas.add(fabricImage);
        
        // Set custom properties
        fabricImage.set('id', element.id);
        fabricImage.set('elementName', element.name);
        fabricImage.set('elementLabel', element.label);
        
        // Add modified event
        fabricImage.on('modified', () => {
          const newPosition = {
            left: Math.round(fabricImage.left! / scale),
            top: Math.round(fabricImage.top! / scale),
            width: Math.round((fabricImage.width! * fabricImage.scaleX!) / scale),
            height: Math.round((fabricImage.height! * fabricImage.scaleY!) / scale),
            angle: fabricImage.angle
          };
          
          // Store the modified position for the current layout
          setModifiedPositions(prev => ({
            ...prev,
            [generatedLayout.name]: {
              ...(prev[generatedLayout.name] || {}),
              [element.id]: newPosition
            }
          }));
        });
        
        elementsAdded++;
      }
    }
    
    if (elementsAdded > 0) {
      canvas.calcOffset();
      canvas.requestRenderAll();
    }
    
    canvas.renderAll();
    
  }, [generatedLayout, layerImages, modifiedPositions, isGenerating]);
  
  // Function to apply layout positions to fabric objects
  const applyLayoutPositions = (layout: GeneratedLayout, canvas: Canvas, scale: number) => {
    const fabricObjects = canvas.getObjects().filter(obj => 
      !obj.excludeFromExport && obj instanceof FabricImage);
    
    // Map for quick element lookup
    const elementMap = new Map(layout.elements.map(el => [el.id, el]));
    
    fabricObjects.forEach(obj => {
      const elementId = obj.get('id') as string;
      const element = elementMap.get(elementId);
      
      if (element) {
        // Calculate final position with scaling
        const finalLeft = Math.max(0, element.x * scale);
        const finalTop = Math.max(0, element.y * scale);
        
        // Update position
        obj.set({
          left: finalLeft,
          top: finalTop,
          opacity: 1
        });
      }
    });
    
    canvas.renderAll();
  };

  // Generate a layout based on the selected layout name
  const handleGenerateLayout = async () => {
    if (!psdLayers || !selectedLayout) return;
    
    setIsGenerating(true);
    
    try {
      // Clear any previously modified positions when generating a new layout
      if (modifiedPositions[selectedLayout]) {
        setModifiedPositions(prev => {
          const newPositions = { ...prev };
          delete newPositions[selectedLayout];
          return newPositions;
        });
      }
      
      // Generate new layout with current safezone
      const layout = generateLayout(psdLayers, selectedLayout, safezoneWidth);
      if (!layout) {
        console.error('Failed to generate layout');
        setIsGenerating(false);
        return;
      }

      // Get container dimensions for scaling
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const containerEl = canvas.getElement().parentElement;
      if (!containerEl) return;
      
      const containerWidth = containerEl.clientWidth || 800;
      const layoutAspectRatio = layout.width / layout.height;
      const canvasWidth = containerWidth;
      const canvasHeight = containerWidth / layoutAspectRatio;
      
      // Calculate scale based on layout dimensions
      const scaleX = canvasWidth / layout.width;
      const scaleY = canvasHeight / layout.height;
      const scale = Math.min(scaleX, scaleY);
      
      // Set initial positions
      setGeneratedLayout(layout);
      
      // Wait a moment before animating
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check which elements have modified positions
      const layoutPositions = modifiedPositions[layout.name] || {};
      
      // Create final layout with proper positions
      const finalLayout: GeneratedLayout = {
        ...layout,
        elements: layout.elements.map(element => {
          const modifiedPosition = layoutPositions[element.id];
          if (modifiedPosition) {
            // Use modified position
            return {
              ...element,
              x: modifiedPosition.left,
              y: modifiedPosition.top,
              width: modifiedPosition.width,
              height: modifiedPosition.height
            };
          }
          return element;
        })
      };

      // Animate elements to their final positions
      if (canvas) {
        const fabricObjects = canvas.getObjects().filter(obj => !obj.excludeFromExport && obj instanceof FabricImage);
        let animationCount = 0;
        
        fabricObjects.forEach((obj, index) => {
          const elementId = obj.get('id') as string;
          const finalElement = finalLayout.elements.find(el => el.id === elementId);
          
          if (finalElement) {
            animationCount++;
            
            // Calculate final position with scaling
            const finalLeft = Math.max(0, finalElement.x * scale);
            const finalTop = Math.max(0, finalElement.y * scale);
            
            // Only animate if the position has changed
            if (Math.abs(obj.left! - finalLeft) > 1 || Math.abs(obj.top! - finalTop) > 1) {
              // Add staggered delay for each element
              setTimeout(() => {
                obj.animate({
                  left: finalLeft,
                  top: finalTop,
                  opacity: 1
                }, {
                  duration: 1000,
                  easing: fabricUtil.ease.easeOutCubic,
                  onChange: () => canvas.renderAll()
                });
              }, index * 100); // Stagger animations by 100ms
            } else {
              // Just update opacity for elements that don't move
              obj.set('opacity', 1);
            }
          }
        });

        // Update state with final layout after all animations complete
        const animationDelay = animationCount * 100 + 1000;
        setTimeout(() => {
          setGeneratedLayout(finalLayout);
          setIsGenerating(false);
        }, animationDelay);
      }
      
    } catch (error) {
      console.error('Error generating layout:', error);
      setIsGenerating(false);
    }
  };

  // Reset the generated layout
  const handleResetLayout = () => {
    setGeneratedLayout(null);
    setSelectedLayout(null);
    // Clear all modified positions
    setModifiedPositions({});
    
    if (fabricCanvasRef.current) {
      const canvas = fabricCanvasRef.current;
      canvas.clear();
      canvas.setDimensions({ width: 800, height: 500 });
      
      // Add placeholder text
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      
      const placeholderText = new Text('Select a layout and click Generate', {
        left: width / 2,
        top: height / 2,
        fontSize: 16,
        fill: '#666',
        originX: 'center',
        originY: 'center',
        selectable: false
      });
      
      canvas.add(placeholderText);
      canvas.renderAll();
    }
  };

  // Add a function to reset a single layout's positions
  const handleResetCurrentLayout = () => {
    if (!generatedLayout) return;
    
    setModifiedPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[generatedLayout.name];
      return newPositions;
    });
  };

  // Handle channel change
  const handleChannelChange = (value: string) => {
    setSelectedChannel(value);
    setSelectedLayout(null);
    setGeneratedLayout(null);
  };

  // Get a color for each label type
  const getLabelColor = (label: string | null): string => {
    switch (label) {
      case 'background':
        return 'rgba(107, 114, 128, 0.3)'; // Light gray for background
      case 'logo':
        return 'rgba(239, 68, 68, 0.7)'; // Red
      case 'main-subject':
        return 'rgba(59, 130, 246, 0.7)'; // Blue
      case 'domain':
        return 'rgba(168, 85, 247, 0.7)'; // Purple
      case 'product-name':
        return 'rgba(16, 185, 129, 0.7)'; // Green
      case 'sub-content-1':
        return 'rgba(236, 72, 153, 0.7)'; // Pink
      case 'sub-content-2':
        return 'rgba(99, 102, 241, 0.7)'; // Indigo
      case 'cta':
        return 'rgba(249, 115, 22, 0.7)'; // Orange
      case 'disclaimer':
        return 'rgba(245, 158, 11, 0.7)'; // Amber
      default:
        return 'rgba(156, 163, 175, 0.7)'; // Gray
    }
  };
  
  // Export the canvas as an image
  const handleExportImage = () => {
    if (!fabricCanvasRef.current || !generatedLayout) return;
    
    setDownloading(true);
    
    try {
      const canvas = fabricCanvasRef.current;
      
      // Store current dimensions and zoom
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();
      const currentZoom = canvas.getZoom();
      
      // Calculate the scale needed to match the target dimensions
      const targetWidth = generatedLayout.width;
      const targetHeight = generatedLayout.height;
      
      // Set canvas to the exact layout dimensions
      canvas.setDimensions({
        width: targetWidth,
        height: targetHeight
      });

      // Calculate scale factors for the transformation
      const scaleX = targetWidth / currentWidth;
      const scaleY = targetHeight / currentHeight;
      
      // Scale and reposition all objects
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
        }
      });

      // Hide helper objects
      const excludedObjects: {obj: FabricObject, wasVisible: boolean}[] = [];
      canvas.getObjects().forEach(obj => {
        if (obj.excludeFromExport) {
          excludedObjects.push({obj, wasVisible: obj.visible || false});
          obj.visible = false;
        }
      });
      
      // Force render before export
      canvas.renderAll();
      
      // Export at the exact dimensions
      const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: targetWidth / canvas.getWidth(),
        enableRetinaScaling: true
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `${generatedLayout.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Restore original dimensions
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight
      });

      // Restore original object positions and scales
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
            scaleY: originalScaleY / scaleX
          });
        }
      });
      
      // Restore visibility of excluded objects
      excludedObjects.forEach(({obj, wasVisible}) => {
        obj.visible = wasVisible;
      });
      
      // Restore zoom and render
      canvas.setZoom(currentZoom);
      canvas.renderAll();
    } catch (error) {
      console.error('Error exporting image:', error);
    } finally {
      setDownloading(false);
    }
  };
  
  // Add additional styles directly to the canvas container for debugging
  useEffect(() => {
    if (canvasRef.current && canvasRef.current.parentElement) {
      canvasRef.current.parentElement.style.border = "1px solid #ccc";
      canvasRef.current.parentElement.style.minHeight = "500px";
      canvasRef.current.parentElement.style.display = "flex";
      canvasRef.current.parentElement.style.alignItems = "center";
      canvasRef.current.parentElement.style.justifyContent = "center";
    }
  }, [canvasRef.current]);
  
  // Add event listeners for layer changes
  useEffect(() => {
    const handleVisibilityChange = (event: CustomEvent) => {
      const { layerId, isVisible, isGroup } = event.detail;
      
      // Update the layout with new visibility
      if (generatedLayout) {
        const updatedLayout = {
          ...generatedLayout,
          elements: generatedLayout.elements.map(element => {
            // If this is the target layer, update its visibility
            if (element.id === layerId) {
              return {
                ...element,
                visible: isVisible
              };
            }
            
            // If this is a group, update all descendant layers
            if (isGroup) {
              // Check if this element is a descendant of the group by checking parent chain
              let currentParent = element.parent;
              while (currentParent) {
                if (currentParent === layerId) {
                  return {
                    ...element,
                    visible: isVisible // Set same visibility as parent group
                  };
                }
                // Find the parent element to continue up the chain
                const parentElement = generatedLayout.elements.find(e => e.id === currentParent);
                currentParent = parentElement?.parent;
              }
            }
            
            return element;
          })
        };
        setGeneratedLayout(updatedLayout);
      }
    };

    const handleLayerReorder = (event: CustomEvent) => {
      const { updatedLayers } = event.detail;
      
      // Update the layout with new layer order
      if (generatedLayout && selectedLayout) {
        const newLayout = generateLayout(updatedLayers, selectedLayout);
        if (newLayout) {
          setGeneratedLayout(newLayout);
        }
      }
    };

    // Add event listeners
    window.addEventListener('psd_layer_visibility_change', handleVisibilityChange as EventListener);
    window.addEventListener('psd_layer_reorder', handleLayerReorder as EventListener);

    return () => {
      // Remove event listeners on cleanup
      window.removeEventListener('psd_layer_visibility_change', handleVisibilityChange as EventListener);
      window.removeEventListener('psd_layer_reorder', handleLayerReorder as EventListener);
    };
  }, [generatedLayout, selectedLayout]);
  
  // Effect to respond to safezone changes
  useEffect(() => {
    if (generatedLayout && !isGenerating) {
      // Generate a new layout with the updated safezone
      handleSafezoneChange();
    }
  }, [safezoneWidth]);

  // Function to update layout with new safezone
  const handleSafezoneChange = () => {
    if (!psdLayers || !generatedLayout) return;
    
    // Only regenerate if we're not already generating
    if (!isGenerating) {
      const newLayout = generateLayout(psdLayers, generatedLayout.name, safezoneWidth);
      if (newLayout && fabricCanvasRef.current) {
        // Get scale for positioning
        const canvas = fabricCanvasRef.current;
        const containerEl = canvas.getElement().parentElement;
        if (!containerEl) return;
        
        const containerWidth = containerEl.clientWidth || 800;
        const layoutAspectRatio = newLayout.width / newLayout.height;
        const canvasWidth = containerWidth;
        const canvasHeight = containerWidth / layoutAspectRatio;
        
        // Calculate scale
        const scaleX = canvasWidth / newLayout.width;
        const scaleY = canvasHeight / newLayout.height;
        const scale = Math.min(scaleX, scaleY);
        
        // Update positions with the new safezone calculations
        applyLayoutPositions(newLayout, canvas, scale);
        
        // Update state
        setGeneratedLayout(newLayout);
      }
    }
  };
  
  if (!psdLayers) {
    return (
      <div className="p-4 border-dashed border-2 rounded-lg text-center">
        <p className="text-gray-500">Upload a PSD file first</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
            {/* Controls grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Channel selector */}
        <div className="md:col-span-4">
          <Label className="text-sm font-medium mb-2">Channel</Label>
          <Select value={selectedChannel} onValueChange={handleChannelChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((channel) => (
                <SelectItem key={channel.id} value={channel.id}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Layout selection */}
        <div className="md:col-span-4">
          <Label className="text-sm font-medium mb-2">Layout</Label>
          <Select value={selectedLayout || ''} onValueChange={setSelectedLayout}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select layout" />
            </SelectTrigger>
            <SelectContent>
              {filteredLayouts.map((layout) => (
                <SelectItem key={layout.name} value={layout.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-[8px]">
                      {layout.aspectRatio}
                    </div>
                    {layout.name}
                    {sourceRatio === layout.aspectRatio && (
                      <span className="ml-1 text-xs text-muted-foreground">(source)</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons */}
        <div className="md:col-span-4 flex items-end gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={handleResetLayout}
            disabled={!generatedLayout}
            className="flex-1 md:flex-none"
          >
            Reset Layout
          </Button>

          {generatedLayout && (
            <Button 
              variant="outline" 
              onClick={handleResetCurrentLayout}
              className="flex-1 md:flex-none"
            >
              Reset Current Layout
            </Button>
          )}

          {filteredLayouts.length > 0 && selectedLayout && (
            <Button 
              onClick={handleGenerateLayout} 
              disabled={!selectedLayout || isGenerating}
              className="flex-1 md:flex-none"
            >
              {isGenerating ? 'Generating...' : 'AI Generate'}
            </Button>
          )}
        </div>
      </div>
      
      {generatedLayout && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Generated {generatedLayout.name} ({generatedLayout.width}×{generatedLayout.height}) with {generatedLayout.elements.length} elements
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="safezone-width" className="text-sm whitespace-nowrap">
                Safezone (px):
              </Label>
              <input
                id="safezone-width"
                type="number"
                min="0"
                max="100"
                value={safezoneWidth}
                onChange={(e) => {
                  const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                  setSafezoneWidth(value);
                }}
                className="w-20 h-8 px-2 rounded-md border border-input bg-background"
              />
            </div>
            
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
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleSafezoneChange}
              disabled={isGenerating || !generatedLayout}
            >
              Apply Safezone
            </Button>
          </div>
        </div>
      )}
      
      <div className="border rounded-lg overflow-hidden w-full layout-generator-canvas-container bg-white shadow-sm">
        <div className="w-full h-full flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
} 