import { LogOut } from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';
interface User { name: string; email: string }
interface Props { user: User | null; onLogout: () => void; }
export default function TopBarSimple({ user, onLogout }: Props) {
  const bp = useBreakpoint();
  const getInitial = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: bp === 'mobile' ? '9px 12px' : '10px 16px', background: '#fff', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>C</div>
        {bp !== 'mobile' && <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', letterSpacing: '-0.01em' }}>CDSCO Regulatory Review Platform</span>}
        {bp === 'mobile' && <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>CDSCO Review</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {bp !== 'mobile' && user && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Reviewer: {user.name}</span>}
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5563', fontSize: 10, fontWeight: 700 }}>{user ? getInitial(user.name) : 'G'}</div>
        {user && <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><LogOut size={13} />{bp !== 'mobile' && 'Logout'}</button>}
      </div>
    </header>
  );
}