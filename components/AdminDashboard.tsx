import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  // Парсер даты специально для формата: 22.01.2026, 13:15:35
  const parseDate = (val: any) => {
    if (!val) return 0;
    const s = String(val);
    if (!isNaN(Number(s)) && s.length > 10) return Number(s);
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
    } catch (e) { console.error("Ошибка"); } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { stats, list } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0,0,0,0);
    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    // Считаем визиты по колонке "Дата"
    const fSessions = (sessions || []).filter(s => period === 'all' || parseDate(s['Дата'] || s['timestamp']) >= limit);
    
    // Считаем заказы и оплаты
    const processedLeads = (leads || []).map(l => {
      const ts = parseDate(l['timestamp'] || l['Дата']);
      const status = String(l['PaymentStatus'] || l['Статус'] || '').toLowerCase();
      const isPaid = status === 'да' || status.includes('оплат');
      const isFailed = status === 'нет' || status.includes('отмена') || status.includes('архив');
      return { ...l, ts, isPaid, isFailed };
    });

    const fLeads = processedLeads.filter(l => period === 'all' || l.ts >= limit);

    const nicks: Record<string, number> = {};
    fSessions.forEach(s => { const k = s['Email'] || 'Гость'; nicks[k] = (nicks[k] || 0) + 1; });

    return {
      stats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a,b) => b[1]-a[1]).slice(0, 10)
      },
      list: processedLeads.filter(l => activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed)
    };
  }, [leads, sessions, period, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-10 font-sans">
      <div className="p-6 bg-white flex justify-between items-center border-b">
        <h1 className="text-sm font-black uppercase text-indigo-600">Панель управления</h1>
        <button onClick={() => fetchData()} className="p-2 bg-slate-100 rounded-full">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1 p-2 bg-white mb-4">
        {['today', '7days', 'month', 'all'].map((p: any) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg ${period === p ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border">
          <p className="text-[10px] font-black text-slate-400 uppercase">Визиты</p>
          <p className="text-4xl font-black text-slate-900">{stats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border">
          <p className="text-[10px] font-black text-slate-400 uppercase">Оплаты</p>
          <p className="text-4xl font-black text-emerald-500">{stats.paid}</p>
        </div>
      </div>

      <div className="mx-4 mb-6 bg-white rounded-3xl p-6 border">
        <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Activity size={14}/> Активность</h2>
        {stats.nicks.map(([n, c]) => (
          <div key={n} className="flex justify-between py-1 border-b border-slate-50 last:border-0">
            <span className="text-[12px] font-bold text-slate-600 truncate max-w-[200px]">{n}</span>
            <span className="text-[12px] font-black text-indigo-600">{c}</span>
          </div>
        ))}
      </div>

      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase">Заказы ({list.length})</h3>
          <div className="flex bg-slate-200 p-1 rounded-xl">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-white text-indigo-600' : 'text-slate-500'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-white text-rose-600' : 'text-slate-500'}`}>АРХИВ</button>
          </div>
        </div>
        <div className="space-y-3">
          {list.map((l, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border">
              <div className="flex justify-between mb-2">
                <span className="text-[13px] font-black text-slate-800">{l['productTitle'] || 'Заказ'}</span>
                <span className="text-[13px] font-black">{l['price'] || '0'} ₽</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-indigo-500">{l['customerEmail'] || '@гость'}</span>
                <span className={`text-[9px] font-black px-2 py-1 rounded ${l.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
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
