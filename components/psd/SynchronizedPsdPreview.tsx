"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, Image as FabricImage } from "fabric";
import { toast } from "sonner";
import type { Layer as PsdLayer, Node } from "@webtoon/psd";
import Psd from "@webtoon/psd";
import { PsdLayerMetadata } from "@/utils/psd-parser";

interface SynchronizedPsdPreviewProps {
  psdBuffer: ArrayBuffer;
  fileName: string;
  layerVisibility: Record<string, boolean>;
  onLayerVisibilityChange: (layerId: string, visible: boolean) => void;
  psdStructure: PsdLayerMetadata[];
}

interface LayerPreview {
  id: string;
  name: string;
  imageData: ImageData | null;
  width: number;
  height: number;
  left: number;
  top: number;
  type: string;
  visible: boolean;
  fabricObject?: FabricImage;
}

export function SynchronizedPsdPreview({ 
  psdBuffer, 
  fileName, 
  layerVisibility,
  psdStructure 
}: SynchronizedPsdPreviewProps) {
  const [psdFile, setPsdFile] = useState<Psd | null>(null);
  const [layers, setLayers] = useState<LayerPreview[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // Define resizeCanvasToContainer first
  const resizeCanvasToContainer = useCallback(() => {
    if (!fabricCanvasRef.current || !psdFile || !canvasContainerRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    const container = canvasContainerRef.current;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const scaleX = containerWidth / psdFile.width;
    const scaleY = containerHeight / psdFile.height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    canvas.setDimensions({
      width: containerWidth,
      height: containerHeight
    });
    
    canvas.setZoom(scale);
    
    const centerX = (containerWidth - psdFile.width * scale) / 2;
    const centerY = (containerHeight - psdFile.height * scale) / 2;
    
    canvas.setViewportTransform([
      scale, 0, 0, scale, centerX, centerY
    ]);
    
    canvas.renderAll();
  }, [psdFile]);

  // Parse PSD and create layer previews
  useEffect(() => {
    async function parsePsd() {
      try {
        const psd = Psd.parse(psdBuffer);
        setPsdFile(psd);
        
        const layerPreviews: LayerPreview[] = [];
        
        const processNode = async (node: Node, index: number) => {
          if (node.type === "Layer") {
            const layer = node as PsdLayer;
            try {
              const layerBuffer = await layer.composite();
              
              if (layerBuffer) {
                const layerImageData = new ImageData(
                  new Uint8ClampedArray(layerBuffer),
                  layer.width,
                  layer.height
                );
                
                // Use the layer's unique identifier from psdStructure if available
                const layerId = psdStructure.find(l => l.name === layer.name)?.id || index.toString();
                
                layerPreviews.push({
                  id: layerId,
                  name: layer.name || `Layer ${index}`,
                  imageData: layerImageData,
                  width: layer.width,
                  height: layer.height,
                  left: layer.left,
                  top: layer.top,
                  type: layer.type,
                  visible: layerVisibility[layerId] ?? true
                });
              }
            } catch (error) {
              console.error(`Error processing layer ${layer.name}:`, error);
            }
          }
          
          if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
              await processNode(node.children[i], index * 100 + i);
            }
          }
        };
        
        await processNode(psd, 0);
        setLayers(layerPreviews);
        
      } catch (error) {
        console.error("Error parsing PSD:", error);
        toast.error("Failed to parse PSD file");
      }
    }
    
    if (psdBuffer) {
      parsePsd();
    }
  }, [psdBuffer, fileName, psdStructure, layerVisibility]);

  // Update layer visibility when layerVisibility prop changes
  useEffect(() => {
    setLayers(prevLayers => {
      const updatedLayers = prevLayers.map(layer => {
        const newVisible = layerVisibility[layer.id] ?? layer.visible;
        if (layer.fabricObject) {
          layer.fabricObject.visible = newVisible;
          fabricCanvasRef.current?.renderAll();
        }
        return { ...layer, visible: newVisible };
      });
      return updatedLayers;
    });
  }, [layerVisibility]);

  // Initialize canvas and setup layers
  useEffect(() => {
    const initializeCanvas = async () => {
      if (layers.length > 0 && psdFile && canvasRef.current) {
        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.dispose();
        }
        
        try {
          const canvas = new FabricCanvas(canvasRef.current);
          canvas.setWidth(psdFile.width);
          canvas.setHeight(psdFile.height);
          canvas.backgroundColor = 'white';
          canvas.renderAll();
          
          fabricCanvasRef.current = canvas;
  
          const updatedLayers = [...layers].reverse();
          for (const layer of updatedLayers) {
            if (layer.imageData) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = layer.width;
              tempCanvas.height = layer.height;
              
              const ctx = tempCanvas.getContext('2d');
              if (ctx) {
                ctx.putImageData(layer.imageData, 0, 0);
                
                const fabricImage = new FabricImage(tempCanvas, {
                  left: layer.left,
                  top: layer.top,
                  selectable: false,
                  name: layer.name,
                  visible: layer.visible,
                  evented: false,
                  lockMovementX: true,
                  lockMovementY: true,
                  lockRotation: true,
                  lockScalingX: true,
                  lockScalingY: true,
                });
                
                layer.fabricObject = fabricImage;
                canvas.add(fabricImage);
                canvas.renderAll();
              }
            }
          }
          
          // Disable all canvas interactions
          canvas.selection = false;
          canvas.skipTargetFind = true;
          
          setupPanAndZoom(canvas);
          resizeCanvasToContainer();
        } catch (err) {
          console.error("Error initializing canvas:", err);
          toast.error("Failed to initialize canvas");
        }
      }
    };
    
    initializeCanvas();
    
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, [layers, psdFile, resizeCanvasToContainer]);

  const setupPanAndZoom = (canvas: FabricCanvas) => {
    // Disable all interactions
    canvas.allowTouchScrolling = true;
    canvas.off(); // Remove all event listeners
  };

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fabricCanvasRef.current) {
        resizeCanvasToContainer();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeCanvasToContainer]);

  return (
    <div className="w-full h-full relative">
      <div 
        ref={canvasContainerRef} 
        className="w-full overflow-hidden relative"
        style={{ height: "calc(100vh - 100px)" }}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
} 