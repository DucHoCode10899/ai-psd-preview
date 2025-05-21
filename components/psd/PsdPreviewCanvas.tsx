"use client";

import React, { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, Image as FabricImage, Point } from "fabric";
import { toast } from "sonner";
import type { Layer as PsdLayer, Node } from "@webtoon/psd";
import Psd from "@webtoon/psd";

interface PsdPreviewCanvasProps {
  psdBuffer: ArrayBuffer;
  fileName: string;
  onLayerVisibilityChange?: (layerId: string, visible: boolean) => void;
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

export function PsdPreviewCanvas({ psdBuffer, fileName, onLayerVisibilityChange }: PsdPreviewCanvasProps) {
  const [psdFile, setPsdFile] = useState<Psd | null>(null);
  const [layers, setLayers] = useState<LayerPreview[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

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
                
                layerPreviews.push({
                  id: layer.id || index.toString(),
                  name: layer.name || `Layer ${index}`,
                  imageData: layerImageData,
                  width: layer.width,
                  height: layer.height,
                  left: layer.left,
                  top: layer.top,
                  type: layer.type,
                  visible: true
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
  }, [psdBuffer, fileName]);

  // Listen for visibility changes from LayerTree
  useEffect(() => {
    const handleVisibilityChange = (event: CustomEvent) => {
      const { layerId, isVisible } = event.detail;
      
      setLayers(prevLayers => {
        const updatedLayers = prevLayers.map(layer => {
          if (layer.id === layerId) {
            if (layer.fabricObject) {
              layer.fabricObject.visible = isVisible;
              fabricCanvasRef.current?.renderAll();
            }
            return { ...layer, visible: isVisible };
          }
          return layer;
        });
        return updatedLayers;
      });
    };

    window.addEventListener('psd_layer_visibility_change', handleVisibilityChange as EventListener);
    return () => {
      window.removeEventListener('psd_layer_visibility_change', handleVisibilityChange as EventListener);
    };
  }, []);

  // Initial layer setup
  useEffect(() => {
    if (onLayerVisibilityChange && layers.length > 0) {
      // Only notify about initial visibility once when layers are first loaded
      layers.forEach(layer => {
        onLayerVisibilityChange(layer.id, layer.visible);
      });
    }
  }, [layers.length]); // Only run when layers are first loaded

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
                  selectable: true,
                  name: layer.name,
                  visible: layer.visible
                });
                
                layer.fabricObject = fabricImage;
                canvas.add(fabricImage);
                canvas.renderAll();
              }
            }
          }
          
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
  }, [layers, psdFile]);

  const setupPanAndZoom = (canvas: FabricCanvas) => {
    let isPanning = false;
    let lastPosX = 0;
    let lastPosY = 0;
    
    canvas.on('mouse:down', (opt) => {
      const evt = opt.e as MouseEvent;
      if (evt.altKey === true) {
        isPanning = true;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        canvas.selection = false;
      }
    });
    
    canvas.on('mouse:move', (opt) => {
      if (isPanning && opt.e) {
        const e = opt.e as MouseEvent;
        const vpt = canvas.viewportTransform!;
        vpt[4] += e.clientX - lastPosX;
        vpt[5] += e.clientY - lastPosY;
        canvas.requestRenderAll();
        lastPosX = e.clientX;
        lastPosY = e.clientY;
      }
    });
    
    canvas.on('mouse:up', () => {
      isPanning = false;
    });
    
    canvasRef.current?.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom = delta > 0 ? zoom * 0.9 : zoom * 1.1;
      
      if (zoom > 20) zoom = 20;
      if (zoom < 0.1) zoom = 0.1;
      
      canvas.zoomToPoint(
        new Point(e.offsetX, e.offsetY),
        zoom
      );
    });
  };
  
  const resizeCanvasToContainer = () => {
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
  };

  useEffect(() => {
    const handleResize = () => {
      if (fabricCanvasRef.current) {
        resizeCanvasToContainer();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

