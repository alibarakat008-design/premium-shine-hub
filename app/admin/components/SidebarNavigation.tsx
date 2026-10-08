'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MenuGroup, matchesRoute, normalizeSearch } from './navigation'
import styles from './SidebarNavigation.module.css'

type Props = {
  groups: MenuGroup[]
  pathname: string
  storageScope: string
  onNavigate: () => void
}

export default function SidebarNavigation({ groups, pathname, storageScope, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [preferences, setPreferences] = useState<{ key: string; collapsed: Record<string, boolean> }>({ key: '', collapsed: {} })
  const [routeOverride, setRouteOverride] = useState<{ pathname: string; label: string; collapsed: boolean } | null>(null)
  const storageKey = `psh-navigation-v2:${storageScope}`

  useEffect(() => {
    let collapsed: Record<string, boolean> = {}
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        collapsed = Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'boolean'))
      }
    } catch { /* Storage unavailable: use the compact default. */ }
    setPreferences({ key: storageKey, collapsed })
  }, [storageKey])

  useEffect(() => {
    setQuery('')
    setRouteOverride(null)
  }, [pathname, storageScope])

  const collapsed = preferences.key === storageKey ? preferences.collapsed : {}
  const search = normalizeSearch(query)
  const visibleGroups = groups.map(group => ({
    ...group,
    items: search
      ? group.items.filter(item => normalizeSearch(`${group.label} ${item.label} ${item.href}`).includes(search))
      : group.items,
  })).filter(group => group.items.length > 0)

  function toggleGroup(group: MenuGroup, currentlyCollapsed: boolean) {
    const next = { ...collapsed, [group.label]: !currentlyCollapsed }
    setPreferences({ key: storageKey, collapsed: next })
    setRouteOverride({ pathname, label: group.label, collapsed: !currentlyCollapsed })
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep navigation usable. */ }
  }

  return (
    <nav aria-label="Navegação do painel" className={styles.navigation}>
      <div className={styles.searchBox}>
        <label htmlFor="sidebar-search" className={styles.srOnly}>Buscar no menu</label>
        <input id="sidebar-search" type="search" placeholder="Buscar no menu…" value={query}
          onChange={event => setQuery(event.target.value)} className={styles.search} />
        {query && <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Limpar busca">×</button>}
      </div>
      <div className={styles.groups}>
        {visibleGroups.map(group => {
          const activeGroup = group.items.some(item => matchesRoute(pathname, item.href))
          const override = routeOverride?.pathname === pathname && routeOverride.label === group.label ? routeOverride.collapsed : undefined
          const isCollapsed = !search && !!group.collapsible && (override ?? (activeGroup ? false : (collapsed[group.label] ?? group.defaultCollapsed ?? true)))
          const groupId = `navigation-${normalizeSearch(group.label).replace(/[^a-z0-9]+/g, '-')}`
          return <div key={group.label} className={styles.group}>
            {group.collapsible ? (
              <button type="button" className={`${styles.heading} ${activeGroup ? styles.activeHeading : ''}`}
                aria-expanded={!isCollapsed} aria-controls={groupId}
                onClick={() => toggleGroup(group, isCollapsed)} disabled={!!search}>
                <span>{group.label}</span><span aria-hidden="true" className={styles.chevron}>{isCollapsed ? '›' : '⌄'}</span>
              </button>
            ) : <div className={styles.sectionLabel}>{group.label}</div>}
            <div id={groupId} hidden={isCollapsed}>
              {group.items.map(item => {
                const active = matchesRoute(pathname, item.href)
                if (item.unavailable) return <span key={item.href} aria-disabled="true" className={`${styles.link} ${styles.unavailable}`} title="Esta página não existe no backup enviado."><span aria-hidden="true" className={styles.icon}>{item.emoji}</span><span>{item.label}<small className={styles.unavailableLabel}>Indisponível neste backup</small></span></span>
                return <Link key={item.href} href={item.href} prefetch={false} onClick={onNavigate}
                  aria-current={active ? 'page' : undefined} className={`${styles.link} ${active ? styles.activeLink : ''}`}>
                  <span aria-hidden="true" className={styles.icon}>{item.emoji}</span><span>{item.label}</span>
                </Link>
              })}
            </div>
          </div>
        })}
        {visibleGroups.length === 0 && <p role="status" className={styles.empty}>Nenhuma função encontrada. Tente outro termo.</p>}
      </div>
    </nav>
  )
}
