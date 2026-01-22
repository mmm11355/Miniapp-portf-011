import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  // Умный парсер, который понимает и "22.01.2026", и системные даты
  const parseDate = (val: any) => {
    if (!val) return 0;
    const s = String(val);
    if (!isNaN(Number(s)) && s.length > 10) return Number(s);
    
    // Поддержка вашего формата: 22.01.2026, 13:20:03
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const timePart = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${timePart}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error("Ошибка");
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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let limit = 0;
    if (period === 'today') limit = todayStart;
    else if (period === '7days') limit = Date.now() - 7 * 86400000;
    else if (period === 'month') limit = Date.now() - 30 * 86400000;

    // 1. Фильтруем Визиты (Sessions) - берем колонку "Дата" из вашей таблицы
    const fSessions = (sessions || []).filter(s => {
      const ts = parseDate(s['Дата'] || s['timestamp']);
      return period === 'all' || ts >= limit;
    });

    // 2. Фильтруем Заказы (Leads)
    const allLeads = (leads || []).map(l => {
      const ts = parseDate(l['timestamp'] || l['Дата']);
      const status = String(l['PaymentStatus'] || l['Статус'] || '').toLowerCase();
      return {
        ...l, ts,
        isPaid: status === 'да' || status.includes('оплат'),
        isFailed: status === 'нет' || status.includes('отмена') || status.includes('архив') || status.includes('pending'),
        title: l['productTitle'] || l['Товар'] || 'Заказ',
        price: l['price'] || l['Сумма'] || '0',
        user: l['customerEmail'] || l['Email'] || '@гость',
        dateStr: ts > 0 ? new Date(ts).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '---'
      };
    });

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);

    // Считаем активность (ники/email)
    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const key = s['Email'] || 'Гость';
      nicks[key] = (nicks[key] || 0) + 1;
    });

    return {
      processedLeads: allLeads,
      filteredStats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [leads, sessions, period]);

  const list = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-20 font-sans text-slate-900">
      {/* Шапка */}
      <div className="p-6 bg-white flex justify-between items-center border-b border-slate-200">
        <h1 className="text-sm font-black uppercase tracking-widest text-indigo-600">Панель управления</h1>
        <button onClick={() => fetchData()} className="p-2 bg-slate-100 rounded-full">
          <RefreshCw size={20} className={`${loading ? 'animate-spin text-indigo-500' : 'text-slate-600'}`} />
        </button>
      </div>

      {/* Фильтры - Крупные и жирные */}
      <div className="flex gap-2 p-3 bg-white shadow-sm mb-4">
        {(['today', '7days', 'month', 'all'] as const).map((p) => (
          <button 
            key={p} 
            onClick={() => setPeriod(p)}
            className={`flex-1 py-3 text-[11px] font-black uppercase rounded-xl transition-all ${period === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 bg-slate-50'}`}
          >
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      {/* Главные цифры */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-6 rounded-[32px] shadow-sm border-2 border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Визиты</p>
          <p className="text-4xl font-black text-slate-900 tracking-tighter">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[32px] shadow-sm border-2 border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Оплаты</p>
          <p className="text-4xl font-black text-emerald-500 tracking-tighter">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Активность */}
      <div className="mx-4 mb-6 bg-white rounded-[32px] p-6 shadow-sm border-2 border-slate-100">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-2">
          <Activity size={18} className="text-indigo-500" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Активность по никам</h2>
        </div>
        <div className="space-y-3">
          {filteredStats.nicks.length > 0 ? filteredStats.nicks.map(([name, count]) => (
            <div key={name} className="flex justify-between items-center py-1">
              <span className="text-[13px] font-black text-slate-700 truncate max-w-[180px]">{name}</span>
              <span className="text-[12px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{count}</span>
            </div>
          )) : <p className="text-center text-xs font-bold text-slate-300 py-4 italic">Данных пока нет</p>}
        </div>
      </div>

      {/* Список транзакций */}
      <div className="mx-4">
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-[11px] font-black uppercase text-slate-400">Заказы ({list.length})</h3>
          <div className="flex bg-white p-1 rounded-xl border-2 border-slate-100">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-2 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-2 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-500 text-white' : 'text-slate-300'}`}>АРХИВ</button>
          </div>
        </div>

        <div className="space-y-4">
          {list.map((l, i) => (
            <div key={i} className="bg-white p-5 rounded-[28px] shadow-sm border-2 border-slate-100">
              <div className="flex justify-between items-start mb-3">
                <h4 className="text-[14px] font-black text-slate-800 leading-tight pr-4">{l.title}</h4>
                <span className="text-[15px] font-black text-slate-900">{l.price} ₽</span>
              </div>
              <div className="flex justify-between items-end pt-3 border-t border-slate-50">
                <div>
                  <p className="text-[12px] font-black text-indigo-500 mb-0.5">{l.user}</p>
                  <p className="text-[10px] font-bold text-slate-300">{l.dateStr}</p>
                </div>
                <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-tighter ${l.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {l.isPaid ? 'ОПЛАЧЕНО' : 'ОЖИДАНИЕ'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
