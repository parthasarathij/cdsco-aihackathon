import { useEffect, useState, useRef } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'left',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'bottom';
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const slideStyles: Record<string, React.CSSProperties> = {
    left:   { left: 0, top: 0, bottom: 0, width: 'min(85vw, 320px)', transform: open ? 'translateX(0)' : 'translateX(-100%)' },
    right:  { right: 0, top: 0, bottom: 0, width: 'min(90vw, 420px)', transform: open ? 'translateX(0)' : 'translateX(100%)' },
    bottom: { bottom: 0, left: 0, right: 0, maxHeight: '80vh', borderRadius: '16px 16px 0 0', transform: open ? 'translateY(0)' : 'translateY(100%)' },
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.35)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
        }}
      />
      <div style={{
        position: 'fixed', zIndex: 50,
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 240ms cubic-bezier(0.4,0,0.2,1)',
        ...slideStyles[side],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{title}</div>
          <button onClick={onClose} style={{ padding: 4, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </>
  );
}

interface ResponsivePageProps {
  topBar: React.ReactNode;
  subHeader: React.ReactNode;
  leftPanel?: React.ReactNode;
  middlePanel: React.ReactNode;
  rightPanel?: React.ReactNode;
  uploadView?: React.ReactNode;
  processed?: boolean;
  leftLabel?: string;
  middleLabel?: string;
  rightLabel?: string;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  onLeftDrag?: (delta: number) => void;
  onRightDrag?: (delta: number) => void;
}

export default function ResponsivePage({
  topBar,
  subHeader,
  leftPanel,
  middlePanel,
  rightPanel,
  uploadView,
  processed = true,
  leftLabel = 'Overview',
  middleLabel = 'Main',
  rightLabel = 'Detail',
  leftPanelWidth = 280,
  rightPanelWidth = 340,
  onLeftDrag,
  onRightDrag,
}: ResponsivePageProps) {
  const bp = useBreakpoint();
  const [activeTab, setActiveTab] = useState<'left' | 'middle' | 'right'>('middle');

  const tabs = [
    ...(leftPanel ? [{ id: 'left' as const, label: leftLabel }] : []),
    { id: 'middle' as const, label: middleLabel },
    ...(rightPanel ? [{ id: 'right' as const, label: rightLabel }] : []),
  ];

  //  Desktop: 
  if (bp === 'desktop') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#F5F3F0' }}>
        {topBar}
        {subHeader}
        {!processed && uploadView ? (
          <div style={{ flex: 1, overflow: 'auto' }}>{uploadView}</div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {leftPanel && (
              <>
                <aside style={{ width: leftPanelWidth, flexShrink: 0, background: '#fff', borderRight: '0.5px solid #e0ddd6', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                  {leftPanel}
                </aside>
                <LocalDivider onDrag={onLeftDrag} />
              </>
            )}
            <main style={{ flex: 1, minWidth: 0, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {middlePanel}
            </main>
            {rightPanel && (
              <>
                <LocalDivider onDrag={onRightDrag} />
                <aside style={{ width: rightPanelWidth, flexShrink: 0, background: '#fff', borderLeft: '0.5px solid #e0ddd6', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                  {rightPanel}
                </aside>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  //  Mobile / Tablet: tab-based stacked layout
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: '#F5F3F0' }}>
      {topBar}
      {subHeader}

      {!processed && uploadView ? (
        <div style={{ flex: 1, overflow: 'auto' }}>{uploadView}</div>
      ) : (
        <>
          {/* Tab bar (only when there are multiple panels) */}
          {tabs.length > 1 && (
            <div style={{ display: 'flex', background: '#fff', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, padding: '9px 8px', fontSize: 12, fontWeight: activeTab === tab.id ? 600 : 400,
                    color: activeTab === tab.id ? '#185FA5' : '#9CA3AF',
                    background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #185FA5' : '2px solid transparent',
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Active panel */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
            {activeTab === 'left' && leftPanel}
            {activeTab === 'middle' && middlePanel}
            {activeTab === 'right' && rightPanel}
          </div>
        </>
      )}
    </div>
  );
}

//  Draggable divider for desktop 
function LocalDivider({ onDrag }: { onDrag?: (delta: number) => void }) {
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const stop = () => {
    draggingRef.current = false;
    document.body.classList.remove('cdsco-resizing');
  };

  return (
    <div
      onPointerDown={(e) => {
        if (!onDrag) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        draggingRef.current = true;
        document.body.classList.add('cdsco-resizing');
        lastXRef.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (!onDrag || !draggingRef.current) return;
        const delta = e.clientX - lastXRef.current;
        lastXRef.current = e.clientX;
        if (delta !== 0) onDrag(delta);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      style={{
        width: 6,
        background: '#e0ddd6',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onDrag ? 'col-resize' : 'default',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div style={{ width: 2, height: 32, borderRadius: 2, background: '#c5c1bb' }} />
    </div>
  );
}

//  Responsive TopBarSimple (collapses title on mobile)
export function ResponsiveTopBar({ user, onLogout }: { user: { name: string } | null; onLogout: () => void }) {
  const bp = useBreakpoint();
  const getInitial = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: bp === 'mobile' ? '9px 12px' : '10px 16px', background: '#fff', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>C</div>
        {bp !== 'mobile' && <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>CDSCO Regulatory Review Platform</span>}
        {bp === 'mobile' && <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>CDSCO Review</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {bp !== 'mobile' && user && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Reviewer: {user.name}</span>}
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0C447C', fontSize: 10, fontWeight: 700 }}>
          {user ? getInitial(user.name) : 'G'}
        </div>
        {user && (
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            {bp !== 'mobile' ? 'Logout' : '×'}
          </button>
        )}
      </div>
    </header>
  );
}
