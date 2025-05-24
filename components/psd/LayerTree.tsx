import React, { useState, useEffect, useRef, useCallback } from "react";
import { PsdLayerMetadata, flattenLayers } from "@/utils/psd-parser";
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Folder,
  Image as ImageIcon,
  Type,
  Square,
  GripVertical,
  Tag,
  Check,
  Users,
  CheckSquare,
  Square as SquareIcon,
  Link,
  Link2Off,
  Plus,
  Trash2,
  Move,
  Settings2,
  Info,
  Wand2,
  X
} from "lucide-react";
import { cn } from "@/utils/cn";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSegmentationRules } from '@/hooks/useSegmentationRules';
import { useAutoAI } from '@/hooks/useAutoAI';

// Update type to use string instead of union
type SegmentationType = string;

interface PersonalizationRule {
  type: SegmentationType;
  value: string;
}

interface LayerPersonalization {
  isPersonalized: boolean;
  rules: PersonalizationRule[];
}

// Remove the hardcoded SEGMENTATION_OPTIONS since we'll use the API

// Predefined label options
const LABEL_OPTIONS = [
  { id: "background", name: "Background", color: "bg-gray-100 text-gray-700" },
  { id: "logo", name: "Logo", color: "bg-red-100 text-red-700" },
  { id: "main-subject", name: "Main Subject", color: "bg-blue-100 text-blue-700" },
  { id: "domain", name: "Domain", color: "bg-purple-100 text-purple-700" },
  { id: "product-name", name: "Product Name", color: "bg-green-100 text-green-700" },
  { id: "sub-content-1", name: "Sub Content 1", color: "bg-pink-100 text-pink-700" },
  { id: "sub-content-2", name: "Sub Content 2", color: "bg-indigo-100 text-indigo-700" },
  { id: "cta", name: "CTA", color: "bg-orange-100 text-orange-700" },
  { id: "disclaimer", name: "Disclaimer", color: "bg-amber-100 text-amber-700" },
];

// Add new interfaces for layer links
interface LayerLink {
  sourceId: string;
  targetId: string;
  type: 'sync-visibility' | 'sync-position' | 'custom';
  description?: string;
}

interface LayerTreeProps {
  layers?: PsdLayerMetadata[];
  onLayerVisibilityChange?: (layerId: string, visible: boolean) => void;
  onLayerHover?: (layerId: string | null) => void;
  onLayerReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  layerVisibility?: Record<string, boolean>;
}

// Add StepsIndicator component
const StepsIndicator = () => {
  return (
    <div className="p-4 border-b bg-gray-50">
      <div className="flex items-center justify-between space-x-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <div className="flex items-center flex-shrink-0">
              <Tag className="h-5 w-5 text-blue-500" />
            </div>
            <div className="ml-2 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Label Layers</p>
              <p className="text-xs text-gray-500">Assign semantic labels to organize your layers</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <div className="flex items-center flex-shrink-0">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-2 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">Personalization</p>
              <p className="text-xs text-gray-500">Add rules for dynamic content</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <div className="flex items-center flex-shrink-0">
              <Link className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-2 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">Sync</p>
              <p className="text-xs text-gray-500">Link layers for synchronized behavior</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function LayerTree({
  layers,
  onLayerVisibilityChange,
  onLayerHover,
  onLayerReorder,
  layerVisibility: initialLayerVisibility,
}: LayerTreeProps) {
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [visibilityState, setVisibilityState] = useState<Record<string, boolean>>(
    initialLayerVisibility || {}
  );
  const [labelState, setLabelState] = useState<Record<string, string>>({});
  const [highlightedLayer, setHighlightedLayer] = useState<string | null>(null);
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [layersState, setLayersState] = useState<PsdLayerMetadata[] | null>(null);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState<string | null>(null);
  
  // New state for personalization
  const [personalizationRules, setPersonalizationRules] = useState<Record<string, LayerPersonalization>>({});
  const [personalizationModalOpen, setPersonalizationModalOpen] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedSegmentationType, setSelectedSegmentationType] = useState<string>('gender');
  const [selectedSegmentationValue, setSelectedSegmentationValue] = useState<string>('');

  // Ref to store all layer elements for drag and drop 
  const layerRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load layers from localStorage if not provided as props
  const layerData = layers || loadLayersFromStorage();

  // Initialize layers state from props or localStorage
  useEffect(() => {
    setLayersState(layerData);
  }, [layerData]);

  // Initialize state from sessionStorage on mount
  useEffect(() => {
    if (!layerData) return;

    // Load expanded state
    const storedExpandedState = sessionStorage.getItem("psd_tree_expanded");
    if (storedExpandedState) {
      try {
        setExpandedState(JSON.parse(storedExpandedState));
      } catch (err) {
        console.error("Error parsing expanded state from sessionStorage", err);
      }
    } else {
      // By default expand all top-level groups
      const initialState: Record<string, boolean> = {};
      layerData.forEach((layer) => {
        if (layer.type === "group") {
          initialState[layer.id] = true;
        }
      });
      setExpandedState(initialState);
    }

    // Load personalization rules
    const storedPersonalizationRules = localStorage.getItem("psd_personalization_rules");
    let initialRules: Record<string, LayerPersonalization> = {};
    
    // First set default state for all layers
    const initializeDefaultState = (layers: PsdLayerMetadata[]) => {
      layers.forEach(layer => {
        initialRules[layer.id] = {
          isPersonalized: false,
          rules: []
        };
        if (layer.type === 'group' && layer.children) {
          initializeDefaultState(layer.children);
        }
      });
    };
    
    // Initialize all layers with default state
    if (layerData) {
      initializeDefaultState(Array.isArray(layerData) ? layerData : [layerData]);
    }
    
    // Then overlay stored rules if they exist
    if (storedPersonalizationRules) {
      try {
        const storedRules = JSON.parse(storedPersonalizationRules);
        initialRules = {
          ...initialRules,
          ...storedRules
        };
      } catch (error) {
        console.error('Error parsing personalization rules:', error);
      }
    }
    
    setPersonalizationRules(initialRules);

    // Initialize visibility state from layerData
    const initialVisibilityState: Record<string, boolean> = {};
    const initializeVisibility = (layers: PsdLayerMetadata[]) => {
      layers.forEach(layer => {
        initialVisibilityState[layer.id] = layer.visible;
        if (layer.type === 'group' && layer.children) {
          initializeVisibility(layer.children);
        }
      });
    };
    
    initializeVisibility(Array.isArray(layerData) ? layerData : [layerData]);
    setVisibilityState(prev => ({
      ...prev,
      ...initialVisibilityState
    }));

    // Load label state
    const storedLabelState = localStorage.getItem("psd_layer_labels");
    if (storedLabelState) {
      try {
        setLabelState(JSON.parse(storedLabelState));
      } catch (error) {
        console.error('Error parsing layer labels:', error);
      }
    }
  }, [layerData]);

  // Listen for new file uploads to reset the label state
  useEffect(() => {
    const handleNewFileUpload = () => {
      // Reset the label state when a new file is uploaded
      setLabelState({});
    };

    window.addEventListener("psd_new_file_uploaded", handleNewFileUpload);
    
    return () => {
      window.removeEventListener("psd_new_file_uploaded", handleNewFileUpload);
    };
  }, []);

  // Save state to sessionStorage when it changes
  useEffect(() => {
    if (Object.keys(expandedState).length > 0) {
      sessionStorage.setItem("psd_tree_expanded", JSON.stringify(expandedState));
    }
  }, [expandedState]);

  useEffect(() => {
    if (Object.keys(visibilityState).length > 0) {
      sessionStorage.setItem("psd_layer_visibility", JSON.stringify(visibilityState));
    }
  }, [visibilityState]);

  useEffect(() => {
    if (Object.keys(labelState).length > 0) {
      sessionStorage.setItem("psd_layer_labels", JSON.stringify(labelState));
      
      // Dispatch an event to notify other components
      const event = new CustomEvent("psd_label_change", {
        detail: labelState
      });
      window.dispatchEvent(event);
    }
  }, [labelState]);

  // Save layers to localStorage when they change
  useEffect(() => {
    if (layersState) {
      localStorage.setItem("psd_structure", JSON.stringify(layersState));
      
      // Dispatch a custom event to notify other components
      const event = new CustomEvent("psd_structure_change", { 
        detail: { layers: layersState } 
      });
      window.dispatchEvent(event);
    }
  }, [layersState]);

  // Save personalization rules to localStorage when they change
  useEffect(() => {
    const hasRules = Object.values(personalizationRules).some(
      layer => layer.isPersonalized && layer.rules.length > 0
    );

    if (hasRules) {
      localStorage.setItem("psd_personalization_rules", JSON.stringify(personalizationRules));
    } else if (Object.keys(personalizationRules).length > 0) {
      // If we have layers but no rules, clean up storage
      localStorage.removeItem("psd_personalization_rules");
    }
    
    // Dispatch an event to notify other components
    const event = new CustomEvent("psd_personalization_change", {
      detail: {
        rules: personalizationRules,
        hasPersonalization: hasRules
      }
    });
    window.dispatchEvent(event);
  }, [personalizationRules]);

  // Listen for new file uploads to reset the personalization state
  useEffect(() => {
    const handleNewFileUpload = () => {
      setPersonalizationRules({});
      localStorage.removeItem("psd_personalization_rules");
    };

    window.addEventListener("psd_new_file_uploaded", handleNewFileUpload);
    
    return () => {
      window.removeEventListener("psd_new_file_uploaded", handleNewFileUpload);
    };
  }, []);

  // Load layers from localStorage
  function loadLayersFromStorage(): PsdLayerMetadata[] | null {
    const storedStructure = localStorage.getItem("psd_structure");
    if (!storedStructure) return null;

    try {
      return JSON.parse(storedStructure) as PsdLayerMetadata[];
    } catch (err) {
      console.error("Error parsing PSD structure from localStorage", err);
      return null;
    }
  }

  // Toggle layer expansion
  const toggleExpanded = (layerId: string) => {
    setExpandedState((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  // Toggle layer visibility
  const toggleVisibility = (
    e: React.MouseEvent,
    layerId: string,
    isGroup: boolean
  ) => {
    e.stopPropagation();
    
    // Update visibility state
    const newVisibility = !visibilityState[layerId];
    setVisibilityState((prev) => ({
      ...prev,
      [layerId]: newVisibility,
    }));

    // If it's a group, update all children
    if (isGroup && layerData) {
      const updateChildrenVisibility = (
        layers: PsdLayerMetadata[],
        parentId: string,
        visible: boolean
      ) => {
        layers.forEach((layer) => {
          if (layer.parent === parentId) {
            // Update visibility state for all children to match parent
            setVisibilityState((prev) => ({
              ...prev,
              [layer.id]: visible,
            }));

            // Dispatch visibility change event for each child
            window.dispatchEvent(new CustomEvent('psd_layer_visibility_change', {
              detail: {
                layerId: layer.id,
                isVisible: visible,
                isGroup: layer.type === "group"
              }
            }));

            // Recursively update nested groups and their children
            if (layer.type === "group" && layer.children) {
              updateChildrenVisibility(layer.children, layer.id, visible);
            }
          }
        });
      };

      const allLayers = flattenLayers(Array.isArray(layerData) ? layerData : []);
      updateChildrenVisibility(allLayers, layerId, newVisibility);
    }

    // Notify parent component
    if (onLayerVisibilityChange) {
      onLayerVisibilityChange(layerId, newVisibility);
    }

    // Dispatch visibility change event
    window.dispatchEvent(new CustomEvent('psd_layer_visibility_change', {
      detail: {
        layerId,
        isVisible: newVisibility,
        isGroup
      }
    }));
  };

  // Handle layer hover
  const handleLayerHover = (layerId: string | null) => {
    setHighlightedLayer(layerId);
    if (onLayerHover) {
      onLayerHover(layerId);
    }
  };

  // Find a layer by ID in the layer tree (recursive)
  const findLayerById = (
    layers: PsdLayerMetadata[] | null,
    layerId: string
  ): PsdLayerMetadata | null => {
    if (!layers) return null;
    
    for (const layer of layers) {
      if (layer.id === layerId) {
        return layer;
      }
      
      if (layer.type === 'group' && layer.children) {
        const found = findLayerById(layer.children, layerId);
        if (found) return found;
      }
    }
    
    return null;
  };

  // Find parent layer of a layer by ID
  const findParentLayer = (
    layers: PsdLayerMetadata[] | null,
    layerId: string
  ): { parent: PsdLayerMetadata | null; index: number } => {
    if (!layers) return { parent: null, index: -1 };
    
    for (const layer of layers) {
      if (layer.type === 'group' && layer.children) {
        const index = layer.children.findIndex(child => child.id === layerId);
        if (index !== -1) {
          return { parent: layer, index };
        }
        
        const result = findParentLayer(layer.children, layerId);
        if (result.parent) return result;
      }
    }
    
    // Check if it's a top-level layer
    if (layers) {
      const index = layers.findIndex(layer => layer.id === layerId);
      if (index !== -1) {
        return { parent: null, index }; // null parent means it's at the root level
      }
    }
    
    return { parent: null, index: -1 };
  };

  // Remove a layer from its parent
  const removeLayerFromParent = (
    layers: PsdLayerMetadata[],
    layerId: string
  ): PsdLayerMetadata | null => {
    const { parent, index } = findParentLayer(layers, layerId);
    
    if (index === -1) return null;
    
    let removedLayer: PsdLayerMetadata | null = null;
    
    if (parent) {
      // Remove from parent's children
      removedLayer = parent.children![index];
      parent.children!.splice(index, 1);
    } else {
      // Remove from root level
      removedLayer = layers[index];
      layers.splice(index, 1);
    }
    
    return removedLayer;
  };

  // Add a layer to a parent at a specific index
  const addLayerToParent = (
    layers: PsdLayerMetadata[],
    layer: PsdLayerMetadata,
    parentId: string | null,
    index: number
  ) => {
    if (!parentId) {
      // Add to root level
      layers.splice(index, 0, layer);
      layer.parent = undefined; // Remove parent reference
    } else {
      // Add to parent's children
      const parent = findLayerById(layers, parentId);
      if (parent && parent.type === 'group') {
        if (!parent.children) parent.children = [];
        parent.children.splice(index, 0, layer);
        layer.parent = parentId;
      }
    }
  };

  // Reorder layers
  const reorderLayers = (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after' | 'inside'
  ) => {
    if (!layersState || sourceId === targetId) return;
    
    // Clone the current layers to avoid direct mutation
    const updatedLayers = JSON.parse(JSON.stringify(layersState)) as PsdLayerMetadata[];
    
    // Remove the source layer from its current position
    const sourceLayer = removeLayerFromParent(updatedLayers, sourceId);
    if (!sourceLayer) return;
    
    // Find target layer and its parent
    const targetLayer = findLayerById(updatedLayers, targetId);
    if (!targetLayer) return;
    
    const { parent: targetParent, index: targetIndex } = findParentLayer(updatedLayers, targetId);
    
    if (position === 'inside' && targetLayer.type === 'group') {
      // Add as first child of the target group
      if (!targetLayer.children) targetLayer.children = [];
      targetLayer.children.unshift(sourceLayer);
      sourceLayer.parent = targetLayer.id;
      
      // Ensure the group is expanded
      setExpandedState(prev => ({
        ...prev,
        [targetLayer.id]: true
      }));
    } else if (position === 'before') {
      // Add before the target
      if (targetParent) {
        addLayerToParent(updatedLayers, sourceLayer, targetParent.id, targetIndex);
      } else {
        addLayerToParent(updatedLayers, sourceLayer, null, targetIndex);
      }
    } else if (position === 'after') {
      // Add after the target
      if (targetParent) {
        addLayerToParent(updatedLayers, sourceLayer, targetParent.id, targetIndex + 1);
      } else {
        addLayerToParent(updatedLayers, sourceLayer, null, targetIndex + 1);
      }
    }
    
    // Update the layers state
    setLayersState(updatedLayers);
    
    // Notify parent component
    if (onLayerReorder) {
      onLayerReorder(sourceId, targetId, position);
    }
    
    // Dispatch reorder event
    window.dispatchEvent(new CustomEvent('psd_layer_reorder', {
      detail: {
        sourceId,
        targetId,
        position,
        updatedLayers
      }
    }));
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    e.stopPropagation();
    setDraggedLayer(layerId);
    
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add('opacity-50');
    }
    
    // Required for Firefox
    e.dataTransfer.setData('text/plain', layerId);
    // Use the move cursor
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag end
  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    
    // Remove visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('opacity-50');
    }
    
    // Process drop if we have all needed information
    if (draggedLayer && dropTarget && dropPosition) {
      reorderLayers(draggedLayer, dropTarget, dropPosition);
    }
    
    // Reset drag state
    setDraggedLayer(null);
    setDropTarget(null);
    setDropPosition(null);
    
    // Remove any drop indicators
    document.querySelectorAll('.drop-target-before, .drop-target-after, .drop-target-inside')
      .forEach(el => {
        el.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-inside');
      });
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, layerId: string, isGroup: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedLayer || draggedLayer === layerId) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    
    // Determine drop position based on mouse position
    const relativeY = mouseY - rect.top;
    
    // Clear previous indicators
    document.querySelectorAll('.drop-target-before, .drop-target-after, .drop-target-inside')
      .forEach(el => {
        el.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-inside');
      });
    
    let position: 'before' | 'after' | 'inside';
    if (isGroup && relativeY > rect.height / 3 && relativeY < rect.height * 2/3) {
      // Drop inside a group if we're in the middle third
      position = 'inside';
      e.currentTarget.classList.add('drop-target-inside');
    } else if (relativeY < rect.height / 2) {
      // Drop before if in the top half
      position = 'before';
      e.currentTarget.classList.add('drop-target-before');
    } else {
      // Drop after if in the bottom half
      position = 'after';
      e.currentTarget.classList.add('drop-target-after');
    }
    
    setDropTarget(layerId);
    setDropPosition(position);
    
    // Set the drop effect
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // The actual reordering logic is handled in dragEnd
  };

  // Filter layers based on search query
  const filterLayers = (
    layers: PsdLayerMetadata[] | null
  ): PsdLayerMetadata[] => {
    if (!layers) return [];
    return layers;
  };

  // Get layer type icon
  const getLayerTypeIcon = (layer: PsdLayerMetadata) => {
    if (layer.type === "group") {
      return <Folder className="h-4 w-4 text-amber-500" />;
    } else if (layer.textContent !== undefined) {
      return <Type className="h-4 w-4 text-blue-500" />;
    } else if (layer.bounds) {
      return <ImageIcon className="h-4 w-4 text-green-500" />;
    } else {
      return <Square className="h-4 w-4 text-gray-500" />;
    }
  };

  // Handle layer selection
  const handleLayerSelect = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    
    setSelectedLayers(prev => {
      const newSelection = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        // Get all layers in between last selected and current
        const allLayers = flattenLayers(Array.isArray(layerData) ? layerData : []);
        const lastSelected = Array.from(prev)[prev.size - 1];
        const lastIndex = allLayers.findIndex(l => l.id === lastSelected);
        const currentIndex = allLayers.findIndex(l => l.id === layerId);
        const [start, end] = [Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex)];
        
        for (let i = start; i <= end; i++) {
          newSelection.add(allLayers[i].id);
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle selection
        if (newSelection.has(layerId)) {
          newSelection.delete(layerId);
        } else {
          newSelection.add(layerId);
        }
      } else {
        // Single select/deselect
        if (newSelection.size === 1 && newSelection.has(layerId)) {
          // If only this layer is selected, deselect it
          newSelection.clear();
        } else {
          // Otherwise, select only this layer
          newSelection.clear();
          newSelection.add(layerId);
        }
      }
      return newSelection;
    });
  };

  // Get segmentation rules from the hook
  const {
    getSegmentationTypes,
    getValuesForType,
  } = useSegmentationRules();

  // Handle personalization click
  const handlePersonalizationClick = useCallback((e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    
    // Initialize personalization state for this layer if it doesn't exist
    if (!personalizationRules[layerId]) {
      setPersonalizationRules(prev => ({
        ...prev,
        [layerId]: {
          isPersonalized: false,
          rules: []
        }
      }));
    }
    
    setSelectedLayer(layerId);
    setPersonalizationModalOpen(true);
  }, [personalizationRules]);

  // Update the personalization modal content to use the new segmentation system
  const renderPersonalizationModal = () => {
    if (!selectedLayer) return null;

    const currentRules = personalizationRules[selectedLayer] || {
      isPersonalized: false,
      rules: []
    };

    const selectedLayerData = layersState?.find(layer => layer.id === selectedLayer);
    const layerName = selectedLayerData?.name || "Selected Layer";

    return (
      <Dialog open={personalizationModalOpen} onOpenChange={setPersonalizationModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Layer Personalization
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Personalizing: <span className="font-medium text-gray-700">{layerName}</span>
            </p>
          </DialogHeader>

          <div className="py-6">
            {/* Step 1: Enable/Disable Personalization */}
            <div className="space-y-6">
              <div className="flex items-start gap-4 pb-6 border-b">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-purple-600">1</span>
                </div>
                <div className="flex-grow">
                  <h3 className="text-sm font-semibold mb-2">Enable Personalization</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Turn on personalization to make this layer&apos;s content dynamic based on rules.
                  </p>
                  <Button
                    variant={currentRules.isPersonalized ? "default" : "outline"}
                    onClick={() => {
                      const updatedRules = {
                        ...personalizationRules,
                        [selectedLayer]: {
                          ...currentRules,
                          isPersonalized: !currentRules.isPersonalized
                        }
                      };
                      setPersonalizationRules(updatedRules);
                      localStorage.setItem("psd_personalization_rules", JSON.stringify(updatedRules));
                    }}
                    className={cn(
                      "transition-all",
                      currentRules.isPersonalized && "bg-purple-600 hover:bg-purple-700"
                    )}
                  >
                    {currentRules.isPersonalized ? (
                      <span className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        Personalization Enabled
                      </span>
                    ) : (
                      "Enable Personalization"
                    )}
                  </Button>
                </div>
              </div>

              {currentRules.isPersonalized && (
                <>
                  {/* Step 2: Add Rules */}
                  <div className="flex items-start gap-4 pb-6 border-b">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-purple-600">2</span>
                    </div>
                    <div className="flex-grow space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Add Personalization Rules</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          Define how this layer should change based on different conditions.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Rule Type</label>
                          <Select
                            value={selectedSegmentationType}
                            onValueChange={setSelectedSegmentationType}
                          >
                            <SelectTrigger className="bg-white w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="w-full">
                              {getSegmentationTypes().map((type) => (
                                <SelectItem key={type.id} value={type.id}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Rule Value</label>
                          <Select
                            value={selectedSegmentationValue}
                            onValueChange={setSelectedSegmentationValue}
                          >
                            <SelectTrigger className="bg-white w-full">
                              <SelectValue placeholder="Select value" />
                            </SelectTrigger>
                            <SelectContent className="w-full">
                              {getValuesForType(selectedSegmentationType).map((value) => (
                                <SelectItem key={value.id} value={value.id}>
                                  {value.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!selectedSegmentationType || !selectedSegmentationValue) return;

                          const currentRules = personalizationRules[selectedLayer] || {
                            isPersonalized: true,
                            rules: []
                          };

                          // Add new rule
                          const updatedRules = {
                            ...personalizationRules,
                            [selectedLayer]: {
                              ...currentRules,
                              rules: [
                                ...currentRules.rules,
                                {
                                  type: selectedSegmentationType,
                                  value: selectedSegmentationValue
                                }
                              ]
                            }
                          };

                          setPersonalizationRules(updatedRules);
                          localStorage.setItem("psd_personalization_rules", JSON.stringify(updatedRules));
                          
                          // Reset selections
                          setSelectedSegmentationValue('');
                        }}
                        className="w-full"
                        disabled={!selectedSegmentationType || !selectedSegmentationValue}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Rule
                      </Button>
                    </div>
                  </div>

                  {/* Step 3: Review Rules */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-purple-600">3</span>
                    </div>
                    <div className="flex-grow space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Active Rules</h3>
                        <p className="text-sm text-gray-500 mb-3">
                          Review and manage the personalization rules for this layer.
                        </p>
                      </div>

                      {currentRules.rules.length > 0 ? (
                        <div className="space-y-2">
                          {currentRules.rules.map((rule: PersonalizationRule, index: number) => {
                            const type = getSegmentationTypes().find(t => t.id === rule.type);
                            const value = getValuesForType(rule.type).find(v => v.id === rule.value);
                            
                            return (
                              <div key={index} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                                  <span className="text-sm">
                                    <span className="font-medium">{type?.label}:</span>
                                    {" "}
                                    {value?.label}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updatedRules = {
                                      ...personalizationRules,
                                      [selectedLayer]: {
                                        ...currentRules,
                                        rules: currentRules.rules.filter((_: PersonalizationRule, i: number) => i !== index)
                                      }
                                    };
                                    setPersonalizationRules(updatedRules);
                                    localStorage.setItem("psd_personalization_rules", JSON.stringify(updatedRules));
                                  }}
                                  className="text-gray-500 hover:text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                          
                          <Button
                            variant="ghost"
                            onClick={() => {
                              const updatedRules = {
                                ...personalizationRules,
                                [selectedLayer]: {
                                  isPersonalized: false,
                                  rules: []
                                }
                              };
                              setPersonalizationRules(updatedRules);
                              localStorage.setItem("psd_personalization_rules", JSON.stringify(updatedRules));
                            }}
                            className="text-red-500 hover:text-red-600 w-full mt-4"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear All Rules
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed">
                          <div className="text-gray-500">
                            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No rules added yet</p>
                            <p className="text-xs mt-1">Add a rule above to personalize this layer&apos;s content</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // Add new state for multi-select
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [bulkLabelModalOpen, setBulkLabelModalOpen] = useState(false);
  const [bulkPersonalizationModalOpen, setBulkPersonalizationModalOpen] = useState(false);

  // Bulk label application
  const applyBulkLabel = (labelId: string | null) => {
    setLabelState(prev => {
      const newState = {...prev};
      selectedLayers.forEach(layerId => {
        if (labelId === null) {
          delete newState[layerId];
        } else {
          newState[layerId] = labelId;
        }
      });
      return newState;
    });
    setBulkLabelModalOpen(false);
  };

  // Bulk personalization application
  const applyBulkPersonalization = (isPersonalized: boolean, rules: PersonalizationRule[]) => {
    setPersonalizationRules(prev => {
      const newState = {...prev};
      selectedLayers.forEach(layerId => {
        newState[layerId] = {
          isPersonalized,
          rules: [...rules]
        };
      });
      return newState;
    });
    setBulkPersonalizationModalOpen(false);
  };

  // Render bulk label modal
  const renderBulkLabelModal = () => (
    <Dialog open={bulkLabelModalOpen} onOpenChange={setBulkLabelModalOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Bulk Label Layers</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="text-sm text-gray-500 mb-4">
            Selected layers: {selectedLayers.size}
          </div>
          <div className="space-y-2">
            {LABEL_OPTIONS.map(option => (
              <Button
                key={option.id}
                variant="ghost"
                className="w-full justify-start text-sm py-1.5 px-2 h-auto"
                onClick={() => applyBulkLabel(option.id)}
              >
                <div className="flex items-center w-full">
                  <div className={cn("w-2 h-2 rounded-full mr-2", option.color.split(' ')[0])} />
                  <span>{option.name}</span>
                </div>
              </Button>
            ))}
            <Button
              variant="ghost"
              className="w-full justify-start text-sm py-1.5 px-2 h-auto text-red-500 hover:text-red-600"
              onClick={() => applyBulkLabel(null)}
            >
              Remove Labels
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Render bulk personalization modal
  const renderBulkPersonalizationModal = () => (
    <Dialog open={bulkPersonalizationModalOpen} onOpenChange={setBulkPersonalizationModalOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Bulk Personalize Layers
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Selected layers: <span className="font-medium text-gray-700">{selectedLayers.size}</span>
          </p>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-6">
            {/* Step 1: Enable Personalization */}
            <div className="flex items-start gap-4 pb-6 border-b">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-purple-600">1</span>
              </div>
              <div className="flex-grow">
                <h3 className="text-sm font-semibold mb-2">Configure Rule</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Define a personalization rule that will be applied to all selected layers.
                </p>

                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Rule Type</label>
                    <Select
                      value={selectedSegmentationType}
                      onValueChange={setSelectedSegmentationType}
                    >
                      <SelectTrigger className="bg-white w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="w-full">
                        {getSegmentationTypes().map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Rule Value</label>
                    <Select
                      value={selectedSegmentationValue}
                      onValueChange={setSelectedSegmentationValue}
                    >
                      <SelectTrigger className="bg-white w-full">
                        <SelectValue placeholder="Select value" />
                      </SelectTrigger>
                      <SelectContent className="w-full">
                        {getValuesForType(selectedSegmentationType).map((value) => (
                          <SelectItem key={value.id} value={value.id}>
                            {value.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Review and Apply */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-purple-600">2</span>
              </div>
              <div className="flex-grow space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Review and Apply</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Apply the personalization rule to all selected layers or clear existing rules.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      if (!selectedSegmentationType || !selectedSegmentationValue) return;
                      
                      const rules = [{
                        type: selectedSegmentationType,
                        value: selectedSegmentationValue
                      }];
                      
                      applyBulkPersonalization(true, rules);
                    }}
                    disabled={!selectedSegmentationType || !selectedSegmentationValue}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Apply to All Selected
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => applyBulkPersonalization(false, [])}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Rules
                  </Button>
                </div>

                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex gap-2 text-amber-800">
                    <div className="flex-shrink-0">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Bulk Operation Notice</p>
                      <p className="text-sm mt-1">
                        This action will modify personalization settings for all {selectedLayers.size} selected layers. 
                        Any existing rules on these layers will be replaced.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Add new state for layer links
  const [layerLinks, setLayerLinks] = useState<LayerLink[]>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSourceLayer, setLinkSourceLayer] = useState<string | null>(null);
  const [linkTargetLayer, setLinkTargetLayer] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<LayerLink['type']>('sync-visibility');
  const [linkDescription, setLinkDescription] = useState('');

  // Load layer links from storage
  useEffect(() => {
    const storedLinks = localStorage.getItem('psd_layer_links');
    if (storedLinks) {
      try {
        setLayerLinks(JSON.parse(storedLinks));
      } catch (error) {
        console.error('Error parsing layer links:', error);
      }
    }
  }, []);

  // Save layer links to storage when they change
  useEffect(() => {
    if (layerLinks.length > 0) {
      localStorage.setItem('psd_layer_links', JSON.stringify(layerLinks));
    } else {
      localStorage.removeItem('psd_layer_links');
    }

    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('psd_layer_links_change', {
      detail: { links: layerLinks }
    }));
  }, [layerLinks]);

  // Handle creating a new link
  const handleCreateLink = () => {
    if (!linkSourceLayer || !linkTargetLayer) return;

    const newLink: LayerLink = {
      sourceId: linkSourceLayer,
      targetId: linkTargetLayer,
      type: linkType,
      description: linkDescription || undefined
    };

    setLayerLinks(prev => [...prev, newLink]);
    setLinkModalOpen(false);
    resetLinkForm();
  };

  // Handle removing a link
  const handleRemoveLink = (sourceId: string, targetId: string) => {
    setLayerLinks(prev => 
      prev.filter(link => 
        !(link.sourceId === sourceId && link.targetId === targetId) &&
        !(link.sourceId === targetId && link.targetId === sourceId)
      )
    );
  };

  // Reset link form
  const resetLinkForm = () => {
    setLinkSourceLayer(null);
    setLinkTargetLayer(null);
    setLinkType('sync-visibility');
    setLinkDescription('');
  };

  // Get links for a layer
  const getLayerLinks = (layerId: string) => {
    return layerLinks.filter(link => 
      link.sourceId === layerId || link.targetId === layerId
    );
  };

  // Render link modal
  const renderLinkModal = () => (
    <Dialog open={linkModalOpen} onOpenChange={(open) => {
      if (!open) resetLinkForm();
      setLinkModalOpen(open);
    }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Link className="h-5 w-5 text-blue-500" />
            Link Layers
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Create synchronized behavior between layers
          </p>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-6">
            {/* Step 1: Select Layers */}
            <div className="flex items-start gap-4 pb-6 border-b">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-600">1</span>
              </div>
              <div className="flex-grow">
                <h3 className="text-sm font-semibold mb-2">Choose Layers to Link</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Select the source and target layers you want to connect.
                </p>

                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Source Layer</label>
                    <Select
                      value={linkSourceLayer || ''}
                      onValueChange={setLinkSourceLayer}
                    >
                      <SelectTrigger className="bg-white w-full">
                        <SelectValue placeholder="Select layer" />
                      </SelectTrigger>
                      <SelectContent className="w-full">
                        {layersState && flattenLayers(layersState).map(layer => (
                          <SelectItem key={layer.id} value={layer.id}>
                            {layer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Target Layer</label>
                    <Select
                      value={linkTargetLayer || ''}
                      onValueChange={setLinkTargetLayer}
                    >
                      <SelectTrigger className="bg-white w-full">
                        <SelectValue placeholder="Select layer" />
                      </SelectTrigger>
                      <SelectContent className="w-full">
                        {layersState && flattenLayers(layersState)
                          .filter(layer => layer.id !== linkSourceLayer)
                          .map(layer => (
                            <SelectItem key={layer.id} value={layer.id}>
                              {layer.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Configure Link */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-600">2</span>
              </div>
              <div className="flex-grow space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Configure Link Behavior</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Define how the linked layers should interact with each other.
                  </p>
                </div>

                <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Link Type</label>
                    <Select
                      value={linkType}
                      onValueChange={(value) => setLinkType(value as LayerLink['type'])}
                    >
                      <SelectTrigger className="bg-white w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-full">
                        <SelectItem value="sync-visibility">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <span>Sync Visibility</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="sync-position">
                          <div className="flex items-center gap-2">
                            <Move className="h-4 w-4" />
                            <span>Sync Position</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <Settings2 className="h-4 w-4" />
                            <span>Custom</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
                    <input
                      type="text"
                      value={linkDescription}
                      onChange={(e) => setLinkDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md bg-white"
                      placeholder="Enter link description"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleCreateLink}
                  disabled={!linkSourceLayer || !linkTargetLayer}
                  className="w-full"
                >
                  <Link className="h-4 w-4 mr-2" />
                  Create Link
                </Button>

                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex gap-2 text-blue-800">
                    <div className="flex-shrink-0">
                      <Info className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">About Layer Links</p>
                      <p className="text-sm mt-1">
                        Linked layers will automatically sync their behavior based on the selected link type. 
                        You can manage these links later from the layer tree.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Update layer node rendering to show links
  const renderLayerLinks = (layerId: string) => {
    const links = getLayerLinks(layerId);
    if (links.length === 0) return null;

    return (
      <div className="ml-8 mt-1 space-y-1">
        {links.map((link, index) => {
          const otherLayerId = link.sourceId === layerId ? link.targetId : link.sourceId;
          const otherLayer = layersState && flattenLayers(layersState).find(l => l.id === otherLayerId);
          
          return (
            <div key={index} className="flex items-center text-xs text-gray-500">
              <Link className="h-3 w-3 mr-1" />
              <span>Linked to {otherLayer?.name}</span>
              <span className="mx-1">•</span>
              <span>{link.type}</span>
              {link.description && (
                <>
                  <span className="mx-1">•</span>
                  <span>{link.description}</span>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 ml-1 p-0"
                onClick={() => handleRemoveLink(link.sourceId, link.targetId)}
              >
                <Link2Off className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  // Render layer tree nodes recursively
  const renderLayerNodes = (
    layers: PsdLayerMetadata[] | null,
    level = 0
  ) => {
    if (!layers || layers.length === 0) {
      return <div className="py-2 px-3 text-gray-400">No layers found</div>;
    }

    // Apply search filter
    const filteredLayers = filterLayers(layers);
    if (filteredLayers.length === 0) {
      return <div className="py-2 px-3 text-gray-400">No layers found</div>;
    }

    return filteredLayers.map((layer) => {
      const isGroup = layer.type === "group" && layer.children;
      const isExpanded = expandedState[layer.id] || false;
      const isVisible = visibilityState[layer.id] !== undefined 
        ? visibilityState[layer.id] 
        : layer.visible;
      const layerLabel = labelState[layer.id] || "";
      const hasChildren = isGroup && layer.children && layer.children.length > 0;
      const isSelected = selectedLayers.has(layer.id);
      
      // Find the label option if there's a label set
      const labelOption = LABEL_OPTIONS.find(option => option.id === layerLabel);

      return (
        <div key={layer.id}>
          <div
            ref={(el) => {
              if (el) layerRefsMap.current.set(layer.id, el);
            }}
            className={cn(
              "flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-gray-100",
              highlightedLayer === layer.id && "bg-blue-50",
              draggedLayer === layer.id && "opacity-50",
              isSelected && "bg-blue-100",
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleLayerSelect(e, layer.id);
                toggleExpanded(layer.id);
              }
            }}
            onMouseEnter={() => handleLayerHover(layer.id)}
            onMouseLeave={() => handleLayerHover(null)}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, layer.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, layer.id, Boolean(isGroup))}
            onDrop={handleDrop}
          >
            <div 
              className="flex-shrink-0 mr-1 p-1 cursor-pointer"
              onClick={(e) => handleLayerSelect(e, layer.id)}
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-blue-500" />
              ) : (
                <SquareIcon className="h-4 w-4 text-gray-400" />
              )}
            </div>

            <div 
              className="flex-shrink-0 mr-1 p-1 cursor-grab hover:bg-gray-200 rounded-sm"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3 w-3 text-gray-400" />
            </div>

            <div className="flex-shrink-0 mr-1 w-4">
              {hasChildren && (
                <>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </>
              )}
            </div>

            <div
              className="flex-shrink-0 mr-2"
              onClick={(e) => toggleVisibility(e, layer.id, Boolean(isGroup))}
            >
              {isVisible ? (
                <Eye className="h-4 w-4 text-gray-600" />
              ) : (
                <EyeOff className="h-4 w-4 text-gray-400" />
              )}
            </div>

            <div className="flex-shrink-0 mr-2">{getLayerTypeIcon(layer)}</div>

            <div className="flex-grow truncate">
              <span className="font-medium text-xs">{layer.name}</span>
              {labelOption ? (
                <span className={cn("ml-2 text-xs font-semibold px-1.5 py-0.5 rounded", labelOption.color)}>
                  {labelOption.name}
                </span>
              ) : predictions[layer.id] && (
                <div className="inline-flex items-center ml-2 gap-1">
                  <span className={cn(
                    "text-xs font-semibold px-1.5 py-0.5 rounded opacity-70",
                    LABEL_OPTIONS.find(opt => opt.id === predictions[layer.id].label)?.color
                  )}>
                    {LABEL_OPTIONS.find(opt => opt.id === predictions[layer.id].label)?.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Accept prediction
                      handleLabelChange(layer.id, predictions[layer.id].label);
                    }}
                  >
                    <Check className="h-3 w-3 text-green-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLabelPopoverOpen(layer.id);
                    }}
                  >
                    <X className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              )}
              {personalizationRules[layer.id]?.rules.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  <Users className="h-3 w-3 inline-block mr-1 text-purple-500" />
                  {personalizationRules[layer.id].rules.map((rule, index) => (
                    <span key={index} className="mr-2">
                      {rule.type}: <strong>{rule.value}</strong>
                      {index < personalizationRules[layer.id].rules.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <Popover open={labelPopoverOpen === layer.id} onOpenChange={(open) => setLabelPopoverOpen(open ? layer.id : null)}>
              <PopoverTrigger asChild>
                <div 
                  className="flex-shrink-0 ml-2 p-1 hover:bg-gray-200 rounded-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Tag className={cn(
                    "h-4 w-4", 
                    layerLabel ? "text-blue-500" : "text-gray-400"
                  )} />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="end">
                <div className="text-xs font-medium text-gray-500 mb-1 px-2 pt-1">
                  Assign Label
                </div>
                {LABEL_OPTIONS.map(option => (
                  <Button
                    key={option.id}
                    variant="ghost"
                    className="w-full justify-start text-sm py-1.5 px-2 h-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLabelChange(layer.id, layerLabel === option.id ? null : option.id);
                    }}
                  >
                    <div className="flex items-center w-full">
                      <div className={cn("w-2 h-2 rounded-full mr-2", option.color.split(' ')[0])} />
                      <span>{option.name}</span>
                      {layerLabel === option.id && (
                        <Check className="h-4 w-4 ml-auto" />
                      )}
                    </div>
                  </Button>
                ))}
                {layerLabel && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm py-1.5 px-2 h-auto text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLabelChange(layer.id, null);
                    }}
                  >
                    Remove Label
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            <div 
              className="flex-shrink-0 ml-2 p-1 hover:bg-gray-200 rounded-sm"
              onClick={(e) => handlePersonalizationClick(e, layer.id)}
            >
              <Users className={cn(
                "h-4 w-4",
                personalizationRules[layer.id]?.isPersonalized
                  ? personalizationRules[layer.id]?.rules.length
                    ? "text-purple-500"
                    : "text-amber-500"
                  : "text-gray-400"
              )} />
            </div>

            <div 
              className="flex-shrink-0 ml-2 p-1 hover:bg-gray-200 rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                setLinkSourceLayer(layer.id);
                setLinkModalOpen(true);
              }}
            >
              <Link className={cn(
                "h-4 w-4",
                getLayerLinks(layer.id).length > 0 ? "text-blue-500" : "text-gray-400"
              )} />
            </div>
          </div>

          {renderLayerLinks(layer.id)}

          {isGroup && isExpanded && layer.children && (
            <div className="layer-children">
              {renderLayerNodes(layer.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // Add useAutoAI hook with feedback
  const { 
    processLayers, 
    processing: aiProcessing, 
    error: aiError,
    loadTrainingData,
    predictLabel,
  } = useAutoAI();

  // State for AI predictions
  const [predictions, setPredictions] = useState<Record<string, { label: string; confidence: number }>>({});

  useEffect(() => {
    loadTrainingData();
  }, [loadTrainingData]);

  // Generate predictions when layers change
  useEffect(() => {
    if (!layersState) return;
    
    const allLayers = flattenLayers(Array.isArray(layersState) ? layersState : []);
    const newPredictions: Record<string, { label: string; confidence: number }> = {};
    
    allLayers.forEach(layer => {
      const prediction = predictLabel(layer.name);
      if (prediction) {
        newPredictions[layer.id] = prediction;
      }
    });
    
    setPredictions(newPredictions);
  }, [layersState, predictLabel]);

  // Add auto process function with feedback tracking
  const handleAutoProcess = useCallback(() => {
    if (!layersState) return;

    // Process layers with AI
    const results = processLayers(layersState, {
      labelConfidenceThreshold: 0.7
    });

    // Apply labels
    const newLabelState = { ...labelState };
    Object.entries(results).forEach(([layerId, result]) => {
      if (result.label) {
        newLabelState[layerId] = result.label;
      }
    });
    setLabelState(newLabelState);

    // Show success message
    window.dispatchEvent(new CustomEvent('psd_auto_process_complete', {
      detail: {
        labels: Object.keys(newLabelState).length
      }
    }));
  }, [layersState, processLayers, labelState]);

  // Handle manual label change
  const handleLabelChange = useCallback((layerId: string, newLabel: string | null) => {
    // First update the UI state
    setLabelState(prev => {
      const newState = {...prev};
      if (newLabel === null) {
        delete newState[layerId];
      } else {
        newState[layerId] = newLabel;
      }
      return newState;
    });
    setLabelPopoverOpen(null);

    // If there's a new label, save it as a training example
    if (newLabel && layersState) {
      const layer = flattenLayers(Array.isArray(layersState) ? layersState : []).find(l => l.id === layerId);
      if (layer) {
        // Show saving indicator
        window.dispatchEvent(new CustomEvent('psd_training_update', {
          detail: { status: 'saving' }
        }));

        // Save the new training example
        // Calculate confidence based on user interaction
        const confidence = 0.8;
        
        fetch('/api/ai-training/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{
            layerName: layer.name,
            correctLabel: newLabel,
            confidence
          }])
        }).then(() => {
          // Reload training data to include the new example
          loadTrainingData();
          
          // Show success message
          window.dispatchEvent(new CustomEvent('psd_training_update', {
            detail: { 
              status: 'success',
              message: `Added "${layer.name}" as training example for "${newLabel}"`
            }
          }));
        }).catch(error => {
          console.error('Error saving training data:', error);
          
          // Show error message
          window.dispatchEvent(new CustomEvent('psd_training_update', {
            detail: { 
              status: 'error',
              message: 'Failed to save training data'
            }
          }));
        });
      }
    } else if (newLabel === null && layersState) {
      // When a label is removed, remove it from training data
      const layer = flattenLayers(Array.isArray(layersState) ? layersState : []).find(l => l.id === layerId);
      if (layer) {
        fetch('/api/ai-training/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            layerName: layer.name,
            shouldRemove: false // Don't remove, just update history
          })
        }).then(() => {
          loadTrainingData();
        }).catch(error => {
          console.error('Error removing training data:', error);
        });
      }
    }
  }, [layersState, loadTrainingData]);

  if (!layerData) {
    return (
      <div className="p-4 border rounded-md bg-gray-50 text-center">
        No PSD structure available. Please upload a PSD file.
      </div>
    );
  }

  return (
    <div className="layer-tree border rounded-md overflow-hidden flex flex-col h-full">
      <StepsIndicator />
      <div className="p-2 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Layers</h3>
          <div className="flex gap-2">
            {selectedLayers.size > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkLabelModalOpen(true)}
                >
                  <Tag className="h-4 w-4 mr-1" />
                  Label ({selectedLayers.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkPersonalizationModalOpen(true)}
                >
                  <Users className="h-4 w-4 mr-1" />
                  Personalize ({selectedLayers.size})
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoProcess}
                disabled={aiProcessing || !layersState}
                className={cn(
                  "transition-all",
                  aiProcessing && "opacity-50 cursor-not-allowed"
                )}
              >
                <Wand2 className={cn(
                  "h-4 w-4 mr-1",
                  aiProcessing && "animate-spin"
                )} />
                {aiProcessing ? "Processing..." : "Auto Label"}
              </Button>
            )}
          </div>
        </div>
        {aiError && (
          <div className="mt-2 text-xs text-red-500">
            Error: {aiError}
          </div>
        )}
      </div>

      <style jsx global>{`
        .drop-target-before {
          border-top: 2px solid #3b82f6;
        }
        .drop-target-after {
          border-bottom: 2px solid #3b82f6;
        }
        .drop-target-inside {
          background-color: rgba(59, 130, 246, 0.1);
          box-shadow: inset 0 0 0 2px #3b82f6;
        }
      `}</style>

      <div className="overflow-y-auto flex-grow p-1">
        {layersState && renderLayerNodes(layersState)}
      </div>

      {renderBulkLabelModal()}
      {renderBulkPersonalizationModal()}
      {renderPersonalizationModal()}
      {renderLinkModal()}
    </div>
  );
} 