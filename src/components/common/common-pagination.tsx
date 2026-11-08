'use client'

/**
 * 通用分页组件（深色主题）
 * ─────────────────────────────────────────────────
 * 功能：
 *  - 搜索框（按指定字段实时过滤）
 *  - 每页显示数量选择（10 / 50 / 100）
 *  - 总页数 / 总条数显示
 *  - 页码跳转（input + 跳转按钮）
 *  - 上一页 / 下一页按钮
 *  - 当前页码高亮
 *
 * 使用方式（render props）：
 *   <CommonPagination items={tasks} searchKeys={['name','id','warningLevel']}>
 *     {(pageItems) => (
 *       <ul>{pageItems.map(t => <li key={t.id}>{t.name}</li>)}</ul>
 *     )}
 *   </CommonPagination>
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export interface CommonPaginationProps<T> {
  /** 全部数据（未过滤） */
  items: T[]
  /** 用于搜索的字段名列表 */
  searchKeys: string[]
  /** 默认每页数量，默认 10 */
  pageSize?: number
  /** 搜索框占位文字 */
  searchPlaceholder?: string
  /** 空数据提示文字 */
  emptyText?: string
  /** 是否显示搜索框，默认 true */
  showSearch?: boolean
  /** 紧凑模式（用于侧边栏等窄空间），默认 false */
  compact?: boolean
  /** 渲染当前页数据的函数 */
  children: (pageItems: T[]) => ReactNode
  /** 分页变化回调 */
  onPageChange?: (page: number) => void
}

const PAGE_SIZE_OPTIONS = [10, 50, 100]

export default function CommonPagination<T extends Record<string, any>>({
  items,
  searchKeys,
  pageSize: defaultPageSize = 10,
  searchPlaceholder = '搜索...',
  emptyText = '暂无数据',
  showSearch = true,
  compact = false,
  children,
  onPageChange,
}: CommonPaginationProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [jumpInput, setJumpInput] = useState('')

  // 搜索过滤
  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      return searchKeys.some((key) => {
        const val = item[key]
        if (val == null) return false
        return String(val).toLowerCase().includes(q)
      })
    })
  }, [items, searchTerm, searchKeys])

  const totalItems = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  // 当前页数据
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, safePage, pageSize])

  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(p)
    onPageChange?.(p)
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const handleJump = () => {
    const n = parseInt(jumpInput, 10)
    if (!isNaN(n)) {
      goToPage(n)
      setJumpInput('')
    }
  }

  const handleJumpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJump()
  }

  // 生成页码按钮（最多显示 7 个，含省略号）
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | '...')[] = [1]
    const left = Math.max(2, safePage - 1)
    const right = Math.min(totalPages - 1, safePage + 1)
    if (left > 2) pages.push('...')
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < totalPages - 1) pages.push('...')
    pages.push(totalPages)
    return pages
  }, [totalPages, safePage])

  return (
    <div className="flex flex-col gap-2">
      {/* 搜索框 + 每页数量 */}
      {(showSearch || !compact) && (
        <div className={`flex flex-wrap items-center gap-2 ${compact ? 'px-1' : ''}`}>
          {showSearch && (
            <div className={`relative flex-1 min-w-[160px] ${compact ? "ml-1" : ""}`}>
              <Search size={compact ? 12 : 14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className={`w-full rounded-md border border-slate-700/60 bg-slate-800/50 text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-400/60 focus:bg-slate-800/70 focus:ring-2 focus:ring-violet-500/15 ${
                  compact ? 'py-1.5 pl-8 pr-3 text-[11px]' : 'py-2 pl-9 pr-3 text-sm'
                }`}
              />
              {searchTerm && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-300 ${compact ? 'text-[8px]' : ''}`}>
                  {totalItems}
                </span>
              )}
            </div>
          )}
          {/* 每页数量选择 */}
          <div className="flex items-center gap-1.5">
            <span className={`text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>每页</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className={`rounded-md border border-slate-700/60 bg-slate-800/60 text-slate-200 outline-none transition focus:border-violet-400/60 cursor-pointer ${
                compact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-xs'
              }`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className={`text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>条</span>
          </div>
        </div>
      )}

      {/* 列表内容 */}
      {totalItems === 0 ? (
        <div className={`flex items-center justify-center text-slate-500 ${compact ? 'py-6 text-[11px]' : 'py-10 text-sm'}`}>
          {searchTerm ? `未找到与「${searchTerm}」匹配的结果` : emptyText}
        </div>
      ) : (
        children(pageItems)
      )}

      {/* 分页控制栏 */}
      {totalItems > 0 && (
        <div className={`flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-2 ${compact ? 'px-1' : ''}`}>
          {/* 统计信息 */}
          <span className={`text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            共 <span className="font-semibold text-violet-300">{totalPages}</span> 页 /{' '}
            <span className="font-semibold text-slate-300">{totalItems}</span> 条
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-1">
            {/* 首页 */}
            <button
              onClick={() => goToPage(1)}
              disabled={safePage === 1}
              className={`inline-flex items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 transition hover:border-violet-400/40 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                compact ? 'h-6 w-6' : 'h-7 w-7'
              }`}
              title="首页"
            >
              <ChevronsLeft size={compact ? 11 : 13} />
            </button>
            {/* 上一页 */}
            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 1}
              className={`inline-flex items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 transition hover:border-violet-400/40 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                compact ? 'h-6 w-6' : 'h-7 w-7'
              }`}
              title="上一页"
            >
              <ChevronLeft size={compact ? 11 : 13} />
            </button>

            {/* 页码按钮 */}
            {!compact && (
              <div className="flex items-center gap-1">
                {pageNumbers.map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-600 text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={`inline-flex items-center justify-center rounded-md border text-xs font-medium transition ${
                        p === safePage
                          ? 'border-violet-400/70 bg-violet-500/20 text-violet-200 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                          : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-violet-400/40 hover:text-violet-300'
                      } h-7 min-w-[28px] px-1.5`}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>
            )}

            {/* 下一页 */}
            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage === totalPages}
              className={`inline-flex items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 transition hover:border-violet-400/40 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                compact ? 'h-6 w-6' : 'h-7 w-7'
              }`}
              title="下一页"
            >
              <ChevronRight size={compact ? 11 : 13} />
            </button>
            {/* 末页 */}
            <button
              onClick={() => goToPage(totalPages)}
              disabled={safePage === totalPages}
              className={`inline-flex items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 transition hover:border-violet-400/40 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                compact ? 'h-6 w-6' : 'h-7 w-7'
              }`}
              title="末页"
            >
              <ChevronsRight size={compact ? 11 : 13} />
            </button>

            {/* 页码跳转 */}
            <div className="flex items-center gap-1 ml-1">
              <span className={`text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>跳至</span>
              <input
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={handleJumpKeyDown}
                placeholder={String(safePage)}
                className={`rounded-md border border-slate-700/60 bg-slate-800/60 text-center text-slate-200 outline-none transition focus:border-violet-400/60 ${
                  compact ? 'h-6 w-10 text-[10px]' : 'h-7 w-12 text-xs'
                }`}
              />
              <span className={`text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>页</span>
              <button
                onClick={handleJump}
                className={`rounded-md border border-violet-400/50 bg-violet-500/15 font-medium text-violet-200 transition hover:bg-violet-500/25 ${
                  compact ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-xs'
                }`}
              >
                跳转
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
