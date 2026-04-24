import { useRef, useState } from 'react';

interface Props {
  onDrag: (delta: number) => void;
  orientation?: 'vertical' | 'horizontal';
}

export default function DraggableDivider({ onDrag, orientation = 'vertical' }: Props) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastPointerPosRef = useRef<number | null>(null);

  const stopDragging = () => {
    setIsDragging(false);
    lastPointerPosRef.current = null;
    document.body.classList.remove('cdsco-resizing');
  };

  return (
    <div
      ref={dividerRef}
      onPointerDown={(e) => {
        // Pointer capture prevents stutter when crossing iframes/canvas.
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        setIsDragging(true);
        document.body.classList.add('cdsco-resizing');
        lastPointerPosRef.current = orientation === 'vertical' ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (!isDragging) return;
        const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
        const previousPos = lastPointerPosRef.current ?? currentPos;
        const delta = currentPos - previousPos;
        lastPointerPosRef.current = currentPos;
        if (delta !== 0) onDrag(delta);
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      className={`${
        orientation === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      } bg-gray-200 hover:bg-blue-400 transition-colors select-none group`}
      style={{
        userSelect: 'none',
        touchAction: 'none',
        backgroundColor: isDragging ? '#0C447C' : '#e0ddd6',
      }}
      title="Drag to resize"
    />
  );
}
