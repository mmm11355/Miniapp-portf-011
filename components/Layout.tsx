
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
    <div className="min-h-screen bg-[#f8fafc] flex flex-col max-w-md mx-auto relative overflow-x-hidden">
      
      {/* ШАПКА — стала чище и нежнее */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[1500] bg-white/80 backdrop-blur-md border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('home')}>
          {/* Убрали жесткий градиент, сделали нежный индиго */}
          <div className="w-10 h-10 bg-indigo-500 rounded-[10px] flex items-center justify-center text-white font-bold text-[12px] shadow-md shadow-indigo-100">
            ОА
          </div>
          <div className="flex flex-col">
             <span className="font-bold text-slate-800 text-[14px] tracking-tight uppercase leading-none">О ГЕТКУРС</span>
             <span className="font-bold text-indigo-400 text-[11px] tracking-widest uppercase mt-1">И НЕ ТОЛЬКО</span>
          </div>
        </div>
        
        {/* Кнопка админа теперь тоже в мягком стиле */}
        <button onClick={() => onNavigate('admin')} className={`p-2 transition-all rounded-[10px] ${activeView === 'admin' ? 'bg-indigo-50 text-indigo-500' : 'text-slate-300'}`}>
          <ShieldCheck size={20} strokeWidth={2} />
        </button>
      </header>

      <main className="flex-grow pt-[74px] pb-28 px-4">
        {children}
      </main>

      {/* НИЖНЕЕ МЕНЮ — теперь парящее и нежное */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-[400px] bg-white/90 backdrop-blur-md border border-slate-100 grid grid-cols-5 h-18 py-2 z-[5000] rounded-[15px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewState)}
              className="flex flex-col items-center justify-center transition-all active:scale-90"
            >
              <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-all ${isActive ? 'bg-indigo-50 text-indigo-500' : 'text-slate-300'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[8px] font-bold tracking-tight uppercase mt-1 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
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
