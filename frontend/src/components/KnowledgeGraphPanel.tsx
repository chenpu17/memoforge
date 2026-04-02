import React, { useEffect, useState, useCallback } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { tauriService, KnowledgeGraph as GraphData } from '../services/tauri'
import { X, Maximize2 } from 'lucide-react'

interface KnowledgeGraphPanelProps {
  onClose: () => void
  onSelectKnowledge?: (id: string) => void
}

// 将后端数据转换为 React Flow 格式
export const convertToReactFlow = (data: GraphData): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = data.nodes.map((node, index) => ({
    id: node.id,
    type: 'default',
    data: {
      label: node.title,
      tags: node.tags,
      category: node.category_id,
    },
    position: {
      // 初始位置，后续会通过布局算法调整
      x: (index % 10) * 150,
      y: Math.floor(index / 10) * 100,
    },
    style: {
      background: getCategoryColor(node.category_id),
      border: '1px solid #6366F1',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '12px',
      width: 150,
    },
  }))

  const edges: Edge[] = data.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${edge.relation}-${index}`,
    source: edge.source,
    target: edge.target,
    animated: edge.relation === 'WikiLink',
    style: { stroke: getEdgeColor(edge.relation), strokeWidth: 2 },
    label: getEdgeLabel(edge.relation),
    labelStyle: { fontSize: 10, fill: '#666' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: getEdgeColor(edge.relation),
    },
  }))

  return { nodes, edges }
}

// 根据分类获取颜色
const getCategoryColor = (categoryId: string | null): string => {
  const colors: Record<string, string> = {
    'programming': '#EEF2FF',
    'system-design': '#FEF3C7',
    'tools': '#DCFCE7',
    'rust': '#FEE2E2',
    'python': '#EFF6FF',
  }
  return colors[categoryId || ''] || '#F5F5F5'
}

// 根据关系类型获取边的颜色
const getEdgeColor = (relation: string): string => {
  switch (relation) {
    case 'WikiLink':
      return '#6366F1'
    case 'SharedTag':
      return '#10B981'
    case 'SameCategory':
      return '#F59E0B'
    default:
      return '#9CA3AF'
  }
}

// 获取边的标签
const getEdgeLabel = (relation: string): string => {
  switch (relation) {
    case 'WikiLink':
      return '链接'
    case 'SharedTag':
      return '共标'
    case 'SameCategory':
      return '同类'
    default:
      return ''
  }
}

export const KnowledgeGraphPanel: React.FC<KnowledgeGraphPanelProps> = ({
  onClose,
  onSelectKnowledge,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // 加载图谱数据
  useEffect(() => {
    const loadGraph = async () => {
      try {
        setLoading(true)
        const graphData = await tauriService.getKnowledgeGraph()
        const { nodes: flowNodes, edges: flowEdges } = convertToReactFlow(graphData)
        setNodes(flowNodes)
        setEdges(flowEdges)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载图谱失败')
      } finally {
        setLoading(false)
      }
    }
    loadGraph()
  }, [setNodes, setEdges])

  // 节点点击处理
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (onSelectKnowledge) {
      onSelectKnowledge(node.id)
      onClose()
    }
  }, [onSelectKnowledge, onClose])

  // 过滤节点
  const filteredNodes = searchTerm
    ? nodes.filter(node =>
        node.data.label?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      )
    : nodes

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: '#0A0A0A' }}>知识图谱</h2>
            <span className="text-sm" style={{ color: '#737373' }}>
              {nodes.length} 个节点 · {edges.length} 条边
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 搜索框 */}
            <input
              type="text"
              placeholder="搜索知识..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border"
              style={{ borderColor: '#E5E5E5', width: 200 }}
            />
            {/* 全屏按钮 */}
            <button
              onClick={() => {
                // 可以实现全屏逻辑
              }}
              className="p-1.5 rounded-md hover:bg-gray-100"
              title="全屏"
            >
              <Maximize2 className="w-4 h-4" style={{ color: '#737373' }} />
            </button>
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100"
              title="关闭"
            >
              <X className="w-4 h-4" style={{ color: '#737373' }} />
            </button>
          </div>
        </div>

        {/* Graph Area */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="text-sm" style={{ color: '#737373' }}>加载中...</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-sm text-red-500">{error}</div>
            </div>
          )}
          <ReactFlow
            nodes={filteredNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#E5E5E5" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(node) => getCategoryColor(node.data?.category as string || null)}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 border-t flex items-center gap-4 text-xs" style={{ borderColor: '#E5E5E5', color: '#737373' }}>
          <span>关系类型:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ background: '#6366F1' }} />
            <span>Wiki 链接</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ background: '#10B981' }} />
            <span>共享标签</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ background: '#F59E0B' }} />
            <span>同分类</span>
          </div>
          <span className="ml-4">点击节点查看详情</span>
        </div>
      </div>
    </div>
  )
}
