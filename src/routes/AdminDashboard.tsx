import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getUsers,
  deleteUser,
  changeUserPassword,
  setAdminToken,
  getAdminToken,
  type AdminUser,
} from '@/api/admin'

function ChangePasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError(null)
    try {
      await changeUserPassword(user.id, password)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h3 className="text-base font-semibold text-white">Change password</h3>
        <p className="mt-1 text-sm text-slate-400">
          Setting new password for {user.displayName} ({user.email})
        </p>
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !password || !confirm}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [changingPasswordUser, setChangingPasswordUser] = useState<AdminUser | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users'
      if (msg.includes('403') || msg.includes('Admin access')) {
        navigate('/admin/login')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login')
      return
    }
    loadUsers()
  }, [loadUsers, navigate])

  const handleLogout = () => {
    setAdminToken(null)
    navigate('/admin/login')
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
      setPendingDeleteId(null)
      showSuccess('Account deleted successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-400">Workroom user management</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 inline-block">
          <p className="text-sm text-slate-400">Total accounts</p>
          <p className="text-3xl font-bold text-white">{users.length}</p>
        </div>

        {/* Success message */}
        {successMessage && (
          <div className="mb-4 rounded-lg bg-green-900/30 px-4 py-2 text-sm text-green-400">
            {successMessage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* User table */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading accounts...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No accounts yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">{user.displayName}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {pendingDeleteId === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-slate-400">Sure?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(user.id)}
                            className="rounded px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="rounded px-2 py-1 text-xs border border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setChangingPasswordUser(user)}
                            className="rounded px-2 py-1 text-xs border border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            Change password
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(user.id)}
                            className="rounded px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {changingPasswordUser && (
        <ChangePasswordModal
          user={changingPasswordUser}
          onClose={() => setChangingPasswordUser(null)}
          onSaved={() => {
            setChangingPasswordUser(null)
            showSuccess(`Password updated for ${changingPasswordUser.displayName}`)
          }}
        />
      )}
    </div>
  )
}
