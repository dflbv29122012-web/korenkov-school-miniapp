import { NavLink } from 'react-router-dom'

const items = [
  { to: '/teacher', label: 'Ученики', icon: '👥', end: true },
  { to: '/teacher/homework', label: 'ДЗ', icon: '📝' },
  { to: '/teacher/topics', label: 'Номера', icon: '📁' },
  { to: '/teacher/materials', label: 'Материалы', icon: '📚' },
  { to: '/teacher/settings', label: 'Ещё', icon: '⚙️' },
]

export default function TeacherBottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => 'bottom-nav-item' + (isActive ? ' active' : '')}
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
