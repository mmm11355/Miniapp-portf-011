import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, MapPin, Settings, Clock, CheckCircle, AlertCircle } from 'lucide-react';

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

  const getVal = (obj: any, key: string) => {
    if (!obj) return null;
    const aliases: Record<string, string[]> = {
      'title': ['товар', 'product', 'title', 'название'],
      'price': ['сумма', 'стоимость', 'цена', 'amount', 'price'],
      'status': ['статус', 'status', 'paymentstatus', 'состояние'],
      'name': ['имя', 'клиент', 'фио', 'name', 'customer'],
      'date': ['дата', 'timestamp', 'date', 'время', 'starttime'],
      'city': ['город', 'city', 'место']
    };
    const searchKeys = aliases[key] || [key];
    const objKeys = Object.keys(obj);
    for (const sKey of searchKeys) {
      const found = objKeys.find(ok => ok.toLowerCase().replace(/\s/g, '').includes(sKey.toLowerCase()));
      if (found) return obj[found];
    }
    return obj[key];
  };

  const parseSafeDate = (dateVal: any): number => {
    if (!dateVal) return 0;
    const str = String(dateVal).trim();
    // Обработка формата ДД.ММ.ГГГГ
    const dmy = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmy) {
      const [_, d, m, y] = dmy;
      const time = str.match(/(\d{2}):(\d{2}):(\d{2})/)?.[0] || '00:00:00';
      return new Date(`${y}-${m}-${d}T${time}`).getTime();
    }
    const ts = Date.parse(str);
    return isNaN(ts) ? 0 : ts;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${config.googleSheetWebhook}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      if (data) {
        // Проверка разных форматов ответа
        const s = data.sessions || data.data?.sessions || [];
        const o = data.orders || data.data?.orders || (Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
        setSessions(s);
        setOrders(o);
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
    const now = Date.now();
    const startOfToday = new Date().setHours(0,0,0,0);
    const tenMin = 10 * 60 * 1000;
    
    const processedOrders = (orders || []).map(o => {
      const sRaw = String(getVal(o, 'status') || '').toLowerCase();
      const orderTime = parseSafeDate(getVal(o, 'date'));
      const isExpired = (now - orderTime) > tenMin;
      const isPaid = sRaw.includes('оплат') || sRaw.includes('success') || sRaw.includes('да');
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(sRaw) || (isExpired && !isPaid);

      const fullName = String(getVal(o, 'name') || '');
      const tgMatch = fullName.match(/(@[A-Za-z0-9_]+)/);
      const nick = tgMatch ? tgMatch[1] : fullName;

      return { 
        ...o, 
        isPaid, isFailed, orderTime,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'price') || 0,
        dUser: nick || 'Гость',
        dDate: getVal(o, 'date') || '---'
      };
    });

    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = now - 7 * 86400000;
    else if (period === 'month') threshold = now - 30 * 86400000;
    
    const ordersInPeriod = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const sessionsInPeriod = (sessions || []).filter(s => {
      const st = parseSafeDate(getVal(s, 'date'));
      return period === 'all' || st >= threshold;
    });

    const geoStats = {};
    sessionsInPeriod.forEach(s => {
      const city = getVal(s, 'city') || 'Не определен';
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
    return (processed || []).filter(o => 
      activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid)
    );
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4">
      {/* Шапка */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
           <h2 className="text-[14px] font-black uppercase text-slate-500 tracking-tighter">Admin Panel</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="p-2 bg-white shadow-sm rounded-lg text-slate-400"><Settings size={16} /></button>
          <button onClick={() => fetchData()} className="p-2 bg-white shadow-sm rounded-lg text-slate-400"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {showConfig && (
        <div className="bg-white p-4 rounded-2xl shadow-xl space-y-3 border border-indigo-50">
           <input className="w-full bg-slate-50 p-3 rounded-xl text-[12px]" value={config.googleSheetWebhook} onChange={e => setConfig({...config, googleSheetWebhook: e.target.value})} />
           <button onClick={() => {localStorage.setItem('olga_tg_config', JSON.stringify(config)); setShowConfig(false); fetchData();}} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-[12px]">СОХРАНИТЬ</button>
        </div>
      )}

      {/* Селектор периода */}
      <div className="flex bg-slate-100 p-1 rounded-xl">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase transition-all ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      {/* Карточки статистики */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
          <p className="text-[11px] font-black text-slate-400 uppercase">Визиты</p>
          <p className="text-xl font-black text-slate-700">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
          <p className="text-[11px] font-black text-slate-400 uppercase">Оплачено</p>
          <p className="text-xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      {/* Список заказов */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[12px] font-black uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button onClick={() => setActiveTab('active')} className={`px-3 py-1 rounded-md text-[10px] font-black ${activeTab === 'active' ? 'bg-white shadow-sm' : ''}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-3 py-1 rounded-md text-[10px] font-black ${activeTab === 'archive' ? 'bg-white shadow-sm text-rose-500' : ''}`}>АРХИВ</button>
          </div>
        </div>

        {displayList.length === 0 ? (
          <div className="text-center py-10 text-slate-300 text-[11px] font-bold uppercase tracking-widest">Пусто</div>
        ) : (
          displayList.map((o, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-[14px] font-bold text-slate-800 leading-tight">{o.dTitle}</h4>
                  <p className="text-indigo-500 font-bold text-[12px] mt-1">{o.dUser}</p>
                </div>
                <div className="text-[14px] font-black text-slate-700">{o.dPrice} ₽</div>
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-50">
                <span className={`text-[10px] font-black uppercase tracking-widest ${o.pStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {o.pLabel}
                </span>
                <span className="text-[10px] font-bold text-slate-300">{String(o.dDate).split(',')[0]}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
