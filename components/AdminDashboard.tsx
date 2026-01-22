import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const lowKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowKey);
    return foundKey ? obj[foundKey] : (obj[key] || '');
  };

  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
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
      console.error('Data error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  const { stats, displayList, activity } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = now - 7 * 86400000;
    else if (period === 'month') threshold = now - 30 * 86400000;

    const fSessions = sessions.filter(s => {
      const ts = parseSafeDate(getVal(s, 'Дата') || getVal(s, 'date'));
      return period === 'all' || ts >= threshold;
    });

    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const name = getVal(s, 'Имя') || getVal(s, 'Email') || 'Гость';
      nicks[name] = (nicks[name] || 0) + 1;
    });

    const fLeads = leads.map(l => {
      const ts = parseSafeDate(getVal(l, 'timestamp') || getVal(l, 'Дата'));
      const status = String(getVal(l, 'PaymentStatus') || '').toLowerCase();
      const isPaid = status === 'да' || status.includes('оплат');
      const isFailed = status.includes('отмен') || (!isPaid && (now - ts) > 600000);
      return { ...l, ts, isPaid, isFailed };
    }).filter(l => period === 'all' || l.ts >= threshold);

    return {
      stats: { sessions: fSessions.length, paid: fLeads.filter(l => l.isPaid).length },
      activity: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 10),
      displayList: fLeads.filter(l => activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed)
    };
  }, [sessions, leads, period, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans pb-10">
      <div className="p-6 bg-white border-b flex justify-between items-center">
        <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin</h1>
        <button onClick={() => fetchData()}><RefreshCw size={18} className={loading ? 'animate-spin' : 'text-indigo-600'} /></button>
      </div>

      <div className="flex p-2 bg-white gap-1 mb-4">
        {['today', '7days', 'month', 'all'].map((p: any) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border ${period === p ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border-slate-100'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-5 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase">Визиты</p>
          <p className="text-3xl font-black text-slate-900">{stats.sessions}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">{stats.paid}</p>
        </div>
      </div>

      <div className="mx-4 bg-white rounded-3xl p-5 border border-slate-100 mb-6">
        <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Activity size={14}/> Активность</h2>
        <div className="space-y-2">
          {activity.map(([n, c]) => (
            <div key={n} className="flex justify-between text-xs font-bold border-b border-slate-50 pb-1">
              <span className="text-slate-600 truncate max-w-[180px]">{n}</span>
              <span className="text-indigo-600">{c}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase">Заказы ({displayList.length})</h3>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1 text-[10px] font-black rounded-lg ${activeTab === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1 text-[10px] font-black rounded-lg ${activeTab === 'archive' ? 'bg-white text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        <div className="space-y-3">
          {displayList.map((l, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-black text-slate-800">{getVal(l, 'productTitle') || 'Заказ'}</span>
                <span className="text-xs font-black">{getVal(l, 'price') || 0} ₽</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-indigo-500">{getVal(l, 'customerEmail') || 'Гость'}</span>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${l.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{l.isPaid ? 'Оплачено' : 'Ждем'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
