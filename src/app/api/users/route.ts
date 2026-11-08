import { NextRequest, NextResponse } from 'next/server'
import { getUsers, createUser, updateUser, deleteUser, getUserByAccount } from '@/lib/store/store-users'

export const dynamic = 'force-dynamic'

// GET /api/users - 获取用户列表
export async function GET() {
  const users = getUsers()
  // 不返回密码
  const safeUsers = users.map(({ password, ...rest }) => rest)
  return NextResponse.json({ success: true, users: safeUsers })
}

// POST /api/users - 创建用户
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { account, name, role, password, phone } = body

    if (!account || !name || !role || !password) {
      return NextResponse.json({ success: false, error: '账号、姓名、角色、密码为必填项' }, { status: 400 })
    }

    // 检查账号是否已存在
    if (getUserByAccount(account)) {
      return NextResponse.json({ success: false, error: '账号已存在' }, { status: 400 })
    }

    const user = createUser({
      account,
      name,
      role: role as 'admin' | 'center' | 'street' | 'police',
      password,
      phone: phone || '',
      status: 'active',
    })

    const { password: _pw, ...safeUser } = user
    return NextResponse.json({ success: true, user: safeUser })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '创建失败' }, { status: 500 })
  }
}

// PATCH /api/users - 更新用户
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...patch } = body

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少用户ID' }, { status: 400 })
    }

    // 如果修改账号，检查新账号是否已存在
    if (patch.account) {
      const existing = getUserByAccount(patch.account)
      if (existing && existing.id !== id) {
        return NextResponse.json({ success: false, error: '账号已存在' }, { status: 400 })
      }
    }

    const user = updateUser(id, patch)
    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    }

    const { password: _pw, ...safeUser } = user
    return NextResponse.json({ success: true, user: safeUser })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '更新失败' }, { status: 500 })
  }
}

// DELETE /api/users - 删除用户
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少用户ID' }, { status: 400 })
    }

    const ok = deleteUser(id)
    if (!ok) {
      return NextResponse.json({ success: false, error: '用户不存在或为管理员账号（不可删除）' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 })
  }
}
