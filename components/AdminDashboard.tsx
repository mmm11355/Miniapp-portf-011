import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // Поиск значения без учета регистра
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const lowKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowKey);
    return foundKey ? obj[foundKey] : (obj[key] || '');
  };

  // Парсинг вашей даты "22.01.2026, 13:20:03"
  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    if (/^\d+$/.test(s)) return Number(s); // если пришел таймстамп числом
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
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error('Ошибка загрузки');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  const { stats, processedLeads, activity } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const tenMin = 10 * 60 * 1000;
    
    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = now - 7 * 86400000;
    else if (period === 'month') threshold = now - 30 * 86400000;

    // 1. Фильтруем сессии и собираем ники (АКТИВНОСТЬ)
    const filteredSessions = sessions.filter(s => {
      const ts = parseSafeDate(getVal(s, 'Дата') || getVal(s, 'date'));
      return period === 'all' || ts >= threshold;
    });

    const nicksMap: Record<string, number> = {};
    filteredSessions.forEach(s => {
      const name = getVal(s, 'Имя') || getVal(s, 'Email') || 'Гость';
      nicksMap[name] = (nicksMap[name] || 0) + 1;
    });

    // 2. Обрабатываем заказы (LEADS)
    const mappedLeads = leads.map(l => {
      const ts = parseSafeDate(getVal(l, 'timestamp') || getVal(l, 'Дата'));
      const status = String(getVal(l, 'PaymentStatus') || '').toLowerCase();
      const isPaid = status === 'да' || status.includes('оплат');
      const isExpired = (now - ts) > tenMin;
      const isFailed = status.includes('отмен') || (isExpired && !isPaid);

      return {
        ...l,
        ts,
        isPaid,
        isFailed,
        dTitle: getVal(l, 'productTitle') || 'Заказ',
        dPrice: getVal(l, 'price') || 0,
        dUser: getVal(l, 'customerEmail') || 'Гость'
      };
    }).filter(l => period === 'all' || l.ts >= threshold);

    return {
      stats: {
        visits: filteredSessions.length,
        paid: mappedLeads.filter(l => l.isPaid).length
      },
      activity: Object.entries(nicksMap).sort((a, b) => b[1] - a[1]).slice(0, 15),
      processedLeads: mappedLeads
    };
  }, [sessions, leads, period]);

  const displayList = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F8FAFC] pb-20 font-sans">
      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-white border-b">
        <h1 className="text-xs font-bold uppercase tracking-widest text-slate-400">Панель управления</h1>
        <button onClick={() => fetchData()} className="p-2 active:scale-95 transition-transform">
          <RefreshCw size={20} className={`${loading ? 'animate-spin' : ''} text-indigo-600`} />
        </button>
      </div>

      {/* Фильтр по датам */}
      <div className="flex p-4 gap-2 bg-white mb-4 border-b">
        {(['today', '7days', 'month', 'all'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} 
            className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all 
            ${period === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-400 border-slate-100'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Визиты</span>
          <div className="text-3xl font-bold text-slate-900 mt-1">{stats.visits}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Оплаты</span>
          <div className="text-3xl font-bold text-emerald-500 mt-1">{stats.paid}</div>
        </div>
      </div>

      {/* Блок активности - НИКИ ВЕРНУЛИСЬ */}
      <div className="mx-4 bg-white rounded-3xl p-5 border border-slate-100 mb-6">
        <div className="flex items-center gap-2 mb-4 border-b pb-2">
          <Activity size={14} className="text-indigo-500" />
          <h2 className="text-[10px] font-bold uppercase text-slate-400">Кто заходил (Ники)</h2>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {activity.map(([name, count], i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="font-medium text-slate-600 truncate mr-2">{name}</span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-bold">{count}</span>
            </div>
          ))}
          {activity.length === 0 && <p className="text-[10px] text-slate-300 italic">За этот период никто не заходил</p>}
        </div>
      </div>

      {/* Список транзакций */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Заказы ({displayList.length})</h3>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold ${activeTab === 'active' ? 'bg-white text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold ${activeTab === 'archive' ? 'bg-white text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>

        <div className="space-y-3">
          {displayList.map((l, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 line-clamp-1">{l.dTitle}</span>
                <span className="text-sm font-black text-slate-900">{l.dPrice} ₽</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-indigo-500 font-bold">{l.dUser}</span>
                <span className={`px-2 py-0.5 rounded uppercase font-black ${l.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {l.isPaid ? 'Оплачено' : 'Ожидание'}
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
