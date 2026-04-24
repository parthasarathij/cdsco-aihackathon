export default function TopBar() {

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200" style={{ borderBottomWidth: '0.5px' }}>
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-medium" style={{ background: '#185FA5' }}>
          C
        </div>
        <span className="font-medium text-sm text-gray-800 tracking-tight">CDSCO Regulatory Review Platform</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium">
            G
          </div>
          <span>Reviewer: Dr. Ganesh</span>
        </div>
      </div>
    </header>
  );
}
