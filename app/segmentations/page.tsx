"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusIcon, ChevronRight, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import React from 'react';
import { segmentationRulesApi } from '@/utils/api';

// Types for segmentation data
interface SegmentationValue {
  id: string;
  label: string;
}

interface SegmentationType {
  id: string;
  label: string;
  values: SegmentationValue[];
}

interface SegmentationRules {
  segmentationTypes: SegmentationType[];
}

// Helper function to generate slug from label
const generateSlug = (label: string): string => {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Helper function to ensure unique ID
const ensureUniqueId = (
  baseId: string,
  existingIds: string[],
  counter = 0
): string => {
  const newId = counter === 0 ? baseId : `${baseId}-${counter}`;
  if (!existingIds.includes(newId)) {
    return newId;
  }
  return ensureUniqueId(baseId, existingIds, counter + 1);
};

export default function SegmentationsPage() {
  const [segmentationRules, setSegmentationRules] = useState<SegmentationRules>({ segmentationTypes: [] });
  const [isAddTypeDialogOpen, setIsAddTypeDialogOpen] = useState(false);
  const [isAddValueDialogOpen, setIsAddValueDialogOpen] = useState(false);
  const [isEditTypeDialogOpen, setIsEditTypeDialogOpen] = useState(false);
  const [isEditValueDialogOpen, setIsEditValueDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<SegmentationType | null>(null);
  const [selectedValue, setSelectedValue] = useState<SegmentationValue | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [newType, setNewType] = useState({ label: '' });
  const [newValue, setNewValue] = useState({ label: '' });
  const [editingItem, setEditingItem] = useState<{ id: string; label: string; }>({ id: '', label: '' });
  const [deleteType, setDeleteType] = useState<'type' | 'value'>('type');

  // Load segmentation rules
  useEffect(() => {
    const loadSegmentationRules = async () => {
      try {
        const response = await segmentationRulesApi.get();
        const data = await response.json();
        setSegmentationRules(data);
      } catch (error) {
        console.error('Error loading segmentation rules:', error);
        toast.error('Failed to load segmentation rules');
      }
    };

    loadSegmentationRules();
  }, []);

  // Toggle expanded state for a type
  const toggleTypeExpanded = (typeId: string) => {
    const newExpandedTypes = new Set(expandedTypes);
    if (newExpandedTypes.has(typeId)) {
      newExpandedTypes.delete(typeId);
    } else {
      newExpandedTypes.add(typeId);
    }
    setExpandedTypes(newExpandedTypes);
  };

  // Save segmentation rules
  const saveSegmentationRules = async (newRules: SegmentationRules) => {
    try {
      const response = await segmentationRulesApi.update(newRules);

      if (!response.ok) {
        throw new Error('Failed to save segmentation rules');
      }

      setSegmentationRules(newRules);
      toast.success('Segmentation rules saved successfully');
    } catch (error) {
      console.error('Error saving segmentation rules:', error);
      toast.error('Failed to save segmentation rules');
    }
  };

  // Add new segmentation type
  const handleAddType = async () => {
    if (!newType.label) {
      toast.error('Please enter a label');
      return;
    }

    const baseId = generateSlug(newType.label);
    const existingTypeIds = segmentationRules.segmentationTypes.map(type => type.id);
    const uniqueId = ensureUniqueId(baseId, existingTypeIds);

    const updatedRules = {
      ...segmentationRules,
      segmentationTypes: [
        ...segmentationRules.segmentationTypes,
        { id: uniqueId, label: newType.label, values: [] }
      ]
    };

    await saveSegmentationRules(updatedRules);
    setNewType({ label: '' });
    setIsAddTypeDialogOpen(false);
  };

  // Add new value to selected type
  const handleAddValue = async () => {
    if (!selectedType || !newValue.label) {
      toast.error('Please enter a label');
      return;
    }

    const baseId = generateSlug(newValue.label);
    const existingValueIds = selectedType.values.map(value => value.id);
    const uniqueId = ensureUniqueId(baseId, existingValueIds);

    const updatedRules = {
      ...segmentationRules,
      segmentationTypes: segmentationRules.segmentationTypes.map(type =>
        type.id === selectedType.id
          ? { ...type, values: [...type.values, { id: uniqueId, label: newValue.label }] }
          : type
      )
    };

    await saveSegmentationRules(updatedRules);
    setNewValue({ label: '' });
    setIsAddValueDialogOpen(false);
  };

  // Delete segmentation type or value
  const handleDelete = async () => {
    if (deleteType === 'type' && selectedType) {
      const updatedRules = {
        ...segmentationRules,
        segmentationTypes: segmentationRules.segmentationTypes.filter(
          type => type.id !== selectedType.id
        )
      };
      await saveSegmentationRules(updatedRules);
    } else if (deleteType === 'value' && selectedType && selectedValue) {
      const updatedRules = {
        ...segmentationRules,
        segmentationTypes: segmentationRules.segmentationTypes.map(type =>
          type.id === selectedType.id
            ? { ...type, values: type.values.filter(value => value.id !== selectedValue.id) }
            : type
        )
      };
      await saveSegmentationRules(updatedRules);
    }
    setIsDeleteDialogOpen(false);
  };

  // Edit type or value
  const handleEdit = async () => {
    if (!editingItem.label) {
      toast.error('Please enter a label');
      return;
    }

    if (deleteType === 'type' && selectedType) {
      const updatedRules = {
        ...segmentationRules,
        segmentationTypes: segmentationRules.segmentationTypes.map(type =>
          type.id === selectedType.id ? { ...type, label: editingItem.label } : type
        )
      };
      await saveSegmentationRules(updatedRules);
      setIsEditTypeDialogOpen(false);
    } else if (deleteType === 'value' && selectedType && selectedValue) {
      const updatedRules = {
        ...segmentationRules,
        segmentationTypes: segmentationRules.segmentationTypes.map(type =>
          type.id === selectedType.id
            ? {
                ...type,
                values: type.values.map(value =>
                  value.id === selectedValue.id ? { ...value, label: editingItem.label } : value
                )
              }
            : type
        )
      };
      await saveSegmentationRules(updatedRules);
      setIsEditValueDialogOpen(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Segmentation Management</h1>
        <Dialog open={isAddTypeDialogOpen} onOpenChange={setIsAddTypeDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Segmentation Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Segmentation Type</DialogTitle>
              <DialogDescription>
                Create a new segmentation type to group related values.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="type-label">Display Label</Label>
                <Input
                  id="type-label"
                  value={newType.label}
                  onChange={(e) => setNewType({ label: e.target.value })}
                  placeholder="e.g., Gender"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddTypeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddType}>Add Type</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-background rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segmentationRules.segmentationTypes.map((type) => (
              <React.Fragment key={type.id}>
                <TableRow className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => toggleTypeExpanded(type.id)}
                      >
                        {expandedTypes.has(type.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      {type.label}
                    </div>
                  </TableCell>
                  <TableCell>{type.id}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedType(type);
                          setDeleteType('type');
                          setIsAddValueDialogOpen(true);
                        }}
                      >
                        <PlusIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedType(type);
                          setDeleteType('type');
                          setEditingItem({ id: type.id, label: type.label });
                          setIsEditTypeDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedType(type);
                          setDeleteType('type');
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedTypes.has(type.id) && type.values.map((value) => (
                  <TableRow key={`${type.id}-${value.id}`} className="bg-muted/50">
                    <TableCell className="font-medium pl-10">
                      {value.label}
                    </TableCell>
                    <TableCell>{value.id}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedType(type);
                            setSelectedValue(value);
                            setDeleteType('value');
                            setEditingItem({ id: value.id, label: value.label });
                            setIsEditValueDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedType(type);
                            setSelectedValue(value);
                            setDeleteType('value');
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Type Dialog */}
      <Dialog open={isEditTypeDialogOpen} onOpenChange={setIsEditTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Segmentation Type</DialogTitle>
            <DialogDescription>
              Update the display label for this segmentation type.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Type ID</Label>
              <Input value={editingItem.id} disabled />
            </div>
            <div>
              <Label>Display Label</Label>
              <Input
                value={editingItem.label}
                onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTypeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Value Dialog */}
      <Dialog open={isEditValueDialogOpen} onOpenChange={setIsEditValueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Value</DialogTitle>
            <DialogDescription>
              Update the display label for this value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Value ID</Label>
              <Input value={editingItem.id} disabled />
            </div>
            <div>
              <Label>Display Label</Label>
              <Input
                value={editingItem.label}
                onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditValueDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Value Dialog */}
      <Dialog open={isAddValueDialogOpen} onOpenChange={setIsAddValueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Value</DialogTitle>
            <DialogDescription>
              Add a new value to {selectedType?.label} segmentation type.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="value-label">Display Label</Label>
              <Input
                id="value-label"
                value={newValue.label}
                onChange={(e) => setNewValue({ label: e.target.value })}
                placeholder="e.g., Male"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddValueDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddValue}>Add Value</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'type'
                ? `This will permanently delete the "${selectedType?.label}" segmentation type and all its values.`
                : `This will permanently delete the "${selectedValue?.label}" value.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 