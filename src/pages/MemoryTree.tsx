import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowDownToLine,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  Filter,
  FolderHeart,
  Heart,
  ImagePlus,
  Layers3,
  LockKeyhole,
  Maximize2,
  Minus,
  Music2,
  PanelRightOpen,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  TreePine,
  WandSparkles,
} from 'lucide-react';
import MemoryLightbox from '../components/MemoryLightbox';
import DriveMediaPreview from '../components/DriveMediaPreview';
import type { SlideshowTemplate, SlideshowTransition } from '../components/MemoryLightbox';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { groupMemoriesByYear } from '../data/memories';
import type { Memory } from '../data/memories';
import { DRIVE_MEMORIES_UPDATED_EVENT, readDriveMemories } from '../services/driveLibrary';

type TreeNodeKind = 'root' | 'year' | 'event' | 'media';

interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  accent: string;
  order: number;
  parentId?: string;
  memory?: Memory;
  memories: Memory[];
  count: number;
}

interface TreeEdge {
  id: string;
  from: string;
  to: string;
  d: string;
  color: string;
  order: number;
}

interface TreeModel {
  nodes: TreeNode[];
  edges: TreeEdge[];
  nodeMap: Map<string, TreeNode>;
  width: number;
  height: number;
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMOTION_COLORS: Record<string, { primary: string; accent: string }> = {
  joy: { primary: '#ffd166', accent: '#ff8f70' },
  nostalgia: { primary: '#8ee3ff', accent: '#ff5fd2' },
  love: { primary: '#ff5fd2', accent: '#ffe66d' },
  adventure: { primary: '#36f1cd', accent: '#8ee3ff' },
  friendship: { primary: '#7cf7ff', accent: '#b8ff6a' },
  celebration: { primary: '#ffcf5f', accent: '#ff4ecd' },
  farewell: { primary: '#d8f3ff', accent: '#36f1cd' },
};

const FRAME_THEMES = [
  'Classic Elegant',
  'Modern Glass',
  'Wedding Gold',
  'Vintage Paper',
  'Kids Birthday',
  'Film Strip',
  'Polaroid',
  'Premium Matte',
  'Romantic Glow',
  'Festival Light',
];

const STORY_TEMPLATES = [
  'Wedding Romance',
  'Kids Birthday',
  'Anniversary',
  'Travel Journey',
  'College Farewell',
  'Family Archive',
  'Baby First Year',
];

const EXPORT_FORMATS = ['JPG', 'PNG', 'WEBP', 'PDF', 'ZIP', 'MP4', 'Print PDF'];

const INVITATION_TEMPLATES = ['Wedding', 'Birthday', 'Anniversary', 'Baby Shower', 'Family Reunion', 'Graduation'];

const TREE_WIDTH = typeof window !== "undefined" ? Math.max(960, Math.min(1680, window.innerWidth * 1.15)) : 1280;
const ROOT_WIDTH = 220;
const ROOT_HEIGHT = 168;
const YEAR_WIDTH = 176;
const YEAR_HEIGHT = 112;
const EVENT_WIDTH = 168;
const EVENT_HEIGHT = 104;
const MEDIA_WIDTH = 148;
const MEDIA_HEIGHT = 134;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const templateFromLabel = (label: string): SlideshowTemplate => {
  const value = label.toLowerCase();
  if (value.includes('wedding')) return 'wedding';
  if (value.includes('kids')) return 'kids-birthday';
  if (value.includes('birthday')) return 'birthday';
  if (value.includes('baby')) return 'baby';
  if (value.includes('travel')) return 'travel';
  if (value.includes('college')) return 'college';
  if (value.includes('family')) return 'family';
  return 'nostalgia';
};

const branchPath = (from: TreeNode, to: TreeNode) => {
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height;
  const endX = to.x + to.width / 2;
  const endY = to.y;
  const distance = Math.max(80, endY - startY);
  const curve = distance * 0.48;
  return `M ${startX} ${startY} C ${startX} ${startY + curve}, ${endX} ${endY - curve}, ${endX} ${endY}`;
};

const groupByEvent = (memories: Memory[]) => {
  const map = new Map<string, Memory[]>();
  memories.forEach(memory => {
    const key = memory.event || `${MONTH_NAMES[memory.month]} ${memory.year}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(memory);
  });
  return Array.from(map.entries()).map(([event, items]) => ({
    event,
    memories: items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }));
};

const colorForMemory = (memory?: Memory, fallback = '#9bffec') => {
  if (!memory?.emotion) return { primary: fallback, accent: '#ff4ecd' };
  return EMOTION_COLORS[memory.emotion] || { primary: fallback, accent: '#ff4ecd' };
};

const buildTreeModel = (memories: Memory[], themePrimary: string): TreeModel => {
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  let order = 0;
  let yCursor = 34;

  const root: TreeNode = {
    id: 'root',
    kind: 'root',
    title: 'My Memories',
    subtitle: `${memories.length} living moments`,
    x: TREE_WIDTH / 2 - ROOT_WIDTH / 2,
    y: yCursor,
    width: ROOT_WIDTH,
    height: ROOT_HEIGHT,
    color: themePrimary,
    accent: '#ff4ecd',
    order: order++,
    memories,
    count: memories.length,
  };
  nodes.push(root);
  yCursor += 272;

  const years = groupMemoriesByYear(memories);
  years.forEach((year, yearIndex) => {
    const yearMemories = year.memories;
    const yearColor = colorForMemory(yearMemories.find(item => item.isFavorite) || yearMemories[0], themePrimary);
    const yearOffset = yearIndex % 2 === 0 ? -520 : 520;
    const yearNode: TreeNode = {
      id: `year-${year.year}`,
      kind: 'year',
      title: String(year.year),
      subtitle: `${yearMemories.length} memories`,
      x: TREE_WIDTH / 2 - YEAR_WIDTH / 2 + yearOffset,
      y: yCursor,
      width: YEAR_WIDTH,
      height: YEAR_HEIGHT,
      color: yearColor.primary,
      accent: yearColor.accent,
      order: order++,
      parentId: root.id,
      memories: yearMemories,
      count: yearMemories.length,
    };
    nodes.push(yearNode);
    edges.push({ id: `${root.id}-${yearNode.id}`, from: root.id, to: yearNode.id, d: branchPath(root, yearNode), color: yearNode.color, order: yearNode.order });

    const eventGroups = groupByEvent(yearMemories);
    const eventY = yCursor + 166;
    const eventGap = eventGroups.length <= 1 ? 0 : (TREE_WIDTH - 460) / (eventGroups.length - 1);

    eventGroups.forEach((group, eventIndex) => {
      const eventColor = colorForMemory(group.memories.find(item => item.isFavorite) || group.memories[0], yearNode.color);
      const rawX = eventGroups.length <= 1 ? TREE_WIDTH / 2 - EVENT_WIDTH / 2 : 230 + eventGap * eventIndex - EVENT_WIDTH / 2;
      const eventNode: TreeNode = {
        id: `event-${year.year}-${eventIndex}`,
        kind: 'event',
        title: group.event,
        subtitle: `${group.memories.length} item${group.memories.length > 1 ? 's' : ''}`,
        x: clamp(rawX, 44, TREE_WIDTH - EVENT_WIDTH - 44),
        y: eventY,
        width: EVENT_WIDTH,
        height: EVENT_HEIGHT,
        color: eventColor.primary,
        accent: eventColor.accent,
        order: order++,
        parentId: yearNode.id,
        memories: group.memories,
        count: group.memories.length,
      };
      nodes.push(eventNode);
      edges.push({ id: `${yearNode.id}-${eventNode.id}`, from: yearNode.id, to: eventNode.id, d: branchPath(yearNode, eventNode), color: eventNode.color, order: eventNode.order });

      const leaves = group.memories;
      leaves.forEach((memory, memoryIndex) => {
        const row = Math.floor(memoryIndex / 3);
        const column = memoryIndex % 3;
        const spread = Math.min(leaves.length, 3);
        const centeredColumn = column - (spread - 1) / 2;
        const mediaColor = colorForMemory(memory, eventNode.color);
        const leafX = clamp(eventNode.x + EVENT_WIDTH / 2 - MEDIA_WIDTH / 2 + centeredColumn * 220, 28, TREE_WIDTH - MEDIA_WIDTH - 28);
        const leafY = eventY + 142 + row * 156;
        const mediaNode: TreeNode = {
          id: `media-${memory.id}`,
          kind: 'media',
          title: memory.title,
          subtitle: `${MONTH_NAMES[memory.month]} ${memory.year}`,
          x: leafX,
          y: leafY,
          width: MEDIA_WIDTH,
          height: MEDIA_HEIGHT,
          color: mediaColor.primary,
          accent: mediaColor.accent,
          order: order++,
          parentId: eventNode.id,
          memory,
          memories: [memory],
          count: 1,
        };
        nodes.push(mediaNode);
        edges.push({ id: `${eventNode.id}-${mediaNode.id}`, from: eventNode.id, to: mediaNode.id, d: branchPath(eventNode, mediaNode), color: mediaNode.color, order: mediaNode.order });
      });
    });

    const deepestRowCount = Math.max(...eventGroups.map(group => Math.ceil(group.memories.length / 3)), 1);
    yCursor += 390 + deepestRowCount * 156;
  });

  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  return {
    nodes,
    edges,
    nodeMap,
    width: TREE_WIDTH,
    height: yCursor + 120,
  };
};

const getPathIds = (nodeId: string | null, nodeMap: Map<string, TreeNode>) => {
  if (!nodeId) return new Set<string>();
  const ids = new Set<string>();
  let current = nodeMap.get(nodeId);
  while (current) {
    ids.add(current.id);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return ids;
};

const IconButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}> = ({ label, icon, onClick, active, disabled }) => (
  <motion.button
    whileHover={disabled ? undefined : { y: -2 }}
    whileTap={disabled ? undefined : { scale: 0.97 }}
    onClick={onClick}
    disabled={disabled}
    className={`memory-tool-button ${active ? 'memory-tool-button-active' : ''}`}
    title={label}
    aria-label={label}
  >
    {icon}
    <span>{label}</span>
  </motion.button>
);

const CinematicTreeBackground: React.FC = () => (
  <div className="memory-scene-bg" aria-hidden="true">
    <div className="memory-mountain-layer memory-mountain-back" />
    <div className="memory-mountain-layer memory-mountain-mid" />
    <div className="memory-mountain-layer memory-mountain-front" />
    <div className="memory-aurora-sweep" />
    <div className="memory-starfield" />
    <div className="memory-vignette" />
  </div>
);

const MemoryNodeMediaPreview: React.FC<{ memory: Memory }> = ({ memory }) => (
  <DriveMediaPreview memory={memory} className="memory-node-image-preview" />
);

const NodeCard = React.memo<{
  node: TreeNode;
  selected: boolean;
  inPath: boolean;
  collapsed: boolean;
  onClick: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
}>(({ node, selected, inPath, collapsed, onClick, onToggle }) => {
  const isMedia = node.kind === 'media';
  const isBranch = node.kind === 'year' || node.kind === 'event';

  return (
    <div
      className={`memory-node memory-node-${node.kind} ${selected ? 'is-selected' : ''} ${inPath ? 'is-in-path' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        borderColor: `${node.color}${selected ? 'dd' : '66'}`,
        boxShadow: selected ? `0 0 40px ${node.color}55, inset 0 0 18px ${node.color}1f` : `0 0 22px ${node.color}20`,
      }}
    >
      <button className="memory-node-hit" onClick={() => onClick(node)} aria-label={`Open ${node.title}`}>
        {isMedia && node.memory ? (
          <>
            <MemoryNodeMediaPreview memory={node.memory} />
            <span className="memory-media-shade" />
            {node.memory.isFavorite && <Star className="memory-favorite-star" size={14} style={{ color: '#ffd166' }} fill="currentColor" />}
          </>
        ) : (
          <div className="memory-branch-face" style={{ background: `linear-gradient(135deg, ${node.color}26, ${node.accent}18)` }}>
            {node.kind === 'root' && node.memory && <DriveMediaPreview memory={node.memory} alt="" />}
            {node.kind === 'year' && <CalendarDays size={22} />}
            {node.kind === 'event' && <FolderHeart size={21} />}
          </div>
        )}
        <span className="memory-node-copy">
          <span className="memory-node-title">{node.title}</span>
          <span className="memory-node-subtitle">{node.subtitle}</span>
        </span>
      </button>

      {isBranch && (
        <button
          className="memory-node-toggle"
          onClick={event => {
            event.stopPropagation();
            onToggle(node);
          }}
          aria-label={collapsed ? 'Expand branch' : 'Collapse branch'}
          title={collapsed ? 'Expand Branch' : 'Collapse Branch'}
          style={{ borderColor: `${node.color}66`, color: node.color }}
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      )}
    </div>
  );
});
NodeCard.displayName = 'NodeCard';

const StudioPanel: React.FC<{
  selectedNode: TreeNode | null;
  memories: Memory[];
  onOpenMemory: (memory: Memory) => void;
  onPlayStory: (template?: SlideshowTemplate) => void;
  onAction: (message: string) => void;
  onDownloadAlbum: (format?: string) => void;
  onShare: () => void;
}> = ({ selectedNode, memories, onOpenMemory, onPlayStory, onAction, onDownloadAlbum, onShare }) => {
  const { config } = useTheme();
  const [editorItems, setEditorItems] = useState<Memory[]>(() => memories.slice(0, 8));
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    const source = selectedNode?.memories?.length ? selectedNode.memories : memories;
    setEditorItems(source.slice(0, 8));
  }, [selectedNode, memories]);

  const moveDragged = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setEditorItems(items => {
      const from = items.findIndex(item => item.id === dragId);
      const to = items.findIndex(item => item.id === targetId);
      if (from < 0 || to < 0) return items;
      const next = [...items];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked);
      return next;
    });
  };

  const active = selectedNode || {
    title: 'Memory Tree',
    subtitle: `${memories.length} memories`,
    memories,
    count: memories.length,
    color: config.primary,
  };

  return (
    <aside className="memory-studio-panel">
      <div className="memory-panel-section">
        <div className="memory-panel-kicker">
          <PanelRightOpen size={14} />
          Branch Studio
        </div>
        <h2>{active.title}</h2>
        <p>{active.subtitle}</p>
        <div className="memory-panel-actions">
          <button onClick={() => onPlayStory()}><Play size={14} /> Play Story</button>
          <button onClick={onShare}><Share2 size={14} /> Share Link</button>
          <button onClick={() => onAction('Branch marked as favorite.')}><Heart size={14} /> Favorite</button>
          <button onClick={() => onAction('Caption editor opened for this branch.')}><PenLine size={14} /> Add Caption</button>
          <button onClick={() => onAction('Cover image set from the current branch preview.')}><ImagePlus size={14} /> Set Cover</button>
          <button onClick={() => onDownloadAlbum()}><Download size={14} /> Download</button>
        </div>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <Layers3 size={15} />
          Album Editor
        </div>
        <div className="memory-editor-grid">
          {editorItems.map(item => (
            <button
              key={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={event => event.preventDefault()}
              onDrop={() => moveDragged(item.id)}
              onClick={() => onOpenMemory(item)}
              className="memory-editor-tile"
              style={{ borderColor: dragId === item.id ? config.primary : 'rgba(255,255,255,0.14)' }}
            >
              <DriveMediaPreview memory={item} alt={item.title} />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
        <div className="memory-compact-actions">
          <button onClick={() => onAction('Album rename saved locally.')}>Rename Album</button>
          <button onClick={() => onAction('Selected branch merged into the current album preview.')}>Merge</button>
          <button onClick={() => onAction('Duplicate scan complete. No duplicates found in demo data.')}>Remove Duplicates</button>
          <button onClick={() => onAction('Sub-album created in the editor preview.')}>Create Sub-album</button>
        </div>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <WandSparkles size={15} />
          Story Builder
        </div>
        <div className="memory-chip-row">
          {STORY_TEMPLATES.map(template => <button key={template} onClick={() => onPlayStory(templateFromLabel(template))}>{template}</button>)}
        </div>
        <div className="memory-compact-actions">
          <button onClick={() => onAction('Story draft saved.')}>Save Story</button>
          <button onClick={() => onPlayStory()}>Preview Story</button>
          <button onClick={() => onAction('Story published as a private preview link.')}>Publish Story</button>
          <button onClick={() => onAction('Soundtrack attached to this story.')}>Add Music</button>
        </div>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <Sparkles size={15} />
          Frames
        </div>
        <div className="memory-chip-row">
          {FRAME_THEMES.map(frame => <button key={frame} onClick={() => onAction(`${frame} applied to this album.`)}>{frame}</button>)}
        </div>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <FileArchive size={15} />
          Export
        </div>
        <div className="memory-export-grid">
          {EXPORT_FORMATS.map(format => (
            <button key={format} onClick={() => onDownloadAlbum(format)}>
              {format === 'PDF' || format === 'Print PDF' ? <FileText size={14} /> : format === 'ZIP' ? <FileArchive size={14} /> : <FileImage size={14} />}
              {format}
            </button>
          ))}
        </div>
        <label className="memory-toggle-row"><input type="checkbox" defaultChecked /> Include captions</label>
        <label className="memory-toggle-row"><input type="checkbox" defaultChecked /> Print-safe quality</label>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <Bot size={15} />
          Invitation Builder
        </div>
        <div className="memory-chip-row">
          {INVITATION_TEMPLATES.map(template => <button key={template} onClick={() => onAction(`${template} invitation preview generated.`)}>{template}</button>)}
        </div>
        <div className="memory-invite-preview">
          {(selectedNode?.memories?.[0] || memories[0]) && <DriveMediaPreview memory={(selectedNode?.memories?.[0] || memories[0])} alt="" />}
          <div>
            <strong>Family Evening</strong>
            <span>Animated preview ready</span>
          </div>
        </div>
      </div>

      <div className="memory-panel-section">
        <div className="memory-panel-title">
          <LockKeyhole size={15} />
          Sharing
        </div>
        <div className="memory-permission-list">
          <span>Private link</span>
          <span>Password protected</span>
          <span>Family-only</span>
          <span>Expiry date</span>
          <span>Revoke anytime</span>
        </div>
      </div>
    </aside>
  );
};

const MemoryTree: React.FC = () => {
  const { config } = useTheme();
  const { isMusicOn, setMusicOn } = useUser();
  const shellRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const autoCenteredLayoutRef = useRef<string>('');
  const userInteractedRef = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [viewerSequence, setViewerSequence] = useState<Memory[]>(driveMemories);
  const [viewerAutoplay, setViewerAutoplay] = useState(false);
  const [viewerTemplate, setViewerTemplate] = useState<SlideshowTemplate>('auto');
  const [viewerTransition, setViewerTransition] = useState<SlideshowTransition>('branch-guided');
  const [renderLimit, setRenderLimit] = useState(10000);
  const [zoom, setZoom] = useState(0.78);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'photos' | 'videos'>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [journey, setJourney] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollFrameRef = useRef(0);
  const [actionToast, setActionToast] = useState('');

  useEffect(() => {
    const refresh = () => {
      const next = readDriveMemories();
      setDriveMemories(next);
      setViewerSequence(next);
      setSelectedMemory(current => current && next.some(memory => memory.id === current.id) ? current : null);
    };
    window.addEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refresh);
  }, []);

  const emitAction = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => setActionToast(''), 1900);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const filteredMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return driveMemories.filter(memory => {
      if (filterMode === 'favorites' && !memory.isFavorite) return false;
      if (filterMode === 'photos' && memory.type !== 'photo') return false;
      if (filterMode === 'videos' && memory.type !== 'video') return false;
      if (!needle) return true;
      return (
      [memory.title, memory.caption, memory.location, memory.event, memory.year, memory.month, ...(memory.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
      );
    });
  }, [driveMemories, filterMode, query]);

  const model = useMemo(() => buildTreeModel(filteredMemories, config.primary), [filteredMemories, config.primary]);
  const layoutSignature = useMemo(
    () => `${config.primary}:${filteredMemories.map(memory => memory.id).join('|')}`,
    [config.primary, filteredMemories]
  );
  const pathIds = useMemo(() => getPathIds(selectedNodeId, model.nodeMap), [selectedNodeId, model.nodeMap]);
  const selectedNode = model.nodeMap.get(selectedNodeId) || model.nodeMap.get('root') || null;
  const favoriteCount = useMemo(() => filteredMemories.filter(memory => memory.isFavorite).length, [filteredMemories]);
  const locationCount = useMemo(() => new Set(filteredMemories.map(memory => memory.location).filter(Boolean)).size, [filteredMemories]);

  const hiddenByCollapse = useCallback((node: TreeNode) => {
    let current = node.parentId ? model.nodeMap.get(node.parentId) : undefined;
    while (current) {
      if (collapsed.has(current.id)) return true;
      current = current.parentId ? model.nodeMap.get(current.parentId) : undefined;
    }
    return false;
  }, [collapsed, model.nodeMap]);

  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const visibleNodes = useMemo(() => {
    const low = scrollTop / zoom - 560;
    const high = (scrollTop + viewportHeight) / zoom + 780;
    return model.nodes.filter(node => {
      if (hiddenByCollapse(node)) return false;
      if (node.kind !== 'media') return true;
      return node.y + node.height >= low && node.y <= high;
    });
  }, [hiddenByCollapse, model.nodes, renderLimit, scrollTop, viewportHeight, zoom]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => model.edges.filter(edge => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)), [model.edges, visibleNodeIds]);

  useEffect(() => {
    autoCenteredLayoutRef.current = '';
    userInteractedRef.current = false;
  }, [layoutSignature]);

  useEffect(() => {
    const root = model.nodeMap.get('root');
    if (!root || autoCenteredLayoutRef.current === layoutSignature) return;
    const positionRoot = () => {
      const scroller = scrollerRef.current;
      if (!scroller || userInteractedRef.current) return;
      const left = root.x * zoom - scroller.clientWidth / 2 + (root.width * zoom) / 2;
      const top = root.y * zoom - 28;
      scroller.scrollLeft = Math.max(0, left);
      scroller.scrollTop = Math.max(0, top);
      autoCenteredLayoutRef.current = layoutSignature;
    };
    const frame = window.requestAnimationFrame(positionRoot);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [layoutSignature, model.nodeMap, zoom]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scroller = scrollerRef.current;
    if (!sentinel || !scroller) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setRenderLimit(limit => Math.max(limit, model.nodes.length));
        }
      },
      { root: scroller, rootMargin: '650px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [model.nodes.length]);

  const centerNode = (node: TreeNode) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = node.x * zoom - scroller.clientWidth / 2 + (node.width * zoom) / 2;
    const top = node.y * zoom - scroller.clientHeight / 2 + (node.height * zoom) / 2;
    scroller.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth' });
  };

  const getSequenceForNode = (node: TreeNode) => {
    if (node.kind === 'media' && node.memory) {
      const parentMemories = node.parentId ? model.nodeMap.get(node.parentId)?.memories : undefined;
      return parentMemories?.length ? parentMemories : [node.memory];
    }
    return node.memories.length ? node.memories : filteredMemories;
  };

  const handleNodeClick = (node: TreeNode) => {
    setSelectedNodeId(node.id);
    centerNode(node);
    if (node.kind === 'media' && node.memory) {
      setViewerSequence(getSequenceForNode(node));
      setViewerAutoplay(false);
      setViewerTemplate('auto');
      setViewerTransition('crossfade');
      setSelectedMemory(node.memory);
    }
  };

  const toggleBranch = (node: TreeNode) => {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const resetView = () => {
    setSelectedNodeId('root');
    setCollapsed(new Set());
    setRenderLimit(10000);
    setZoom(0.78);
    const root = model.nodeMap.get('root');
    if (root) window.setTimeout(() => centerNode(root), 40);
  };

  const cycleFilter = () => {
    const order: Array<typeof filterMode> = ['all', 'favorites', 'photos', 'videos'];
    const next = order[(order.indexOf(filterMode) + 1) % order.length];
    setFilterMode(next);
    emitAction(`Filter: ${next}`);
  };

  const startCinematicJourney = (template: SlideshowTemplate = 'auto') => {
    const source = selectedNode?.memories?.length ? selectedNode.memories : filteredMemories;
    const sequence = source.length ? source : driveMemories;
    if (!sequence.length) {
      emitAction('Connect Google Drive in Memoriya first');
      return;
    }
    const first = selectedNode?.kind === 'media' && selectedNode.memory ? selectedNode.memory : sequence[0];
    setViewerSequence(sequence);
    setViewerTemplate(template);
    setViewerTransition(template === 'travel' ? 'ken-burns' : template === 'wedding' ? 'dream-dissolve' : 'branch-guided');
    setViewerAutoplay(true);
    setJourney(true);
    setSelectedMemory(first);
    const firstNode = model.nodeMap.get(`media-${first.id}`);
    if (firstNode) {
      setSelectedNodeId(firstNode.id);
      centerNode(firstNode);
    }
  };

  const openFullscreenViewer = () => {
    const source = selectedNode?.memories?.length ? selectedNode.memories : filteredMemories;
    const sequence = source.length ? source : driveMemories;
    const first = selectedNode?.kind === 'media' && selectedNode.memory ? selectedNode.memory : sequence[0];
    if (!first) {
      emitAction('Connect Google Drive in Memoriya first');
      return;
    }
    setViewerSequence(sequence);
    setViewerAutoplay(false);
    setViewerTemplate('auto');
    setViewerTransition('crossfade');
    setSelectedMemory(first);
  };

  const handleViewerIndexChange = (memory: Memory) => {
    const node = model.nodeMap.get(`media-${memory.id}`);
    if (!node) return;
    setSelectedNodeId(node.id);
    centerNode(node);
  };

  const closeViewer = () => {
    setSelectedMemory(null);
    setViewerAutoplay(false);
    setJourney(false);
  };

  const downloadAlbum = (format = 'ZIP') => {
    const source = selectedNode?.memories?.length ? selectedNode.memories : filteredMemories;
    const content = source.map((memory, index) => `${index + 1}. ${memory.title}\n${memory.caption}\n${memory.url}`).join('\n\n');
    downloadTextFile(`memory-tree-${format.toLowerCase().replace(/\s+/g, '-')}-export.txt`, content || 'No memories selected.');
    emitAction(`${format} export package prepared.`);
  };

  const shareBranch = async () => {
    const title = selectedNode?.title || 'Memory Tree';
    const text = `Shared memory branch: ${title}`;
    try {
      if (navigator.share) await navigator.share({ title, text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      emitAction('Private share link ready.');
    } catch {
      emitAction('Share cancelled.');
    }
  };

  const jumpToRandom = () => {
    const mediaNodes = model.nodes.filter(node => node.kind === 'media');
    const node = mediaNodes[Math.floor(Math.random() * mediaNodes.length)];
    if (node) handleNodeClick(node);
  };

  const jumpToYear = () => {
    const yearNode = model.nodes.find(node => node.kind === 'year');
    if (yearNode) handleNodeClick(yearNode);
  };

  return (
    <div className="memory-tree-page">
      <CinematicTreeBackground />

      <section className="memory-tree-hero">
        <div className="memory-hero-copy">
          <div className="memory-kicker">
            <TreePine size={15} />
            Memory Tree
          </div>
          <h1><span>Cinematic</span> Archive</h1>
          <p className="memory-hero-lead">
            Explore your moments without scroll jumps, open photos faster, and move through the archive like a living map.
          </p>
          <div className="memory-hero-stats">
            <div className="memory-hero-stat">
              <strong>{filteredMemories.length}</strong>
              <span>memories in view</span>
            </div>
            <div className="memory-hero-stat">
              <strong>{favoriteCount}</strong>
              <span>favorites highlighted</span>
            </div>
            <div className="memory-hero-stat">
              <strong>{locationCount}</strong>
              <span>places remembered</span>
            </div>
          </div>
        </div>

        <div className="memory-hero-actions">
          <IconButton label="Landing" icon={<Archive size={14} />} onClick={resetView} />
          <IconButton label="Get Started" icon={<Sparkles size={14} />} onClick={resetView} />
          <IconButton label="Explore Memory Tree" icon={<TreePine size={14} />} onClick={resetView} active />
          <IconButton label="Shared Memories" icon={<Share2 size={14} />} onClick={shareBranch} />
          <IconButton label="Settings" icon={<LockKeyhole size={14} />} onClick={() => emitAction('Slideshow settings are available inside fullscreen playback.')} />
          <IconButton label="Toggle Theme" icon={<RefreshCcw size={14} />} onClick={() => emitAction('Use the navbar palette button to switch global theme.')} />
          <IconButton label={isMusicOn ? 'Toggle Music' : 'Toggle Music'} icon={<Music2 size={14} />} onClick={() => setMusicOn(!isMusicOn)} active={isMusicOn} />
        </div>
      </section>

      <section ref={shellRef} className="memory-tree-shell">
        <div className="memory-tree-toolbar">
          <label className="memory-search">
            <Search size={15} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memories" />
          </label>
          <div className="memory-toolbar-group">
            <IconButton label={`Filter: ${filterMode}`} icon={<Filter size={14} />} onClick={cycleFilter} active={filterMode !== 'all'} />
            <IconButton label="View Tree" icon={<TreePine size={14} />} onClick={resetView} active />
            <IconButton label="View Timeline" icon={<CalendarDays size={14} />} onClick={() => emitAction('Timeline view is synced with this tree in the top navigation.')} />
            <IconButton label="View Grid" icon={<Layers3 size={14} />} onClick={() => emitAction('Grid preview is available in the album editor below.')} />
            <IconButton label="Zoom In" icon={<Plus size={14} />} onClick={() => setZoom(value => clamp(value + 0.08, 0.5, 1.2))} />
            <IconButton label="Zoom Out" icon={<Minus size={14} />} onClick={() => setZoom(value => clamp(value - 0.08, 0.5, 1.2))} />
            <IconButton label="Reset View" icon={<RefreshCcw size={14} />} onClick={resetView} />
            <IconButton label={journey ? 'Pause Journey' : 'Play Tree Journey'} icon={journey ? <Pause size={14} /> : <Play size={14} />} onClick={() => journey ? setViewerAutoplay(value => !value) : startCinematicJourney()} active={journey} />
            <IconButton label="Random Memory" icon={<Shuffle size={14} />} onClick={jumpToRandom} />
            <IconButton label="Fullscreen" icon={<Maximize2 size={14} />} onClick={openFullscreenViewer} />
            <IconButton label="Back to Root" icon={<ArrowDownToLine size={14} />} onClick={resetView} />
            <IconButton label="Jump to Year" icon={<CalendarDays size={14} />} onClick={jumpToYear} />
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="memory-tree-viewport"
          onWheel={() => {
            userInteractedRef.current = true;
          }}
          onPointerDown={() => {
            userInteractedRef.current = true;
          }}
          onScroll={event => {
            userInteractedRef.current = true;
            const top = event.currentTarget.scrollTop;
            if (scrollFrameRef.current) return;
            scrollFrameRef.current = window.requestAnimationFrame(() => {
              scrollFrameRef.current = 0;
              // Bucket to 160px so React only re-renders when new rows can appear.
              const bucket = Math.floor(top / 160) * 160;
              setScrollTop(prev => (prev === bucket ? prev : bucket));
            });
          }}
        >
          <div
            className="memory-tree-canvas"
            style={{
              width: model.width * zoom,
              height: model.height * zoom,
            }}
          >
            <div
              className="memory-tree-world"
              style={{
                width: model.width,
                height: model.height,
                transform: `scale(${zoom})`,
              }}
            >
              <svg className="memory-branch-svg" width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true">
                <defs>
                  <filter id="memory-branch-bloom" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {visibleEdges.filter(edge => pathIds.has(edge.from) && pathIds.has(edge.to)).map(edge => (
                    <linearGradient key={`gradient-${edge.id}`} id={`gradient-${edge.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={edge.color} stopOpacity="0.08" />
                      <stop offset="42%" stopColor={edge.color} stopOpacity="0.86" />
                      <stop offset="72%" stopColor="#ffffff" stopOpacity="0.72" />
                      <stop offset="100%" stopColor={edge.color} stopOpacity="0.18" />
                    </linearGradient>
                  ))}
                </defs>
                {visibleEdges.map(edge => {
                  const active = pathIds.has(edge.from) && pathIds.has(edge.to);
                  return (
                    <g key={edge.id}>
                      <path
                        d={edge.d}
                        stroke={active ? edge.color : 'rgba(255,255,255,0.13)'}
                        strokeWidth={active ? 4.5 : 2.2}
                        strokeLinecap="round"
                        fill="none"
                        opacity={active ? 0.95 : 0.58}
                      />
                      {active && (
                        <path
                          d={edge.d}
                          stroke={`url(#gradient-${edge.id})`}
                          strokeWidth={3.2}
                          strokeLinecap="round"
                          fill="none"
                          className="memory-path-flow"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              <>
                {visibleNodes.map(node => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    selected={selectedNodeId === node.id}
                    inPath={pathIds.has(node.id)}
                    collapsed={collapsed.has(node.id)}
                    onClick={handleNodeClick}
                    onToggle={toggleBranch}
                  />
                ))}
              </>
              <div ref={sentinelRef} className="memory-tree-sentinel" style={{ top: model.height - 780 }} />
            </div>
          </div>
        </div>

        <div className="memory-mobile-controls">
          <button type="button" onClick={() => setZoom(value => clamp(value - 0.08, 0.62, 1.2))} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
          <button type="button" onClick={() => journey ? setViewerAutoplay(value => !value) : startCinematicJourney()} aria-label={journey ? 'Pause memory journey' : 'Play memory journey'} title={journey ? 'Pause journey' : 'Play journey'}>{journey ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" onClick={() => setZoom(value => clamp(value + 0.08, 0.62, 1.2))} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
          <button type="button" onClick={resetView} aria-label="Reset tree view" title="Reset view"><RefreshCcw size={16} /></button>
        </div>
      </section>

      <section className="memory-workspace">
        <StudioPanel
          selectedNode={selectedNode}
          memories={filteredMemories}
          onOpenMemory={memory => {
            setViewerSequence(selectedNode?.memories?.length ? selectedNode.memories : filteredMemories);
            setViewerAutoplay(false);
            setSelectedMemory(memory);
          }}
          onPlayStory={startCinematicJourney}
          onAction={emitAction}
          onDownloadAlbum={downloadAlbum}
          onShare={shareBranch}
        />

        <div className="memory-summary-grid">
          {[
            { label: 'Virtual Nodes', value: `${Math.min(renderLimit, model.nodes.length)} / ${model.nodes.length}`, icon: <Eye size={16} /> },
            { label: 'Albums', value: groupByEvent(filteredMemories).length, icon: <FolderHeart size={16} /> },
            { label: 'Exports', value: EXPORT_FORMATS.length, icon: <Download size={16} /> },
            { label: 'Protected Shares', value: '5 modes', icon: <LockKeyhole size={16} /> },
          ].map(item => (
            <div key={item.label} className="memory-stat-card">
              {item.icon}
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="memory-tree-quote">"Memories are the stories we tell our future."</p>

      <AnimatePresence>
        {actionToast && (
          <motion.div
            className="memory-page-toast"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
          >
            {actionToast}
          </motion.div>
        )}
      </AnimatePresence>

      <MemoryLightbox
        memory={selectedMemory}
        memories={viewerSequence}
        autoplay={viewerAutoplay}
        mode={journey ? 'tree' : 'viewer'}
        template={viewerTemplate}
        transitionStyle={viewerTransition}
        showTreeOverlay={journey}
        onIndexChange={handleViewerIndexChange}
        onAutoplayChange={setViewerAutoplay}
        onClose={closeViewer}
      />
    </div>
  );
};

export default MemoryTree;
