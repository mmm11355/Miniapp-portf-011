import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, MapPin, Settings } from 'lucide-react';

type Period = 'today' | '7days' | 'month' | 'all';

const DEFAULTS = {
  botToken: '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58',
  chatId: '-1002095569247',
  googleSheetWebhook: 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec'
};

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<Period>('all'); 
  const [showConfig, setShowConfig] = useState(false);
  
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULTS;
  });

  // 1. ПАРСЕР ДАТЫ (Специально для 22.01.2026)
  const toTimestamp = (val: any) => {
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
      const res = await fetch(`${config.googleSheetWebhook}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      const s = data.sessions || (data.data && data.data.sessions) || [];
      const o = data.orders || (data.data && data.data.orders) || (Array.isArray(data) ? data : []);
      setSessions(s);
      setOrders(o);
    } catch (e) {} finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { 
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000); 
    return () => clearInterval(interval);
  }, [config.googleSheetWebhook]);

  const { filteredStats, processed } = useMemo(() => {
    const today = new Date().setHours(0,0,0,0);
    
    const processedOrders = (orders || []).map(o => {
      // Прямое обращение к твоим колонкам из скринов
      const status = String(o['Статус'] || o['статус'] || '').toLowerCase();
      const rawDate = o['Дата'] || o['дата'] || '';
      const nick = String(o['Email'] || o['email'] || '').includes('@') ? o['Email'] : o['Имя'];

      const isPaid = status.includes('оплат') || status === 'да';
      const isFailed = /(отмен|архив|нет)/i.test(status);

      return { 
        ...o, isPaid, isFailed, 
        ts: toTimestamp(rawDate),
        dTitle: o['Товар'] || 'Заказ',
        dPrice: o['Сумма'] || o['цена'] || 0,
        dUser: nick || 'Гость',
        dDate: rawDate
      };
    });

    let limit = 0;
    if (period === 'today') limit = today;
    else if (period === '7days') limit = Date.now() - 7 * 86400000;
    else if (period === 'month') limit = Date.now() - 30 * 86400000;

    const fOrders = processedOrders.filter(o => period === 'all' || o.ts >= limit);
    const fSessions = (sessions || []).filter(s => toTimestamp(s['Дата'] || s['дата']) >= limit);

    const nicks = {};
    fSessions.forEach(s => {
      const n = String(s['Email'] || '').includes('@') ? s['Email'] : (s['Имя'] || 'Гость');
      nicks[n] = (nicks[n] || 0) + 1;
    });

    return {
      processed: processedOrders,
      filteredStats: {
        visits: fSessions.length,
        paidCount: fOrders.filter(o => o.isPaid).length,
        allOrders: fOrders,
        geo: Object.entries(nicks).sort((a,b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [orders, sessions, period]);

  const displayList = useMemo(() => {
    return (processed || []).filter(o => activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid));
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center px-4">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-tighter">Admin Panel</h2>
        <button onClick={() => fetchData()} className="p-2 bg-white rounded-xl shadow-sm"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
      </div>

      <div className="flex bg-white p-1 rounded-2xl shadow-sm mx-2">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-2">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-300 uppercase">Визиты</p>
          <p className="text-3xl font-black text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[10px] font-black text-slate-300 uppercase">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-sm mx-2">
        <h3 className="text-[10px] font-black uppercase text-slate-300 mb-4 flex gap-2"><MapPin size={14}/> Активность по никам</h3>
        <div className="space-y-3">
          {filteredStats.geo.map(([nick, count]) => (
            <div key={nick} className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-600 truncate max-w-[180px]">{nick}</span>
              <span className="text-xs font-black text-indigo-500">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-2 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-black text-slate-300 uppercase">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-white rounded-xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[1.5rem] shadow-sm">
            <div className="flex justify-between mb-2">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-sm leading-tight">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[11px]">{o.dUser}</p>
              </div>
              <div className="font-black text-sm">{o.dPrice} ₽</div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50 text-[9px] font-black uppercase">
              <span className={o.isPaid ? 'text-emerald-500' : 'text-amber-500'}>{o.pLabel}</span>
              <span className="text-slate-300">{String(o.dDate).split(',')[0]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
