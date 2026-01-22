
import React from 'react';
import { Home, Briefcase, ShoppingBag, BookOpen, Send, ShieldCheck } from 'lucide-react';
import { ViewState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ViewState;
  onNavigate: (view: ViewState) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, onNavigate }) => {
  const navItems = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'portfolio', label: 'Бонусы', icon: Briefcase },
    { id: 'shop', label: 'Магазин', icon: ShoppingBag },
    { id: 'account', label: 'Профиль', icon: BookOpen }, 
    { id: 'contact', label: 'TG', icon: Send },
  ];

  return (
    <div className="min-h-screen bg-[#f6f8fb] flex flex-col max-w-md mx-auto relative border-x border-slate-100 overflow-x-hidden">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[1500] bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('home')}>
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-black text-[12px] shadow-lg shadow-indigo-100">ОА</div>
          <div className="flex flex-col">
             <span className="font-bold text-slate-900 text-[14px] tracking-tight uppercase leading-none">О ГЕТКУРС</span>
             <span className="font-bold text-indigo-500 text-[12px] tracking-widest uppercase mt-1">И НЕ ТОЛЬКО</span>
          </div>
        </div>
        <button onClick={() => onNavigate('admin')} className={`p-2.5 transition-all rounded-xl ${activeView === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-300'}`}>
          <ShieldCheck size={22} strokeWidth={2.5} />
        </button>
      </header>

      <main className="flex-grow pt-[74px] pb-28 px-5">
        {children}
      </main>

      {/* Навигация всегда сверху всех модальных окон кроме критических */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-md border-t border-slate-100 grid grid-cols-5 h-20 px-2 z-[5000] pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewState)}
              className="flex flex-col items-center justify-center gap-1 transition-all active:scale-90"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400'}`}>
                <Icon size={20} strokeWidth={2} />
              </div>
              <span className={`text-[8px] font-black tracking-widest uppercase ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
