import { NextRequest, NextResponse } from 'next/server'
import { verifyLogin } from '@/lib/store/store-users'

export const dynamic = 'force-dynamic'

// POST /api/auth/login - 登录验证
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: '请输入账号和密码' }, { status: 400 })
    }

    const user = verifyLogin(username.trim(), password)
    if (!user) {
      return NextResponse.json({ ok: false, error: '账号或密码错误，或账号已被禁用' }, { status: 401 })
    }

    // 生成会话ID
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    return NextResponse.json({
      ok: true,
      role: user.role,
      user: user.account,
      name: user.name,
      sessionId,
      phone: user.phone,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '登录失败' }, { status: 500 })
  }
}
