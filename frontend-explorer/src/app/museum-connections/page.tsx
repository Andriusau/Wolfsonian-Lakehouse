"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useDuckDB } from "@/providers/DuckDBProvider";
import dynamic from 'next/dynamic';

// Dynamically import react-force-graph to prevent SSR issues (it requires window)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

type Node = {
  id: string;
  imgUrl: string;
  title: string;
  creator: string;
  group: number;
  val: number;
  type: 'artifact' | 'creator' | 'subject';
  loaded: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

type LinkType = {
  source: string;
  target: string;
};

export default function MuseumConnections() {
  const { isReady, runQuery } = useDuckDB();
  const [graphData, setGraphData] = useState<{ nodes: Node[], links: LinkType[] }>({ nodes: [], links: [] });
  const [hoverNode, setHoverNode] = useState<Node | null>(null);
  const fgRef = useRef<any>(null);

  // Fetch initial random artifacts
  useEffect(() => {
    if (!isReady) return;

    const fetchInitialNodes = async () => {
      try {
        const query = `
          SELECT field_identifier, title, field_linked_agent as creator 
          FROM catalog 
          WHERE has_image = true AND field_linked_agent IS NOT NULL
          USING SAMPLE 15
        `;
        const initialData = await runQuery(query);
        
        if (initialData && initialData.length > 0) {
          const nodes: Node[] = initialData.map((d: any) => ({
            id: d.field_identifier,
            imgUrl: `/images/${d.field_identifier}.jpg`,
            title: d.title,
            creator: d.creator || 'Unknown',
            group: 1,
            val: 10,
            type: 'artifact',
            loaded: false
          }));

          setGraphData({ nodes, links: [] });
        }
      } catch (e) {
        console.error("Failed to load initial graph data", e);
      }
    };

    fetchInitialNodes();
  }, [isReady]);

  // Handle clicking a node to expand its network
  const handleNodeClick = useCallback(async (node: any) => {
    if (!isReady || node.loaded || node.type !== 'artifact') return;

    // Center on node
    fgRef.current?.centerAt(node.x, node.y, 1000);
    fgRef.current?.zoom(2, 2000);

    // Query for related artifacts by creator
    try {
      const escapedCreator = node.creator.replace(/'/g, "''");
      const query = `
        SELECT field_identifier, title, field_linked_agent as creator 
        FROM catalog 
        WHERE has_image = true 
        AND field_linked_agent = '${escapedCreator}'
        AND field_identifier != '${node.id}'
        LIMIT 10
      `;
      
      const relatedData = await runQuery(query);
      
      if (relatedData && relatedData.length > 0) {
        setGraphData(({ nodes, links }) => {
          const newNodes = [...nodes];
          const newLinks = [...links];

          // Create a central 'creator' node if it doesn't exist
          const creatorNodeId = `creator_${node.creator}`;
          if (!newNodes.find(n => n.id === creatorNodeId)) {
            newNodes.push({
              id: creatorNodeId,
              title: node.creator,
              creator: node.creator,
              imgUrl: '',
              group: 2,
              val: 15,
              type: 'creator',
              loaded: true
            });
          }

          // Link the clicked node to the creator node
          if (!newLinks.find(l => l.source === node.id && l.target === creatorNodeId)) {
            newLinks.push({ source: node.id, target: creatorNodeId });
          }

          // Add new related artifacts and link them to the creator node
          relatedData.forEach((d: any) => {
            if (!newNodes.find(n => n.id === d.field_identifier)) {
              newNodes.push({
                id: d.field_identifier,
                imgUrl: `/images/${d.field_identifier}.jpg`,
                title: d.title,
                creator: d.creator,
                group: 1,
                val: 8,
                type: 'artifact',
                loaded: false
              });
              newLinks.push({ source: d.field_identifier, target: creatorNodeId });
            }
          });

          // Mark clicked node as loaded
          const updatedNodes = newNodes.map(n => n.id === node.id ? { ...n, loaded: true } : n);
          
          return { nodes: updatedNodes, links: newLinks };
        });
      }
    } catch (e) {
      console.error("Failed to expand network", e);
    }
  }, [isReady]);

  // Custom node renderer for drawing artifact images
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = node.val || 5;

    // Draw Creator Node (Text instead of Image)
    if (node.type === 'creator') {
      ctx.fillStyle = '#05C3DD'; // mca-cyan
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      ctx.fill();
      
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'white';
      ctx.fillText(node.title, node.x, node.y + size + 4);
      return;
    }

    // Draw Artifact Node (Image)
    if (!node.img) {
      const img = new Image();
      img.src = node.imgUrl;
      img.onload = () => {
        node.img = img;
      };
      // Draw placeholder while loading
      ctx.fillStyle = '#1e1e1e';
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      node.img,
      node.x - size,
      node.y - size,
      size * 2,
      size * 2
    );

    // Draw highlight ring if hovered or loaded
    if (hoverNode?.id === node.id || node.loaded) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = node.loaded ? '#05C3DD' : '#E8FB24'; // loaded = cyan, hover = yellow
      ctx.stroke();
    }
    ctx.restore();
  }, [hoverNode]);

  return (
    <div className="h-screen w-screen bg-mca-black overflow-hidden flex flex-col relative font-mono text-white">
      
      {/* Top Banner */}
      <div className="absolute top-0 left-0 w-full z-10 border-b-2 border-white/20 bg-mca-black/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-mca-yellow hover:text-white font-bold uppercase tracking-widest text-xs border border-mca-yellow hover:border-white px-3 py-1 transition-colors">
            &larr; BACK
          </Link>
          <h1 className="text-lg md:text-xl font-display font-black uppercase tracking-widest text-mca-cyan">
            MUSEUM CONNECTIONS
          </h1>
        </div>
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          {isReady ? `Nodes: ${graphData.nodes.length} | Links: ${graphData.links.length}` : 'INITIALIZING ENGINE...'}
        </div>
      </div>

      {/* Force Graph Canvas */}
      <div className="flex-1 w-full h-full cursor-crosshair">
        {typeof window !== 'undefined' && (
          // @ts-ignore - react-force-graph doesn't have perfect TS definitions
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel="title"
            nodeColor={(node: any) => node.type === 'creator' ? '#05C3DD' : '#ffffff'}
            linkColor={() => 'rgba(255,255,255,0.2)'}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color: any, ctx: any) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
            onNodeHover={(node: any) => setHoverNode(node || null)}
            onNodeClick={handleNodeClick}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTicks={100}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={0.005}
          />
        )}
      </div>

      {/* Info Panel Overlay */}
      {hoverNode && hoverNode.type === 'artifact' && (
        <div className="absolute bottom-8 right-8 z-10 bg-mca-black border-2 border-mca-cyan p-6 max-w-sm brutalist-shadow-cyan">
          <div className="text-[10px] font-bold text-mca-cyan uppercase tracking-widest mb-2">
            ARTIFACT DATA
          </div>
          <h2 className="text-lg font-black uppercase leading-tight mb-2 truncate">
            {hoverNode.title}
          </h2>
          <p className="text-xs text-slate-300 font-bold uppercase mb-4 truncate">
            {hoverNode.creator}
          </p>
          <div className="w-full aspect-square bg-mca-dark border border-white/20 mb-4 overflow-hidden relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={hoverNode.imgUrl} 
              alt={hoverNode.title}
              className="w-full h-full object-contain"
            />
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-mca-yellow uppercase tracking-widest animate-pulse">
              {!hoverNode.loaded ? 'CLICK NODE TO EXPAND NETWORK' : 'NETWORK EXPANDED'}
            </span>
            <Link 
              href={`/record/${encodeURIComponent(hoverNode.id)}`}
              target="_blank"
              className="text-xs font-bold text-mca-black bg-mca-cyan hover:bg-white px-3 py-1 uppercase tracking-widest transition-colors"
            >
              VIEW
            </Link>
          </div>
        </div>
      )}

      {/* Intro Modal Overlay */}
      {graphData.nodes.length > 0 && graphData.nodes.length <= 15 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none text-center">
          <div className="bg-mca-black/90 border border-white p-6 max-w-md mx-auto backdrop-blur-md">
            <h2 className="text-xl font-black text-mca-cyan uppercase tracking-widest mb-2">
              Explore the Archive
            </h2>
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
              Click any artifact node to query the Lakehouse and map out its connections to other artifacts sharing the same creator.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
