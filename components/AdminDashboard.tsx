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

  // 1. Поиск значений в колонках (поддержка RU и EN)
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const aliases: Record<string, string[]> = {
      'title': ['товар', 'название', 'product', 'title'],
      'price': ['сумма', 'цена', 'стоимость', 'amount', 'price'],
      'status': ['статус', 'состояние', 'status', 'paymentstatus'],
      'name': ['имя', 'клиент', 'фио', 'name', 'user'],
      'date': ['дата', 'время', 'timestamp', 'date'],
      'city': ['город', 'city', 'место']
    };
    const searchKeys = aliases[key] || [key];
    const objKeys = Object.keys(obj);
    for (const sKey of searchKeys) {
      const found = objKeys.find(ok => ok.toLowerCase().includes(sKey.toLowerCase()));
      if (found) return obj[found];
    }
    return obj[key] || '';
  };

  // 2. Улучшенный парсер дат специально для формата "21.01.2025, 12:00:00"
  const parseDateToMs = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    try {
      const match = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (match) {
        const [_, d, m, y] = match;
        const timePart = s.split(',')[1]?.trim() || '00:00:00';
        // Создаем формат YYYY-MM-DDTHH:mm:ss
        return new Date(`${y}-${m}-${d}T${timePart.replace(/\s/g, '')}`).getTime();
      }
      return new Date(s).getTime() || 0;
    } catch (e) { return 0; }
  };

  // 3. Извлечение НИКА из строки типа "12345 @nick" или "Имя @nick"
  const getNick = (obj: any) => {
    const rawName = String(getVal(obj, 'name') || getVal(obj, 'username') || '');
    const match = rawName.match(/(@[A-Za-z0-9_]+)/);
    if (match) return match[1];
    return rawName.split(' ')[0] || 'Гость';
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
      console.error("Data error", e);
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { 
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000); 
    return () => clearInterval(interval);
  }, [config.googleSheetWebhook]);

  const { filteredStats, processed } = useMemo(() => {
    const nowTs = Date.now();
    const todayTs = new Date().setHours(0,0,0,0);
    
    const processedOrders = (orders || []).map(o => {
      const stat = String(getVal(o, 'status')).toLowerCase();
      const pStat = String(o.PaymentStatus || '').toLowerCase();
      const orderTs = parseDateToMs(getVal(o, 'date'));
      
      const isPaid = stat.includes('оплат') || stat.includes('success') || pStat === 'да';
      const isFailed = /(отмен|архив|fail|истек|нет)/i.test(stat);

      return { 
        ...o, 
        isPaid, isFailed, orderTs,
        pStatus: isPaid ? 'paid' : (isFailed ? 'failed' : 'pending'),
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'price') || 0,
        dUser: getNick(o),
        dDate: getVal(o, 'date') || '---'
      };
    });

    let limit = 0;
    if (period === 'today') limit = todayTs;
    else if (period === '7days') limit = nowTs - 7 * 86400000;
    else if (period === 'month') limit = nowTs - 30 * 86400000;

    const ordersFinal = processedOrders.filter(o => period === 'all' || o.orderTs >= limit);
    const sessionsFinal = (sessions || []).filter(s => parseDateToMs(getVal(s, 'date')) >= limit);

    const geoStats = {};
    sessionsFinal.forEach(s => {
      const city = getVal(s, 'city') || 'Не определен';
      geoStats[city] = (geoStats[city] || 0) + 1;
    });

    return {
      processed: processedOrders,
      filteredStats: {
        visits: sessionsFinal.length,
        paidCount: ordersFinal.filter(o => o.isPaid).length,
        allOrders: ordersFinal,
        geo: Object.entries(geoStats).sort((a,b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [orders, sessions, period]);

  const displayList = useMemo(() => {
    return (processed || []).filter(o => activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid));
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-[16px] font-black uppercase text-slate-500">Управление</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="p-2 bg-slate-100 rounded-lg text-slate-400"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-2 bg-slate-100 rounded-lg text-slate-400"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl mx-1">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-1">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50">
          <p className="text-[12px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-2xl font-black text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50">
          <p className="text-[12px] font-black text-slate-400 uppercase mb-1">Оплачено</p>
          <p className="text-2xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 mx-1">
        <h3 className="text-[13px] font-black uppercase text-slate-400 mb-4 flex gap-2"><MapPin size={16}/> География визитов</h3>
        {filteredStats.geo.map(([city, count]) => (
          <div key={city} className="mb-3 last:mb-0">
            <div className="flex justify-between text-[14px] font-bold text-slate-600 mb-1"><span>{city}</span><span>{count}</span></div>
            <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-300" style={{width: `${(count/filteredStats.visits)*100}%`}} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 px-1">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[13px] font-black uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-white shadow-sm text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-50">
            <div className="flex justify-between items-start mb-2">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-[14px] leading-tight">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[12px] mt-1">{o.dUser}</p>
              </div>
              <div className="font-black text-[15px] text-slate-900">{o.dPrice} ₽</div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50 text-[10px] font-black uppercase tracking-widest">
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
