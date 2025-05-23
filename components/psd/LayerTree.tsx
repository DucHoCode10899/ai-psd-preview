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

interface LayerTreeProps {
  layers?: PsdLayerMetadata[];
  onLayerVisibilityChange?: (layerId: string, visible: boolean) => void;
  onLayerHover?: (layerId: string | null) => void;
  onLayerReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  layerVisibility?: Record<string, boolean>;
}

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

  // Create a memoized set layer label function to prevent re-renders
  const setLayerLabelMemo = useCallback((layerId: string, labelId: string | null) => {
    // Update label state
    setLabelState(prev => {
      const newState = {...prev};
      if (labelId === null) {
        // Remove label
        delete newState[layerId];
      } else {
        // Set label
        newState[layerId] = labelId;
      }
      return newState;
    });
    // Close the popover after selection
    setLabelPopoverOpen(null);
  }, []);

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

    return (
      <Dialog open={personalizationModalOpen} onOpenChange={setPersonalizationModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Layer Personalization</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
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
              >
                {currentRules.isPersonalized ? "Personalized" : "Not Personalized"}
              </Button>
            </div>

            {currentRules.isPersonalized && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <Select
                      value={selectedSegmentationType}
                      onValueChange={setSelectedSegmentationType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Value</label>
                    <Select
                      value={selectedSegmentationValue}
                      onValueChange={setSelectedSegmentationValue}
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
                </div>

                <div className="flex justify-between">
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
                  >
                    Add Rule
                  </Button>

                  <Button
                    variant="destructive"
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
                  >
                    Clear Rules
                  </Button>
                </div>

                {/* Display current rules */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Current Rules:</label>
                  <div className="space-y-1">
                    {currentRules.rules.map((rule, index) => {
                      const type = getSegmentationTypes().find(t => t.id === rule.type);
                      const value = getValuesForType(rule.type).find(v => v.id === rule.value);
                      
                      return (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                          <span>
                            {type?.label}: {value?.label}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updatedRules = {
                                ...personalizationRules,
                                [selectedLayer]: {
                                  ...currentRules,
                                  rules: currentRules.rules.filter((_, i) => i !== index)
                                }
                              };
                              setPersonalizationRules(updatedRules);
                              localStorage.setItem("psd_personalization_rules", JSON.stringify(updatedRules));
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => toggleExpanded(layer.id)}
            onMouseEnter={() => handleLayerHover(layer.id)}
            onMouseLeave={() => handleLayerHover(null)}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, layer.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, layer.id, Boolean(isGroup))}
            onDrop={handleDrop}
          >
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
              {labelOption && (
                <span className={cn("ml-2 text-xs font-semibold px-1.5 py-0.5 rounded", labelOption.color)}>
                  {labelOption.name}
                </span>
              )}
              {personalizationRules[layer.id]?.rules.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
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
                      setLayerLabelMemo(layer.id, layerLabel === option.id ? null : option.id);
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
                      setLayerLabelMemo(layer.id, null);
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
          </div>

          {isGroup && isExpanded && layer.children && (
            <div className="layer-children">
              {renderLayerNodes(layer.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (!layerData) {
    return (
      <div className="p-4 border rounded-md bg-gray-50 text-center">
        No PSD structure available. Please upload a PSD file.
      </div>
    );
  }

  return (
    <div className="layer-tree border rounded-md overflow-hidden flex flex-col h-full">
      <div className="p-2 border-b bg-gray-50">
        <h3 className="font-medium text-sm">Layers</h3>
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

      {renderPersonalizationModal()}
    </div>
  );
} 