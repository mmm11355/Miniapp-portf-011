import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Clock, CheckCircle, AlertCircle, MapPin, Settings } from 'lucide-react';

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
    if (!obj || typeof obj !== 'object') return null;
    const aliases: Record<string, string[]> = {
      'title': ['producttitle', 'товар', 'название', 'product', 'title'],
      'price': ['price', 'сумма', 'стоимость', 'цена', 'amount'],
      'status': ['paymentstatus', 'статус', 'status', 'состояние', 'payment_status'],
      'name': ['customername', 'имя', 'клиент', 'фио', 'name'],
      'date': ['timestamp', 'дата', 'date', 'время', 'starttime'],
      'city': ['city', 'город']
    };
    const searchKeys = aliases[key] || [key];
    const objKeys = Object.keys(obj);
    for (const sKey of searchKeys) {
      const found = objKeys.find(ok => ok.toLowerCase().replace(/[^a-zа-я0-9]/g, '').includes(sKey.toLowerCase().replace(/[^a-zа-я0-9]/g, '')));
      if (found) return obj[found];
    }
    return obj[key];
  };

  const parseSafeDate = (dateVal: any): number => {
    if (!dateVal) return 0;
    if (typeof dateVal === 'number') return dateVal;
    const str = String(dateVal).trim();
    const dmyMatch = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmyMatch) {
      const [_, d, m, y] = dmyMatch;
      const timePart = str.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${y}-${m}-${d}T${timePart}`).getTime();
    }
    return Date.parse(str) || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${config.googleSheetWebhook}?action=getStats&_t=${Date.now()}`);
      const data: any = await res.json();
      if (data) {
        // ВОЗВРАЩАЕМ КАК БЫЛО: гибкое чтение структуры
        const s = data.sessions || (data.data && data.data.sessions) || [];
        const o = data.orders || (data.data && data.data.orders) || (Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
        setSessions(s);
        setOrders(o);
      }
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {
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
      const psRaw = String(o.PaymentStatus || '').toLowerCase();
      const orderTime = parseSafeDate(getVal(o, 'date'));
      const isPaid = sRaw.includes('оплат') || sRaw.includes('success') || psRaw === 'да';
      const isExpired = (now - orderTime) > tenMin;
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(sRaw) || (isExpired && !isPaid);

      // ИЩЕМ НИК В КОЛОНКЕ "ИМЯ"
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
    else if (period === '7days') threshold = now - (7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') threshold = now - (30 * 24 * 60 * 60 * 1000);

    const filteredOrders = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const filteredSessions = (sessions || []).filter(s => {
      const sTime = parseSafeDate(getVal(s, 'date'));
      return period === 'all' || sTime >= threshold;
    });

    const geoStats = {};
    filteredSessions.forEach(s => {
      const city = getVal(s, 'city') || 'Не определен';
      geoStats[city] = (geoStats[city] || 0) + 1;
    });

    return {
      processed: processedOrders,
      filteredStats: {
        visits: filteredSessions.length,
        paidCount: filteredOrders.filter(o => o.isPaid).length,
        allOrders: filteredOrders,
        geo: Object.entries(geoStats).sort((a,b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [orders, sessions, period]);

  const displayList = useMemo(() => {
    return (processed || []).filter(o => activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid));
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-1 pt-4">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-[16px] font-black uppercase text-slate-500 tracking-widest">Управление</h2>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-black text-slate-300 uppercase">{lastUpdated}</span>
          <button onClick={() => setShowConfig(!showConfig)} className="p-3 bg-slate-100 rounded-xl text-slate-400"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-3 bg-slate-100 rounded-xl text-slate-400"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {showConfig && (
        <div className="bg-white p-6 rounded-[2rem] shadow-2xl space-y-4 mx-2">
           <input className="w-full bg-slate-50 p-4 rounded-2xl text-[14px] border border-slate-100 outline-none" value={config.googleSheetWebhook} onChange={e => setConfig({...config, googleSheetWebhook: e.target.value})} />
           <button onClick={() => {localStorage.setItem('olga_tg_config', JSON.stringify(config)); setShowConfig(false); fetchData();}} className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest">Применить настройки</button>
        </div>
      )}

      <div className="flex bg-slate-200/40 p-1.5 rounded-2xl mx-1">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-3 rounded-xl text-[13px] font-black uppercase transition-all ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-1">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-50 shadow-sm">
          <p className="text-[13px] font-black text-slate-400 uppercase mb-2">Визиты</p>
          <p className="text-2xl font-black text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-50 shadow-sm">
          <p className="text-[13px] font-black text-slate-400 uppercase mb-2">Оплачено</p>
          <p className="text-2xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-50 shadow-sm mx-1">
        <h3 className="text-[14px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-3"><MapPin size={18} className="text-rose-400" /> География</h3>
        <div className="space-y-4">
          {filteredStats.geo.map(([key, count]) => (
            <div key={key}>
              <div className="flex justify-between text-[15px] font-bold text-slate-500 mb-2"><span>{key}</span><span className="text-indigo-600">{count}</span></div>
              <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-indigo-200" style={{width: `${(count/filteredStats.visits)*100}%`}} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[14px] font-black uppercase tracking-widest text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-slate-200/40 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('active')} className={`px-6 py-2.5 rounded-xl text-[12px] font-black uppercase transition-all ${activeTab === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Актив</button>
            <button onClick={() => setActiveTab('archive')} className={`px-6 py-2.5 rounded-xl text-[12px] font-black uppercase transition-all ${activeTab === 'archive' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-400'}`}>Архив</button>
          </div>
        </div>
        <div className="space-y-4 px-1">
          {displayList.map((o, i) => (
            <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <h4 className="text-[15px] font-black text-slate-800 leading-tight">{o.dTitle}</h4>
                  <p className="text-[13px] font-bold text-indigo-500">{o.dUser}</p>
                </div>
                <div className="text-[16px] font-black text-slate-900">{o.dPrice} ₽</div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-50 pt-4 text-[11px] font-black uppercase">
                <span className={o.pStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'}>{o.pLabel}</span>
                <span className="text-slate-300">{String(o.dDate).split(',')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
