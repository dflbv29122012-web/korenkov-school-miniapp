import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Главная', icon: '🏠', end: true },
  { to: '/schedule', label: 'Расписание', icon: '📅' },
  { to: '/homework', label: 'ДЗ', icon: '📝' },
  { to: '/materials', label: 'Материалы', icon: '📚' },
  { to: '/payment', label: 'Оплата', icon: '💳' },
]

export default function BottomNav() {
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
