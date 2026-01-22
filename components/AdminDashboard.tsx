import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Users, CreditCard, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  const parseDate = (val: any) => {
    if (!val) return 0;
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
      setSessions(data.sessions || data.data?.sessions || []);
      setLeads(data.leads || data.orders || data.data?.leads || []);
    } catch (e) { console.error("Data error"); }
    finally { if (!silent) setLoading(false); }
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
      const ts = parseDate(l.timestamp || l['Дата']);
      const status = String(l.PaymentStatus || l['Статус'] || '').toLowerCase();
      return {
        ...l, ts,
        isPaid: status.includes('да') || status.includes('оплат'),
        isFailed: status.includes('отмена') || status.includes('архив'),
        title: l.productTitle || l['Товар'] || 'Заказ',
        price: l.price || l['Сумма'] || '0',
        user: l.customerEmail || l['Email'] || '@guest',
        dateStr: ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '---'
      };
    });

    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);
    const fSessions = (sessions || []).filter(s => parseDate(s['Дата']) >= limit);

    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const nick = s['Email'] || s['Имя'] || 'Guest';
      nicks[nick] = (nicks[nick] || 0) + 1;
    });

    return {
      processedLeads: allLeads,
      filteredStats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 6)
      }
    };
  }, [leads, sessions, period]);

  const list = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#FDFDFD] pb-24 font-light text-slate-600">
      {/* Header - Simple & Clean */}
      <div className="p-8 flex justify-between items-center">
        <h1 className="text-[10px] tracking-[0.2em] uppercase font-medium text-slate-400">Dashboard</h1>
        <button onClick={() => fetchData()} className="text-slate-300 hover:text-indigo-500 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Period Selector - Minimalist */}
      <div className="flex justify-center gap-6 mb-10 text-[9px] uppercase tracking-widest font-medium">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button 
            key={p} 
            onClick={() => setPeriod(p as any)}
            className={`${period === p ? 'text-indigo-600 border-b border-indigo-600' : 'text-slate-300'} pb-1 transition-all`}
          >
            {p === 'today' ? 'Day' : p === '7days' ? '7D' : p === 'month' ? 'Month' : 'All'}
          </button>
        ))}
      </div>

      {/* Main Stats - Airy design */}
      <div className="grid grid-cols-2 gap-8 px-8 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-slate-300"><Users size={12}/> <span className="text-[9px] uppercase tracking-wider">Visits</span></div>
          <p className="text-4xl font-light text-slate-800 tracking-tight">{filteredStats.visits}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-slate-300"><CreditCard size={12}/> <span className="text-[9px] uppercase tracking-wider">Sales</span></div>
          <p className="text-4xl font-light text-emerald-500 tracking-tight">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Activity - List style */}
      <div className="px-8 mb-12">
        <div className="flex items-center gap-2 mb-6 text-slate-400 border-b border-slate-50 pb-2">
          <Activity size={12}/> 
          <span className="text-[9px] uppercase tracking-widest font-medium">User Activity</span>
        </div>
        <div className="space-y-5">
          {filteredStats.nicks.length > 0 ? filteredStats.nicks.map(([name, count]) => (
            <div key={name} className="flex justify-between items-center">
              <span className="text-[11px] font-normal text-slate-500">{name}</span>
              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full">{count}</span>
            </div>
          )) : <p className="text-[10px] text-slate-300 italic">No activity yet</p>}
        </div>
      </div>

      {/* Orders - Card style but lighter */}
      <div className="px-8 space-y-6">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-[9px] uppercase tracking-[0.2em] font-medium text-slate-400">Transactions</h3>
          <div className="flex gap-4 text-[9px] font-medium uppercase tracking-wider">
            <button onClick={() => setActiveTab('active')} className={activeTab === 'active' ? 'text-indigo-600' : 'text-slate-300'}>Active</button>
            <button onClick={() => setActiveTab('archive')} className={activeTab === 'archive' ? 'text-rose-500' : 'text-slate-300'}>Archive</button>
          </div>
        </div>

        {list.map((l, i) => (
          <div key={i} className="group bg-white border border-slate-50 p-5 rounded-2xl hover:border-indigo-100 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <h4 className="text-[12px] font-medium text-slate-700 leading-snug">{l.title}</h4>
                <p className="text-[10px] text-indigo-400 font-normal">{l.user}</p>
              </div>
              <span className="text-[12px] font-medium text-slate-900 whitespace-nowrap">{l.price} ₽</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50/50">
              <span className={`text-[8px] uppercase tracking-widest font-bold ${l.isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {l.isPaid ? 'Paid' : 'Pending'}
              </span>
              <span className="text-[9px] text-slate-300">{l.dateStr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
