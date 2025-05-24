"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2, Plus, FileJson } from 'lucide-react';
import { useAutoAI } from '@/hooks/useAutoAI';

interface TrainingExample {
  layerName: string;
  correctLabel: string;
  pattern: string;
}

export default function AITraining() {
  const [trainingData, setTrainingData] = useState<TrainingExample[]>([]);
  const [newExample, setNewExample] = useState<TrainingExample>({
    layerName: '',
    correctLabel: '',
    pattern: ''
  });
  const [modelStats, setModelStats] = useState<{
    accuracy: number;
    totalExamples: number;
    labelDistribution: Record<string, number>;
  }>({
    accuracy: 0,
    totalExamples: 0,
    labelDistribution: {}
  });

  const { analyzeLayerName } = useAutoAI();

  // Memoize updateStats function
  const updateStats = useCallback((data: TrainingExample[]) => {
    let correct = 0;
    const distribution: Record<string, number> = {};

    data.forEach(example => {
      // Count label distribution
      distribution[example.correctLabel] = (distribution[example.correctLabel] || 0) + 1;

      // Test accuracy
      const prediction = analyzeLayerName(example.layerName);
      if (prediction.label === example.correctLabel) {
        correct++;
      }
    });

    setModelStats({
      accuracy: data.length ? (correct / data.length) : 0,
      totalExamples: data.length,
      labelDistribution: distribution
    });
  }, [analyzeLayerName]);

  // Load training data from file
  useEffect(() => {
    const loadTrainingData = async () => {
      try {
        const response = await fetch('/api/ai-training/data');
        const data = await response.json();
        setTrainingData(data);
        updateStats(data);
      } catch (error) {
        console.error('Error loading training data:', error);
      }
    };
    loadTrainingData();
  }, [updateStats]);

  // Add new training example
  const handleAddExample = useCallback(() => {
    if (!newExample.layerName || !newExample.correctLabel) return;

    const updatedData = [...trainingData, newExample];
    setTrainingData(updatedData);
    updateStats(updatedData);

    // Reset form
    setNewExample({
      layerName: '',
      correctLabel: '',
      pattern: ''
    });
  }, [trainingData, newExample, updateStats]);

  // Remove training example
  const handleRemoveExample = useCallback((index: number) => {
    const updatedData = trainingData.filter((_, i) => i !== index);
    setTrainingData(updatedData);
    updateStats(updatedData);
  }, [trainingData, updateStats]);

  // Save training data
  const handleSave = async () => {
    try {
      await fetch('/api/ai-training/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trainingData),
      });
      alert('Training data saved successfully!');
    } catch (error) {
      console.error('Error saving training data:', error);
      alert('Error saving training data');
    }
  };

  // Export training data as JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(trainingData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ai-training-data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">AI Layer Labeling Training</h1>
          <p className="text-gray-600">Train the AI model to improve layer labeling accuracy</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <FileJson className="h-4 w-4 mr-2" />
            Export Data
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Model Statistics */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-sm font-medium text-gray-500">Accuracy</h3>
          <p className="text-2xl font-bold">{(modelStats.accuracy * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-sm font-medium text-gray-500">Total Examples</h3>
          <p className="text-2xl font-bold">{modelStats.totalExamples}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-sm font-medium text-gray-500">Unique Labels</h3>
          <p className="text-2xl font-bold">{Object.keys(modelStats.labelDistribution).length}</p>
        </div>
      </div>

      {/* Add New Example Form */}
      <div className="bg-white p-6 rounded-lg border mb-8">
        <h2 className="text-lg font-semibold mb-4">Add Training Example</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="layerName">Layer Name</Label>
            <Input
              id="layerName"
              value={newExample.layerName}
              onChange={(e) => setNewExample({ ...newExample, layerName: e.target.value })}
              placeholder="Enter layer name"
            />
          </div>
          <div>
            <Label htmlFor="correctLabel">Correct Label</Label>
            <Input
              id="correctLabel"
              value={newExample.correctLabel}
              onChange={(e) => setNewExample({ ...newExample, correctLabel: e.target.value })}
              placeholder="Enter correct label"
            />
          </div>
          <div>
            <Label htmlFor="pattern">Pattern (optional)</Label>
            <Input
              id="pattern"
              value={newExample.pattern}
              onChange={(e) => setNewExample({ ...newExample, pattern: e.target.value })}
              placeholder="Enter regex pattern"
            />
          </div>
        </div>
        <Button className="mt-4" onClick={handleAddExample}>
          <Plus className="h-4 w-4 mr-2" />
          Add Example
        </Button>
      </div>

      {/* Training Data Table */}
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Layer Name</TableHead>
              <TableHead>Correct Label</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>AI Prediction</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainingData.map((example, index) => {
              const prediction = analyzeLayerName(example.layerName);
              const isCorrect = prediction.label === example.correctLabel;

              return (
                <TableRow key={index}>
                  <TableCell>{example.layerName}</TableCell>
                  <TableCell>{example.correctLabel}</TableCell>
                  <TableCell>{example.pattern || '-'}</TableCell>
                  <TableCell>
                    <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>
                      {prediction.label || 'No prediction'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveExample(index)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 