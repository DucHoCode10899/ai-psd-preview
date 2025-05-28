"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { labelsApi } from '@/utils/api';

export default function LabelsPage() {
  const [labels, setLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [editLabel, setEditLabel] = useState({ old: '', new: '' });
  const [labelToDelete, setLabelToDelete] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch labels
  const fetchLabels = async () => {
    try {
      setIsLoading(true);
      const response = await labelsApi.getAll();
      const data = await response.json();
      if (response.ok) {
        setLabels(data.labels);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Error fetching labels:', err);
      toast.error('Failed to fetch labels');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLabels();
  }, []);

  // Add new label
  const handleAddLabel = async () => {
    try {
      const response = await labelsApi.add(newLabel.trim());
      
      const data = await response.json();
      if (response.ok) {
        setLabels(data.labels);
        setIsAddDialogOpen(false);
        setNewLabel('');
        toast.success('Label added successfully');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to add label');
      }
    }
  };

  // Edit label
  const handleEditLabel = async () => {
    try {
      const response = await labelsApi.update(editLabel.old, editLabel.new.trim());
      
      const data = await response.json();
      if (response.ok) {
        setLabels(data.labels);
        setIsEditDialogOpen(false);
        setEditLabel({ old: '', new: '' });
        toast.success('Label updated successfully');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to update label');
      }
    }
  };

  // Delete label
  const handleDeleteLabel = async () => {
    try {
      const response = await labelsApi.delete(labelToDelete);
      
      const data = await response.json();
      if (response.ok) {
        setLabels(data.labels);
        setIsDeleteDialogOpen(false);
        setLabelToDelete('');
        toast.success('Label deleted successfully');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to delete label');
      }
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Label Management</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={fetchLabels}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Label
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Label</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Enter label name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddLabel} disabled={!newLabel.trim()}>
                  Add Label
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {labels.map((label) => (
          <div
            key={label}
            className="flex items-center justify-between p-4 bg-white rounded-lg shadow"
          >
            <span>{label}</span>
            <div className="flex gap-2">
              <Dialog open={isEditDialogOpen && editLabel.old === label} onOpenChange={(open) => {
                setIsEditDialogOpen(open);
                if (!open) setEditLabel({ old: '', new: '' });
              }}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditLabel({ old: label, new: label });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Label</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Input
                      placeholder="Enter new label name"
                      value={editLabel.new}
                      onChange={(e) => setEditLabel({ ...editLabel, new: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleEditLabel}
                      disabled={!editLabel.new.trim() || editLabel.new.trim() === editLabel.old}
                    >
                      Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog open={isDeleteDialogOpen && labelToDelete === label} onOpenChange={(open) => {
                setIsDeleteDialogOpen(open);
                if (!open) setLabelToDelete('');
              }}>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setLabelToDelete(label);
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Label</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete the label &quot;{label}&quot;? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteLabel}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 