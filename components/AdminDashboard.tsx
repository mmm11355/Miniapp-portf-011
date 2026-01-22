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
  const [lastUpdated, setLastUpdated] = useState<string>('');
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

  // 1. Поиск значений (поддержка разных имен колонок из твоих скринов)
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const aliases: Record<string, string[]> = {
      'title': ['товар', 'название', 'product', 'title'],
      'price': ['сумма', 'цена', 'amount', 'price'],
      'status': ['статус', 'состояние', 'status', 'paymentstatus'],
      'name': ['имя', 'клиент', 'email', 'name', 'user'], // Email часто содержит ник
      'date': ['дата', 'время', 'timestamp', 'date']
    };
    const searchKeys = aliases[key] || [key];
    const objKeys = Object.keys(obj);
    for (const sKey of searchKeys) {
      const found = objKeys.find(ok => ok.toLowerCase().includes(sKey.toLowerCase()));
      if (found) return obj[found];
    }
    return obj[key] || '';
  };

  // 2. Исправленный парсер даты (для формата 22.01.2026)
  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    const parts = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (parts) {
      const [_, d, m, y] = parts;
      const timePart = s.split(',')[1]?.trim() || '00:00:00';
      // Создаем объект даты через YYYY/MM/DD для стабильности
      const dObj = new Date(`${y}/${m}/${d} ${timePart}`);
      return dObj.getTime() || 0;
    }
    return new Date(s).getTime() || 0;
  };

  // 3. Красивое извлечение НИКА
  const extractNick = (obj: any) => {
    const raw = String(getVal(obj, 'name') || '');
    const nickMatch = raw.match(/(@[A-Za-z0-9_]+)/);
    if (nickMatch) return nickMatch[1];
    const idMatch = raw.match(/^\d+/);
    if (idMatch && raw.includes(' ')) return raw.split(' ').slice(1).join(' ');
    return raw || 'Гость';
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${config.googleSheetWebhook}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      if (data) {
        setSessions(data.sessions || data.data?.sessions || []);
        setOrders(data.orders || data.data?.orders || (Array.isArray(data) ? data : []));
      }
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {
      console.error("Fetch error:", e);
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { 
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000); 
    return () => clearInterval(interval);
  }, [config.googleSheetWebhook]);

  const { filteredStats, processed } = useMemo(() => {
    const nowTs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfToday = new Date().setHours(0,0,0,0);

    const processedOrders = (orders || []).map(o => {
      const stat = String(getVal(o, 'status')).toLowerCase();
      const timeTs = parseSafeDate(getVal(o, 'date'));
      const isPaid = stat.includes('оплат') || stat.includes('success') || stat === 'да';
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(stat);

      return { 
        ...o, isPaid, isFailed, timeTs,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'price') || 0,
        dUser: extractNick(o),
        dDate: getVal(o, 'date') || '---'
      };
    });

    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = nowTs - 7 * dayMs;
    else if (period === 'month') threshold = nowTs - 30 * dayMs;

    const fOrders = processedOrders.filter(o => period === 'all' || o.timeTs >= threshold);
    const fSessions = (sessions || []).filter(s => {
      const ts = parseSafeDate(getVal(s, 'date'));
      return period === 'all' || ts >= threshold;
    });

    const nicks = {};
    fSessions.forEach(s => {
      const n = extractNick(s);
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
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4 bg-slate-50/50 min-h-screen">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-[14px] font-black uppercase text-slate-400 tracking-widest">Панель управления</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="p-2 bg-white shadow-sm rounded-xl text-slate-400"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-2 bg-white shadow-sm rounded-xl text-slate-400"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      <div className="flex bg-white/80 backdrop-blur p-1.5 rounded-2xl shadow-sm border border-white mx-1">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${period === p ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-1">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white">
          <p className="text-[11px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-800 tracking-tight">{filteredStats.visits}</p>
          <div className="w-full h-1 bg-indigo-50 rounded-full mt-3 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{width: '60%'}} /></div>
        </div>
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white">
          <p className="text-[11px] font-black text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500 tracking-tight">{filteredStats.paidCount}</p>
          <div className="w-full h-1 bg-emerald-50 rounded-full mt-3 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width: filteredStats.paidCount > 0 ? '100%' : '0%'}} /></div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white mx-1">
        <h3 className="text-[12px] font-black uppercase text-slate-400 mb-6 flex gap-2"><MapPin size={16} className="text-indigo-500"/> Активность по никам</h3>
        <div className="space-y-4">
          {filteredStats.geo.length > 0 ? filteredStats.geo.map(([nick, count]) => (
            <div key={nick}>
              <div className="flex justify-between text-[13px] font-bold text-slate-700 mb-1"><span>{nick}</span><span className="text-indigo-600">{count}</span></div>
              <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{width: `${(count/Math.max(filteredStats.visits, 1))*100}%`}} />
              </div>
            </div>
          )) : <p className="text-center text-slate-300 py-4 font-bold uppercase text-[10px]">Нет данных за период</p>}
        </div>
      </div>

      <div className="space-y-4 px-1">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[12px] font-black uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-white rounded-xl p-1 shadow-sm border border-white">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-white mb-4">
            <div className="flex justify-between items-start mb-2">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-[14px] leading-tight mb-1">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[12px]">{o.dUser}</p>
              </div>
              <div className="font-black text-[16px] text-slate-900">{o.dPrice} ₽</div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-50 text-[10px] font-black uppercase tracking-widest mt-2">
              <span className={o.pStatus === 'paid' ? 'text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md' : 'text-amber-500 bg-amber-50 px-2 py-1 rounded-md'}>{o.pLabel}</span>
              <span className="text-slate-300">{String(o.dDate).split(',')[0]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
