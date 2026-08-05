import { getMediaFilename } from '@/utils/formatters';
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCollection } from "@/hooks/useCollection";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as htmlToImage from "html-to-image";

function SortableItem(props: { id: string; item: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const primaryId = (props.item.field_identifier || "").split(';')[0].trim();
  const imageUrl = `https://lakehouse.wolfsonian.org/images/${getMediaFilename(primaryId)}.jpg`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative bg-zinc-900 border border-white/20 p-2 shadow-xl cursor-grab active:cursor-grabbing hover:border-mca-cyan transition-colors"
    >
      <img
        src={imageUrl}
        alt={props.item.title || "Artifact"}
        className="w-full h-48 md:h-64 object-contain bg-black"
        crossOrigin="anonymous"
      />
      <div className="absolute bottom-0 left-0 w-full bg-black/80 backdrop-blur-sm p-2 opacity-0 hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white font-mono truncate">{props.item.title}</p>
      </div>
    </div>
  );
}

export default function ExhibitionBuilderPage() {
  const { collection, isLoaded } = useCollection();
  const [items, setItems] = useState<any[]>([]);
  const [exhibitionTitle, setExhibitionTitle] = useState("My Curated Collection");
  const [curatorName, setCuratorName] = useState("Guest Curator");
  const [isExporting, setIsExporting] = useState(false);
  
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && collection.length > 0 && items.length === 0) {
      setItems(collection);
    }
  }, [isLoaded, collection]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.field_identifier === active.id);
        const newIndex = items.findIndex((i) => i.field_identifier === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleExport = async () => {
    if (!galleryRef.current) return;
    setIsExporting(true);
    
    try {
      const dataUrl = await htmlToImage.toPng(galleryRef.current, {
        quality: 0.95,
        backgroundColor: '#000000',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });
      
      const link = document.createElement('a');
      link.download = `exhibition-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export image", err);
      alert("Failed to export poster. Make sure all images are fully loaded.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">Loading gallery...</div>;
  }

  return (
    <div className="min-h-screen bg-mca-black flex flex-col text-white">
      {/* Header */}
      <div className="p-6 flex justify-between items-center z-50 border-b border-white/20 bg-mca-black shrink-0">
        <Link href="/" className="text-white/50 hover:text-white transition-colors font-mono text-sm tracking-widest uppercase">
          ← Back
        </Link>
        <div className="text-mca-cyan font-mono font-bold tracking-widest text-sm uppercase">
          Virtual Exhibition Builder
        </div>
        <div>
          <button 
            onClick={handleExport}
            disabled={isExporting || items.length === 0}
            className="px-4 py-2 bg-mca-cyan text-black font-bold font-mono text-xs uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Poster'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar Controls */}
        <div className="w-full md:w-80 border-r border-white/20 p-6 flex flex-col gap-6 bg-zinc-950 overflow-y-auto">
          <div>
            <h2 className="font-display font-black text-2xl uppercase tracking-tighter mb-4">Exhibition Details</h2>
            <p className="text-sm font-sans text-gray-400 mb-6">
              Arrange your saved artifacts on the wall, set your titles, and export a high-quality poster.
            </p>
          </div>
          
          <div className="space-y-4 font-mono text-sm">
            <div>
              <label className="block text-mca-cyan mb-2 tracking-widest uppercase text-xs font-bold">Exhibition Title</label>
              <input 
                type="text" 
                value={exhibitionTitle}
                onChange={(e) => setExhibitionTitle(e.target.value)}
                className="w-full bg-black border border-white/20 p-3 text-white focus:outline-none focus:border-mca-cyan transition-colors"
                placeholder="Title..."
              />
            </div>
            <div>
              <label className="block text-mca-cyan mb-2 tracking-widest uppercase text-xs font-bold">Curator Name</label>
              <input 
                type="text" 
                value={curatorName}
                onChange={(e) => setCuratorName(e.target.value)}
                className="w-full bg-black border border-white/20 p-3 text-white focus:outline-none focus:border-mca-cyan transition-colors"
                placeholder="Curator..."
              />
            </div>
          </div>
          
          {items.length === 0 && (
            <div className="mt-8 p-4 border border-mca-yellow bg-mca-yellow/10 text-mca-yellow font-mono text-sm">
              Your collection is empty! Go play Art Swipe or explore the catalog to save some artifacts first.
            </div>
          )}
        </div>

        {/* Gallery Wall Area */}
        <div className="flex-1 overflow-y-auto bg-neutral-900 p-8 flex justify-center">
          <div 
            ref={galleryRef}
            className="w-full max-w-5xl bg-black shadow-[0_0_100px_rgba(0,0,0,0.5)] p-12 md:p-20 relative"
            style={{ minHeight: '800px' }}
          >
            {/* Poster Header */}
            <div className="text-center mb-16 space-y-4">
              <h1 className="font-display font-black text-5xl md:text-7xl uppercase tracking-tighter text-white">
                {exhibitionTitle || "Untitled Exhibition"}
              </h1>
              <div className="h-1 w-24 bg-mca-cyan mx-auto my-6"></div>
              <p className="font-mono text-lg md:text-xl text-gray-400 tracking-widest uppercase">
                Curated by <span className="text-white font-bold">{curatorName || "Unknown"}</span>
              </p>
              <p className="font-mono text-xs text-gray-600 tracking-widest uppercase mt-4">
                Powered by Wolfsonian-FIU Lakehouse
              </p>
            </div>

            {/* Draggable Grid */}
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={items.map(i => i.field_identifier)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
                  {items.map((item) => (
                    <SortableItem key={item.field_identifier} id={item.field_identifier} item={item} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}
