import { NavLink } from 'react-router-dom'

const items = [
  { to: '/teacher', label: 'Ученики', icon: '👥', end: true },
  { to: '/teacher/schedule', label: 'Расписание', icon: '📅' },
  { to: '/teacher/homework', label: 'ДЗ', icon: '📝' },
  { to: '/teacher/analytics', label: 'Аналитика', icon: '📊' },
  { to: '/teacher/settings', label: 'Настройки', icon: '⚙️' },
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
