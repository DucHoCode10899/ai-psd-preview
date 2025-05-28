"use client";

import { useState, useEffect } from "react";
import { FileUpload } from "@/components/upload/FileUpload";
import { PsdLayerMetadata } from "@/utils/psd-parser";
import { SynchronizedPsdPreview } from "@/components/psd/SynchronizedPsdPreview";
import { LayerTree } from "@/components/psd/LayerTree";
import { AdvancedLayoutGenerator } from "@/components/layout/AdvancedLayoutGenerator";
// import { AnimationStudio } from "@/components/layout/AnimationStudio";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [psdStructure, setPsdStructure] = useState<PsdLayerMetadata[] | null>(null);
  const [psdBuffer, setPsdBuffer] = useState<ArrayBuffer | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});

  // Handle reset all data
  const handleReset = () => {
    // Clear all localStorage items except isAuthenticate
    Object.keys(localStorage).forEach(key => {
      if (key !== 'isAuthenticate') {
        localStorage.removeItem(key);
      }
    });

    // Reset all state
    setUploadedFile(null);
    setPsdStructure(null);
    setPsdBuffer(null);
    setLayerVisibility({});

    toast.success('All data has been reset');
  };

  // Load stored PSD data
  useEffect(() => {
    // Check for stored PSD structure and filename
    const storedStructure = localStorage.getItem('psd_structure');
    const storedFileName = localStorage.getItem('psd_filename');

    if (storedStructure && storedFileName) {
      try {
        const parsedStructure = JSON.parse(storedStructure);
        setPsdStructure(parsedStructure);

        // Initialize layer visibility based on stored structure
        const initialVisibility: Record<string, boolean> = {};
        parsedStructure.forEach((layer: PsdLayerMetadata) => {
          initialVisibility[layer.id] = layer.visible;
        });
        setLayerVisibility(initialVisibility);

        toast.info('Please re-upload your PSD file to continue editing');
        
      } catch (error: unknown) {
        console.error('Error restoring PSD structure:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to restore session: ' + errorMessage);
        
        // Clear all localStorage items except isAuthenticate
        Object.keys(localStorage).forEach(key => {
          if (key !== 'isAuthenticate') {
            localStorage.removeItem(key);
          }
        });
        
        // Reset state
        setUploadedFile(null);
        setPsdStructure(null);
        setPsdBuffer(null);
        setLayerVisibility({});
      }
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    
    // Read file as ArrayBuffer for PsdViewer
    const buffer = await file.arrayBuffer();
    setPsdBuffer(buffer);

    // Store filename in local storage
    try {
      localStorage.setItem('psd_filename', file.name);
    } catch (error) {
      console.error('Error storing filename:', error);
      toast.error('Failed to store filename');
    }
  };

  const handlePsdParsed = (layers: PsdLayerMetadata[]) => {
    setPsdStructure(layers);
    // Initialize layer visibility based on the PSD file's visibility state
    const initialVisibility: Record<string, boolean> = {};
    layers.forEach((layer) => {
      initialVisibility[layer.id] = layer.visible;
    });
    setLayerVisibility(initialVisibility);
  };

  const handleLayerVisibilityChange = (layerId: string, visible: boolean) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerId]: visible
    }));

    // Dispatch the visibility change event
    window.dispatchEvent(new CustomEvent('psd_layer_visibility_change', {
      detail: {
        layerId,
        isVisible: visible
      }
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      <div className="w-full h-screen flex flex-col">
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 h-[calc(100vh-4rem)]"
        >
          {/* Left sidebar panel */}
          <ResizablePanel
            defaultSize={60}
            minSize={15}
            maxSize={35}
            className="bg-white h-full"
          >
            <div className="h-full overflow-y-auto">
              <div className="p-4 space-y-6">
                {/* File Upload with Reset Button */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">File Upload</h2>
                    {(uploadedFile || psdStructure) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FileUpload 
                    onFileUpload={handleFileUpload} 
                    onPsdParsed={handlePsdParsed} 
                  />
                </div>
                
                {/* Layer Structure */}
                {psdStructure && (
                  <div className="flex-1 flex flex-col">
                    <h2 className="text-lg font-semibold mb-4">Layer Structure</h2>
                    <div className="border rounded-lg overflow-hidden">
                      <LayerTree 
                        layers={psdStructure}
                        onLayerVisibilityChange={handleLayerVisibilityChange}
                        layerVisibility={layerVisibility}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Right content area */}
          <ResizablePanel defaultSize={40} className="bg-gray-50 overflow-auto">
            {psdStructure ? (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                {/* PSD Preview panel */}
                <ResizablePanel defaultSize={40}>
                  <div className="h-full flex flex-col overflow-hidden">
                    <div className="flex-1">
                      <div className="p-3">
                        <div className="border rounded-lg p-4 bg-gray-50">
                          <h2 className="text-lg font-semibold mb-4">Master PSD Preview</h2>
                          <div className="overflow-x-auto">
                            {psdBuffer && uploadedFile && psdStructure && (
                              <SynchronizedPsdPreview 
                                psdBuffer={psdBuffer}
                                fileName={uploadedFile.name}
                                layerVisibility={layerVisibility}
                                onLayerVisibilityChange={handleLayerVisibilityChange}
                                psdStructure={psdStructure}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Layout Generator panel */}
                <ResizablePanel defaultSize={60} className="overflow-auto">
                  <div className="p-3 h-full overflow-y-auto space-y-4">
                    <div className="border rounded-lg p-4 bg-white">
                      <AdvancedLayoutGenerator 
                        psdLayers={psdStructure}
                        psdBuffer={psdBuffer || undefined}
                      />
                    </div>
                    
                    {/* <div className="border rounded-lg p-4 bg-white">
                      <AnimationStudio 
                        psdLayers={psdStructure}
                        psdBuffer={psdBuffer || undefined}
                      />
                    </div> */}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="h-full flex items-center justify-center p-6 bg-gradient-to-br from-white to-gray-50">
                <div className="max-w-4xl w-full bg-white rounded-2xl shadow-sm border p-8 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <span className="text-2xl">✨</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">Welcome to Your Layout Sidekick</h2>
                      <p className="text-gray-500 font-medium">AI-Powered Ads Adaptation</p>
                    </div>
                  </div>

                  <p className="text-gray-600 text-lg mb-8 border-l-4 border-blue-500/20 pl-4">
                    Turn your master KV into a full set of platform-ready banners — intelligently adapted with the help of AI.
                  </p>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Get Started Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <span className="text-blue-500">🚀</span>
                        </div>
                        <h3 className="text-lg font-semibold">Get Started in 4 Simple Steps</h3>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-medium">1</span>
                          <div>
                            <p className="font-medium text-gray-900">Upload Your Master KV</p>
                            <p className="text-sm text-gray-500">Drop in your approved PSD file</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-medium">2</span>
                          <div>
                            <p className="font-medium text-gray-900">Label Your Layers</p>
                            <p className="text-sm text-gray-500">Name key elements like logo, main-subject, product-name, domain, etc.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-medium">3</span>
                          <div>
                            <p className="font-medium text-gray-900">Pick Platform & Ad Ratio</p>
                            <p className="text-sm text-gray-500">Facebook, YouTube, DOOH, 1:1, 9:16, etc.</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-medium">4</span>
                          <div>
                            <p className="font-medium text-gray-900">Generate Layouts</p>
                            <p className="text-sm text-gray-500">Preview, fine-tune, and export instantly</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Coming Soon Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <span className="text-blue-500">🔧</span>
                        </div>
                        <h3 className="text-lg font-semibold">Coming Soon</h3>
                      </div>

                      <div className="space-y-6">
                        <div className="p-4 rounded-lg border bg-gray-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-blue-500">📁</span>
                            <h4 className="font-medium">Brand & Product System</h4>
                          </div>
                          <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500/70">•</span>
                              Brand Kit Library – Save and apply brand fonts, colors, logos across campaigns
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500/70">•</span>
                              Product Kit Manager – Store product-specific palettes, logos, placements
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500/70">•</span>
                              Campaign Templates – One-click setup using saved brand/product kits
                            </li>
                          </ul>
                        </div>

                        <div className="p-4 rounded-lg border bg-gray-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-blue-500">🧠</span>
                            <h4 className="font-medium">Smart Automation & AI Enhancements</h4>
                          </div>
                          <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500/70">•</span>
                              Auto-Layer Detection – AI recognizes and labels logo, CTA, disclaimer, etc.
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-500/70">•</span>
                              Visual Placement AI – Follows safe zone rules and historical layout guides
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
