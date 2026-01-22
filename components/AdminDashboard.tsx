import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, MapPin } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  // Умный парсер даты: понимает и "22.01.2026", и "1768541517750"
  const parseSafeDate = (val: any) => {
    if (!val) return 0;
    if (!isNaN(Number(val))) return Number(val); // Если это числовой таймстамп
    const s = String(val);
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      // Sessions берем из Sessions, Заказы из Leads (как в таблице)
      setSessions(data.sessions || data.data?.sessions || []);
      setLeads(data.leads || data.orders || data.data?.leads || []);
    } catch (e) {
      console.error("Ошибка:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { filteredStats, processedLeads } = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();

    const allLeads = (leads || []).map(l => {
      const ts = parseSafeDate(l.timestamp || l['Дата']);
      const status = String(l.PaymentStatus || l['Статус'] || '').toLowerCase();
      
      // Оплачено, если в статусе есть "да" или "оплачено"
      const isPaid = status.includes('да') || status.includes('оплат');
      const isFailed = status.includes('отмена') || status.includes('архив');

      return {
        ...l,
        ts,
        isPaid,
        isFailed,
        // Точные названия колонок из image_82b773
        title: l.productTitle || l['Товар'] || 'Заказ',
        price: l.price || l['Сумма'] || '0',
        user: l.customerEmail || l.customerName || l['Email'] || 'Гость',
        dateStr: ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '---'
      };
    });

    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);
    const fSessions = (sessions || []).filter(s => parseSafeDate(s['Дата']) >= limit);

    // География по Email (Ники)
    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const nick = s['Email'] || s['Имя'] || 'Гость';
      nicks[nick] = (nicks[nick] || 0) + 1;
    });

    return {
      processedLeads: allLeads,
      filteredStats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 8)
      }
    };
  }, [leads, sessions, period]);

  const list = useMemo(() => {
    return processedLeads.filter(l => 
      activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
    );
  }, [processedLeads, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-20 font-sans">
      <div className="p-6 flex justify-between items-center">
        <h1 className="text-xs font-black uppercase text-slate-400">О ГЕТКУРС И НЕ ТОЛЬКО</h1>
        <button onClick={() => fetchData()} className="p-2 bg-white rounded-xl shadow-sm">
          <RefreshCw size={18} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
        </button>
      </div>

      <div className="flex bg-white p-1 rounded-2xl shadow-sm mx-4 mb-6">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Оплачено</p>
          <p className="text-3xl font-black text-emerald-500">{filteredStats.paid}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-sm mx-4 mb-6">
        <h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex gap-2"><MapPin size={14}/> География визитов</h3>
        <div className="space-y-4">
          {filteredStats.nicks.map(([name, count]) => (
            <div key={name}>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="truncate max-w-[200px]">{name}</span>
                <span className="text-indigo-600">{count}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400" style={{ width: `${(count / (filteredStats.visits || 1)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-black text-slate-400 uppercase">Заказы ({list.length})</h3>
          <div className="flex bg-white rounded-xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>

        {list.map((l, i) => (
          <div key={i} className="bg-white p-5 rounded-[1.5rem] shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-sm leading-tight mb-1">{l.title}</h4>
                <p className="text-indigo-500 font-bold text-[11px] truncate">{l.user}</p>
              </div>
              <div className="font-black text-sm">{l.price} ₽</div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50">
              <span className={`text-[9px] font-black uppercase ${l.isPaid ? 'text-emerald-500' : 'text-amber-500'}`}>
                {l.isPaid ? 'Оплачено' : (l.isFailed ? 'Архив' : 'Новый')}
              </span>
              <span className="text-[10px] font-bold text-slate-300">{l.dateStr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
