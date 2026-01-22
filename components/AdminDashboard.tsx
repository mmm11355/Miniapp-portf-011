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

  // 1. Поиск значений (теперь приоритет на Email для ника)
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const aliases: Record<string, string[]> = {
      'title': ['товар', 'название', 'product', 'title'],
      'price': ['сумма', 'цена', 'amount', 'price'],
      'status': ['статус', 'состояние', 'status', 'paymentstatus'],
      'name': ['email', 'имя', 'клиент', 'name', 'user'], // Проверяем Email первым
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

  // 2. Жесткий парсер даты для формата "22.01.2026, 13:20:03"
  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    const parts = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (parts) {
      const [_, d, m, y] = parts;
      const timePart = s.split(',')[1]?.trim() || '00:00:00';
      // Используем формат ISO: YYYY-MM-DDTHH:mm:ss
      const isoStr = `${y}-${m}-${d}T${timePart.replace(/\s/g, '')}`;
      const dObj = new Date(isoStr);
      return dObj.getTime() || 0;
    }
    return new Date(s).getTime() || 0;
  };

  // 3. Извлечение ника (ищем @ в строке Email/Имя)
  const extractNick = (obj: any) => {
    const rawEmail = String(obj['Email'] || obj['email'] || '');
    const rawName = String(obj['Имя'] || obj['имя'] || '');
    const combined = `${rawEmail} ${rawName}`;
    const match = combined.match(/(@[A-Za-z0-9_]+)/);
    return match ? match[1] : (rawEmail || rawName || 'Гость').split(' ')[0];
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
    else if (period === '7days') threshold = now - 7 * 86400000;
    else if (period === 'month') threshold = now - 30 * 86400000;

    const fOrders = processedOrders.filter(o => period === 'all' || o.timeTs >= threshold);
    const fSessions = (sessions || []).filter(s => {
      const ts = parseSafeDate(getVal(s, 'date'));
      return period === 'all' || ts >= threshold;
    });

    const nicksMap = {};
    fSessions.forEach(s => {
      const n = extractNick(s);
      nicksMap[n] = (nicksMap[n] || 0) + 1;
    });

    return {
      processed: processedOrders,
      filteredStats: {
        visits: fSessions.length,
        paidCount: fOrders.filter(o => o.isPaid).length,
        allOrders: fOrders,
        geo: Object.entries(nicksMap).sort((a,b) => b[1] - a[1]).slice(0, 10)
      }
    };
  }, [orders, sessions, period]);

  const displayList = useMemo(() => {
    return (processed || []).filter(o => activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid));
  }, [processed, activeTab]);

  return (
    <div className="space-y-6 max-w-md mx-auto pb-10 px-2 pt-4 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-[14px] font-black uppercase text-slate-400">Управление</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="p-2 bg-white shadow-sm rounded-xl"><Settings size={18} /></button>
          <button onClick={() => fetchData()} className="p-2 bg-white shadow-sm rounded-xl"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      <div className="flex bg-white p-1 rounded-2xl shadow-sm mx-1">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 px-1">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">{filteredStats.paidCount}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm mx-1">
        <h3 className="text-[12px] font-black uppercase text-slate-400 mb-4 flex gap-2"><MapPin size={16}/> Активность по никам</h3>
        <div className="space-y-3">
          {filteredStats.geo.map(([nick, count]) => (
            <div key={nick}>
              <div className="flex justify-between text-[13px] font-bold"><span>{nick}</span><span className="text-indigo-600">{count}</span></div>
              <div className="w-full h-1.5 bg-slate-50 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-indigo-400" style={{width: `${(count/Math.max(filteredStats.visits, 1))*100}%`}} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-1">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[12px] font-black uppercase text-slate-400">Заказы ({filteredStats.allOrders.length})</h3>
          <div className="flex bg-white rounded-xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>
        
        {displayList.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[2.5rem] shadow-sm mb-4">
            <div className="flex justify-between items-start mb-2">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-[14px] leading-tight mb-1">{o.dTitle}</h4>
                <p className="text-indigo-500 font-bold text-[12px]">{o.dUser}</p>
              </div>
              <div className="font-black text-[15px]">{o.dPrice} ₽</div>
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
