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
  animationType: string | null; // 'fade-in', 'slide-in-left', etc. or null for no animation
  startTime: number;
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic';
  color: string;
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
  startTime: number;
  startX: number;
  timelineRect: DOMRect;
  pixelsPerSecond: number;
}

interface Channel {
  id: string;
  name: string;
  layouts: Layout[];
}

interface Layout {
  aspectRatio: string;
  width: number;
  height: number;
  options?: LayoutOption[];
}

interface LayoutOption {
  name: string;
  rules: {
    visibility: Record<string, boolean>;
    positioning: Record<string, Record<string, number>>;
    renderOrder?: string[];
  };
  safezoneMargin?: number;
}

// API Response interfaces
interface ChannelResponse {
  id: string;
  name: string;
  layouts: LayoutResponse[];
}

interface LayoutResponse {
  aspectRatio: string;
  width: number;
  height: number;
  options?: LayoutOptionResponse[];
}

interface LayoutOptionResponse {
  name: string;
  rules: {
    visibility: Record<string, boolean>;
    positioning: Record<string, Record<string, number>>;
    renderOrder?: string[];
  };
  safezoneMargin?: number;
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
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Layer images from PSD
  const [layerImages, setLayerImages] = useState<Map<string, ImageData>>(new Map());

  // Timeline state
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Canvas resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 });

  // Layout selection state (similar to AdvancedLayoutGenerator)
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [availableLayouts, setAvailableLayouts] = useState<Layout[]>([]);
  const [availableOptions, setAvailableOptions] = useState<LayoutOption[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [sourceRatio, setSourceRatio] = useState<string | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    
    fabricCanvasRef.current = new Canvas(canvasRef.current, {
      backgroundColor: '#f9f9f9',
      width: canvasSize.width,
      height: canvasSize.height,
      centeredScaling: true,
      preserveObjectStacking: true,
      selection: false,
      selectionColor: 'rgba(100, 100, 255, 0.3)',
      selectionBorderColor: '#6366F1',
      selectionLineWidth: 1
    });
    
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, [canvasSize]);

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

    // Get layer labels from session storage
    const storedLabels = sessionStorage.getItem('psd_layer_labels');
    let labels: Record<string, string> = {};
    try {
      labels = storedLabels ? JSON.parse(storedLabels) : {};
    } catch (error) {
      console.error('Error parsing layer labels:', error);
    }

    // Only include layers that have labels (not 'unlabeled')
    const animationLayers: LayerAnimation[] = psdLayers
      .filter(layer => {
        if (layer.type !== 'layer' || !layer.bounds) return false;
        
        const layerId = layer.id;
        const normalizedId = layerId.startsWith('layer_') ? layerId : `layer_${layerId}`;
        const label = labels[normalizedId] || labels[layerId] || 'unlabeled';
        
        // Only include layers with actual labels (not 'unlabeled')
        return label !== 'unlabeled';
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
          animationType: null, // No animation by default
          startTime: 0,
          duration: 1,
          easing: 'ease-out' as const,
          color: getLabelColor(label)
        };
      });

    setProject(prev => ({
      ...prev,
      layers: animationLayers
    }));

    toast.success(`Loaded ${animationLayers.length} labeled layers for animation`);
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
    if (!psdLayers || project.layers.length > 0) return;
    loadLabeledLayers();
  }, [psdLayers, project.layers.length, loadLabeledLayers]);

  // Listen for storage changes to auto-refresh layers when labels are updated
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'psd_layer_labels' && e.newValue !== e.oldValue) {
        // Delay refresh to ensure the storage is fully updated
        setTimeout(() => {
          refreshLayers();
        }, 200);
      }
    };

    // Listen for storage events (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom events from the same tab
    const handleCustomStorageChange = () => {
      setTimeout(() => {
        refreshLayers();
      }, 200);
    };

    window.addEventListener('psd_label_change', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('psd_label_change', handleCustomStorageChange);
    };
  }, [refreshLayers]);

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

  // Render canvas at current time with proper aspect ratio handling
  useEffect(() => {
    if (!fabricCanvasRef.current || !psdLayers) return;

    const canvas = fabricCanvasRef.current;
    canvas.clear();

    // Calculate canvas dimensions maintaining aspect ratio and fitting viewport
    const containerEl = canvas.getElement().parentElement;
    if (!containerEl) return;

    // Get container dimensions with some padding
    const containerWidth = Math.min(canvasSize.width - 32, containerEl.clientWidth - 32) || 768;
    const containerHeight = Math.min(canvasSize.height - 32, 400); // Max height for better UX
    
    // Use project dimensions (from selected layout or default)
    const projectAspectRatio = project.width / project.height;
    
    let canvasWidth, canvasHeight;
    
    // Calculate dimensions to fit within container while maintaining aspect ratio
    if (projectAspectRatio > containerWidth / containerHeight) {
      // Project is wider than container ratio
      canvasWidth = containerWidth;
      canvasHeight = containerWidth / projectAspectRatio;
    } else {
      // Project is taller than container ratio
      canvasHeight = containerHeight;
      canvasWidth = containerHeight * projectAspectRatio;
    }

    // Ensure minimum dimensions
    canvasWidth = Math.max(canvasWidth, 300);
    canvasHeight = Math.max(canvasHeight, 200);

    canvas.setDimensions({
      width: canvasWidth,
      height: canvasHeight
    });

    // Calculate scale factors
    const scaleX = canvasWidth / project.width;
    const scaleY = canvasHeight / project.height;
    const scale = Math.min(scaleX, scaleY); // Use uniform scaling to maintain aspect ratio

    // Add background with layout info
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

    // Add layout info text if layout is selected
    if (selectedChannelId && selectedAspectRatio) {
      const channel = availableChannels.find(c => c.id === selectedChannelId);
      if (channel) {
        const layoutInfo = `${channel.name} - ${project.aspectRatio} (${project.width}x${project.height})`;
        
        // Create a temporary canvas for text
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 400;
        textCanvas.height = 30;
        const textCtx = textCanvas.getContext('2d');
        
        if (textCtx) {
          textCtx.fillStyle = '#6b7280';
          textCtx.font = '12px sans-serif';
          textCtx.textAlign = 'center';
          textCtx.fillText(layoutInfo, 200, 20);
          
          const textImage = new FabricImage(textCanvas, {
            left: (canvasWidth - 400) / 2,
            top: 10,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            opacity: 0.7
          });
          canvas.add(textImage);
        }
      }
    }

    // Sort layers by render order (similar to AdvancedLayoutGenerator)
    const sortedLayers = [...project.layers].sort((a, b) => {
      // Background layers first, then by original order
      if (a.label === 'background') return -1;
      if (b.label === 'background') return 1;
      return 0;
    });

    // Render layers at current time
    sortedLayers.forEach(layer => {
      if (!layer.visible) return;

      const psdLayer = psdLayers.find(l => l.id === layer.layerId);
      if (!psdLayer || !psdLayer.bounds) return;

      // Interpolate properties at current time
      const properties = interpolateProperties(layer, currentTime);
      
      // Calculate original layer dimensions
      const originalWidth = psdLayer.bounds.right - psdLayer.bounds.left;
      const originalHeight = psdLayer.bounds.bottom - psdLayer.bounds.top;
      
      // Create temporary canvas for the layer
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.max(1, originalWidth);
      tempCanvas.height = Math.max(1, originalHeight);
      const ctx = tempCanvas.getContext('2d');

      if (ctx) {
        const imageData = layerImages.get(psdLayer.name);
        
        if (imageData && imageData.width > 0 && imageData.height > 0) {
          const originalCanvas = document.createElement('canvas');
          originalCanvas.width = Math.max(1, imageData.width);
          originalCanvas.height = Math.max(1, imageData.height);
          const originalCtx = originalCanvas.getContext('2d');
          
          if (originalCtx) {
            originalCtx.putImageData(imageData, 0, 0);
            // Properly scale the image to fit the layer bounds
            ctx.drawImage(
              originalCanvas,
              0, 0, imageData.width, imageData.height,
              0, 0, originalWidth, originalHeight
            );
          }
        } else {
          // Fallback colored rectangle using consistent label color
          ctx.fillStyle = getLabelColor(layer.label);
          ctx.fillRect(0, 0, originalWidth, originalHeight);
          
          // Add layer label
          ctx.fillStyle = 'white';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.label, originalWidth / 2, originalHeight / 2);
        }
      }

      // Create fabric image with animated properties and proper scaling
      const fabricImage = new FabricImage(tempCanvas, {
        left: properties.x * scale,
        top: properties.y * scale,
        scaleX: properties.scaleX * scale,
        scaleY: properties.scaleY * scale,
        angle: properties.rotation,
        opacity: properties.opacity,
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top'
      });

      canvas.add(fabricImage);
    });

    canvas.renderAll();
  }, [currentTime, project, psdLayers, layerImages, selectedChannelId, selectedAspectRatio, availableChannels, canvasSize]);

  // Interpolate properties for animation
  const interpolateProperties = (layer: LayerAnimation, time: number): AnimationProperties => {
    if (!layer.animationType || !psdLayers) {
      // No animation - return original position
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

    const preset = ANIMATION_PRESETS[layer.animationType as keyof typeof ANIMATION_PRESETS];
    if (!preset) {
      // Fallback to original position
      const psdLayer = psdLayers.find(l => l.id === layer.layerId);
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

    // Get original layer position
    const psdLayer = psdLayers.find(l => l.id === layer.layerId);
    const originalX = psdLayer?.bounds?.left || 0;
    const originalY = psdLayer?.bounds?.top || 0;

    // Calculate animation progress
    const animationStart = layer.startTime;
    const animationEnd = layer.startTime + layer.duration;
    
    if (time < animationStart) {
      // Before animation starts - use start properties
      return {
        x: originalX + preset.startProperties.x,
        y: originalY + preset.startProperties.y,
        scaleX: preset.startProperties.scaleX,
        scaleY: preset.startProperties.scaleY,
        rotation: preset.startProperties.rotation,
        opacity: preset.startProperties.opacity
      };
    }
    
    if (time >= animationEnd) {
      // After animation ends - use end properties
      return {
        x: originalX + preset.endProperties.x,
        y: originalY + preset.endProperties.y,
        scaleX: preset.endProperties.scaleX,
        scaleY: preset.endProperties.scaleY,
        rotation: preset.endProperties.rotation,
        opacity: preset.endProperties.opacity
      };
    }

    // During animation - interpolate
    const progress = (time - animationStart) / layer.duration;
    const easedProgress = applyEasing(progress, layer.easing);

    return {
      x: originalX + lerp(preset.startProperties.x, preset.endProperties.x, easedProgress),
      y: originalY + lerp(preset.startProperties.y, preset.endProperties.y, easedProgress),
      scaleX: lerp(preset.startProperties.scaleX, preset.endProperties.scaleX, easedProgress),
      scaleY: lerp(preset.startProperties.scaleY, preset.endProperties.scaleY, easedProgress),
      rotation: lerp(preset.startProperties.rotation, preset.endProperties.rotation, easedProgress),
      opacity: lerp(preset.startProperties.opacity, preset.endProperties.opacity, easedProgress)
    };
  };

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

  // Apply animation preset
  const applyPreset = (layerId: string, presetKey: string) => {
    const preset = ANIMATION_PRESETS[presetKey as keyof typeof ANIMATION_PRESETS];
    if (!preset) return;

    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(l =>
        l.layerId === layerId
          ? { 
              ...l, 
              animationType: presetKey,
              duration: preset.duration,
              easing: 'ease-out'
            }
          : l
      )
    }));

    toast.success(`Applied ${preset.name} animation`);
  };

  // Remove animation from layer
  const removeAnimation = (layerId: string) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.layerId === layerId
          ? { ...layer, animationType: null }
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
                      title="Remove animation"
                      disabled={!layer.animationType}
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
              onScroll={() => {
                // Scroll handling is now managed by the browser's native scrolling
              }}
            >
              {/* Container with consistent width for both header and tracks */}
              <div style={{ width: Math.max(totalWidth, 600), minWidth: '100%' }}>
                {/* Time ruler header - synchronized with timeline */}
                <div className="h-10 bg-gray-750 border-b border-gray-600 relative">
                  {/* Time markers */}
                  {Array.from({ length: Math.ceil(project.duration) + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-gray-600 flex items-center pl-2"
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
                      {/* Animation blocks */}
                      {layer.animationType && (
                        <div
                          className="absolute top-2 h-8 bg-blue-500 bg-opacity-30 border border-blue-400 rounded cursor-move flex items-center"
                          style={{
                            left: `${layer.startTime * pixelsPerSecond}px`,
                            width: `${Math.max(layer.duration * pixelsPerSecond, 20)}px` // Minimum width for visibility
                          }}
                          title={`${layer.animationType}: ${layer.startTime.toFixed(1)}s - ${(layer.startTime + layer.duration).toFixed(1)}s`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const timelineRect = e.currentTarget.parentElement!.getBoundingClientRect();
                            const scrollContainer = timelineRef.current;
                            const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
                            
                            setDragState({
                              type: 'animation',
                              layerId: layer.layerId,
                              startTime: layer.startTime,
                              startX: e.clientX + scrollLeft,
                              timelineRect: timelineRect,
                              pixelsPerSecond: pixelsPerSecond
                            });
                          }}
                        >
                          <div className="flex items-center justify-center h-full px-2 min-w-0">
                            <span className="text-xs text-blue-200 truncate">
                              {ANIMATION_PRESETS[layer.animationType as keyof typeof ANIMATION_PRESETS]?.name || layer.animationType}
                            </span>
                          </div>
                          
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
                                startTime: layer.startTime,
                                startX: e.clientX + scrollLeft,
                                timelineRect: timelineRect,
                                pixelsPerSecond: pixelsPerSecond
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
                                startTime: layer.startTime + layer.duration,
                                startX: e.clientX + scrollLeft,
                                timelineRect: timelineRect,
                                pixelsPerSecond: pixelsPerSecond
                              });
                            }}
                          />
                        </div>
                      )}
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

  // Improved global mouse event handlers for dragging with grid snapping and better precision
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      // Calculate delta with scroll compensation
      const scrollContainer = timelineRef.current;
      const currentScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
      const deltaX = e.clientX + currentScrollLeft - dragState.startX;
      
      // Apply sensitivity and grid snapping
      const sensitivity = 1.0;
      const adjustedDeltaX = deltaX * sensitivity;
      const deltaTime = adjustedDeltaX / dragState.pixelsPerSecond;
      
      // Grid snapping to 0.1 second intervals
      const gridSize = 0.1;
      const snappedDeltaTime = Math.round(deltaTime / gridSize) * gridSize;

      switch (dragState.type) {
        case 'animation':
          // Move entire animation with grid snapping
          const newStartTime = Math.max(0, Math.min(project.duration - 0.1, dragState.startTime + snappedDeltaTime));
          const roundedStartTime = Math.round(newStartTime * 10) / 10; // Round to 1 decimal place
          
          if (Math.abs(roundedStartTime - dragState.startTime) >= gridSize) {
            setProject(prev => ({
              ...prev,
              layers: prev.layers.map(layer =>
                layer.layerId === dragState.layerId
                  ? { ...layer, startTime: roundedStartTime }
                  : layer
              )
            }));
          }
          break;
          
        case 'resize':
          // Resize animation duration with grid snapping
          const layer = project.layers.find(l => l.layerId === dragState.layerId);
          if (layer) {
            const newDuration = Math.max(0.1, Math.min(project.duration - layer.startTime, layer.duration + snappedDeltaTime));
            const roundedDuration = Math.round(newDuration * 10) / 10; // Round to 1 decimal place
            
            if (Math.abs(roundedDuration - layer.duration) >= gridSize) {
              setProject(prev => ({
                ...prev,
                layers: prev.layers.map(l =>
                  l.layerId === dragState.layerId
                    ? { ...l, duration: roundedDuration }
                    : l
                )
              }));
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

  // Canvas resize handler
  const handleCanvasResize = useCallback((e: MouseEvent) => {
    if (!isResizing || !canvasContainerRef.current) return;
    
    const container = canvasContainerRef.current;
    const rect = container.getBoundingClientRect();
    const newWidth = Math.max(400, e.clientX - rect.left);
    const newHeight = Math.max(300, e.clientY - rect.top);
    
    setCanvasSize({ width: newWidth, height: newHeight });
    
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.setDimensions({
        width: newWidth,
        height: newHeight
      });
    }
  }, [isResizing]);

  // Canvas resize mouse events
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleCanvasResize);
      document.addEventListener('mouseup', () => setIsResizing(false));
      
      return () => {
        document.removeEventListener('mousemove', handleCanvasResize);
        document.removeEventListener('mouseup', () => setIsResizing(false));
      };
    }
  }, [isResizing, handleCanvasResize]);

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

  // Load available channels
  useEffect(() => {
    const fetchLayoutRules = async () => {
      try {
        const response = await fetch('/api/layout-rules');
        const data: ApiResponse = await response.json();
        setAvailableChannels(data.channels.map((channel: ChannelResponse) => ({
          id: channel.id,
          name: channel.name,
          layouts: channel.layouts.map(layout => ({
            aspectRatio: layout.aspectRatio,
            width: layout.width,
            height: layout.height,
            options: layout.options || []
          }))
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
        const data: ApiResponse = await response.json();
        const channel = data.channels.find((c: ChannelResponse) => c.id === selectedChannelId);
        
        if (channel) {
          setAvailableLayouts(channel.layouts.map(layout => ({
            aspectRatio: layout.aspectRatio,
            width: layout.width,
            height: layout.height,
            options: layout.options || []
          })));
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
        const data: ApiResponse = await response.json();
        const channel = data.channels.find((c: ChannelResponse) => c.id === selectedChannelId);
        
        if (channel) {
          const layout = channel.layouts.find((l: LayoutResponse) => l.aspectRatio === selectedAspectRatio);
          
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

  // Calculate source ratio when PSD layers are loaded
  useEffect(() => {
    if (psdLayers && psdLayers.length > 0) {
      // Find a reference layer with bounds for source ratio calculation
      const referenceLayer = psdLayers.find(layer => layer.bounds) || psdLayers[0];
      if (referenceLayer.bounds) {
        const width = referenceLayer.bounds.right - referenceLayer.bounds.left;
        const height = referenceLayer.bounds.bottom - referenceLayer.bounds.top;
        const ratio = `${width}:${height}`;
        setSourceRatio(ratio);
      }
    }
  }, [psdLayers]);

  // Update project dimensions when layout is selected
  useEffect(() => {
    if (selectedChannelId && selectedAspectRatio) {
      const channel = availableChannels.find(c => c.id === selectedChannelId);
      if (channel) {
        const layout = channel.layouts.find((l: Layout) => l.aspectRatio === selectedAspectRatio);
        if (layout) {
          setProject(prev => ({
            ...prev,
            width: layout.width,
            height: layout.height,
            aspectRatio: layout.aspectRatio
          }));
        }
      }
    }
  }, [selectedChannelId, selectedAspectRatio, availableChannels]);

  // Handle channel selection
  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId);
    setSelectedAspectRatio(null);
    setSelectedOption(null);
  };

  // Handle aspect ratio selection
  const handleAspectRatioSelect = (aspectRatio: string) => {
    setSelectedAspectRatio(aspectRatio);
    setSelectedOption(null);
  };

  // Handle option selection
  const handleOptionSelect = (optionName: string) => {
    setSelectedOption(optionName);
  };

  // Filter aspect ratios by selected channel and compatible ratios
  const filteredAspectRatios = availableLayouts.filter((layout: Layout) => {
    // Skip layouts that have the same aspect ratio as the source
    if (!sourceRatio) return true;
    
    // Simple ratio comparison - you might want to implement areRatiosEquivalent function
    if (layout.aspectRatio === sourceRatio) {
      return false;
    }
    
    return true;
  });

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
          {/* Layout Selection Controls */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              {/* Channel selection */}
              <div>
                <Label className="text-sm font-medium mb-2">Channel</Label>
                <Select value={selectedChannelId || ''} onValueChange={handleChannelSelect}>
                  <SelectTrigger className="w-48">
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
                  <SelectTrigger className="w-48">
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
                            {layout.aspectRatio} ({layout.width}x{layout.height})
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
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select layout option" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOptions.length === 0 ? (
                      <SelectItem value="none" disabled>No options available</SelectItem>
                    ) : (
                      availableOptions.map((option) => (
                        <SelectItem key={option.name} value={option.name}>
                          {option.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

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
              </div>
            </div>
          </div>

          {/* Canvas with resize handle */}
          <div 
            ref={canvasContainerRef}
            className="border overflow-hidden bg-white shadow-sm rounded-lg relative"
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            <div className="w-full h-full flex items-center justify-center p-4">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
            
            {/* Resize handle */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 bg-gray-400 cursor-se-resize hover:bg-gray-600 transition-colors"
              onMouseDown={() => setIsResizing(true)}
              title="Drag to resize canvas"
            >
              <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-white"></div>
            </div>
          </div>

          {/* Timeline */}
          {renderTimeline()}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
} 