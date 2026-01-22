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

  // Упрощенный поиск значений (берем как есть, без сложной логики)
  const getVal = (obj: any, key: string) => {
    if (!obj) return null;
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase().includes(lowerKey));
    return foundKey ? obj[foundKey] : obj[key];
  };

  const parseSafeDate = (dateVal: any): number => {
    if (!dateVal) return 0;
    const str = String(dateVal).trim();
    const dmy = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmy) {
      const [_, d, m, y] = dmy;
      const time = str.match(/(\d{2}):(\d{2}):(\d{2})/)?.[0] || '00:00:00';
      return new Date(`${y}-${m}-${d}T${time}`).getTime();
    }
    return Date.parse(str) || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${config.googleSheetWebhook}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      
      // Самая широкая проверка структуры, чтобы точно найти данные
      const s = data.sessions || (data.data && data.data.sessions) || [];
      const o = data.orders || (data.data && data.data.orders) || (Array.isArray(data) ? data : []);
      
      setSessions(s);
      setOrders(o);
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {
      console.error("Ошибка загрузки:", e);
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { 
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000); 
    return () => clearInterval(interval);
  }, [config.googleSheetWebhook]);

  const { filteredStats, processed } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0,0,0,0);
    
    const processedOrders = (orders || []).map(o => {
      const status = String(getVal(o, 'статус') || getVal(o, 'status') || '').toLowerCase();
      const orderTime = parseSafeDate(getVal(o, 'дата') || getVal(o, 'date') || getVal(o, 'timestamp'));
      const isPaid = status.includes('оплат') || status.includes('success') || status.includes('да');
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(status);

      // Берем ник из колонки Имя или Username как есть
      const name = getVal(o, 'имя') || getVal(o, 'name') || getVal(o, 'username') || 'Гость';

      return { 
        ...o, 
        isPaid, isFailed, orderTime,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'товар') || getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'сумма') || getVal(o, 'price') || 0,
        dUser: String(name),
        dDate: getVal(o, 'дата') || getVal(o, 'date') || '---'
      };
    });

    const threshold = period === 'today' ? startOfToday : (period === '7days' ? now - 7*86400000 : period === 'month' ? now - 30*86400000 : 0);
    
    const ordersInPeriod = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const sessionsInPeriod = (sessions || []).filter(s => parseSafeDate(getVal(s, 'дата') || getVal(s, 'date')) >= threshold);

    const geoStats = {};
    sessionsInPeriod.forEach(s => {
      const city = getVal(s, 'город') || getVal(s, 'city') || 'Не определен';
      geoStats[city] = (geoStats[city] || 0) + 1;
    });

    return {
      processed: processedOrders,
      filteredStats: {
        visits: sessionsInPeriod.length,
        paidCount: ordersInPeriod.filter(o => o.isPaid).length,
        allOrders: ordersInPeriod,
        geo: Object.entries(geoStats).sort((a,b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [orders, sessions, period]);

  const displayList = useMemo(() => {
    return (processed || []).filter(o => activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid));
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4">
      <div className="flex justify-between items-center">
        <h2 className="text-[16px] font-black uppercase text-slate-500">Управление</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="p-2 bg-slate-100 rounded-lg"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-2 bg-slate-100 rounded-lg"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-xl">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${period === p ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-50">
          <p className="text-[12px] font-bold text-slate-400 uppercase">Визиты</p>
          <p className="text-2xl font-black">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-50">
          <p className="text-[12px] font-bold text-slate-400 uppercase">Оплачено</p>
          <p className="text-2xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-50">
        <h3 className="text-[12px] font-bold uppercase text-slate-400 mb-4 flex items-center gap-2"><MapPin size={16}/> География визитов</h3>
        {filteredStats.geo.map(([city, count]) => (
          <div key={city} className="mb-3">
            <div className="flex justify-between text-[13px] font-bold"><span>{city}</span><span>{count}</span></div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-indigo-400 rounded-full" style={{width: `${(count/filteredStats.visits)*100}%`}} /></div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[12px] font-bold uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold ${activeTab === 'active' ? 'bg-white shadow-sm' : ''}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold ${activeTab === 'archive' ? 'bg-white shadow-sm' : ''}`}>АРХИВ</button>
          </div>
        </div>
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-slate-800 text-[14px] leading-tight">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[12px] mt-1">{o.dUser}</p>
              </div>
              <div className="font-black text-[14px]">{o.dPrice} ₽</div>
            </div>
            <div className="flex justify-between text-[10px] font-bold uppercase pt-3 border-t border-slate-50">
              <span className={o.pStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'}>{o.pLabel}</span>
              <span className="text-slate-300">{String(o.dDate).split(',')[0]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
