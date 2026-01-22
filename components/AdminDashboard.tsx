import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity, Users, CreditCard } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // Утилита для поиска значения в объекте (игнорирует регистр)
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const lowKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowKey);
    return foundKey ? obj[foundKey] : (obj[key] || '');
  };

  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }
    const d = new Date(s).getTime();
    return isNaN(d) ? 0 : d;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setOrders(data.leads || data.orders || []);
    } catch (e) {
      console.error('Ошибка сети');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  // 1. Тот самый рабочий блок обработки
  const { filteredStats, processed } = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const tenMin = 10 * 60 * 1000;

    const processedOrders = orders.map(o => {
      const sRaw = String(getVal(o, 'статус') || getVal(o, 'status') || '').toLowerCase().trim();
      const psRaw = String(getVal(o, 'PaymentStatus') || '').toLowerCase().trim();
      
      const orderTime = parseSafeDate(getVal(o, 'дата') || getVal(o, 'date') || getVal(o, 'timestamp'));
      const isExpired = (now - orderTime) > tenMin;

      const isPaid = sRaw.includes('оплат') || sRaw.includes('success') || psRaw === 'да';
      const isFailed = /(отмен|архив|fail|истек|not|unpaid|нет)/i.test(sRaw) || (isExpired && !isPaid);

      return { 
        ...o, 
        isPaid, 
        isFailed,
        orderTime,
        pLabel: isPaid ? 'Оплачено' : (isFailed ? 'Архив' : 'Новый'),
        dTitle: getVal(o, 'товар') || getVal(o, 'title') || 'Заказ',
        dPrice: getVal(o, 'сумма') || getVal(o, 'price') || 0,
        dName: getVal(o, 'email') || getVal(o, 'name') || 'Гость',
        dDate: getVal(o, 'дата') || getVal(o, 'date') || '---'
      };
    });

    const threshold = period === 'today' ? new Date().setHours(0,0,0,0) : (period === '7days' ? now - 7 * day : now - 30 * day);
    
    const fOrders = processedOrders.filter(o => period === 'all' || o.orderTime >= threshold);
    const fSessions = sessions.filter(s => period === 'all' || parseSafeDate(getVal(s, 'дата') || getVal(s, 'date')) >= threshold);

    return {
      processed: processedOrders,
      filteredStats: {
        ordersCount: fOrders.length,
        sessionsCount: fSessions.length,
        paidCount: fOrders.filter(o => o.isPaid).length
      }
    };
  }, [orders, sessions, period]);

  const list = processed.filter(o => 
    activeTab === 'active' ? (!o.isFailed || o.isPaid) : o.isFailed
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white pb-10 font-sans text-slate-900">
      {/* Шапка */}
      <div className="p-6 flex justify-between items-center border-b border-slate-100">
        <h1 className="text-[12px] font-black uppercase tracking-widest text-indigo-600">Admin Panel</h1>
        <button onClick={() => fetchData()} className="p-2 bg-slate-50 rounded-full">
          <RefreshCw size={20} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
        </button>
      </div>

      {/* Кнопки периода */}
      <div className="flex p-2 gap-1">
        {(['today', '7days', 'month', 'all'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${period === p ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      {/* Цифры - ЖИРНЫЕ */}
      <div className="grid grid-cols-2 gap-4 px-4 py-4">
        <div className="bg-slate-900 p-6 rounded-[32px] text-white">
          <p className="text-[10px] font-bold opacity-60 uppercase mb-1">Визиты</p>
          <p className="text-4xl font-black">{filteredStats.sessionsCount}</p>
        </div>
        <div className="bg-emerald-500 p-6 rounded-[32px] text-white">
          <p className="text-[10px] font-bold opacity-60 uppercase mb-1">Оплаты</p>
          <p className="text-4xl font-black">{filteredStats.paidCount}</p>
        </div>
      </div>

      {/* Вкладки */}
      <div className="px-4 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Список заказов</h3>
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button onClick={() => setActiveTab('active')} className={`px-5 py-2 rounded-xl text-[10px] font-black ${activeTab === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-5 py-2 rounded-xl text-[10px] font-black ${activeTab === 'archive' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>

        {/* Карточки заказов */}
        <div className="space-y-4">
          {list.map((o, i) => (
            <div key={i} className="bg-white p-5 rounded-[28px] border-2 border-slate-50 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h4 className="text-[14px] font-black text-slate-800 pr-4 leading-tight">{o.dTitle}</h4>
                <span className="text-[15px] font-black text-slate-900">{o.dPrice} ₽</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-50 pt-3">
                <span className="text-[11px] font-bold text-indigo-500 truncate max-w-[160px]">{o.dName}</span>
                <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase ${o.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {o.pLabel}
                </span>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="text-center py-10 text-slate-300 font-bold text-xs">Нет данных</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
