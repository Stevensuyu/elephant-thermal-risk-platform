import { BarChart3, BrainCircuit, History, Radar, Settings, ShieldAlert } from 'lucide-react'

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: '态势大屏', icon: BarChart3 },
    { id: 'warning', label: '分级预警', icon: ShieldAlert },
    { id: 'ai', label: 'AI 研判', icon: BrainCircuit },
    { id: 'dispatch', label: '处警联动', icon: Radar },
    { id: 'history', label: '留痕复盘', icon: History },
    { id: 'settings', label: '系统设置', icon: Settings },
  ]

  return (
    <aside className="sticky top-0 h-screen w-72 shrink-0 bg-slate-950 p-5 text-white">
      <div className="mb-8 rounded-lg bg-white/10 p-4">
        <div className="text-sm font-medium text-emerald-300">SkyGuard Elephant</div>
        <div className="mt-1 text-2xl font-black tracking-tight">天眼护象</div>
        <p className="mt-2 text-xs leading-5 text-slate-300">无人机热成像、边缘 AI、分级预警与跨部门警情联动。</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm transition ${
                isActive ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={19} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
