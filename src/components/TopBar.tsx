import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { getAvatar } from '@/store/storage'
import { useSearch } from '@/contexts/SearchContext'
import { useLayout } from '@/contexts/LayoutContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileModal } from '@/components/profile/ProfileModal'
import { OctopusIcon } from '@/components/OctopusIcon'

export function TopBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const name = user?.displayName ?? null
  const { query, setQuery } = useSearch()
  const { setMobileMenuOpen, mobileMenuOpen } = useLayout()
  const { theme } = useSettings()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getAvatar())
  const [dropdownRect, setDropdownRect] = useState<{ top: number; right: number } | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [userMenuOpen])

  useEffect(() => {
    if (userMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownRect({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    } else {
      setDropdownRect(null)
    }
  }, [userMenuOpen])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // All three items are <a> tags so they share identical rendering.
  // <button> elements carry browser UA background/border in dark mode
  // that bleeds through even with Tailwind resets, <a> does not.
  const dropdownItemClass =
    'block w-full px-3 py-2 text-left text-sm no-underline text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer'

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${mobileMenuOpen ? 'hidden' : ''} md:hidden rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800`}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg className="h-6 w-6 text-current" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="3" y="6" width="18" height="1.5" rx="0.75" />
            <rect x="3" y="11.25" width="18" height="1.5" rx="0.75" />
            <rect x="3" y="16.5" width="18" height="1.5" rx="0.75" />
          </svg>
        </button>
        <Link to="/app/workspace" className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {theme === 'octopus' && <OctopusIcon className="h-6 w-6 shrink-0" />}
          Workroom
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <input
          type="search"
          placeholder="Search workspace..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="hidden sm:block rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Search workspace"
        />
        <div className="relative" ref={userMenuRef}>
          <button
            ref={triggerRef}
            type="button"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
            aria-label="User menu"
            onClick={(e) => { e.stopPropagation(); setUserMenuOpen((o) => !o) }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
                {(name || 'U').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden text-sm text-slate-700 dark:text-slate-300 sm:inline">{name || 'Guest'}</span>
          </button>
          {userMenuOpen && dropdownRect && createPortal(
            <div
              className="fixed z-[10000] min-w-[140px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{ top: dropdownRect.top, right: dropdownRect.right }}
            >
              {/* Profile and Logout use <a> instead of <button> to avoid
                  browser UA button styling bleeding through in dark mode */}
              <a
                href="#"
                className={`${dropdownItemClass} border-b border-slate-100 dark:border-slate-700`}
                onClick={(e) => { e.preventDefault(); setUserMenuOpen(false); setProfileOpen(true) }}
              >
                Profile
              </a>
              <Link
                to="/app/settings"
                className={`${dropdownItemClass} border-b border-slate-100 dark:border-slate-700`}
                onClick={() => setUserMenuOpen(false)}
              >
                Settings
              </Link>
              <a
                href="#"
                className={dropdownItemClass}
                onClick={(e) => { e.preventDefault(); handleLogout() }}
              >
                Logout
              </a>
            </div>,
            document.body
          )}
          <ProfileModal
            open={profileOpen}
            onClose={(wasSaved) => {
              setProfileOpen(false)
              if (wasSaved) setAvatarUrl(getAvatar())
            }}
          />
        </div>
      </div>
    </header>
  )
}
