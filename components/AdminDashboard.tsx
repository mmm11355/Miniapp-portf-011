import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

type Period = 'today' | '7days' | 'month' | 'all';
type Tab = 'active' | 'archive';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
  const [activeTab, setActiveTab] = useState<Tab>('active');

  /* ===================== ПАРСИНГ ДАТЫ ===================== */
  const parseDate = (val: any): number => {
    if (!val) return NaN;
    if (typeof val === 'number') return val < 1e12 ? val * 1000 : val;

    const s = String(val).trim();
    if (!isNaN(Number(s))) {
      const n = Number(s);
      return n < 1e12 ? n * 1000 : n;
    }

    // Формат: 22.01.2026, 13:20:03
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{2}:\d{2}:\d{2}))?/);
    if (m) {
      const time = m[4] || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }

    const d = new Date(s).getTime();
    return isNaN(d) ? NaN : d;
  };

  /* ===================== ЗАГРУЗКА ===================== */
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error('Ошибка загрузки', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  /* ===================== ОБРАБОТКА (ЖЕСТКАЯ) ===================== */
  const processedData = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    
    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    // Мапим сессии
    const sNorm = sessions.map(s => ({
      ...s,
      ts: parseDate(s['Дата'] || s['timestamp'] || s['date']),
      email: s['Email'] || s['email'] || 'Гость'
    })).filter(s => period === 'all' || s.ts >= limit);

    // Мапим заказы
    const lNorm = leads.map(l => {
      const ts = parseDate(l['timestamp'] || l['Дата'] || l['date']);
      const status = String(l['PaymentStatus'] || l['Статус'] || '').toLowerCase();
      return {
        ...l,
        ts,
        title: l['productTitle'] || l['Товар'] || 'Заказ',
        price: l['price'] || l['Сумма'] || '0',
        user: l['customerEmail'] || l['Email'] || 'Гость',
        isPaid: status.includes('оплат') || status === 'да',
        isFailed: status.includes('отмен') || status.includes('архив') || status === 'нет'
      };
    }).filter(l => period === 'all' || l.ts >= limit);

    // Ники для активности
    const nicksMap: Record<string, number> = {};
    sNorm.forEach(s => { nicksMap[s.email] = (nicksMap[s.email] || 0) + 1; });

    return {
      visits: sNorm.length,
      paidCount: lNorm.filter(l => l.isPaid).length,
      nicks: Object.entries(nicksMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
      displayList: lNorm.filter(l => activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed)
    };
  }, [sessions, leads, period, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-10 font-sans text-slate-900">
      {/* Шапка */}
      <div className="p-6 bg-white flex justify-between items-center border-b shadow-sm">
        <h1 className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600">Админ-Панель</h1>
        <button onClick={() => fetchData()} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100">
          <RefreshCw size={20} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
        </button>
      </div>

      {/* Периоды */}
      <div className="flex gap-1 p-2 bg-white mb-4 border-b">
        {(['today', '7days', 'month', 'all'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${
              period === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 bg-slate-50'
            }`}
          >
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      {/* Основные цифры */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-6 rounded-[32px] border-2 border-white shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Визиты</p>
          <p className="text-4xl font-black tracking-tighter">{processedData.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[32px] border-2 border-white shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Оплаты</p>
          <p className="text-4xl font-black text-emerald-500 tracking-tighter">{processedData.paidCount}</p>
        </div>
      </div>

      {/* Активность */}
      <div className="mx-4 mb-6 bg-white rounded-[32px] p-6 border-2 border-white shadow-sm">
        <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2">
          <Activity size={14} className="text-indigo-500" /> Активность
        </h2>
        <div className="space-y-3">
          {processedData.nicks.map(([n, c]) => (
            <div key={n} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-2xl">
              <span className="text-[12px] font-black text-slate-700 truncate max-w-[200px]">{n}</span>
              <span className="text-[11px] font-black text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm">{c}</span>
            </div>
          ))}
          {processedData.nicks.length === 0 && <p className="text-center text-[11px] font-bold text-slate-300 py-2">Нет данных</p>}
        </div>
      </div>

      {/* Список */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            Заказы ({processedData.displayList.length})
          </h3>
          <div className="flex bg-slate-200 p-1 rounded-2xl">
            {(['active', 'archive'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all ${
                  activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t === 'active' ? 'АКТИВ' : 'АРХИВ'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 pb-10">
          {processedData.displayList.map((l, i) => (
            <div key={i} className="bg-white p-5 rounded-[28px] border-2 border-white shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h4 className="text-[14px] font-black text-slate-800 leading-tight pr-4">{l.title}</h4>
                <span className="text-[15px] font-black text-slate-900">{l.price} ₽</span>
              </div>
              <div className="flex justify-between items-center border-t pt-3 border-slate-50">
                <span className="text-[11px] font-black text-indigo-500">{l.user}</span>
                <span className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase ${
                  l.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
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
