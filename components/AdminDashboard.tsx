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

  // Вспомогательная функция для извлечения НИКА из строки вида "450553948 @Olga_lav"
  const extractNick = (str: any) => {
    const text = String(str || '');
    const match = text.match(/(@[A-Za-z0-9_]+)/);
    return match ? match[1] : text.split(' ')[0] || 'Гость';
  };

  const getVal = (obj: any, key: string) => {
    if (!obj) return null;
    const aliases: Record<string, string[]> = {
      'title': ['товар', 'product', 'title'],
      'price': ['сумма', 'цена', 'price'],
      'status': ['статус', 'status'],
      'name': ['имя', 'клиент', 'name'],
      'date': ['дата', 'timestamp', 'date']
    };
    const searchKeys = aliases[key] || [key];
    for (const sKey of searchKeys) {
      const found = Object.keys(obj).find(ok => ok.toLowerCase().includes(sKey.toLowerCase()));
      if (found) return obj[found];
    }
    return obj[key];
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
      if (data) {
        setSessions(data.sessions || data.data?.sessions || []);
        setOrders(data.orders || data.data?.orders || (Array.isArray(data) ? data : []));
      }
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {} finally { if (!silent) setLoading(false); }
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
      const sRaw = String(getVal(o, 'status') || '').toLowerCase();
      const orderTime = parseSafeDate(getVal(o, 'date'));
      const isPaid = sRaw.includes('оплат') || sRaw.includes('success');
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(sRaw);

      return { 
        ...o, 
        isPaid, isFailed, orderTime,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'price') || 0,
        dUser: extractNick(getVal(o, 'name')), // ТУТ ТЕПЕРЬ ВСЕГДА НИК
        dDate: getVal(o, 'date') || '---'
      };
    });

    const threshold = period === 'today' ? startOfToday : (period === '7days' ? now - 7*86400000 : period === 'month' ? now - 30*86400000 : 0);
    
    const ordersInPeriod = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const sessionsInPeriod = (sessions || []).filter(s => parseSafeDate(getVal(s, 'date')) >= threshold);

    const geoStats = {};
    sessionsInPeriod.forEach(s => {
      // И ТУТ ТЕПЕРЬ ТОЖЕ НИК ВМЕСТО ID
      const user = extractNick(getVal(s, 'name') || getVal(s, 'email') || 'Гость');
      geoStats[user] = (geoStats[user] || 0) + 1;
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
    <div className="space-y-6 max-w-md mx-auto pb-10">
      <div className="flex justify-between items-center px-1 pt-4">
        <h2 className="text-[16px] font-black uppercase text-slate-500">Управление</h2>
        <div className="flex gap-3">
          <span className="text-[12px] font-black text-slate-300 uppercase">{lastUpdated}</span>
          <button onClick={() => setShowConfig(!showConfig)} className="p-3 bg-slate-100 rounded-xl"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-3 bg-slate-100 rounded-xl"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {showConfig && (
        <div className="bg-white p-6 rounded-[2rem] shadow-2xl space-y-4 mx-1">
           <input className="w-full bg-slate-50 p-4 rounded-2xl" value={config.googleSheetWebhook} onChange={e => setConfig({...config, googleSheetWebhook: e.target.value})} />
           <button onClick={() => {localStorage.setItem('olga_tg_config', JSON.stringify(config)); setShowConfig(false); fetchData();}} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase">Применить</button>
        </div>
      )}

      <div className="flex bg-slate-200/40 p-1.5 rounded-2xl mx-1">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-3 rounded-xl text-[13px] font-black uppercase ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-1">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[13px] font-black text-slate-400 uppercase">Визиты</p>
          <p className="text-2xl font-black">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm">
          <p className="text-[13px] font-black text-slate-400 uppercase">Оплачено</p>
          <p className="text-2xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-sm mx-1">
        <h3 className="text-[14px] font-black uppercase text-slate-400 mb-4 flex gap-3"><MapPin size={18}/> Активность по никам</h3>
        {filteredStats.geo.map(([key, count]) => (
          <div key={key} className="mb-4">
            <div className="flex justify-between text-[14px] font-bold"><span>{key}</span><span className="text-indigo-600">{count}</span></div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1">
              <div className="h-full bg-indigo-400 rounded-full" style={{width: `${(count/filteredStats.visits)*100}%`}} />
            </div>
          </div>
        ))}
      </div>

      <div className="px-1">
        <div className="flex justify-between mb-4">
          <h3 className="text-[14px] font-black uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[11px] font-black ${activeTab === 'active' ? 'bg-white shadow-sm' : ''}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[11px] font-black ${activeTab === 'archive' ? 'bg-white shadow-sm' : ''}`}>АРХИВ</button>
          </div>
        </div>
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[2.5rem] shadow-sm mb-4 border border-slate-50">
            <div className="flex justify-between items-start mb-3">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 leading-tight">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[13px] mt-1">{o.dUser}</p>
              </div>
              <div className="font-black text-right">{o.dPrice} ₽</div>
            </div>
            <div className="flex justify-between items-center text-[11px] font-black uppercase">
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
