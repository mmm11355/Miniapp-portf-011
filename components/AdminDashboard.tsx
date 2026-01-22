import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Clock, CheckCircle, AlertCircle, MapPin, Settings, Trash2, Users, ChevronRight } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<Period>('all'); 
  const [showConfig, setShowConfig] = useState(false);
  
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          botToken: parsed.botToken || DEFAULTS.botToken,
          chatId: parsed.chatId || DEFAULTS.chatId,
          googleSheetWebhook: parsed.googleSheetWebhook || DEFAULTS.googleSheetWebhook
        };
      }
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
      'city': ['city', 'город'],
      'country': ['country', 'страна'],
      'username': ['username', 'tgusername', 'ник', 'user', 'tg_username'],
      'orderId': ['orderid', 'id']
    };
    const searchKeys = aliases[key] || [key];
    const objKeys = Object.keys(obj);
    for (const sKey of searchKeys) {
      const found = objKeys.find(ok => {
        const cleanOk = ok.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
        const cleanSk = sKey.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
        return cleanOk === cleanSk || cleanOk.includes(cleanSk);
      });
      if (found) return obj[found];
    }
    return obj[key];
  };

  // Улучшенный парсер даты для фильтров
  const parseSafeDate = (dateVal: any): number => {
    if (!dateVal) return 0;
    if (typeof dateVal === 'number') return dateVal;
    
    try {
      const str = String(dateVal).trim();
      // Обработка формата 21.01.2025, 15:30:00
      const dmy = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (dmy) {
        const [_, d, m, y] = dmy;
        const timeMatch = str.match(/(\d{2}):(\d{2}):(\d{2})/);
        const time = timeMatch ? timeMatch[0] : '00:00:00';
        return new Date(`${y}-${m}-${d}T${time}`).getTime();
      }
      const ts = Date.parse(str);
      return isNaN(ts) ? 0 : ts;
    } catch (e) {
      return 0;
    }
  };

  const fetchData = async (silent = false) => {
    const webhook = config.googleSheetWebhook || DEFAULTS.googleSheetWebhook;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${webhook}?action=getStats&_t=${Date.now()}`, { 
        method: 'GET', redirect: 'follow', cache: 'no-store'
      });
      const data: any = await res.json();
      if (data) {
        const fetchedSessions = data.sessions || data.data?.sessions || [];
        const fetchedOrders = data.orders || data.data?.orders || (Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
        setSessions(fetchedSessions);
        setOrders(fetchedOrders);
      }
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (e: any) {
      setError(`Сбой: ${e.message}`);
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { 
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000); 
    return () => clearInterval(interval);
  }, []);

  const { filteredStats, processed } = useMemo(() => {
    const now = new Date();
    // Начало текущего дня (00:00:00) для точного расчета "За сегодня"
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const tenMinMs = 10 * 60 * 1000;

    const processedOrders = (orders || []).map(o => {
      const sRaw = String(getVal(o, 'status') || '').toLowerCase().trim();
      const psRaw = String(getVal(o, 'PaymentStatus') || '').toLowerCase().trim();
      const rawDate = getVal(o, 'date') || getVal(o, 'timestamp');
      const orderTime = parseSafeDate(rawDate);
      
      const isExpired = (Date.now() - orderTime) > tenMinMs;
      const isPaid = sRaw.includes('оплат') || sRaw.includes('success') || psRaw === 'да' || psRaw === 'yes';
      const isFailed = /(отмен|архив|fail|истек|not|unpaid|нет)/i.test(sRaw) || (isExpired && !isPaid);

      // Логика ника: ищем во всех возможных полях
      const nick = o.username || o.tgusername || o.tg_username || getVal(o, 'username');

      return { 
        ...o, 
        isPaid, 
        isFailed,
        orderTime,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'price') || 0,
        dName: getVal(o, 'name') || 'Гость',
        dUser: nick ? `@${String(nick).replace('@', '')}` : 'Без ника',
        dDate: rawDate || '---'
      };
    });

    // Определяем порог фильтрации
    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = Date.now() - (7 * dayMs);
    else if (period === 'month') threshold = Date.now() - (30 * dayMs);

    const ordersInPeriod = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const sessionsInPeriod = (sessions || []).filter(s => {
      const sTime = parseSafeDate(getVal(s, 'date'));
      return period === 'all' || sTime >= threshold;
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
    return (processed || []).filter(o => {
      if (activeTab === 'active') return !o.isFailed || o.isPaid;
      return o.isFailed && !o.isPaid;
    });
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 max-w-md mx-auto">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
          <h2 className="text-[16px] font-black uppercase tracking-widest text-slate-500">Управление</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-black text-slate-300 uppercase">{lastUpdated}</span>
          <button onClick={() => setShowConfig(!showConfig)} className={`p-3 rounded-xl transition-all ${showConfig ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 bg-slate-100'}`}><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-3 text-slate-400 bg-slate-100 rounded-xl active:rotate-180 transition-transform"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {showConfig && (
        <div className="bg-white p-6 rounded-[2rem] border border-indigo-50 shadow-2xl space-y-4 mx-1 animate-in slide-in-from-top duration-300">
           <p className="text-[13px] font-black text-indigo-500 uppercase tracking-widest">Конфигурация API</p>
           <input className="w-full bg-slate-50 p-4 rounded-2xl text-[14px] font-bold border border-slate-100 outline-none focus:bg-white transition-all" value={config.googleSheetWebhook} onChange={e => setConfig({...config, googleSheetWebhook: e.target.value})} placeholder="Webhook URL" />
           <button onClick={() => {localStorage.setItem('olga_tg_config', JSON.stringify(config)); setShowConfig(false); fetchData();}} className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Применить настройки</button>
        </div>
      )}

      <div className="flex bg-slate-200/40 p-1.5 rounded-2xl mx-1">
        {(['today', '7days', 'month', 'all'] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-3 rounded-xl text-[13px] font-black uppercase transition-all ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
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
        <h3 className="text-[14px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-3">
          <MapPin size={18} className="text-rose-400" /> География визитов
        </h3>
        <div className="space-y-4 max-h-60 overflow-y-auto no-scrollbar">
          {filteredStats.geo.map(([key, count]) => (
            <div key={key}>
              <div className="flex justify-between text-[15px] font-bold text-slate-500 mb-2">
                <span className="truncate pr-4">{key}</span>
                <span className="text-indigo-600">{count}</span>
              </div>
              <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-200" style={{width: `${(count/filteredStats.visits)*100}%`}} />
              </div>
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
          {displayList.length === 0 ? (
            <div className="py-10 text-center text-slate-300 font-bold uppercase text-[12px]">Пусто</div>
          ) : (
            displayList.map((o, i) => (
              <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-sm space-y-5 active:scale-[0.98] transition-all">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1.5">
                    <h4 className="text-[15px] font-black text-slate-800 leading-tight">{o.dTitle}</h4>
                    <p className="text-[13px] font-bold text-indigo-500 truncate max-w-[220px]">{o.dUser} ({o.dName})</p>
                  </div>
                  <div className="text-[16px] font-black text-slate-900 whitespace-nowrap">{o.dPrice} ₽</div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                  <div className={`flex items-center gap-3 text-[11px] font-black uppercase tracking-widest ${o.pStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${o.pStatus === 'paid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-400 animate-pulse'}`} />
                    {o.pLabel}
                  </div>
                  <div className="text-[11px] font-black text-slate-300 uppercase">{String(o.dDate).split(',')[0]}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
