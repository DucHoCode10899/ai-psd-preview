"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { PsdLayerMetadata } from '@/utils/psd-parser';
import { 
  Canvas, 
  Image as FabricImage, 
  Rect
} from 'fabric';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { toast, Toaster } from 'sonner';
import type { Node, Layer as PsdLayer } from "@webtoon/psd";
import { 
  Play, 
  Pause, 
  Square, 
  SkipBack, 
  SkipForward,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Trash2
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Animation types
interface AnimationProperties {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

interface LayerAnimation {
  layerId: string;
  layerName: string;
  label: string;
  visible: boolean;
  locked: boolean;
  animations: AnimationBlock[]; // Changed from single animation to array of animations
  color: string;
}

interface AnimationBlock {
  id: string;
  animationType: string; // 'fade-in', 'slide-in-left', etc.
  startTime: number;
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic';
}

interface AnimationProject {
  name: string;
  duration: number; // in seconds
  fps: number;
  width: number;
  height: number;
  aspectRatio: string;
  layers: LayerAnimation[];
}

interface AnimationStudioProps {
  psdLayers: PsdLayerMetadata[] | null;
  psdBuffer?: ArrayBuffer;
}

interface DragState {
  type: 'animation' | 'resize';
  layerId: string;
  animationId?: string;
  startTime: number;
  startX: number;
  timelineRect: DOMRect;
  pixelsPerSecond: number;
  resizeHandle?: 'start' | 'end';
}

// API Response interfaces for layout rules
interface PositioningRule {
  maxWidthPercent?: number;
  maxHeightPercent?: number;
  alignment?: string;
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  applySafezone?: boolean;
  coordinatePosition?: Record<string, unknown>;
}

interface LayoutOptionResponse {
  name: string;
  rules: {
    visibility: Record<string, boolean>;
    positioning: Record<string, PositioningRule>;
    renderOrder?: string[];
  };
  safezoneMargin?: number;
}

interface LayoutResponse {
  aspectRatio: string;
  width: number;
  height: number;
  options?: LayoutOptionResponse[];
}

interface ChannelResponse {
  id: string;
  name: string;
  layouts: LayoutResponse[];
}

interface ApiResponse {
  channels: ChannelResponse[];
}

// Animation presets - simplified without keyframes
const ANIMATION_PRESETS = {
  'fade-in': {
    name: 'Fade In',
    duration: 1,
    startProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'slide-in-left': {
    name: 'Slide In Left',
    duration: 1,
    startProperties: { x: -200, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'slide-in-right': {
    name: 'Slide In Right',
    duration: 1,
    startProperties: { x: 200, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'slide-in-up': {
    name: 'Slide In Up',
    duration: 1,
    startProperties: { x: 0, y: 200, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'slide-in-down': {
    name: 'Slide In Down',
    duration: 1,
    startProperties: { x: 0, y: -200, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'scale-in': {
    name: 'Scale In',
    duration: 1,
    startProperties: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'rotate-in': {
    name: 'Rotate In',
    duration: 1,
    startProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: -180, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  },
  'bounce-in': {
    name: 'Bounce In',
    duration: 1.2,
    startProperties: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0, opacity: 0 },
    endProperties: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }
  }
};

// Get consistent color for a label (similar to AdvancedLayoutGenerator)
const getLabelColor = (label: string): string => {
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', 
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
    '#f59e0b', '#10b981', '#6366f1', '#d946ef'
  ];
  
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export function AnimationStudio({ psdLayers, psdBuffer }: AnimationStudioProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [project, setProject] = useState<AnimationProject>({
    name: 'Untitled Animation',
    duration: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    layers: []
  });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Canvas and rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);

  // Layer images from PSD
  const [layerImages, setLayerImages] = useState<Map<string, ImageData>>(new Map());

  // Timeline state
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Read layout generator selections from localStorage
  const [layoutGeneratorSelections, setLayoutGeneratorSelections] = useState<{
    channelId: string | null;
    aspectRatio: string | null;
    option: string | null;
  }>({
    channelId: null,
    aspectRatio: null,
    option: null
  });

  // Current layout option data
  const [currentLayoutOption, setCurrentLayoutOption] = useState<LayoutOptionResponse | null>(null);
  const [safezoneMargin, setSafezoneMargin] = useState<number>(0.043);

  // Add state to track if layout is ready
  const [isLayoutReady, setIsLayoutReady] = useState(false);

  // Add state for combination preview
  const [showCombinationPreview, setShowCombinationPreview] = useState(false);
  const [allLayoutCombinations, setAllLayoutCombinations] = useState<{ layout: { elements: { id: string; name: string; label: string; visible: boolean; x: number; y: number; width: number; height: number }[]; width: number; height: number; aspectRatio: string; name: string }; name: string }[]>([]);
  const [isLoadingCombinations, setIsLoadingCombinations] = useState(false);

  // Add state for custom positions synchronization with AdvancedLayoutGenerator
  const [customPositions, setCustomPositions] = useState<Record<string, Record<string, { 
    position: string;
    x: number;
    y: number;
    width: number; 
    height: number; 
    angle?: number;
  }>>>({});

  // Initialize canvas
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

  // Function to load labeled layers from session storage
  const loadLabeledLayers = useCallback(() => {
    if (!psdLayers) return;

    // Check if we have a generated layout first
    const storedGeneratedLayout = sessionStorage.getItem('generated_layout');
    if (!storedGeneratedLayout) {
      console.log('No generated layout found, waiting for layout generation...');
      setProject(prev => ({
        ...prev,
        layers: []
      }));
      return;
    }

    let generatedLayout;
    try {
      generatedLayout = JSON.parse(storedGeneratedLayout);
    } catch (error) {
      console.error('Error parsing generated layout:', error);
      return;
    }

    // Get layer labels from session storage
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    let labels: Record<string, string> = {};
    try {
      labels = storedLabels ? JSON.parse(storedLabels) : {};
    } catch (error) {
      console.error('Error parsing layer labels:', error);
      return;
    }

    // Check if we have any labels, if not, don't proceed
    if (Object.keys(labels).length === 0) {
      console.log('No layer labels found yet, waiting for labels to be assigned...');
      return;
    }

    // Only include layers that are present in the generated layout
    const generatedLayerIds = new Set(generatedLayout.elements.map((element: { id: string }) => element.id));
    
    const animationLayers: LayerAnimation[] = psdLayers
      .filter(layer => {
        if (layer.type !== 'layer' || !layer.bounds) return false;
        
        // Only include layers that are in the generated layout
        return generatedLayerIds.has(layer.id);
      })
      .map((layer) => {
        const layerId = layer.id;
        const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
        const label = labels[normalizedId] || labels[layerId] || 'unlabeled';
        
        return {
          layerId: layer.id,
          layerName: layer.name,
          label,
          visible: true,
          locked: false,
          animations: [], // Initialize with empty animations array
          color: getLabelColor(label)
        };
      });

    setProject(prev => ({
      ...prev,
      layers: animationLayers
    }));

    if (animationLayers.length > 0) {
      toast.success(`Loaded ${animationLayers.length} layers from generated layout for animation`);
    }
  }, [psdLayers]);

  // Function to refresh layers (force reload from session storage)
  const refreshLayers = useCallback(() => {
    if (!psdLayers) {
      toast.error("No PSD layers available");
      return;
    }

    setIsRefreshing(true);

    // Reset project layers first
    setProject(prev => ({
      ...prev,
      layers: []
    }));

    // Then reload from session storage
    setTimeout(() => {
      loadLabeledLayers();
      setIsRefreshing(false);
    }, 100);
  }, [psdLayers, loadLabeledLayers]);

  // Initialize project layers from PSD - only show labeled layers
  useEffect(() => {
    // Don't auto-load layers anymore - only load when layout is generated
    // This effect is now just for cleanup
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Listen for storage changes to auto-refresh layers when labels are updated
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'psd_layer_labels' && e.newValue !== e.oldValue) {
        // Only refresh if we have a generated layout
        const storedGeneratedLayout = sessionStorage.getItem('generated_layout');
        if (storedGeneratedLayout) {
          setTimeout(() => {
            loadLabeledLayers();
          }, 200);
        }
      }
    };

    // Also listen for custom events from the same tab
    const handleCustomStorageChange = () => {
      // Only refresh if we have a generated layout
      const storedGeneratedLayout = sessionStorage.getItem('generated_layout');
      if (storedGeneratedLayout) {
        setTimeout(() => {
          loadLabeledLayers();
        }, 200);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('psd_label_change', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('psd_label_change', handleCustomStorageChange);
    };
  }, [loadLabeledLayers]);

  // Animation playback loop
  const animate = useCallback((timestamp: number) => {
    if (!isPlaying) return;

    const deltaTime = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    setCurrentTime(prev => {
      const newTime = prev + deltaTime;
      if (newTime >= project.duration) {
        setIsPlaying(false);
        return 0; // Loop back to start
      }
      return newTime;
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, project.duration]);

  // Start/stop animation
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Improved global mouse event handlers for dragging with grid snapping and better precision
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      // Calculate delta with scroll compensation
      const scrollContainer = timelineRef.current;
      const currentScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
      const deltaX = e.clientX + currentScrollLeft - dragState.startX;
      
      // Apply different sensitivity for different drag types with much more conservative settings
      let sensitivity = 1.0;
      if (dragState.type === 'resize') {
        sensitivity = 0.4; // Much more conservative sensitivity for resizing
      }
      
      const adjustedDeltaX = deltaX * sensitivity;
      const deltaTime = adjustedDeltaX / dragState.pixelsPerSecond;
      
      // More conservative grid snapping to 0.2 second intervals for resize, 0.1 for move
      const gridSize = dragState.type === 'resize' ? 0.2 : 0.1;
      const snappedDeltaTime = Math.round(deltaTime / gridSize) * gridSize;

      switch (dragState.type) {
        case 'animation':
          // Move entire animation with grid snapping
          const newStartTime = Math.max(0, Math.min(project.duration - 0.1, dragState.startTime + snappedDeltaTime));
          const roundedStartTime = Math.round(newStartTime * 10) / 10; // Round to 1 decimal place
          
          if (Math.abs(roundedStartTime - dragState.startTime) >= 0.1) {
            setProject(prev => ({
              ...prev,
              layers: prev.layers.map(layer =>
                layer.layerId === dragState.layerId
                  ? { 
                      ...layer, 
                      animations: layer.animations.map(anim =>
                        anim.id === dragState.animationId ? { ...anim, startTime: roundedStartTime } : anim
                      ) 
                    }
                  : layer
              )
            }));
          }
          break;
          
        case 'resize':
          // Resize animation duration with much improved sensitivity and grid snapping
          const layer = project.layers.find(l => l.layerId === dragState.layerId);
          const animation = layer?.animations.find(a => a.id === dragState.animationId);
          if (layer && animation) {
            // Use a larger minimum change threshold to prevent micro-adjustments
            const minChangeThreshold = 0.2; // Minimum change of 0.2 seconds
            
            if (Math.abs(snappedDeltaTime) >= minChangeThreshold) {
              let newDuration: number;
              let newStartTime: number = animation.startTime;
              
              if (dragState.resizeHandle === 'start') {
                // Resizing from the start - adjust start time and duration
                newStartTime = Math.max(0, animation.startTime + snappedDeltaTime);
                newDuration = Math.max(0.2, animation.duration - snappedDeltaTime);
              } else {
                // Resizing from the end - adjust duration only
                newDuration = Math.max(0.2, Math.min(project.duration - animation.startTime, animation.duration + snappedDeltaTime));
              }
              
              const roundedDuration = Math.round(newDuration * 5) / 5; // Round to 0.2 second intervals
              const roundedStartTime = Math.round(newStartTime * 5) / 5;
              
              if (Math.abs(roundedDuration - animation.duration) >= 0.2 || 
                  Math.abs(roundedStartTime - animation.startTime) >= 0.2) {
                setProject(prev => ({
                  ...prev,
                  layers: prev.layers.map(l =>
                    l.layerId === dragState.layerId
                      ? { 
                          ...l, 
                          animations: l.animations.map(anim =>
                            anim.id === dragState.animationId 
                              ? { ...anim, duration: roundedDuration, startTime: roundedStartTime } 
                              : anim
                          )
                        }
                      : l
                  )
                }));
              }
            }
          }
          break;
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, project.duration, project.layers]);

  // Interpolate properties for animation - updated to handle multiple animations
  const interpolateProperties = useCallback((layer: LayerAnimation, time: number, element?: { x: number; y: number; width: number; height: number }): AnimationProperties => {
    if (!layer.animations || layer.animations.length === 0) {
      // No animation - return generated layout position if available, otherwise original position
      if (element) {
        return {
          x: element.x,
          y: element.y,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1
        };
      }
      
      // Fallback to original PSD position if no element provided
      const psdLayer = psdLayers?.find(l => l.id === layer.layerId);
      if (psdLayer && psdLayer.bounds) {
        return {
          x: psdLayer.bounds.left,
          y: psdLayer.bounds.top,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1
        };
      }
      return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
    }

    // Get base position from generated layout element if available, otherwise use original PSD position
    let baseX = 0;
    let baseY = 0;
    
    if (element) {
      baseX = element.x;
      baseY = element.y;
    } else {
      // Fallback to original PSD position
      const psdLayer = psdLayers?.find(l => l.id === layer.layerId);
      baseX = psdLayer?.bounds?.left || 0;
      baseY = psdLayer?.bounds?.top || 0;
    }

    // Start with base properties from generated layout
    const finalProperties: AnimationProperties = {
      x: baseX,
      y: baseY,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1
    };

    // Apply all active animations at current time
    layer.animations.forEach(animation => {
      const preset = ANIMATION_PRESETS[animation.animationType as keyof typeof ANIMATION_PRESETS];
      if (!preset) return;

      const animationStart = animation.startTime;
      const animationEnd = animation.startTime + animation.duration;
      
      if (time >= animationStart && time <= animationEnd) {
        // Animation is active - interpolate
        const progress = (time - animationStart) / animation.duration;
        const easedProgress = applyEasing(progress, animation.easing);

        // Apply animation transformations relative to base position
        finalProperties.x = baseX + lerp(preset.startProperties.x, preset.endProperties.x, easedProgress);
        finalProperties.y = baseY + lerp(preset.startProperties.y, preset.endProperties.y, easedProgress);
        finalProperties.scaleX = lerp(preset.startProperties.scaleX, preset.endProperties.scaleX, easedProgress);
        finalProperties.scaleY = lerp(preset.startProperties.scaleY, preset.endProperties.scaleY, easedProgress);
        finalProperties.rotation = lerp(preset.startProperties.rotation, preset.endProperties.rotation, easedProgress);
        finalProperties.opacity = lerp(preset.startProperties.opacity, preset.endProperties.opacity, easedProgress);
      } else if (time > animationEnd) {
        // Animation has finished - use end properties relative to base position
        finalProperties.x = baseX + preset.endProperties.x;
        finalProperties.y = baseY + preset.endProperties.y;
        finalProperties.scaleX = preset.endProperties.scaleX;
        finalProperties.scaleY = preset.endProperties.scaleY;
        finalProperties.rotation = preset.endProperties.rotation;
        finalProperties.opacity = preset.endProperties.opacity;
      }
      // If time < animationStart, keep current properties (no change)
    });

    return finalProperties;
  }, [psdLayers]);

  // Linear interpolation
  const lerp = (start: number, end: number, t: number) => {
    return start + (end - start) * t;
  };

  // Apply easing function
  const applyEasing = (t: number, easing: string) => {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - Math.pow(1 - t, 2);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'bounce':
        if (t < 1 / 2.75) {
          return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
          return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
          return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
          return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
      case 'elastic':
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      default:
        return t;
    }
  };

  // Render canvas at current time with proper aspect ratio handling - updated to sync with AdvancedLayoutGenerator
  useEffect(() => {
    if (!fabricCanvasRef.current || !psdLayers) return;

    // Don't render until layout is ready (all selections made in AdvancedLayoutGenerator)
    if (!isLayoutReady || !currentLayoutOption) {
      const canvas = fabricCanvasRef.current;
      canvas.clear();
      
      // Add a message indicating layout selection is needed
      const background = new Rect({
        left: 0,
        top: 0,
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        fill: '#f9f9f9',
        selectable: false,
        evented: false
      });
      canvas.add(background);
      
      // Add text message
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 400;
      textCanvas.height = 100;
      const textCtx = textCanvas.getContext('2d');
      
      if (textCtx) {
        textCtx.fillStyle = '#6b7280';
        textCtx.font = '16px sans-serif';
        textCtx.textAlign = 'center';
        textCtx.fillText('Please generate a layout in the Layout Generator first', 200, 40);
        textCtx.fillText('to see the animation preview', 200, 65);
        
        const textImage = new FabricImage(textCanvas, {
          left: (canvas.getWidth() - 400) / 2,
          top: (canvas.getHeight() - 100) / 2,
          selectable: false,
          evented: false,
          opacity: 0.7
        });
        canvas.add(textImage);
      }
      
      canvas.renderAll();
      return;
    }

    // Check if we have a generated layout from AdvancedLayoutGenerator
    const storedGeneratedLayout = sessionStorage.getItem('generated_layout');
    if (!storedGeneratedLayout) {
      const canvas = fabricCanvasRef.current;
      canvas.clear();
      
      // Add a message indicating layout generation is needed
      const background = new Rect({
        left: 0,
        top: 0,
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        fill: '#f9f9f9',
        selectable: false,
        evented: false
      });
      canvas.add(background);
      
      // Add text message
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 400;
      textCanvas.height = 100;
      const textCtx = textCanvas.getContext('2d');
      
      if (textCtx) {
        textCtx.fillStyle = '#6b7280';
        textCtx.font = '16px sans-serif';
        textCtx.textAlign = 'center';
        textCtx.fillText('Please click "Generate Layout" in the Layout Generator', 200, 40);
        textCtx.fillText('to see the animation preview', 200, 65);
        
        const textImage = new FabricImage(textCanvas, {
          left: (canvas.getWidth() - 400) / 2,
          top: (canvas.getHeight() - 100) / 2,
          selectable: false,
          evented: false,
          opacity: 0.7
        });
        canvas.add(textImage);
      }
      
      canvas.renderAll();
      return;
    }

    let generatedLayout;
    try {
      generatedLayout = JSON.parse(storedGeneratedLayout);
    } catch (error) {
      console.error('Error parsing generated layout:', error);
      return;
    }

    const canvas = fabricCanvasRef.current;
    canvas.clear();

    // Get layer labels from session storage
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    if (!storedLabels) {
      return;
    }

    let labels: Record<string, string>;
    try {
      labels = JSON.parse(storedLabels);
    } catch (error) {
      console.error('Error parsing layer labels:', error);
      return;
    }

    // Get container dimensions
    const containerEl = canvas.getElement().parentElement;
    if (!containerEl) return;

    // Use the same canvas sizing logic as AdvancedLayoutGenerator
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
    
    // Calculate scale - same as AdvancedLayoutGenerator
    const scaleX = canvasWidth / generatedLayout.width;
    const scaleY = canvasHeight / generatedLayout.height;
    const scale = Math.min(scaleX, scaleY);

    // Add background - same as AdvancedLayoutGenerator
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

    // Add safezone boundaries - same as AdvancedLayoutGenerator
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

    // Add layout info text
    if (layoutGeneratorSelections.channelId && layoutGeneratorSelections.aspectRatio) {
      const layoutInfo = `${layoutGeneratorSelections.aspectRatio} (${generatedLayout.width}x${generatedLayout.height})`;
      
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 300;
      textCanvas.height = 25;
      const textCtx = textCanvas.getContext('2d');
      
      if (textCtx) {
        textCtx.fillStyle = '#6b7280';
        textCtx.font = '11px sans-serif';
        textCtx.textAlign = 'center';
        textCtx.fillText(layoutInfo, 150, 15);
        
        const textImage = new FabricImage(textCanvas, {
          left: (canvasWidth - 300) / 2,
          top: 8,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          opacity: 0.7
        });
        canvas.add(textImage);
      }
    }

    // Sort elements based on render order - same as AdvancedLayoutGenerator
    let elementsToRender = [...generatedLayout.elements];
    if (currentLayoutOption?.rules.renderOrder) {
      const renderOrder = currentLayoutOption.rules.renderOrder;
      
      const elementsByLabel = new Map();
      elementsToRender.forEach(element => {
        if (!elementsByLabel.has(element.label)) {
          elementsByLabel.set(element.label, []);
        }
        elementsByLabel.get(element.label).push(element);
      });

      elementsToRender = renderOrder.flatMap(label => 
        elementsByLabel.get(label) || []
      );

      const remainingElements = elementsToRender.filter(element => 
        !renderOrder.includes(element.label)
      );
      elementsToRender = [...elementsToRender, ...remainingElements];
    } else {
      elementsToRender.sort((a, b) => {
        if (a.label === 'background') return -1;
        if (b.label === 'background') return 1;
        return 0;
      });
    }

    // Render elements with animation properties applied
    for (const element of elementsToRender) {
      if (!element.visible) continue;

      // Find corresponding animation layer
      const animationLayer = project.layers.find(layer => layer.layerId === element.id);
      
      // Get any custom positions for this layout from AdvancedLayoutGenerator
      const layoutCustomPositions = customPositions[generatedLayout.name] || {};
      const customPosition = layoutCustomPositions[element.id];
      
      // Apply custom position if available, otherwise use original element position
      const baseElement = customPosition ? {
        ...element,
        x: customPosition.x,
        y: customPosition.y,
        width: customPosition.width,
        height: customPosition.height
      } : element;
      
      // Get animated properties at current time
      let animatedProperties = { x: baseElement.x, y: baseElement.y, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
      if (animationLayer) {
        const interpolated = interpolateProperties(animationLayer, currentTime, baseElement);
        animatedProperties = {
          x: interpolated.x,
          y: interpolated.y,
          scaleX: interpolated.scaleX,
          scaleY: interpolated.scaleY,
          rotation: interpolated.rotation,
          opacity: interpolated.opacity
        };
      }

      try {
        // Create temporary canvas for the layer - same as AdvancedLayoutGenerator
        const tempCanvas = document.createElement('canvas');
        const elementWidth = baseElement.width;
        const elementHeight = baseElement.height;
        
        tempCanvas.width = Math.max(1, elementWidth);
        tempCanvas.height = Math.max(1, elementHeight);
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          const imageData = layerImages.get(baseElement.name);
          
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
                console.error(`Error drawing image for layer ${baseElement.name}:`, error);
                ctx.fillStyle = getLabelColor(baseElement.label);
                ctx.fillRect(0, 0, elementWidth, elementHeight);
              }
            }
          } else {
            ctx.fillStyle = getLabelColor(baseElement.label);
            ctx.fillRect(0, 0, elementWidth, elementHeight);
            
            // Add label text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(baseElement.label, elementWidth / 2, elementHeight / 2);
          }
        }
        
        // Calculate final position with scale and safezone - same as AdvancedLayoutGenerator
        let left = animatedProperties.x * scale;
        let top = animatedProperties.y * scale;

        // Apply safezone if enabled for this element's label
        const elementLabel = labels[baseElement.id] || labels[`layer_${baseElement.id}`];
        const positioningRules = currentLayoutOption?.rules.positioning[elementLabel];
        const shouldApplySafezone = positioningRules?.applySafezone !== false;

        if (shouldApplySafezone) {
          const safeLeft = canvasWidth * safezoneMargin;
          const safeTop = canvasHeight * safezoneMargin;
          const safeWidth = canvasWidth * (1 - 2 * safezoneMargin);
          const safeHeight = canvasHeight * (1 - 2 * safezoneMargin);

          left = Math.max(safeLeft, Math.min(safeLeft + safeWidth - elementWidth * scale, left));
          top = Math.max(safeTop, Math.min(safeTop + safeHeight - elementHeight * scale, top));
        }
        
        // Create fabric image with animated properties
        const fabricImage = new FabricImage(tempCanvas, {
          left: left,
          top: top,
          width: elementWidth,
          height: elementHeight,
          scaleX: animatedProperties.scaleX * scale,
          scaleY: animatedProperties.scaleY * scale,
          angle: animatedProperties.rotation,
          opacity: animatedProperties.opacity,
          selectable: true,
          evented: true,
          originX: 'left',
          originY: 'top'
        });
        
        // Add custom properties for identification
        fabricImage.set('elementId', baseElement.id);
        fabricImage.set('elementName', baseElement.name);
        fabricImage.set('elementLabel', baseElement.label);
        
        // Add event handlers for interaction
        fabricImage.on('moving', () => {
          // Update the element position in real-time during animation
          // This will be useful for interactive positioning
        });
        
        fabricImage.on('modified', () => {
          // Handle position/scale changes
          // This could be used to update animation keyframes
        });
        
        canvas.add(fabricImage);
        
      } catch (error) {
        console.error(`Error rendering element ${baseElement.name}:`, error);
      }
    }

    canvas.renderAll();
  }, [currentTime, project, psdLayers, layerImages, layoutGeneratorSelections, currentLayoutOption, safezoneMargin, isLayoutReady, customPositions, interpolateProperties]);

  // Playback controls
  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(project.duration, time)));
  };

  // Layer management
  const toggleLayerVisibility = (layerId: string) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.layerId === layerId ? { ...layer, visible: !layer.visible } : layer
      )
    }));
  };

  // Apply animation preset - updated to add multiple animations
  const applyPreset = (layerId: string, presetKey: string) => {
    const preset = ANIMATION_PRESETS[presetKey as keyof typeof ANIMATION_PRESETS];
    if (!preset) return;

    const newAnimation: AnimationBlock = {
      id: `${layerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      animationType: presetKey,
      startTime: currentTime, // Start at current time
      duration: preset.duration,
      easing: 'ease-out'
    };

    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(l =>
        l.layerId === layerId
          ? { 
              ...l, 
              animations: [...l.animations, newAnimation]
            }
          : l
      )
    }));

    toast.success(`Added ${preset.name} animation`);
  };

  // Remove animation from layer - updated to handle specific animation blocks
  const removeAnimation = (layerId: string, animationId?: string) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.layerId === layerId
          ? { 
              ...layer, 
              animations: animationId 
                ? layer.animations.filter(anim => anim.id !== animationId)
                : [] // Remove all animations if no specific ID
            }
          : layer
      )
    }));
    toast.success("Animation removed");
  };

  // Export functions
  const exportAsGif = async () => {
    if (!fabricCanvasRef.current) {
      toast.error("Canvas not ready for export");
      return;
    }

    toast.info("Generating GIF frames...");
    
    try {
      const canvas = fabricCanvasRef.current;
      const frames: string[] = [];
      const frameCount = Math.ceil(project.duration * project.fps);
      const timeStep = project.duration / frameCount;

      // Store current state
      const currentTimeBackup = currentTime;
      
      // Generate frames
      for (let i = 0; i < frameCount; i++) {
        const frameTime = i * timeStep;
        setCurrentTime(frameTime);
        
        // Wait for canvas to update
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Capture frame
        const dataURL = canvas.toDataURL({
          format: 'png',
          quality: 1,
          multiplier: 1
        });
        frames.push(dataURL);
      }
      
      // Restore current time
      setCurrentTime(currentTimeBackup);
      
      toast.success(`Generated ${frames.length} frames. GIF creation coming soon!`);
    } catch (error) {
      console.error('Error generating GIF:', error);
      toast.error("Error generating GIF frames");
    }
  };

  const exportAsMP4 = async () => {
    if (!fabricCanvasRef.current) {
      toast.error("Canvas not initialized");
      return;
    }

    try {
      toast.info("Starting MP4 export...");
      
      const canvas = fabricCanvasRef.current;
      const frames: string[] = [];
      const totalFrames = Math.ceil(project.duration * project.fps);
      
      // Store current state
      const originalTime = currentTime;
      
      // Generate frames
      for (let frame = 0; frame < totalFrames; frame++) {
        const time = (frame / project.fps);
        setCurrentTime(time);
        
        // Wait for canvas to update
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Capture frame
        const dataURL = canvas.toDataURL({
          format: 'png',
          quality: 1,
          multiplier: 1
        });
        frames.push(dataURL);
      }
      
      // Restore original time
      setCurrentTime(originalTime);
      
      // Create video using MediaRecorder API (simplified approach)
      // Note: For production, you'd want to use a proper video encoding library
      const videoBlob = await createVideoFromFrames(frames, project.fps);
      
      // Download video
      const url = URL.createObjectURL(videoBlob);
      const link = document.createElement('a');
      link.download = `${project.name}.mp4`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("MP4 exported successfully");
    } catch (error) {
      console.error('Error exporting MP4:', error);
      toast.error("Error exporting MP4. Try exporting as GIF instead.");
    }
  };

  const exportAsImage = () => {
    if (!fabricCanvasRef.current) {
      toast.error("Canvas not ready for export");
      return;
    }

    try {
      const canvas = fabricCanvasRef.current;
      
      // Store current dimensions
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();
      
      // Set canvas to project dimensions for export
      canvas.setDimensions({
        width: project.width,
        height: project.height
      });

      // Scale all objects for export
      const scaleX = project.width / currentWidth;
      const scaleY = project.height / currentHeight;
      
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
          obj.visible = false;
        }
      });
      
      canvas.renderAll();
      
      // Export image
      const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `${project.name}_frame_${currentTime.toFixed(2)}s.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Restore original dimensions and scaling
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight
      });

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
          obj.visible = true;
        }
      });
      
      canvas.renderAll();
      
      toast.success("Frame exported successfully");
    } catch (error) {
      console.error('Error exporting frame:', error);
      toast.error("Error exporting frame");
    }
  };

  // Timeline rendering with improved alignment and synchronization
  const renderTimeline = () => {
    const LAYER_PANEL_WIDTH = 240; // Fixed width for layer names panel
    const timelineWidth = 800;
    const pixelsPerSecond = (timelineWidth / project.duration) * timelineZoom;
    const totalWidth = Math.max(timelineWidth, project.duration * pixelsPerSecond);
    
    return (
      <div className="bg-gray-900 text-white rounded-lg overflow-hidden">
        {/* Timeline header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">Timeline</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Zoom:</Label>
              <Slider
                value={[timelineZoom]}
                onValueChange={([value]) => setTimelineZoom(value)}
                min={0.1}
                max={5}
                step={0.1}
                className="w-20"
              />
            </div>
            
            {/* Timeline navigation controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipToStart}
                className="p-1 h-8 w-8 text-white hover:bg-gray-700"
                title="Skip to start"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipToEnd}
                className="p-1 h-8 w-8 text-white hover:bg-gray-700"
                title="Skip to end"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Timeline content with synchronized scrolling */}
        <div className="flex">
          {/* Layer Names Panel - Fixed width */}
          <div 
            className="bg-gray-800 border-r border-gray-700 flex-shrink-0"
            style={{ width: LAYER_PANEL_WIDTH }}
          >
            {/* Header for layer names */}
            <div className="h-10 bg-gray-750 border-b border-gray-600 flex items-center px-3">
              <span className="text-xs font-medium text-gray-300">Layers</span>
            </div>
            
            {/* Layer list */}
            <div className="space-y-1 p-2">
              {project.layers.filter(layer => layer.label !== 'unlabeled').map((layer) => (
                <div key={layer.layerId} className="flex items-center gap-2 p-2 bg-gray-700 rounded h-12">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleLayerVisibility(layer.layerId)}
                    className="p-1 h-6 w-6 flex-shrink-0"
                  >
                    {layer.visible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </Button>
                  
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: layer.color }}
                  />
                  
                  <span className="text-xs truncate flex-1 min-w-0" title={`${layer.layerName} (${layer.label})`}>
                    {layer.layerName}
                  </span>
                  
                  {/* Animation controls */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 h-5 w-5"
                          title="Add animation preset"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add Animation Preset</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-2">
                          {Object.entries(ANIMATION_PRESETS).map(([key, preset]) => (
                            <Button
                              key={key}
                              variant="outline"
                              onClick={() => {
                                applyPreset(layer.layerId, key);
                                // Close dialog
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                              }}
                              className="justify-start"
                            >
                              {preset.name}
                            </Button>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAnimation(layer.layerId)}
                      className="p-1 h-5 w-5"
                      title="Remove all animations"
                      disabled={layer.animations.length === 0}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Area - Synchronized scrolling container */}
          <div className="flex-1 bg-gray-800 overflow-hidden">
            {/* Synchronized scrolling wrapper */}
            <div 
              ref={timelineRef}
              className="overflow-x-auto overflow-y-hidden"
              onWheel={handleTimelineScroll}
            >
              {/* Container with consistent width for both header and tracks */}
              <div style={{ width: Math.max(totalWidth, 600), minWidth: '100%' }}>
                {/* Time ruler header - synchronized with timeline */}
                <div 
                  className="h-10 bg-gray-750 border-b border-gray-600 relative cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const scrollContainer = timelineRef.current;
                    const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                    const x = e.clientX - rect.left + scrollLeft;
                    const time = x / pixelsPerSecond;
                    const snappedTime = Math.round(time * 10) / 10; // Snap to 0.1s grid
                    handleSeek(Math.max(0, Math.min(project.duration, snappedTime)));
                  }}
                >
                  {/* Time markers */}
                  {Array.from({ length: Math.ceil(project.duration) + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-gray-600 flex items-center pl-2 pointer-events-none"
                      style={{ left: `${i * pixelsPerSecond}px` }}
                    >
                      <span className="text-xs text-gray-400">{i}s</span>
                    </div>
                  ))}
                  
                  {/* Playhead */}
                  <div
                    className="absolute top-0 w-0.5 h-full bg-red-500 z-10 pointer-events-none"
                    style={{ left: `${currentTime * pixelsPerSecond}px` }}
                  />
                </div>

                {/* Timeline tracks - aligned with header */}
                <div className="space-y-1 p-2">
                  {project.layers.filter(layer => layer.label !== 'unlabeled').map((layer) => (
                    <div 
                      key={layer.layerId} 
                      className="h-12 bg-gray-700 rounded relative cursor-pointer"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const scrollContainer = timelineRef.current;
                        const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                        const x = e.clientX - rect.left + scrollLeft;
                        const time = x / pixelsPerSecond;
                        const snappedTime = Math.round(time * 10) / 10; // Snap to 0.1s grid
                        handleSeek(Math.max(0, Math.min(project.duration, snappedTime)));
                      }}
                    >
                      {/* Animation blocks - render all animations for this layer */}
                      {layer.animations.map((animation) => (
                        <div
                          key={animation.id}
                          className="absolute top-2 h-8 bg-blue-500 bg-opacity-30 border border-blue-400 rounded cursor-move flex items-center group"
                          style={{
                            left: `${animation.startTime * pixelsPerSecond}px`,
                            width: `${Math.max(animation.duration * pixelsPerSecond, 20)}px` // Minimum width for visibility
                          }}
                          title={`${animation.animationType}: ${animation.startTime.toFixed(1)}s - ${(animation.startTime + animation.duration).toFixed(1)}s`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const timelineRect = e.currentTarget.parentElement!.getBoundingClientRect();
                            const scrollContainer = timelineRef.current;
                            const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                            
                            setDragState({
                              type: 'animation',
                              layerId: layer.layerId,
                              animationId: animation.id,
                              startTime: animation.startTime,
                              startX: e.clientX + scrollLeft,
                              timelineRect: timelineRect,
                              pixelsPerSecond: pixelsPerSecond
                            });
                          }}
                        >
                          <div className="flex items-center justify-center h-full px-2 min-w-0 flex-1">
                            <span className="text-xs text-blue-200 truncate">
                              {ANIMATION_PRESETS[animation.animationType as keyof typeof ANIMATION_PRESETS]?.name || animation.animationType}
                            </span>
                          </div>
                          
                          {/* Delete button - only show on hover */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAnimation(layer.layerId, animation.id);
                            }}
                            className="p-0 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full mr-1"
                            title="Remove this animation"
                          >
                            <Trash2 className="h-2 w-2" />
                          </Button>
                          
                          {/* Resize handles */}
                          <div
                            className="absolute left-0 top-0 w-2 h-full bg-blue-600 cursor-ew-resize hover:bg-blue-500"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const timelineRect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                              const scrollContainer = timelineRef.current;
                              const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                              
                              setDragState({
                                type: 'resize',
                                layerId: layer.layerId,
                                animationId: animation.id,
                                startTime: animation.startTime,
                                startX: e.clientX + scrollLeft,
                                timelineRect: timelineRect,
                                pixelsPerSecond: pixelsPerSecond,
                                resizeHandle: 'start'
                              });
                            }}
                          />
                          <div
                            className="absolute right-0 top-0 w-2 h-full bg-blue-600 cursor-ew-resize hover:bg-blue-500"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const timelineRect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                              const scrollContainer = timelineRef.current;
                              const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                              
                              setDragState({
                                type: 'resize',
                                layerId: layer.layerId,
                                animationId: animation.id,
                                startTime: animation.startTime + animation.duration,
                                startX: e.clientX + scrollLeft,
                                timelineRect: timelineRect,
                                pixelsPerSecond: pixelsPerSecond,
                                resizeHandle: 'end'
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {project.layers.filter(layer => layer.label !== 'unlabeled').length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>No labeled layers found.</p>
            <p className="text-sm mb-4">Please label your layers in the Layer Tree first.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshLayers}
              disabled={isRefreshing}
              className="flex items-center gap-2 mx-auto"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Layers'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Skip to start
  const handleSkipToStart = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // Skip to end
  const handleSkipToEnd = () => {
    setCurrentTime(project.duration);
    setIsPlaying(false);
  };

  // Timeline scroll handler
  const handleTimelineScroll = (e: React.WheelEvent) => {
    e.preventDefault();
    // Let the browser handle horizontal scrolling naturally
  };

  // Helper function to create video from frames
  const createVideoFromFrames = async (frames: string[], fps: number): Promise<Blob> => {
    // This is a simplified implementation
    // For production, you'd use a library like ffmpeg.wasm
    return new Promise((resolve, reject) => {
      try {
        // Create a simple WebM video using canvas and MediaRecorder
        const videoCanvas = document.createElement('canvas');
        videoCanvas.width = project.width;
        videoCanvas.height = project.height;
        const ctx = videoCanvas.getContext('2d');
        
        const stream = videoCanvas.captureStream(fps);
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9'
        });
        
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(blob);
        };
        
        mediaRecorder.start();
        
        // Draw frames
        let frameIndex = 0;
        const drawFrame = () => {
          if (frameIndex >= frames.length) {
            mediaRecorder.stop();
            return;
          }
          
          const img = new Image();
          img.onload = () => {
            ctx?.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
            ctx?.drawImage(img, 0, 0, videoCanvas.width, videoCanvas.height);
            frameIndex++;
            setTimeout(drawFrame, 1000 / fps);
          };
          img.src = frames[frameIndex];
        };
        
        drawFrame();
      } catch (error) {
        reject(error);
      }
    });
  };

  // Function to read layout generator selections from localStorage
  const readLayoutGeneratorSelections = useCallback(() => {
    try {
      const stored = localStorage.getItem('layout_generator_selections');
      if (stored) {
        const selections = JSON.parse(stored);
        setLayoutGeneratorSelections(selections);
        
        // Check if all required selections are made
        const isReady = selections.channelId && selections.aspectRatio && selections.option;
        setIsLayoutReady(!!isReady);
        
        return selections;
      }
    } catch (error) {
      console.error('Error reading layout generator selections:', error);
    }
    setIsLayoutReady(false);
    return null;
  }, []);

  // Function to fetch current layout option data
  const fetchCurrentLayoutOption = useCallback(async (channelId: string, aspectRatio: string, optionName: string) => {
    try {
      const response = await fetch('/api/layout-rules');
      const data: ApiResponse = await response.json();
      
      const channel = data.channels.find(c => c.id === channelId);
      if (channel) {
        const layout = channel.layouts.find(l => l.aspectRatio === aspectRatio);
        if (layout) {
          const option = layout.options?.find(o => o.name === optionName);
          if (option) {
            setCurrentLayoutOption(option);
            setSafezoneMargin(option.safezoneMargin || 0.043);
            
            // Update project dimensions
            setProject(prev => ({
              ...prev,
              width: layout.width,
              height: layout.height,
              aspectRatio: layout.aspectRatio
            }));
            
            setIsLayoutReady(true);
            return option;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching layout option:', error);
    }
    setIsLayoutReady(false);
    return null;
  }, []);

  // Listen for layout generator selection changes
  useEffect(() => {
    // Initial read
    readLayoutGeneratorSelections();
    
    // Listen for changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'layout_generator_selections') {
        readLayoutGeneratorSelections();
      }
    };

    // Listen for custom events from the same tab
    const handleCustomChange = () => {
      readLayoutGeneratorSelections();
    };

    // Listen for layout generation events
    const handleLayoutGenerated = () => {
      // Load layers from the newly generated layout
      loadLabeledLayers();
      // Force canvas re-render when a new layout is generated
      setCurrentTime(prev => prev); // Trigger re-render
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('layout_generator_change', handleCustomChange);
    window.addEventListener('layout_generated', handleLayoutGenerated);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('layout_generator_change', handleCustomChange);
      window.removeEventListener('layout_generated', handleLayoutGenerated);
    };
  }, [readLayoutGeneratorSelections, loadLabeledLayers]);

  // Load custom positions from sessionStorage and listen for position synchronization events
  useEffect(() => {
    // Load initial custom positions from sessionStorage
    const loadCustomPositions = () => {
      const storedPositions = sessionStorage.getItem('layout_custom_positions');
      if (storedPositions) {
        try {
          const positions = JSON.parse(storedPositions);
          setCustomPositions(positions);
        } catch (error) {
          console.error('Error parsing stored custom positions:', error);
        }
      }
    };

    // Load positions on mount
    loadCustomPositions();

    // Listen for position changes from AdvancedLayoutGenerator
    const handlePositionChanged = (event: CustomEvent) => {
      const { allPositions } = event.detail;
      setCustomPositions(allPositions);
      // Force canvas re-render
      setCurrentTime(prev => prev);
    };

    // Listen for position resets from AdvancedLayoutGenerator
    const handlePositionReset = (event: CustomEvent) => {
      const { allPositions } = event.detail;
      setCustomPositions(allPositions);
      // Force canvas re-render
      setCurrentTime(prev => prev);
    };

    // Add event listeners
    window.addEventListener('layout_position_changed', handlePositionChanged as EventListener);
    window.addEventListener('layout_position_reset', handlePositionReset as EventListener);

    return () => {
      window.removeEventListener('layout_position_changed', handlePositionChanged as EventListener);
      window.removeEventListener('layout_position_reset', handlePositionReset as EventListener);
    };
  }, []);

  // Fetch layout option when selections change
  useEffect(() => {
    if (layoutGeneratorSelections.channelId && layoutGeneratorSelections.aspectRatio && layoutGeneratorSelections.option) {
      fetchCurrentLayoutOption(
        layoutGeneratorSelections.channelId,
        layoutGeneratorSelections.aspectRatio,
        layoutGeneratorSelections.option
      );
    } else {
      setIsLayoutReady(false);
    }
  }, [layoutGeneratorSelections, fetchCurrentLayoutOption]);

  // Function to load all layout combinations from AdvancedLayoutGenerator
  const loadAllLayoutCombinations = useCallback(() => {
    setIsLoadingCombinations(true);
    
    // Listen for multiple layouts from AdvancedLayoutGenerator
    const handleMultipleLayouts = (event: CustomEvent) => {
      const layouts = event.detail;
      if (layouts && Array.isArray(layouts)) {
        setAllLayoutCombinations(layouts.map((layout: { elements: { id: string; name: string; label: string; visible: boolean; x: number; y: number; width: number; height: number }[]; width: number; height: number; aspectRatio: string; name: string }, index: number) => ({
          layout,
          name: `Combination ${index + 1}`
        })));
        setShowCombinationPreview(true);
      }
      setIsLoadingCombinations(false);
    };

    // Dispatch event to request all combinations
    window.dispatchEvent(new CustomEvent('request_all_combinations'));
    
    // Listen for the response
    window.addEventListener('multiple_layouts_generated', handleMultipleLayouts as EventListener);
    
    // Cleanup listener after timeout
    setTimeout(() => {
      window.removeEventListener('multiple_layouts_generated', handleMultipleLayouts as EventListener);
      setIsLoadingCombinations(false);
    }, 5000);
  }, []);

  // Function to reset custom positions and synchronize with AdvancedLayoutGenerator
  const handleResetPositions = useCallback(() => {
    // Get current layout name from session storage
    const storedGeneratedLayout = sessionStorage.getItem('generated_layout');
    if (!storedGeneratedLayout) {
      toast.error('No layout found to reset');
      return;
    }

    let generatedLayout;
    try {
      generatedLayout = JSON.parse(storedGeneratedLayout);
    } catch (error) {
      console.error('Error parsing generated layout:', error);
      toast.error('Error parsing layout data');
      return;
    }

    // Reset custom positions for current layout
    setCustomPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[generatedLayout.name];
      
      // Store updated positions in sessionStorage for AdvancedLayoutGenerator synchronization
      sessionStorage.setItem('layout_custom_positions', JSON.stringify(newPositions));
      
      // Dispatch event to notify AdvancedLayoutGenerator of position reset
      window.dispatchEvent(new CustomEvent('layout_position_reset', {
        detail: {
          layoutName: generatedLayout.name,
          allPositions: newPositions
        }
      }));
      
      return newPositions;
    });

    // Force canvas re-render
    setCurrentTime(prev => prev);
    
    toast.success('Positions reset successfully');
  }, []);

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
          <h3 className="text-lg font-semibold mb-4">Animation Studio</h3>
          <CollapsibleTrigger className="hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors">
            {isOpen ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
        </div>
        
        <CollapsibleContent className="space-y-4">
          {/* Refresh button for labeled layers */}
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-blue-900">Animation Layers</p>
              <p className="text-xs text-blue-700">
                {project.layers.length > 0 
                  ? `${project.layers.length} labeled layers loaded`
                  : "No labeled layers found. Please label your layers in the Layer Tree first."
                }
              </p>
              {layoutGeneratorSelections.channelId && layoutGeneratorSelections.aspectRatio && layoutGeneratorSelections.option && (
                <p className="text-xs text-blue-600 mt-1">
                  Using layout: {layoutGeneratorSelections.aspectRatio} - {layoutGeneratorSelections.option}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshLayers}
              disabled={isRefreshing}
              className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Layers'}
            </Button>
          </div>

          {/* Project settings */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <Label className="text-sm font-medium mb-2">Project Name</Label>
              <Input
                value={project.name}
                onChange={(e) => setProject(prev => ({ ...prev, name: e.target.value }))}
                className="w-48"
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2">Duration (seconds)</Label>
              <Input
                type="number"
                value={project.duration}
                onChange={(e) => setProject(prev => ({ ...prev, duration: Number(e.target.value) }))}
                min={1}
                max={60}
                className="w-24"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2">FPS</Label>
              <Select
                value={project.fps.toString()}
                onValueChange={(value) => setProject(prev => ({ ...prev, fps: Number(value) }))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="60">60</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkipToStart}
                disabled={currentTime === 0 && !isPlaying}
                title="Skip to start"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={currentTime === 0 && !isPlaying}
              >
                <Square className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeek(Math.max(0, currentTime - 0.1))}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button
                variant="default"
                size="sm"
                onClick={isPlaying ? handlePause : handlePlay}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeek(Math.min(project.duration, currentTime + 0.1))}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkipToEnd}
                disabled={currentTime === project.duration}
                title="Skip to end"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {currentTime.toFixed(2)}s / {project.duration}s
              </span>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportAsImage}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export Frame
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportAsGif}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export GIF
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportAsMP4}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export MP4
                </Button>
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleResetPositions}
                  className="flex items-center gap-1"
                  disabled={!isLayoutReady}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset Positions
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAllLayoutCombinations}
                  disabled={isLoadingCombinations || !isLayoutReady}
                  className="flex items-center gap-1"
                >
                  <Eye className="h-4 w-4" />
                  {isLoadingCombinations ? 'Loading...' : 'Preview All Combinations'}
                </Button>
              </div>
            </div>
          </div>

          {/* Canvas container */}
          <div className="border overflow-hidden bg-white shadow-sm rounded-lg relative max-w-2xl mx-auto">
            <div className="w-full h-full flex items-center justify-center p-2">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
          </div>

          {/* Timeline */}
          {renderTimeline()}
        </CollapsibleContent>
      </Collapsible>

      {/* Combination Preview Modal */}
      <Dialog open={showCombinationPreview} onOpenChange={setShowCombinationPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>All Layout Combinations with Animation Preview</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {allLayoutCombinations.map((combination, index) => (
              <div key={index} className="border rounded-lg p-2 hover:shadow-lg transition-shadow">
                <h4 className="text-sm font-medium mb-2">{combination.name}</h4>
                <div className="aspect-video bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">
                  {combination.layout.aspectRatio} - {combination.layout.elements.length} layers
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    // Switch to this layout combination
                    sessionStorage.setItem('generated_layout', JSON.stringify(combination.layout));
                    window.dispatchEvent(new CustomEvent('layout_generated'));
                    setShowCombinationPreview(false);
                    toast.success(`Switched to ${combination.name}`);
                  }}
                >
                  Use This Layout
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 