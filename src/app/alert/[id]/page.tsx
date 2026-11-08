import AlertDetailClient from '@/app/alert/[id]/alert-detail-client-page'

// 静态导出（output: 'export'）要求动态路由显式给出参数列表，否则 build 报错。
// 预渲染一个占位详情页；其余 id 通过 OSS/CDN 的「404 回退到 index.html」由客户端路由读取，
// 因此从首页卡片点击进入完全正常，仅「直接粘贴未知 id 的 URL」才会回退到首页。
export function generateStaticParams() {
  return [{ id: 'demo' }]
}

export default function AlertDetailPage({ params }: { params: { id: string } }) {
  return <AlertDetailClient id={params.id} />
}
