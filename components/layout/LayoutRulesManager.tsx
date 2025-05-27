"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { toast } from 'sonner';
import { Canvas, Rect, Text } from 'fabric';
import { Undo2, Redo2, Plus, Pencil, Trash2, RefreshCw, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// Types for layout rules
interface LayoutOption {
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
    renderOrder?: string[]; // Add renderOrder to store label order
  };
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

// Position options for labels
const POSITION_OPTIONS = [
  // Standard positions
  "center",
  "top-left",
  "top-center",
  "top-right",
  "middle-top-center",
  "middle-bottom-center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "left-center",
  "right-center",
  
  // Percentage-based positions from the top
  "top-center-10",  // 10% from the top
  "top-center-20",  // 20% from the top
  "top-center-30",  // 30% from the top
  "top-center-40",  // 40% from the top
  
  // Percentage-based positions from the left side
  "left-center-10",  // 10% from the left
  "left-center-20",  // 20% from the left
  "left-center-30",  // 30% from the left
  "left-center-40",  // 40% from the left
  
  // Percentage-based positions from the right side
  "right-center-10",  // 10% from the right
  "right-center-20",  // 20% from the right
  "right-center-30",  // 30% from the right
  "right-center-40",  // 40% from the right
  
  // Percentage-based positions from the bottom
  "bottom-center-10",  // 10% from the bottom
  "bottom-center-20",  // 20% from the bottom
  "bottom-center-30",  // 30% from the bottom
  "bottom-center-40"   // 40% from the bottom
];

// Label types that can be positioned
const LABEL_TYPES = [
  "background",
  "logo",
  "main-subject",
  "domain",
  "product-name",
  "sub-content-1",
  "sub-content-2",
  "cta",
  "disclaimer"
];

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

export function LayoutRulesManager() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [labelTypes, setLabelTypes] = useState<string[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  
  // New option creation state
  const [isNewOptionDialogOpen, setIsNewOptionDialogOpen] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const [isCreatingOption, setIsCreatingOption] = useState(false);
  
  // Edit option name state
  const [isEditOptionDialogOpen, setIsEditOptionDialogOpen] = useState(false);
  const [editOptionName, setEditOptionName] = useState('');
  const [isEditingOption, setIsEditingOption] = useState(false);
  
  // Delete option state
  const [isDeleteOptionDialogOpen, setIsDeleteOptionDialogOpen] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState<string | null>(null);
  
  // Clone option state
  const [isCloneOptionDialogOpen, setIsCloneOptionDialogOpen] = useState(false);
  const [cloneTargetChannelId, setCloneTargetChannelId] = useState<string | null>(null);
  const [cloneTargetAspectRatio, setCloneTargetAspectRatio] = useState<string | null>(null);
  const [cloneOptionName, setCloneOptionName] = useState('');
  const [isCloningOption, setIsCloningOption] = useState(false);
  
  // Add history state
  const [history, setHistory] = useState<Channel[][]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);

  // Drag and drop state
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  const [dragOverLabel, setDragOverLabel] = useState<string | null>(null);

  // Function to add state to history
  const addToHistory = (newChannels: Channel[]) => {
    const newHistory = history.slice(0, currentHistoryIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newChannels)));
    setHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
  };

  // Undo function
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setChannels(JSON.parse(JSON.stringify(history[newIndex])));
      setIsDirty(true);
    }
  };

  // Redo function
  const handleRedo = () => {
    if (currentHistoryIndex < history.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setChannels(JSON.parse(JSON.stringify(history[newIndex])));
      setIsDirty(true);
    }
  };

  // Add fetchLabels function
  const fetchLabels = async () => {
    try {
      setIsLoadingLabels(true);
      const response = await fetch('/api/labels');
      const data = await response.json();
      if (response.ok) {
        setLabelTypes(data.labels);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Error fetching labels:', err);
      toast.error('Failed to fetch labels');
    } finally {
      setIsLoadingLabels(false);
    }
  };

  // Modify useEffect to fetch labels
  useEffect(() => {
    const loadData = async () => {
      try {
        const [layoutResponse, labelsResponse] = await Promise.all([
          fetch('/api/layout-rules'),
          fetch('/api/labels')
        ]);
        
        const layoutData = await layoutResponse.json();
        const labelsData = await labelsResponse.json();
        
        setChannels(layoutData.channels);
        setLabelTypes(labelsData.labels);
        
        // Initialize history with initial state
        setHistory([JSON.parse(JSON.stringify(layoutData.channels))]);
        setCurrentHistoryIndex(0);
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      }
    };
    
    loadData();
  }, []);

  // Get current channel, layout and option
  const currentChannel = channels.find(c => c.id === selectedChannelId);
  const currentLayout = currentChannel?.layouts.find(l => l.aspectRatio === selectedAspectRatio);
  const currentOption = currentLayout?.options.find(opt => opt.name === selectedOption);
  
  // Get current label settings
  const currentLabelSettings = currentOption && selectedLabel ? {
    visible: currentOption.rules.visibility[selectedLabel],
    position: currentOption.rules.positioning[selectedLabel]?.position,
    maxWidthPercent: currentOption.rules.positioning[selectedLabel]?.maxWidthPercent * 100,
    maxHeightPercent: currentOption.rules.positioning[selectedLabel]?.maxHeightPercent * 100
  } : null;

  // Handle channel selection
  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId);
    setSelectedAspectRatio(null);
    setSelectedOption(null);
    setSelectedLabel(null);
  };

  // Handle aspect ratio selection
  const handleAspectRatioSelect = (aspectRatio: string) => {
    setSelectedAspectRatio(aspectRatio);
    setSelectedOption(null);
    setSelectedLabel(null);
  };

  // Handle option selection
  const handleOptionSelect = (optionName: string) => {
    setSelectedOption(optionName);
    setSelectedLabel(null);
  };

  // Handle label selection
  const handleLabelSelect = (labelName: string) => {
    setSelectedLabel(labelName);
  };

  // Handle visibility toggle
  const handleVisibilityToggle = (checked: boolean) => {
    if (!currentChannel || !currentLayout || !currentOption || !selectedLabel) return;
    
    const updatedChannels = channels.map(channel => {
      if (channel.id === selectedChannelId) {
        return {
          ...channel,
          layouts: channel.layouts.map(layout => {
            if (layout.aspectRatio === selectedAspectRatio) {
              return {
                ...layout,
                options: layout.options.map(option => {
                  if (option.name === selectedOption) {
                    return {
                      ...option,
                      rules: {
                        ...option.rules,
                        visibility: {
                          ...option.rules.visibility,
                          [selectedLabel]: checked
                        }
                      }
                    };
                  }
                  return option;
                })
              };
            }
            return layout;
          })
        };
      }
      return channel;
    });
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
  };

  // Handle position change
  const handlePositionChange = (position: string) => {
    if (!currentChannel || !currentLayout || !currentOption || !selectedLabel) return;
    
    const updatedChannels = channels.map(channel => {
      if (channel.id === selectedChannelId) {
        return {
          ...channel,
          layouts: channel.layouts.map(layout => {
            if (layout.aspectRatio === selectedAspectRatio) {
              return {
                ...layout,
                options: layout.options.map(option => {
                  if (option.name === selectedOption) {
                    return {
                      ...option,
                      rules: {
                        ...option.rules,
                        positioning: {
                          ...option.rules.positioning,
                          [selectedLabel]: {
                            ...option.rules.positioning[selectedLabel],
                            position
                          }
                        }
                      }
                    };
                  }
                  return option;
                })
              };
            }
            return layout;
          })
        };
      }
      return channel;
    });
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
  };

  // Handle size constraints change
  const handleSizeChange = (type: 'width' | 'height', value: number) => {
    if (!currentChannel || !currentLayout || !currentOption || !selectedLabel) return;
    
    const updatedChannels = channels.map(channel => {
      if (channel.id === selectedChannelId) {
        return {
          ...channel,
          layouts: channel.layouts.map(layout => {
            if (layout.aspectRatio === selectedAspectRatio) {
              return {
                ...layout,
                options: layout.options.map(option => {
                  if (option.name === selectedOption) {
                    return {
                      ...option,
                      rules: {
                        ...option.rules,
                        positioning: {
                          ...option.rules.positioning,
                          [selectedLabel]: {
                            ...option.rules.positioning[selectedLabel],
                            [type === 'width' ? 'maxWidthPercent' : 'maxHeightPercent']: value / 100
                          }
                        }
                      }
                    };
                  }
                  return option;
                })
              };
            }
            return layout;
          })
        };
      }
      return channel;
    });
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
  };

  // Create a new option
  const handleCreateOption = () => {
    if (!selectedChannelId || !selectedAspectRatio || !newOptionName.trim() || isCreatingOption) return;
    
    setIsCreatingOption(true);
    
    // Find the current channel and layout
    const channelIndex = channels.findIndex(c => c.id === selectedChannelId);
    if (channelIndex === -1) {
      setIsCreatingOption(false);
      return;
    }
    
    const layoutIndex = channels[channelIndex].layouts.findIndex(l => l.aspectRatio === selectedAspectRatio);
    if (layoutIndex === -1) {
      setIsCreatingOption(false);
      return;
    }
    
    // Check if option name already exists
    if (channels[channelIndex].layouts[layoutIndex].options.some(o => o.name === newOptionName.trim())) {
      toast.error('An option with this name already exists');
      setIsCreatingOption(false);
      return;
    }
    
    // Create default rules
    const defaultVisibility: Record<string, boolean> = {};
    const defaultPositioning: Record<string, {
      position: string;
      maxWidthPercent: number;
      maxHeightPercent: number;
    }> = {};
    
    LABEL_TYPES.forEach(label => {
      defaultVisibility[label] = true;
      defaultPositioning[label] = {
        position: "center",
        maxWidthPercent: 0.5,
        maxHeightPercent: 0.5
      };
    });
    
    // Create new option
    const newOption: LayoutOption = {
      name: newOptionName.trim(),
      rules: {
        visibility: defaultVisibility,
        positioning: defaultPositioning
      }
    };
    
    // Add to channels
    const updatedChannels = [...channels];
    updatedChannels[channelIndex].layouts[layoutIndex].options.push(newOption);
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
    
    // Select the new option
    setSelectedOption(newOption.name);
    
    // Close dialog and reset state
    setIsNewOptionDialogOpen(false);
    setNewOptionName('');
    setIsCreatingOption(false);
    
    toast.success('New option created successfully');
  };

  // Save changes
  const handleSave = async () => {
    try {
      const response = await fetch('/api/layout-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channels })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      setIsDirty(false);
      toast.success('Layout rules saved successfully');
    } catch (error) {
      console.error('Error saving layout rules:', error);
      toast.error('Failed to save layout rules');
    }
  };

  // Initialize canvas when component mounts
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Get the container dimensions
    const container = canvasRef.current.parentElement;
    if (!container) return;
    
    fabricCanvasRef.current = new Canvas(canvasRef.current, {
      backgroundColor: '#f9f9f9',
      width: container.clientWidth,
      height: container.clientHeight,
      selection: false
    });
    
    // Handle window resize
    const handleResize = () => {
      if (!fabricCanvasRef.current || !container) return;
      fabricCanvasRef.current.setDimensions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, []);

  // Function to get current render order
  const getCurrentRenderOrder = () => {
    if (!currentOption) return labelTypes;
    return currentOption.rules.renderOrder || labelTypes;
  };

  // Function to update render order
  const handleUpdateRenderOrder = (newOrder: string[]) => {
    if (!selectedChannelId || !selectedAspectRatio || !selectedOption) return;

    const updatedChannels = channels.map(channel => {
      if (channel.id === selectedChannelId) {
        return {
          ...channel,
          layouts: channel.layouts.map(layout => {
            if (layout.aspectRatio === selectedAspectRatio) {
              return {
                ...layout,
                options: layout.options.map(option => {
                  if (option.name === selectedOption) {
                    return {
                      ...option,
                      rules: {
                        ...option.rules,
                        renderOrder: newOrder
                      }
                    };
                  }
                  return option;
                })
              };
            }
            return layout;
          })
        };
      }
      return channel;
    });

    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
  };

  // Drag and drop handlers
  const handleDragStart = (label: string) => {
    setDraggedLabel(label);
  };

  const handleDragOver = (e: React.DragEvent, label: string) => {
    e.preventDefault();
    if (draggedLabel === label) return;
    setDragOverLabel(label);
  };

  const handleDrop = (targetLabel: string) => {
    if (!draggedLabel || draggedLabel === targetLabel) return;

    const currentOrder = getCurrentRenderOrder();
    const newOrder = [...currentOrder];
    
    const draggedIndex = newOrder.indexOf(draggedLabel);
    const targetIndex = newOrder.indexOf(targetLabel);
    
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedLabel);
    
    handleUpdateRenderOrder(newOrder);
    setDraggedLabel(null);
    setDragOverLabel(null);
  };

  // Update canvas useEffect to respect render order
  useEffect(() => {
    if (!fabricCanvasRef.current || !currentLayout || !currentOption) return;

    const canvas = fabricCanvasRef.current;
    canvas.clear();

    // Calculate scale to fit canvas
    const scale = Math.min(
      canvas.width! / currentLayout.width,
      canvas.height! / currentLayout.height
    );

    // Add layout background
    const background = new Rect({
      left: 0,
      top: 0,
      width: currentLayout.width * scale,
      height: currentLayout.height * scale,
      fill: 'white',
      stroke: '#cccccc',
      strokeWidth: 1,
      selectable: false
    });
    canvas.add(background);

    // Get render order and add labels in that order
    const renderOrder = getCurrentRenderOrder();
    renderOrder.forEach(label => {
      const settings = currentOption.rules.positioning[label];
      if (!settings || !currentOption.rules.visibility[label]) return;

      const maxWidth = settings.maxWidthPercent * currentLayout.width;
      const maxHeight = settings.maxHeightPercent * currentLayout.height;

      // Calculate position based on settings.position
      let left = 0;
      let top = 0;
      
      switch (settings.position) {
        case 'center':
          left = (currentLayout.width - maxWidth) / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
          
        // Top positions
        case 'top-left':
          left = 0;
          top = 0;
          break;
        case 'top-center':
          left = (currentLayout.width - maxWidth) / 2;
          top = 0;
          break;
        case 'top-right':
          left = currentLayout.width - maxWidth;
          top = 0;
          break;
          
        // Middle positions
        case 'middle-top-center':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.25 - maxHeight / 2;
          break;
        case 'middle-bottom-center':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.75 - maxHeight / 2;
          break;
          
        // Bottom positions
        case 'bottom-left':
          left = 0;
          top = currentLayout.height - maxHeight;
          break;
        case 'bottom-center':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height - maxHeight;
          break;
        case 'bottom-right':
          left = currentLayout.width - maxWidth;
          top = currentLayout.height - maxHeight;
          break;
          
        // Side positions
        case 'left-center':
          left = 0;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'right-center':
          left = currentLayout.width - maxWidth;
          top = (currentLayout.height - maxHeight) / 2;
          break;
          
        // New percentage-based positions from top
        case 'top-center-10':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.1 - maxHeight / 2;
          break;
        case 'top-center-20':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.2 - maxHeight / 2;
          break;
        case 'top-center-30':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.3 - maxHeight / 2;
          break;
        case 'top-center-40':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.4 - maxHeight / 2;
          break;
          
        // New percentage-based positions from left
        case 'left-center-10':
          left = currentLayout.width * 0.1 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'left-center-20':
          left = currentLayout.width * 0.2 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'left-center-30':
          left = currentLayout.width * 0.3 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'left-center-40':
          left = currentLayout.width * 0.4 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
          
        // New percentage-based positions from right
        case 'right-center-10':
          left = currentLayout.width * 0.9 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'right-center-20':
          left = currentLayout.width * 0.8 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'right-center-30':
          left = currentLayout.width * 0.7 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
        case 'right-center-40':
          left = currentLayout.width * 0.6 - maxWidth / 2;
          top = (currentLayout.height - maxHeight) / 2;
          break;
          
        // New percentage-based positions from bottom
        case 'bottom-center-10':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.9 - maxHeight / 2;
          break;
        case 'bottom-center-20':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.8 - maxHeight / 2;
          break;
        case 'bottom-center-30':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.7 - maxHeight / 2;
          break;
        case 'bottom-center-40':
          left = (currentLayout.width - maxWidth) / 2;
          top = currentLayout.height * 0.6 - maxHeight / 2;
          break;
      }
      
      // Create rectangle for label
      const rect = new Rect({
        left: left * scale,
        top: top * scale,
        width: maxWidth * scale,
        height: maxHeight * scale,
        fill: getLabelColor(label),
        stroke: selectedLabel === label ? '#3b82f6' : 'transparent',
        strokeWidth: 2,
        selectable: false,
        hoverCursor: 'pointer'
      });
      
      // Add label text
      const text = new Text(label, {
        left: (left + maxWidth/2) * scale,
        top: (top + maxHeight/2) * scale,
        fontSize: 12 * scale,
        fill: 'white',
        fontFamily: 'sans-serif',
        originX: 'center',
        originY: 'center',
        selectable: false
      });
      
      // Add click handler
      rect.on('mousedown', () => {
        handleLabelSelect(label);
      });
      
      canvas.add(rect);
      canvas.add(text);
    });
    
    canvas.renderAll();
  }, [currentLayout, currentOption, selectedLabel]);

  // Edit option name
  const handleEditOption = () => {
    if (!selectedOption) return;
    setEditOptionName(selectedOption);
    setIsEditOptionDialogOpen(true);
  };
  
  // Save edited option name
  const handleSaveOptionName = async () => {
    if (!selectedChannelId || !selectedAspectRatio || !selectedOption || !editOptionName.trim() || isEditingOption) return;
    
    setIsEditingOption(true);
    
    // Find the current channel and layout
    const channelIndex = channels.findIndex(c => c.id === selectedChannelId);
    if (channelIndex === -1) {
      setIsEditingOption(false);
      return;
    }
    
    const layoutIndex = channels[channelIndex].layouts.findIndex(l => l.aspectRatio === selectedAspectRatio);
    if (layoutIndex === -1) {
      setIsEditingOption(false);
      return;
    }
    
    // Check if new name already exists (but not when it's the same as current name)
    if (editOptionName !== selectedOption && 
        channels[channelIndex].layouts[layoutIndex].options.some(o => o.name === editOptionName.trim())) {
      toast.error('An option with this name already exists');
      setIsEditingOption(false);
      return;
    }
    
    // Update the option name
    const updatedChannels = [...channels];
    const optionIndex = updatedChannels[channelIndex].layouts[layoutIndex].options.findIndex(o => o.name === selectedOption);
    
    if (optionIndex !== -1) {
      updatedChannels[channelIndex].layouts[layoutIndex].options[optionIndex].name = editOptionName.trim();
      
      setChannels(updatedChannels);
      addToHistory(updatedChannels);
      setIsDirty(true);
      
      // Save changes to the server immediately
      try {
        const response = await fetch('/api/layout-rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ channels: updatedChannels })
        });
        
        if (!response.ok) throw new Error('Failed to save');
        
        setIsDirty(false);
        
        // Update selected option
        setSelectedOption(editOptionName.trim());
        
        // Close dialog and reset state
        setIsEditOptionDialogOpen(false);
        setEditOptionName('');
        setIsEditingOption(false);
        
        toast.success('Option name updated and saved successfully');
      } catch (error) {
        console.error('Error saving layout rules:', error);
        toast.error('Failed to save layout rules');
        setIsEditingOption(false);
      }
    } else {
      setIsEditingOption(false);
    }
  };

  // Delete option
  const handleShowDeleteDialog = () => {
    if (!selectedOption) return;
    setOptionToDelete(selectedOption);
    setIsDeleteOptionDialogOpen(true);
  };
  
  const handleDeleteOption = async () => {
    if (!selectedChannelId || !selectedAspectRatio || !optionToDelete) return;
    
    // Find the current channel and layout
    const channelIndex = channels.findIndex(c => c.id === selectedChannelId);
    if (channelIndex === -1) return;
    
    const layoutIndex = channels[channelIndex].layouts.findIndex(l => l.aspectRatio === selectedAspectRatio);
    if (layoutIndex === -1) return;
    
    // Make sure we have more than one option (prevent deleting the last option)
    if (channels[channelIndex].layouts[layoutIndex].options.length <= 1) {
      toast.error('Cannot delete the last option for this aspect ratio');
      return;
    }
    
    // Remove the option
    const updatedChannels = [...channels];
    updatedChannels[channelIndex].layouts[layoutIndex].options = updatedChannels[channelIndex].layouts[layoutIndex].options.filter(
      o => o.name !== optionToDelete
    );
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
    
    // Save changes to the server immediately
    try {
      const response = await fetch('/api/layout-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channels: updatedChannels })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      setIsDirty(false);
      
      // Reset selection if we deleted the selected option
      if (selectedOption === optionToDelete) {
        setSelectedOption(null);
        setSelectedLabel(null);
      }
      
      // Close dialog
      setIsDeleteOptionDialogOpen(false);
      setOptionToDelete(null);
      
      toast.success('Option deleted and saved successfully');
    } catch (error) {
      console.error('Error saving layout rules:', error);
      toast.error('Failed to save layout rules');
    }
  };

  // Get target channel for cloning
const cloneTargetChannel = channels.find(c => c.id === cloneTargetChannelId);

  // Handle cloning an option to a different channel
  const handleCloneOption = async () => {
    if (!selectedChannelId || !selectedAspectRatio || !selectedOption || 
        !cloneTargetChannelId || !cloneTargetAspectRatio || !cloneOptionName.trim() || isCloningOption) {
      return;
    }
    
    setIsCloningOption(true);
    
    // Get the source option
    const sourceChannel = channels.find(c => c.id === selectedChannelId);
    const sourceLayout = sourceChannel?.layouts.find(l => l.aspectRatio === selectedAspectRatio);
    const sourceOption = sourceLayout?.options.find(opt => opt.name === selectedOption);
    
    if (!sourceChannel || !sourceLayout || !sourceOption) {
      setIsCloningOption(false);
      toast.error('Source option not found');
      return;
    }
    
    // Find the target channel and layout
    const targetChannelIndex = channels.findIndex(c => c.id === cloneTargetChannelId);
    if (targetChannelIndex === -1) {
      setIsCloningOption(false);
      toast.error('Target channel not found');
      return;
    }
    
    const targetLayoutIndex = channels[targetChannelIndex].layouts.findIndex(l => l.aspectRatio === cloneTargetAspectRatio);
    if (targetLayoutIndex === -1) {
      setIsCloningOption(false);
      toast.error('Target layout not found');
      return;
    }
    
    // Check if option name already exists in target
    if (channels[targetChannelIndex].layouts[targetLayoutIndex].options.some(o => o.name === cloneOptionName.trim())) {
      toast.error('An option with this name already exists in the target layout');
      setIsCloningOption(false);
      return;
    }
    
    // Clone the option
    const clonedOption: LayoutOption = {
      name: cloneOptionName.trim(),
      rules: JSON.parse(JSON.stringify(sourceOption.rules)) // Deep copy the rules
    };
    
    // Add to target channel
    const updatedChannels = [...channels];
    updatedChannels[targetChannelIndex].layouts[targetLayoutIndex].options.push(clonedOption);
    
    setChannels(updatedChannels);
    addToHistory(updatedChannels);
    setIsDirty(true);
    
    // Close dialog and reset state
    setIsCloneOptionDialogOpen(false);
    setCloneTargetChannelId(null);
    setCloneTargetAspectRatio(null);
    setCloneOptionName('');
    setIsCloningOption(false);
    
    toast.success('Option cloned successfully');
  };

  // Initialize target channel with current channel when opening clone dialog
  const handleOpenCloneDialog = () => {
    if (!selectedOption) return;
    
    setCloneTargetChannelId(selectedChannelId);
    setCloneTargetAspectRatio(null);
    setCloneOptionName(`${selectedOption} (Clone)`);
    setIsCloneOptionDialogOpen(true);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-2xl font-bold">Layout Rules Manager</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleUndo}
            disabled={currentHistoryIndex <= 0}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRedo}
            disabled={currentHistoryIndex >= history.length - 1}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isDirty}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Controls */}
        <div className="w-[400px] flex flex-col border-r overflow-y-auto">
          {/* Channel Selection */}
          <div className="p-4 border-b">
            <Label className="mb-2 block">Channel</Label>
            <Select value={selectedChannelId || ''} onValueChange={handleChannelSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                {channels.map(channel => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Aspect Ratio Selection */}
          {selectedChannelId && (
            <div className="p-4 border-b">
              <Label className="mb-2 block">Aspect Ratio</Label>
              <Select value={selectedAspectRatio || ''} onValueChange={handleAspectRatioSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select aspect ratio" />
                </SelectTrigger>
                <SelectContent>
                  {currentChannel?.layouts.map(layout => (
                    <SelectItem key={layout.aspectRatio} value={layout.aspectRatio}>
                      {layout.aspectRatio} ({layout.width}×{layout.height})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Option Selection */}
          {selectedChannelId && selectedAspectRatio && (
            <div className="p-4 border-b">
              <div className="flex justify-between items-center mb-2">
                <Label>Layout Library</Label>
                <Dialog open={isNewOptionDialogOpen} onOpenChange={setIsNewOptionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      <Plus className="h-4 w-4 mr-1" />
                      New Layout
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Layout</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="option-name" className="mb-2 block">Layout Name</Label>
                      <Input 
                        id="option-name" 
                        value={newOptionName} 
                        onChange={(e) => setNewOptionName(e.target.value)}
                        placeholder={`e.g., ${currentChannel?.name} ${currentLayout?.aspectRatio} (Custom)`}
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsNewOptionDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateOption}
                        disabled={!newOptionName.trim() || isCreatingOption}
                      >
                        {isCreatingOption ? 'Creating...' : 'Create Layout'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-3">
                <Select value={selectedOption || ''} onValueChange={handleOptionSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select layout" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentLayout?.options.map(option => (
                      <SelectItem key={option.name} value={option.name}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedOption && (
                  <div className="flex gap-2">
                    {/* Edit option name dialog */}
                    <Dialog open={isEditOptionDialogOpen} onOpenChange={setIsEditOptionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={handleEditOption}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit Name
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Layout Name</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <Label htmlFor="edit-option-name" className="mb-2 block">Layout Name</Label>
                          <Input 
                            id="edit-option-name" 
                            value={editOptionName} 
                            onChange={(e) => setEditOptionName(e.target.value)}
                            placeholder={`e.g., ${currentChannel?.name} ${currentLayout?.aspectRatio} (Custom)`}
                          />
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsEditOptionDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveOptionName}
                            disabled={!editOptionName.trim() || isEditingOption}
                          >
                            {isEditingOption ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    
                    {/* Clone option dialog */}
                    <Dialog open={isCloneOptionDialogOpen} onOpenChange={setIsCloneOptionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1"
                          onClick={handleOpenCloneDialog}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Clone
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Clone Layout</DialogTitle>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="clone-target-channel">Channel</Label>
                            <Select 
                              value={cloneTargetChannelId || ''} 
                              onValueChange={(value) => {
                                setCloneTargetChannelId(value);
                                setCloneTargetAspectRatio(null);
                              }}
                            >
                              <SelectTrigger id="clone-target-channel">
                                <SelectValue placeholder="Select target channel" />
                              </SelectTrigger>
                              <SelectContent>
                                {channels.map(channel => (
                                  <SelectItem key={channel.id} value={channel.id}>
                                    {channel.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {cloneTargetChannelId && (
                            <div className="space-y-2">
                              <Label htmlFor="clone-target-ratio">Aspect Ratio</Label>
                              <Select 
                                value={cloneTargetAspectRatio || ''} 
                                onValueChange={setCloneTargetAspectRatio}
                              >
                                <SelectTrigger id="clone-target-ratio">
                                  <SelectValue placeholder="Select target aspect ratio" />
                                </SelectTrigger>
                                <SelectContent>
                                  {cloneTargetChannel?.layouts.map(layout => (
                                    <SelectItem key={layout.aspectRatio} value={layout.aspectRatio}>
                                      {layout.aspectRatio} ({layout.width}×{layout.height})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          <div className="space-y-2">
                            <Label htmlFor="clone-option-name">New Layout Name</Label>
                            <Input 
                              id="clone-option-name" 
                              value={cloneOptionName} 
                              onChange={(e) => setCloneOptionName(e.target.value)}
                              placeholder="Enter layout name for clone"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsCloneOptionDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleCloneOption}
                            disabled={!cloneTargetChannelId || !cloneTargetAspectRatio || !cloneOptionName.trim() || isCloningOption}
                          >
                            {isCloningOption ? 'Cloning...' : 'Clone Layout'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    
                    {/* Delete option dialog */}
                    <AlertDialog open={isDeleteOptionDialogOpen} onOpenChange={setIsDeleteOptionDialogOpen}>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1"
                        onClick={handleShowDeleteDialog}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Layout</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the layout &quot;<span className="font-bold">{optionToDelete}</span>&quot;? 
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setIsDeleteOptionDialogOpen(false)}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteOption}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Label Selection */}
          {selectedChannelId && selectedAspectRatio && selectedOption && (
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <Label>Label</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchLabels}
                  disabled={isLoadingLabels}
                  className="h-8 px-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingLabels ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[...getCurrentRenderOrder()].reverse().map(label => (
                  <Button
                    key={label}
                    variant={selectedLabel === label ? "default" : "outline"}
                    onClick={() => handleLabelSelect(label)}
                    className={`justify-start h-auto py-2 ${dragOverLabel === label ? 'border-blue-500' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(label)}
                    onDragOver={(e) => handleDragOver(e, label)}
                    onDrop={() => handleDrop(label)}
                    onDragEnd={() => {
                      setDraggedLabel(null);
                      setDragOverLabel(null);
                    }}
                  >
                    <GripVertical className="h-4 w-4 mr-2 cursor-move" />
                    <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: getLabelColor(label) }} />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 relative bg-gray-50">
          <div className="absolute inset-0">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {/* Right Sidebar - Label Settings */}
        <div className="w-[300px] flex flex-col border-l overflow-y-auto">
          <div className="p-4 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Label Settings</h3>
              {selectedLabel && (
                <div className="w-4 h-4 rounded" style={{ backgroundColor: getLabelColor(selectedLabel) }} />
              )}
            </div>
            
            {currentLabelSettings ? (
              <>
                {/* Visibility */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="visibility"
                    checked={currentLabelSettings.visible}
                    onCheckedChange={handleVisibilityToggle}
                  />
                  <Label htmlFor="visibility">Visible in layout</Label>
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select 
                    value={currentLabelSettings.position} 
                    onValueChange={handlePositionChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITION_OPTIONS.map(pos => (
                        <SelectItem key={pos} value={pos}>
                          {pos}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Size Constraints */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Maximum Width (%)</Label>
                    <div className="flex items-center space-x-2">
                      <Slider
                        value={[currentLabelSettings.maxWidthPercent]}
                        onValueChange={([value]) => handleSizeChange('width', value)}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <div className="w-12 text-right">
                        {Math.round(currentLabelSettings.maxWidthPercent)}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Maximum Height (%)</Label>
                    <div className="flex items-center space-x-2">
                      <Slider
                        value={[currentLabelSettings.maxHeightPercent]}
                        onValueChange={([value]) => handleSizeChange('height', value)}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <div className="w-12 text-right">
                        {Math.round(currentLabelSettings.maxHeightPercent)}%
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-8">
                {!selectedChannelId && "Select a channel to start"}
                {selectedChannelId && !selectedAspectRatio && "Select an aspect ratio"}
                {selectedChannelId && selectedAspectRatio && !selectedOption && "Select a layout"}
                {selectedChannelId && selectedAspectRatio && selectedOption && !selectedLabel && "Select a label to edit its settings"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 