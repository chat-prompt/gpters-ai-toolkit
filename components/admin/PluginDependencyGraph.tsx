/**
 * Plugin dependency graph visualization components
 *
 * Provides SVG-based dependency graph visualization with interactive
 * nodes, cycle detection, impact analysis, and export capabilities.
 */
'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  type DependencyGraph,
  type GraphNode,
  type GraphEdge,
  type GraphLayoutOptions,
  type GraphFilterOptions,
  type ImpactAnalysis,
  NODE_STATUS_CONFIG,
  DEFAULT_LAYOUT_OPTIONS,
  calculateTreeLayout,
  detectCircularDependencies,
  getDirectDependencies,
  getDirectDependents,
  getGraphStatistics,
  exportToMermaid,
} from '@/lib/plugin/dependency-graph'

// ============================================
// Main Graph Visualization Component
// ============================================

/** Props for PluginDependencyGraph component */
interface PluginDependencyGraphProps {
  graph: DependencyGraph
  onNodeClick?: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null) => void
  layoutOptions?: GraphLayoutOptions
  filterOptions?: GraphFilterOptions
  width?: number
  /** Graph height in pixels */
  height?: number
}

/**
 * Interactive SVG dependency graph visualization
 *
 * Renders plugin dependencies as a directed graph with:
 * - Color-coded nodes by installation status
 * - Highlighted paths on hover
 * - Cycle detection visualization
 * - Node selection with detail panel
 */
export function PluginDependencyGraph({
  graph,
  onNodeClick,
  onNodeHover,
  layoutOptions = DEFAULT_LAYOUT_OPTIONS,
  width = 800,
  height = 600,
}: PluginDependencyGraphProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  const layoutGraph = useMemo(
    () => calculateTreeLayout(graph, layoutOptions),
    [graph, layoutOptions]
  )

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node)
      onNodeClick?.(node)
    },
    [onNodeClick]
  )

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      setHoveredNode(node)
      onNodeHover?.(node)
    },
    [onNodeHover]
  )

  // Calculate viewBox to fit all nodes
  const viewBox = useMemo(() => {
    if (layoutGraph.nodes.length === 0) return '0 0 800 600'

    const xs = layoutGraph.nodes.map((n) => n.x ?? 0)
    const ys = layoutGraph.nodes.map((n) => n.y ?? 0)
    const minX = Math.min(...xs) - 100
    const minY = Math.min(...ys) - 50
    const maxX = Math.max(...xs) + 100
    const maxY = Math.max(...ys) + 50

    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
  }, [layoutGraph.nodes])

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={viewBox}
        className="rounded-lg border border-gray-700 bg-gray-900"
      >
        {/* Edges */}
        <g className="edges">
          {layoutGraph.edges.map((edge, index) => (
            <EdgeLine
              key={index}
              edge={edge}
              nodes={layoutGraph.nodes}
              isHighlighted={
                hoveredNode?.id === edge.source || hoveredNode?.id === edge.target
              }
            />
          ))}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {layoutGraph.nodes.map((node) => (
            <NodeCircle
              key={node.id}
              node={node}
              isSelected={selectedNode?.id === node.id}
              isHovered={hoveredNode?.id === node.id}
              isRelated={
                hoveredNode
                  ? layoutGraph.edges.some(
                      (e) =>
                        (e.source === hoveredNode.id && e.target === node.id) ||
                        (e.target === hoveredNode.id && e.source === node.id)
                    )
                  : false
              }
              onClick={() => handleNodeClick(node)}
              onMouseEnter={() => handleNodeHover(node)}
              onMouseLeave={() => handleNodeHover(null)}
            />
          ))}
        </g>
      </svg>

      {/* Legend */}
      <GraphLegend />
    </div>
  )
}

// ============================================
// Node Circle Component
// ============================================

/** Props for NodeCircle component */
interface NodeCircleProps {
  node: GraphNode
  isSelected: boolean
  isHovered: boolean
  isRelated: boolean
  onClick: () => void
  onMouseEnter: () => void
  /** Mouse leave handler */
  onMouseLeave: () => void
}

/** SVG node circle with label and version */
function NodeCircle({
  node,
  isSelected,
  isHovered,
  isRelated,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: NodeCircleProps) {
  const config = NODE_STATUS_CONFIG[node.status]
  const x = node.x ?? 0
  const y = node.y ?? 0
  const radius = node.isRoot ? 30 : 24

  const fillColor = node.isCyclic
    ? 'rgb(239, 68, 68)'
    : node.status === 'installed'
      ? 'rgb(34, 197, 94)'
      : node.status === 'not_installed'
        ? 'rgb(239, 68, 68)'
        : node.status === 'outdated'
          ? 'rgb(234, 179, 8)'
          : 'rgb(107, 114, 128)'

  const opacity = isHovered || isRelated || isSelected ? 1 : 0.8

  return (
    <g
      className="cursor-pointer transition-transform"
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Glow effect for selected/hovered */}
      {(isSelected || isHovered) && (
        <circle r={radius + 6} fill={fillColor} opacity={0.3} />
      )}

      {/* Main circle */}
      <circle
        r={radius}
        fill={fillColor}
        opacity={opacity}
        stroke={isSelected ? 'white' : 'transparent'}
        strokeWidth={2}
      />

      {/* Icon */}
      <text
        textAnchor="middle"
        dy="0.3em"
        fill="white"
        fontSize={14}
        fontWeight="bold"
      >
        {config.icon}
      </text>

      {/* Label */}
      <text
        y={radius + 16}
        textAnchor="middle"
        fill="white"
        fontSize={11}
        className="pointer-events-none"
      >
        {node.name.length > 12 ? `${node.name.substring(0, 12)}...` : node.name}
      </text>

      {/* Version */}
      <text
        y={radius + 28}
        textAnchor="middle"
        fill="rgb(156, 163, 175)"
        fontSize={9}
        className="pointer-events-none"
      >
        v{node.version}
      </text>
    </g>
  )
}

// ============================================
// Edge Line Component
// ============================================

/** Props for EdgeLine component */
interface EdgeLineProps {
  /** Edge data */
  edge: GraphEdge
  /** All graph nodes for coordinate lookup */
  nodes: GraphNode[]
  /** Whether edge should be highlighted */
  isHighlighted: boolean
}

/** SVG edge line with arrow */
function EdgeLine({ edge, nodes, isHighlighted }: EdgeLineProps) {
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)

  if (!sourceNode || !targetNode) return null

  const x1 = sourceNode.x ?? 0
  const y1 = sourceNode.y ?? 0
  const x2 = targetNode.x ?? 0
  const y2 = targetNode.y ?? 0

  const strokeColor = edge.isCyclic ? 'rgb(239, 68, 68)' : isHighlighted ? 'rgb(96, 165, 250)' : 'rgb(75, 85, 99)'
  const strokeDasharray = edge.type === 'optional' ? '4,4' : edge.type === 'dev' ? '8,4' : undefined

  // Calculate arrow position
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const radius = 24
  const arrowX = x2 - Math.cos(angle) * radius
  const arrowY = y2 - Math.sin(angle) * radius

  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={arrowX}
        y2={arrowY}
        stroke={strokeColor}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeDasharray={strokeDasharray}
        opacity={isHighlighted ? 1 : 0.6}
      />
      {/* Arrow head */}
      <polygon
        points={`${arrowX},${arrowY} ${arrowX - 8 * Math.cos(angle - 0.4)},${arrowY - 8 * Math.sin(angle - 0.4)} ${arrowX - 8 * Math.cos(angle + 0.4)},${arrowY - 8 * Math.sin(angle + 0.4)}`}
        fill={strokeColor}
        opacity={isHighlighted ? 1 : 0.6}
      />
    </g>
  )
}

// ============================================
// Graph Legend
// ============================================

/** Graph legend showing node and edge type meanings */
function GraphLegend() {
  return (
    <div className="mt-4 flex flex-wrap gap-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-green-500" />
        <span className="text-gray-400">설치됨</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <span className="text-gray-400">미설치</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-yellow-500" />
        <span className="text-gray-400">업데이트 필요</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 w-6 bg-gray-500" />
        <span className="text-gray-400">필수 의존성</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 w-6 border-t-2 border-dashed border-gray-500" />
        <span className="text-gray-400">선택적 의존성</span>
      </div>
    </div>
  )
}

// ============================================
// Graph Statistics Panel
// ============================================

/** Props for GraphStatisticsPanel component */
interface GraphStatisticsPanelProps {
  /** Dependency graph to analyze */
  graph: DependencyGraph
}

/** Displays graph statistics in a grid */
export function GraphStatisticsPanel({ graph }: GraphStatisticsPanelProps) {
  const stats = useMemo(() => getGraphStatistics(graph), [graph])

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatItem label="전체 노드" value={stats.totalNodes} />
      <StatItem label="전체 엣지" value={stats.totalEdges} />
      <StatItem label="최대 깊이" value={stats.maxDepth} />
      <StatItem label="평균 의존성" value={stats.avgDependencies.toFixed(1)} />
      <StatItem label="설치됨" value={stats.installedCount} color="text-green-400" />
      <StatItem label="미설치" value={stats.notInstalledCount} color="text-red-400" />
      <StatItem label="업데이트 필요" value={stats.outdatedCount} color="text-yellow-400" />
      <StatItem
        label="순환 의존성"
        value={stats.cycleCount}
        color={stats.cycleCount > 0 ? 'text-red-400' : 'text-gray-400'}
      />
    </div>
  )
}

/** Individual statistic display item */
function StatItem({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

// ============================================
// Cycle Detection Panel
// ============================================

/** Props for CycleDetectionPanel component */
interface CycleDetectionPanelProps {
  /** Dependency graph to check for cycles */
  graph: DependencyGraph
}

/** Displays circular dependency detection results */
export function CycleDetectionPanel({ graph }: CycleDetectionPanelProps) {
  const result = useMemo(() => detectCircularDependencies(graph), [graph])

  if (!result.hasCycles) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">✓</span>
          <span className="font-medium text-green-400">순환 의존성이 없습니다</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <span className="font-medium text-red-400">
            {result.cycles.length}개의 순환 의존성이 감지되었습니다
          </span>
        </div>
      </div>

      {result.cycles.map((cycle, index) => (
        <div key={index} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h4 className="font-medium text-white">순환 #{index + 1}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {cycle.map((nodeId, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">{nodeId}</span>
                {i < cycle.length - 1 && <span className="text-gray-500">→</span>}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
        <h4 className="font-medium text-yellow-400">💡 권장 조치</h4>
        <ul className="mt-2 space-y-1 text-sm text-yellow-300">
          {result.recommendations.map((rec, i) => (
            <li key={i}>• {rec}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ============================================
// Impact Analysis Panel
// ============================================

/** Props for ImpactAnalysisPanel component */
interface ImpactAnalysisPanelProps {
  /** Impact analysis result */
  analysis: ImpactAnalysis
}

/** Displays plugin change impact analysis */
export function ImpactAnalysisPanel({ analysis }: ImpactAnalysisPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">영향 분석: {analysis.pluginId}</h3>
        {analysis.breakingChange && (
          <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
            ⚠️ Breaking Change
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-red-400">{analysis.directDependents.length}</p>
          <p className="text-sm text-gray-400">직접 의존</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-yellow-400">{analysis.transitiveDependents.length}</p>
          <p className="text-sm text-gray-400">간접 의존</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-white">{analysis.totalAffected}</p>
          <p className="text-sm text-gray-400">전체 영향</p>
        </div>
      </div>

      {analysis.affectedPlugins.length > 0 && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <h4 className="mb-3 font-medium text-white">영향받는 플러그인</h4>
          <div className="space-y-2">
            {analysis.affectedPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="flex items-center justify-between rounded bg-gray-700/50 p-2"
              >
                <span className="text-white">{plugin.name}</span>
                <div className="flex gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      plugin.impact === 'direct'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}
                  >
                    {plugin.impact === 'direct' ? '직접' : '간접'}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      plugin.severity === 'critical'
                        ? 'bg-red-500/20 text-red-300'
                        : plugin.severity === 'major'
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : 'bg-gray-500/20 text-gray-300'
                    }`}
                  >
                    {plugin.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Node Details Panel
// ============================================

/** Props for NodeDetailsPanel component */
interface NodeDetailsPanelProps {
  /** Selected node to show details for */
  node: GraphNode
  /** Full dependency graph */
  graph: DependencyGraph
  /** Close panel callback */
  onClose: () => void
}

/** Detailed node information panel */
export function NodeDetailsPanel({ node, graph, onClose }: NodeDetailsPanelProps) {
  const dependencies = useMemo(() => getDirectDependencies(graph, node.id), [graph, node.id])
  const dependents = useMemo(() => getDirectDependents(graph, node.id), [graph, node.id])
  const config = NODE_STATUS_CONFIG[node.status]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{node.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs ${config.bgColor} ${config.color}`}>
              {config.icon} {config.label}
            </span>
            {node.isCyclic && (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                순환
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">v{node.version}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-400">의존성 ({dependencies.length})</h4>
          {dependencies.length > 0 ? (
            <div className="space-y-1">
              {dependencies.map((dep) => (
                <NodeBadge key={dep.id} node={dep} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">없음</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-400">의존 대상 ({dependents.length})</h4>
          {dependents.length > 0 ? (
            <div className="space-y-1">
              {dependents.map((dep) => (
                <NodeBadge key={dep.id} node={dep} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">없음</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small node badge for dependency lists */
function NodeBadge({ node }: { node: GraphNode }) {
  const config = NODE_STATUS_CONFIG[node.status]
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${config.bgColor} ${config.color}`}>
      {node.name}
    </span>
  )
}

// ============================================
// Mermaid Export
// ============================================

/** Props for MermaidExport component */
interface MermaidExportProps {
  /** Graph to export */
  graph: DependencyGraph
}

/** Export graph as Mermaid diagram code */
export function MermaidExport({ graph }: MermaidExportProps) {
  const [copied, setCopied] = useState(false)
  const mermaidCode = useMemo(() => exportToMermaid(graph), [graph])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(mermaidCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [mermaidCode])

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-white">Mermaid 다이어그램</h4>
        <button
          onClick={handleCopy}
          className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
        >
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre className="mt-3 max-h-48 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-300">
        {mermaidCode}
      </pre>
    </div>
  )
}

// ============================================
// Graph Controls
// ============================================

/** Props for GraphControls component */
interface GraphControlsProps {
  /** Current layout options */
  layoutOptions: GraphLayoutOptions
  /** Current filter options */
  filterOptions: GraphFilterOptions
  /** Layout change callback */
  onLayoutChange: (options: GraphLayoutOptions) => void
  /** Filter change callback */
  onFilterChange: (options: GraphFilterOptions) => void
}

/** Graph visualization control panel */
export function GraphControls({
  layoutOptions,
  filterOptions,
  onLayoutChange,
  onFilterChange,
}: GraphControlsProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {/* Layout Direction */}
      <div>
        <label className="block text-xs text-gray-400">방향</label>
        <select
          value={layoutOptions.direction}
          onChange={(e) => onLayoutChange({ ...layoutOptions, direction: e.target.value as 'TB' | 'BT' | 'LR' | 'RL' })}
          className="mt-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-white"
        >
          <option value="TB">위 → 아래</option>
          <option value="BT">아래 → 위</option>
          <option value="LR">왼쪽 → 오른쪽</option>
          <option value="RL">오른쪽 → 왼쪽</option>
        </select>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filterOptions.showOptional}
            onChange={(e) => onFilterChange({ ...filterOptions, showOptional: e.target.checked })}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700"
          />
          <span className="text-sm text-gray-300">선택적</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filterOptions.showDev}
            onChange={(e) => onFilterChange({ ...filterOptions, showDev: e.target.checked })}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700"
          />
          <span className="text-sm text-gray-300">개발</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filterOptions.highlightCycles}
            onChange={(e) => onFilterChange({ ...filterOptions, highlightCycles: e.target.checked })}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700"
          />
          <span className="text-sm text-gray-300">순환 강조</span>
        </label>
      </div>
    </div>
  )
}
